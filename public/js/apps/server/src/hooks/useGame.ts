'use client';

// ============================================================
// useGame — Estado do jogo no cliente (Fase 3 completa)
//
// Client Prediction + Server Reconciliation para movimento.
// Gerencia fauna, efeitos de status, notificações e morte.
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { SessionItem } from '@survival/shared/types';

const PLAYER_SPEED        = 200;
const RECONCILE_THRESHOLD = 8;
const INTERPOLATION_ALPHA = 0.2;

// ── Tipos do cliente ──────────────────────────────────────────

export interface Vec2 { x: number; y: number }

export interface LocalPlayer {
  socketId:     string;
  playerId:     string;
  username:     string;
  position:     Vec2;
  hp:           number;
  thirst:       number;
  inventory:    SessionItem[];
  weightUsed:   number;
  weightLimit:  number;
  isExtracting: boolean;
  activeEffects: ActiveEffectClient[];
}

export interface ActiveEffectClient {
  type:       'poison' | 'disease' | 'bleed';
  expiresAt:  number;   // Date.now() + durationMs
}

export interface RemotePlayer {
  socketId:   string;
  username:   string;
  position:   Vec2;
  displayPos: Vec2;    // posição interpolada para renderização
  hp:         number;
}

export interface FaunaClient {
  id:           string;
  type:         string;
  label:        string;
  position:     Vec2;
  displayPos:   Vec2;   // interpolada
  hpPct:        number;
  state:        string;
  isHostile:    boolean;
  isAggro:      boolean;
  stealth:      boolean;
  visibleRange: number;
  damageType:   string;
}

export interface ResourceClient {
  id:        string;
  type:      string;
  position:  Vec2;
  available: boolean;
}

export interface ExtractionZone {
  id:       string;
  label:    string;
  position: Vec2;
  radius:   number;
}

export interface GameNotification {
  id:    number;
  text:  string;
  type:  'info' | 'danger' | 'success' | 'warning';
}

interface PendingInput {
  seq:          number;
  dx:           number;
  dy:           number;
  dt:           number;
  predictedPos: Vec2;
}

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════

export function useGame(socket: Socket | null) {
  const [localPlayer,    setLocalPlayer]    = useState<LocalPlayer | null>(null);
  const [remotePlayers,  setRemotePlayers]  = useState<Map<string, RemotePlayer>>(new Map());
  const [faunaEntities,  setFaunaEntities]  = useState<Map<string, FaunaClient>>(new Map());
  const [resources,      setResources]      = useState<ResourceClient[]>([]);
  const [extractionZones, setExtractionZones] = useState<ExtractionZone[]>([]);
  const [notifications,  setNotifications]  = useState<GameNotification[]>([]);

  const localRef       = useRef<LocalPlayer | null>(null);
  const pendingInputs  = useRef<PendingInput[]>([]);
  const seqRef         = useRef(0);
  const keysRef        = useRef<Set<string>>(new Set());
  const lastTickRef    = useRef<number>(performance.now());
  const rafRef         = useRef<number>(0);
  const socketRef      = useRef<Socket | null>(null);
  const notifIdRef     = useRef(0);

  useEffect(() => { socketRef.current = socket; }, [socket]);

  // ── Notificação helper ────────────────────────────────────
  const notify = useCallback((text: string, type: GameNotification['type'] = 'info') => {
    const id = ++notifIdRef.current;
    setNotifications(prev => [...prev.slice(-5), { id, text, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  // ══════════════════════════════════════════════════════════
  // SOCKET LISTENERS
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!socket) return;

    // ── Estado inicial da sala ────────────────────────────
    socket.on('game:joined', (data: any) => {
      const player: LocalPlayer = {
        socketId:     socket.id!,
        playerId:     data.playerId,
        username:     data.username ?? '',
        position:     data.spawnPosition,
        hp:           100,
        thirst:       100,
        inventory:    [],
        weightUsed:   0,
        weightLimit:  30,
        isExtracting: false,
        activeEffects: [],
      };
      localRef.current = player;
      setLocalPlayer({ ...player });
      setResources(data.resources ?? []);
      setExtractionZones(data.extractionZones ?? []);
    });

    // ── Reconciliação de movimento ────────────────────────
    socket.on('player:move_ack', (ack: { seq: number; position: Vec2 }) => {
      const local = localRef.current;
      if (!local) return;

      pendingInputs.current = pendingInputs.current.filter(i => i.seq > ack.seq);

      const err = Math.hypot(
        local.position.x - ack.position.x,
        local.position.y - ack.position.y,
      );

      if (err > RECONCILE_THRESHOLD) {
        let pos = { ...ack.position };
        for (const input of pendingInputs.current) {
          pos = simulateMove(pos, input);
        }
        local.position = pos;
        setLocalPlayer({ ...local });
      }
    });

    // ── Snapshot do mundo ─────────────────────────────────
    socket.on('world:state', (snapshot: any) => {
      // Vitais do player local
      const me = snapshot.players?.find((p: any) => p.socketId === socket.id);
      if (me && localRef.current) {
        localRef.current.hp     = me.hp;
        localRef.current.thirst = me.thirst;
        setLocalPlayer(prev => prev ? { ...prev, hp: me.hp, thirst: me.thirst } : prev);
      }

      // Players remotos (com interpolação)
      setRemotePlayers(prev => {
        const next = new Map<string, RemotePlayer>();
        for (const p of snapshot.players ?? []) {
          if (p.socketId === socket.id) continue;
          const existing   = prev.get(p.socketId);
          const prevDisplay = existing?.displayPos ?? p.position;
          next.set(p.socketId, {
            socketId:   p.socketId,
            username:   p.username,
            position:   p.position,
            displayPos: lerp2(prevDisplay, p.position, INTERPOLATION_ALPHA),
            hp:         p.hp,
          });
        }
        return next;
      });

      // Recursos
      setResources(prev => {
        const map = new Map((snapshot.resources ?? []).map((r: any) => [r.id, r]));
        return prev.map(r => {
          const upd = map.get(r.id) as any;
          return upd ? { ...r, available: upd.available } : r;
        });
      });

      // Fauna (com interpolação + filtro de stealth por distância)
      setFaunaEntities(prev => {
        const next   = new Map<string, FaunaClient>();
        const myPos  = localRef.current?.position;

        for (const f of snapshot.fauna ?? []) {
          // Stealth: só mostra se o player local estiver dentro do visibleRange
          if (f.stealth && myPos) {
            const d = Math.hypot(myPos.x - f.position.x, myPos.y - f.position.y);
            if (d > f.visibleRange) continue;
          }

          const existing    = prev.get(f.id);
          const prevDisplay = existing?.displayPos ?? f.position;
          next.set(f.id, {
            ...f,
            displayPos: lerp2(prevDisplay, f.position, INTERPOLATION_ALPHA),
          });
        }
        return next;
      });
    });

    // ── Hit recebido (fauna ou PvP) ───────────────────────
    socket.on('player:hit', (data: any) => {
      const dmgText = `-${data.damage} ${data.damageType ?? 'dano'}`;
      notify(dmgText, 'danger');

      // Aplica efeito de status no estado local
      if (data.statusEffect && localRef.current) {
        const effect: ActiveEffectClient = {
          type:      data.statusEffect.type,
          expiresAt: Date.now() + data.statusEffect.durationSec * 1000,
        };
        localRef.current.activeEffects = [
          ...localRef.current.activeEffects.filter(e => e.type !== effect.type),
          effect,
        ];
        setLocalPlayer({ ...localRef.current });
        notify(`Afetado: ${effect.type}`, 'warning');
      }

      // Dispara evento global para o HUD exibir a tela de dano
      window.dispatchEvent(new CustomEvent('game:player_hit', { detail: data }));
    });

    // ── Morte ─────────────────────────────────────────────
    socket.on('player:died', (data: any) => {
      if (localRef.current) {
        localRef.current.inventory      = [];
        localRef.current.weightUsed     = 0;
        localRef.current.activeEffects  = [];
        localRef.current.isExtracting   = false;
        setLocalPlayer({ ...localRef.current });
      }
      window.dispatchEvent(new CustomEvent('game:player_died', { detail: data }));
    });

    // ── Respawn ───────────────────────────────────────────
    socket.on('player:respawned', (data: any) => {
      if (localRef.current) {
        localRef.current.position = data.position;
        localRef.current.hp       = data.hp;
        localRef.current.thirst   = data.thirst;
        setLocalPlayer({ ...localRef.current });
      }
      window.dispatchEvent(new CustomEvent('game:player_respawned', { detail: data }));
    });

    // ── Feedback de ataque ────────────────────────────────
    socket.on('attack:hit', (data: any) => {
      const label = data.targetType === 'fauna'
        ? `Acertou! -${data.damage}`
        : `PvP -${data.damage}`;
      notify(label, 'success');
    });

    socket.on('attack:miss', (data: any) => {
      notify(data.reason ?? 'Errou', 'info');
    });

    // ── Kill de fauna ─────────────────────────────────────
    socket.on('fauna:killed', (data: any) => {
      notify(`${data.faunaLabel} abatido!`, 'success');
      if (localRef.current) {
        localRef.current.inventory  = data.inventory;
        localRef.current.weightUsed = data.weightUsed;
        setLocalPlayer({ ...localRef.current });
      }
    });

    socket.on('fauna:died', (data: any) => {
      // Remove do mapa de fauna (opcional — o próximo snapshot já exclui)
      setFaunaEntities(prev => {
        const next = new Map(prev);
        next.delete(data.faunaId);
        return next;
      });
    });

    // ── Outro player morreu (kill feed) ──────────────────
    socket.on('player:other_died', (data: any) => {
      notify(`${data.username} foi eliminado`, 'info');
    });

    socket.on('kill:confirmed', (data: any) => {
      notify(`Você eliminou ${data.targetUsername}!`, 'success');
    });

    // ── Loot ─────────────────────────────────────────────
    socket.on('collect:ok', (data: any) => {
      if (localRef.current) {
        localRef.current.inventory  = data.inventory;
        localRef.current.weightUsed = data.weightUsed;
        setLocalPlayer({ ...localRef.current });
      }
      notify(`+${data.collected}× ${data.itemType.replace(/_/g, ' ')}`, 'success');
    });

    socket.on('collect:fail', (data: any) => notify(data.reason, 'warning'));

    // ── Extração ──────────────────────────────────────────
    socket.on('extract:started',   (d: any) => notify(`Extraindo em ${d.zoneLabel}… ${d.durationMs / 1000}s`, 'info'));
    socket.on('extract:ok',        (d: any) => notify(d.message, 'success'));
    socket.on('extract:cancelled', ()       => notify('Extração cancelada', 'warning'));
    socket.on('extract:fail',      (d: any) => notify(d.reason, 'warning'));

    return () => {
      [
        'game:joined', 'player:move_ack', 'world:state',
        'player:hit', 'player:died', 'player:respawned', 'player:other_died',
        'attack:hit', 'attack:miss',
        'fauna:killed', 'fauna:died',
        'kill:confirmed',
        'collect:ok', 'collect:fail',
        'extract:started', 'extract:ok', 'extract:cancelled', 'extract:fail',
      ].forEach(ev => socket.off(ev));
    };
  }, [socket, notify]);

  // ── Input de teclado ──────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const onUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  }, []);

  // ── Game loop (rAF) — Client Prediction ──────────────────
  useEffect(() => {
    function loop(now: number) {
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const local = localRef.current;
      const sock  = socketRef.current;

      if (local && sock) {
        const keys = keysRef.current;
        let dx = 0, dy = 0;
        if (keys.has('ArrowLeft')  || keys.has('a')) dx -= 1;
        if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
        if (keys.has('ArrowUp')    || keys.has('w')) dy -= 1;
        if (keys.has('ArrowDown')  || keys.has('s')) dy += 1;

        if (dx !== 0 || dy !== 0) {
          const seq   = ++seqRef.current;
          const input = { seq, dx, dy, dt };

          const predictedPos = simulateMove(local.position, input);
          local.position = predictedPos;
          setLocalPlayer({ ...local });

          sock.emit('player:move', input);

          pendingInputs.current.push({ ...input, predictedPos });
          if (pendingInputs.current.length > 60) pendingInputs.current.shift();

          if (local.isExtracting) {
            sock.emit('player:extract_cancel');
            local.isExtracting = false;
          }
        }

        // Expira efeitos de status no cliente (visual apenas)
        const now2 = Date.now();
        if (local.activeEffects.some(e => now2 >= e.expiresAt)) {
          local.activeEffects = local.activeEffects.filter(e => now2 < e.expiresAt);
          setLocalPlayer({ ...local });
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Ações do jogador ──────────────────────────────────────
  const collect = useCallback((resourceId: string) => {
    socketRef.current?.emit('player:collect', { resourceId });
  }, []);

  const startExtraction = useCallback(() => {
    socketRef.current?.emit('player:extract_start');
  }, []);

  const attackFauna = useCallback((faunaId: string) => {
    socketRef.current?.emit('player:attack_fauna', { faunaId });
  }, []);

  const attackPlayer = useCallback((targetSocketId: string) => {
    socketRef.current?.emit('player:attack_player', { targetSocketId });
  }, []);

  return {
    localPlayer,
    remotePlayers,
    faunaEntities,
    resources,
    extractionZones,
    notifications,
    collect,
    startExtraction,
    attackFauna,
    attackPlayer,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function simulateMove(pos: Vec2, input: { dx: number; dy: number; dt: number }): Vec2 {
  const dt  = Math.min(input.dt, 100) / 1000;
  const len = Math.hypot(input.dx, input.dy);
  const ndx = len > 0 ? input.dx / len : 0;
  const ndy = len > 0 ? input.dy / len : 0;
  return {
    x: Math.max(0, Math.min(2000, pos.x + ndx * PLAYER_SPEED * dt)),
    y: Math.max(0, Math.min(2000, pos.y + ndy * PLAYER_SPEED * dt)),
  };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// ============================================================
// TICK LOOP — Fase 4 (usa death.handler centralizado)
// ============================================================

import type { Server as SocketIO } from 'socket.io';
import type {
  RoomState, WorldSnapshot,
  SnapshotPlayer, SnapshotResource, SnapshotFauna,
} from './world.state';
import { tickFauna, FAUNA_REGISTRY }        from './fauna';
import {
  drainVitals,
  applyDamage,
  applyStatusEffect,
  tickStatusEffects,
}                                           from '../services/VitalsService';
import { handlePlayerDeath }               from '../handlers/death.handler';

const TICK_RATE_MS  = 33;           // ~30 ticks/s
const TICK_SECONDS  = TICK_RATE_MS / 1000;

const tickIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function startTickLoop(io: SocketIO, room: RoomState): void {
  if (tickIntervals.has(room.roomId)) return;
  const interval = setInterval(() => tick(io, room), TICK_RATE_MS);
  tickIntervals.set(room.roomId, interval);
}

export function stopTickLoop(roomId: string): void {
  const interval = tickIntervals.get(roomId);
  if (interval) { clearInterval(interval); tickIntervals.delete(roomId); }
}

function tick(io: SocketIO, room: RoomState): void {
  room.tick++;
  const now = Date.now();

  // ── 1. Respawn de recursos ────────────────────────────────
  for (const node of room.resources.values()) {
    if (node.respawnAt !== null && now >= node.respawnAt) {
      node.quantity  = node.maxQty;
      node.respawnAt = null;
    }
  }

  // ── 2. AI da fauna + ataques nos players ──────────────────
  const faunaAttacks = tickFauna(room.fauna, room.players, TICK_SECONDS, room.heightmap);

  for (const atk of faunaAttacks) {
    const target = room.players.get(atk.targetSocketId);
    if (!target) continue;

    const { died } = applyDamage(target, atk.damage);

    let appliedEffect: import('./world.state').ActiveStatusEffect | undefined;
    if (atk.statusEffect) {
      appliedEffect = applyStatusEffect(target, atk.statusEffect);
    }

    io.to(atk.targetSocketId).emit('player:hit', {
      source:       'fauna',
      faunaId:      atk.faunaId,
      faunaType:    atk.faunaType,
      damage:       atk.damage,
      damageType:   atk.damageType,
      hpAfter:      Math.round(target.hp),
      statusEffect: appliedEffect
        ? { type: appliedEffect.type, durationSec: atk.statusEffect!.durationSec }
        : undefined,
    });

    if (died) handlePlayerDeath(io, room, target);
  }

  // ── 3. Vitais + efeitos de status + morte por ambiente ────
  for (const player of room.players.values()) {
    const { died: diedThirst  } = drainVitals(player, TICK_SECONDS);
    const { died: diedEffects } = tickStatusEffects(player, TICK_SECONDS);
    if (diedThirst || diedEffects) handlePlayerDeath(io, room, player);
  }

  // ── 4. Broadcast WorldSnapshot ────────────────────────────
  io.to(room.roomId).emit('world:state', buildSnapshot(room));
}

function buildSnapshot(room: RoomState): WorldSnapshot {
  const players: SnapshotPlayer[] = [];
  for (const p of room.players.values()) {
    players.push({
      socketId:     p.socketId,
      username:     p.username,
      position:     { x: Math.round(p.position.x), y: Math.round(p.position.y) },
      hp:           Math.round(p.hp),
      thirst:       Math.round(p.thirst),
      isExtracting: p.isExtracting,
    });
  }

  const resources: SnapshotResource[] = [];
  for (const r of room.resources.values()) {
    resources.push({
      id:       r.id,
      type:     r.type,
      position: r.position,
      available: r.respawnAt === null && r.quantity > 0,
    });
  }

  // Mobs stealth só aparecem para players dentro do visibleRange.
  // O snapshot usa flag `stealth` + `visibleRange` e deixa o cliente filtrar.
  const fauna: SnapshotFauna[] = [];
  for (const f of room.fauna.values()) {
    if (f.state === 'dead') continue;
    const spec      = FAUNA_REGISTRY[f.type];
    const isStealth = f.behaviors.includes('stealth');
    const isAggro   = f.state === 'chase' || f.state === 'attack'
                   || f.state === 'charge_windup' || f.state === 'charging';

    fauna.push({
      id:           f.id,
      type:         f.type,
      label:        spec.label,
      position:     { x: Math.round(f.position.x), y: Math.round(f.position.y) },
      hpPct:        Math.round((f.hp / f.maxHp) * 100),
      state:        f.state,
      isHostile:    spec.isHostile || (spec.isConditional && isAggro),
      isAggro,
      stealth:      isStealth,
      visibleRange: isStealth ? f.perception * 0.5 : 0,
      damageType:   spec.damageType,
    });
  }

  return { tick: room.tick, players, resources, fauna };
}

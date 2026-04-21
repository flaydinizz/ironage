// ============================================================
// COMBAT HANDLER — Processa intenções de ataque
//
// Eventos recebidos do cliente:
//   player:attack_fauna  { faunaId }
//   player:attack_player { targetSocketId }
//
// O servidor valida tudo (distância, cooldown, alvo válido)
// antes de aplicar qualquer dano.
// ============================================================

import type { Socket, Server as SocketIO } from 'socket.io';
import { getRoomBySocket, getPlayerBySocket } from '../game/room.manager';
import {
  playerAttackFauna,
  playerAttackPlayer,
  rollFaunaLoot,
  clearCombatState,
} from '../services/CombatService';
import { applyStatusEffect }               from '../services/VitalsService';
import { FAUNA_REGISTRY }                  from '../game/fauna';
import { grantXP }                         from '../services/SkillEngine';

export function registerCombatHandler(socket: Socket, io: SocketIO): void {

  // ── PvE: player ataca fauna ───────────────────────────────
  socket.on('player:attack_fauna', ({ faunaId }: { faunaId: string }) => {
    const room    = getRoomBySocket(socket.id);
    const attacker = getPlayerBySocket(socket.id);
    if (!room || !attacker) return;

    const result = playerAttackFauna(attacker, faunaId, room);

    if (!result.hit) {
      socket.emit('attack:miss', { reason: result.reason });
      return;
    }

    const fauna = room.fauna.get(faunaId);
    if (!fauna) return;

    const spec = FAUNA_REGISTRY[fauna.type];

    // Feedback visual do hit para o atacante
    socket.emit('attack:hit', {
      targetId:   faunaId,
      targetType: 'fauna',
      damage:     result.damage,
      damageType: spec.damageType,
      hpPct:      Math.round((fauna.hp / fauna.maxHp) * 100),
    });

    // Se a fauna morreu, gera loot, concede XP e notifica a sala
    if (result.targetDied) {
      const { loot }    = rollFaunaLoot(fauna, attacker);
      const xpResults   = grantXP(attacker.playerId, 'kill_fauna');

      socket.emit('fauna:killed', {
        faunaId,
        faunaType:  fauna.type,
        faunaLabel: spec.label,
        damageType: spec.damageType,
        loot,
        xpResults,
        inventory:   attacker.inventory,
        weightUsed:  Math.round(attacker.inventoryWeightUsed * 10) / 10,
        weightLimit: attacker.inventoryWeightLimit,
      });

      socket.to(room.roomId).emit('fauna:died', {
        faunaId,
        faunaLabel: spec.label,
        position:   fauna.position,
      });
    }
  });

  // ── PvP: player ataca outro player ───────────────────────
  socket.on('player:attack_player', ({ targetSocketId }: { targetSocketId: string }) => {
    const room     = getRoomBySocket(socket.id);
    const attacker = getPlayerBySocket(socket.id);
    if (!room || !attacker) return;

    // Não pode atacar a si mesmo
    if (targetSocketId === socket.id) return;

    const target = room.players.get(targetSocketId);
    if (!target) {
      socket.emit('attack:miss', { reason: 'Alvo não encontrado' });
      return;
    }

    const result = playerAttackPlayer(attacker, target);

    if (!result.hit) {
      socket.emit('attack:miss', { reason: result.reason });
      return;
    }

    // Feedback para o atacante
    socket.emit('attack:hit', {
      targetId:   targetSocketId,
      targetType: 'player',
      damage:     result.damage,
      hpAfter:    Math.round(target.hp),
    });

    // Notifica o player que tomou dano
    io.to(targetSocketId).emit('player:hit', {
      source:    'player',
      attackerId: socket.id,
      damage:     result.damage,
      hpAfter:    Math.round(target.hp),
    });

    // Morte por PvP — tratada pelo mesmo fluxo de death
    if (result.targetDied) {
      const xpResults = grantXP(attacker.playerId, 'kill_player');

      io.to(targetSocketId).emit('player:died', {
        message:  `Você foi eliminado por ${attacker.username}.`,
        lostItems: [...target.inventory],
        respawnAt: { x: 200 + Math.random() * 1600, y: 200 + Math.random() * 1600 },
      });

      socket.emit('kill:confirmed', {
        targetUsername: target.username,
        xpResults,
      });
    }
  });

  // ── Cleanup ao desconectar ────────────────────────────────
  socket.on('disconnect', () => clearCombatState(socket.id));
}

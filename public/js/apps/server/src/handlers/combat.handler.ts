// ============================================================
// COMBAT HANDLER — Processa intenções de ataque (Fase 4)
//
// Eventos recebidos do cliente:
//   player:attack_fauna  { faunaId }
//   player:attack_player { targetSocketId }
//
// O servidor valida tudo (distância, cooldown, alvo válido)
// antes de aplicar qualquer dano.
//
// Mortes são delegadas ao death.handler para evitar duplicação.
// ============================================================

import type { Socket, Server as SocketIO }      from 'socket.io';
import { getRoomBySocket, getPlayerBySocket }    from '../game/room.manager';
import {
  playerAttackFauna,
  playerAttackPlayer,
  rollFaunaLoot,
  clearCombatState,
}                                               from '../services/CombatService';
import { applyStatusEffect }                    from '../services/VitalsService';
import { FAUNA_REGISTRY }                       from '../game/fauna';
import { grantXP, getSkills } from '../services/SkillEngine';
import { handlePlayerDeath }                    from './death.handler';

export function registerCombatHandler(socket: Socket, io: SocketIO): void {

  // ── PvE: player ataca fauna ───────────────────────────────
  socket.on('player:attack_fauna', ({ faunaId }: { faunaId: string }) => {
    const room     = getRoomBySocket(socket.id);
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

    socket.emit('attack:hit', {
      targetId:   faunaId,
      targetType: 'fauna',
      damage:     result.damage,
      damageType: spec.damageType,
      hpPct:      Math.round((fauna.hp / fauna.maxHp) * 100),
    });

    if (result.targetDied) {
      const { loot }  = rollFaunaLoot(fauna, attacker);
      const xpResults = grantXP(attacker.playerId, 'kill_fauna');

      socket.emit('fauna:killed', {
        faunaId,
        faunaType:   fauna.type,
        faunaLabel:  spec.label,
        damageType:  spec.damageType,
        loot,
        xpResults,
        inventory:   attacker.inventory,
        weightUsed:  Math.round(attacker.inventoryWeightUsed * 10) / 10,
        weightLimit: attacker.inventoryWeightLimit,
        skills:      getSkills(attacker.playerId),
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

    // Notifica o alvo que foi atingido
    io.to(targetSocketId).emit('player:hit', {
      source:     'player',
      attackerId: socket.id,
      damage:     result.damage,
      hpAfter:    Math.round(target.hp),
    });

    // Morte por PvP — delega ao death.handler
    if (result.targetDied) {
      const xpResults = grantXP(attacker.playerId, 'kill_player');
      handlePlayerDeath(io, room, target, attacker.username);
      socket.emit('kill:confirmed', {
        targetUsername: target.username,
        xpResults,
      });
    }
  });

  // ── Cleanup ao desconectar ────────────────────────────────
  socket.on('disconnect', () => clearCombatState(socket.id));
}

// ============================================================
// LOOT HANDLER — Coleta de recursos (Fase 4 — com XP)
//
// Princípio Server Authority:
//   O cliente envia "quero coletar recurso X".
//   O servidor valida distância, disponibilidade e capacidade
//   da mochila antes de confirmar a coleta.
//
// Mudança Fase 4: grantXP() concede XP por coleta.
// ============================================================

import type { Socket }                           from 'socket.io';
import { getRoomBySocket, getPlayerBySocket }    from '../game/room.manager';
import { inRange, COLLECT_RANGE }               from '../game/physics';
import { ITEM_WEIGHT_TABLE }                    from '@survival/shared/types';
import type { SessionItem }                     from '../game/world.state';
import { grantXP, getSkills, RESOURCE_ACTION } from '../services/SkillEngine';

interface CollectIntent {
  resourceId: string;
  quantity?:  number; // quanto quer coletar (server limita ao disponível)
}

export function registerLootHandler(socket: Socket): void {
  socket.on('player:collect', (intent: CollectIntent) => {
    const room   = getRoomBySocket(socket.id);
    const player = getPlayerBySocket(socket.id);
    if (!room || !player) return;

    // ── 1. Recurso existe e está disponível? ─────────────────
    const node = room.resources.get(intent.resourceId);
    if (!node || node.respawnAt !== null || node.quantity <= 0) {
      socket.emit('collect:fail', {
        reason:     'Recurso indisponível',
        resourceId: intent.resourceId,
      });
      return;
    }

    // ── 2. Player está em alcance? ────────────────────────────
    if (!inRange(player.position, node.position, COLLECT_RANGE)) {
      socket.emit('collect:fail', {
        reason:     'Muito longe do recurso',
        resourceId: intent.resourceId,
      });
      return;
    }

    // ── 3. Calcula quanto pode coletar (peso da mochila) ──────
    const weightPerUnit = ITEM_WEIGHT_TABLE[node.type] ?? 1;
    const freeWeight    = player.inventoryWeightLimit - player.inventoryWeightUsed;
    const maxByWeight   = Math.floor(freeWeight / weightPerUnit);

    if (maxByWeight <= 0) {
      socket.emit('collect:fail', {
        reason:     'Mochila cheia',
        resourceId: intent.resourceId,
      });
      return;
    }

    const requested = intent.quantity ?? node.quantity;
    const collected  = Math.min(requested, node.quantity, maxByWeight);

    // ── 4. Aplica coleta no WorldState (RAM) ──────────────────
    node.quantity -= collected;
    if (node.quantity <= 0) {
      node.respawnAt = Date.now() + getRespawnMs(node.type);
    }

    const existing = player.inventory.find(i => i.itemType === node.type);
    if (existing) {
      existing.quantity += collected;
      existing.weight   += weightPerUnit * collected;
    } else {
      player.inventory.push({
        itemType: node.type,
        quantity: collected,
        weight:   weightPerUnit * collected,
      } as SessionItem);
    }
    player.inventoryWeightUsed += weightPerUnit * collected;

    // ── 5. Concede XP pela coleta (Fase 4) ───────────────────
    const action    = RESOURCE_ACTION[node.type];
    const xpResults = action ? grantXP(player.playerId, action, collected) : [];

    // ── 6. Confirma ao cliente ────────────────────────────────
    socket.emit('collect:ok', {
      resourceId:  intent.resourceId,
      itemType:    node.type,
      collected,
      inventory:   player.inventory,
      weightUsed:  Math.round(player.inventoryWeightUsed * 10) / 10,
      weightLimit: player.inventoryWeightLimit,
      xpResults,
      skills:      getSkills(player.playerId),
    });
  });
}

function getRespawnMs(type: string): number {
  const table: Record<string, number> = {
    iron_ore:    120_000,
    wood:         60_000,
    stone:        90_000,
    fiber:        45_000,
    coal:        180_000,
    food_ration:  30_000,
  };
  return table[type] ?? 60_000;
}

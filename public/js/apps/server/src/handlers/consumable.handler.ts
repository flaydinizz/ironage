// ============================================================
// CONSUMABLE HANDLER — Uso de itens consumíveis (Etapa 11)
//
// Permite que players usem bandages e cantis diretamente do
// inventário de sessão ou do stash permanente via hotbar.
//
// Funcionalidade:
//   - Usa item do inventário de sessão (priority)
//   - Se não tiver no inventário, usa do stash
//   - Restaura HP/Thirst conforme metadata do item
//   - Atualiza banco de dados se usar do stash
// ============================================================

import type { Socket } from 'socket.io';
import { getRoomBySocket }      from '../game/room.manager';
import { ITEM_META, ITEM_WEIGHT_TABLE } from '@survival/shared/types';
import type { StashData } from '@survival/shared/types';
import { healPlayer, restoreThirst } from '../services/VitalsService';
import { PlayerRepository } from '../db/repositories/PlayerRepository';

export function registerConsumableHandler(socket: Socket): void {
  socket.on('player:use_consumable', async (data: { itemType: string; fromStash?: boolean }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const { itemType, fromStash = false } = data;
    const meta = ITEM_META[itemType as keyof typeof ITEM_META];

    // Valida se o item é consumível
    if (!meta?.onUse) {
      socket.emit('consumable:fail', { reason: 'Item não é consumível' });
      return;
    }

    // Tenta usar do inventário de sessão primeiro (se não forçado usar do stash)
    if (!fromStash) {
      const itemIdx = player.inventory.findIndex(i => i.itemType === itemType);
      
      if (itemIdx !== -1) {
        // Aplica efeitos
        let healedHp = 0, restoredThirst = 0;
        if (meta.onUse.restoreHp) healedHp = healPlayer(player, meta.onUse.restoreHp);
        if (meta.onUse.restoreThirst) restoredThirst = restoreThirst(player, meta.onUse.restoreThirst);

        // Remove 1 unidade do item
        player.inventory[itemIdx].quantity--;
        const weightPerUnit = ITEM_WEIGHT_TABLE[itemType as keyof typeof ITEM_WEIGHT_TABLE] || 0;
        player.inventoryWeightUsed -= weightPerUnit;
        
        if (player.inventory[itemIdx].quantity <= 0) {
          player.inventory.splice(itemIdx, 1);
        }

        socket.emit('consumable:ok', {
          itemType,
          healedHp,
          restoredThirst,
          hp: player.hp,
          thirst: player.thirst,
          inventory: player.inventory,
          weightUsed: player.inventoryWeightUsed,
          source: 'inventory',
        });

        console.log(`[Consumable] ${player.username} usou ${itemType} do inventário | HP:${player.hp} Sede:${player.thirst}`);
        return;
      }
    }

    // Se não tem no inventário ou forçado, tenta usar do stash
    try {
      const playerData = await PlayerRepository.findById(player.playerId);
      if (!playerData?.stash) {
        socket.emit('consumable:fail', { reason: 'Stash não encontrado' });
        return;
      }

      const stash = playerData.stash.items as StashData;
      const stashIdx = stash.findIndex(i => i.itemType === itemType);

      if (stashIdx === -1) {
        socket.emit('consumable:fail', { reason: `Você não tem ${meta.label} no stash` });
        return;
      }

      // Aplica efeitos
      let healedHp = 0, restoredThirst = 0;
      if (meta.onUse.restoreHp) healedHp = healPlayer(player, meta.onUse.restoreHp);
      if (meta.onUse.restoreThirst) restoredThirst = restoreThirst(player, meta.onUse.restoreThirst);

      // Remove 1 unidade do stash
      stash[stashIdx].quantity--;
      const weightPerUnit = ITEM_WEIGHT_TABLE[itemType as keyof typeof ITEM_WEIGHT_TABLE] || 0;
      stash[stashIdx].weight -= weightPerUnit;

      if (stash[stashIdx].quantity <= 0) {
        stash.splice(stashIdx, 1);
      }

      // Atualiza no banco
      await PlayerRepository.saveStash(player.playerId, stash, playerData.stash.version);

      socket.emit('consumable:ok', {
        itemType,
        healedHp,
        restoredThirst,
        hp: player.hp,
        thirst: player.thirst,
        stash,
        source: 'stash',
      });

      console.log(`[Consumable] ${player.username} usou ${itemType} do stash | HP:${player.hp} Sede:${player.thirst}`);
    } catch (err) {
      console.error(`[Consumable] Erro ao usar item do stash:`, err);
      socket.emit('consumable:fail', { reason: 'Erro ao acessar stash' });
    }
  });
}

// ============================================================
// EXTRACTION HANDLER — Zona de extração
//
// Quando o player entra em uma ExtractionZone e confirma a
// extração, o inventário de sessão é fundido no stash permanente
// (único write no banco durante toda a sessão de jogo).
// ============================================================

import type { Socket } from 'socket.io';
import { getRoomBySocket, getPlayerBySocket } from '../game/room.manager';
import { inRange }                            from '../game/physics';
import { PlayerRepository }                   from '../db/repositories/PlayerRepository';
import { ITEM_WEIGHT_TABLE }                  from '@survival/shared/types';
import type { StashData, ItemStack }          from '@survival/shared/types';
import { grantXP, flushSkills }              from '../services/SkillEngine';

const EXTRACTION_DURATION_MS = 5_000; // 5s para extrair (interruptível)
const extractionTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerExtractionHandler(socket: Socket): void {

  // ── Inicia extração ───────────────────────────────────────
  socket.on('player:extract_start', async () => {
    const room   = getRoomBySocket(socket.id);
    const player = getPlayerBySocket(socket.id);
    if (!room || !player) return;

    // Verifica se está em alguma zona de extração
    const zone = room.extractionZones.find(z =>
      inRange(player.position, z.position, z.radius)
    );

    if (!zone) {
      socket.emit('extract:fail', { reason: 'Fora de uma zona de extração' });
      return;
    }

    if (player.inventory.length === 0) {
      socket.emit('extract:fail', { reason: 'Mochila vazia' });
      return;
    }

    // Cancela timer anterior se existir (raro, mas seguro)
    clearExtractionTimer(socket.id);

    player.isExtracting = true;
    socket.emit('extract:started', {
      zoneId:     zone.id,
      zoneLabel:  zone.label,
      durationMs: EXTRACTION_DURATION_MS,
    });

    // Timer da extração — se player se mover, é cancelado pelo movement handler
    const timer = setTimeout(async () => {
      await completeExtraction(socket, player);
    }, EXTRACTION_DURATION_MS);

    extractionTimers.set(socket.id, timer);
  });

  // ── Cancela extração (player se moveu ou cancelou) ────────
  socket.on('player:extract_cancel', () => {
    const player = getPlayerBySocket(socket.id);
    if (!player || !player.isExtracting) return;

    clearExtractionTimer(socket.id);
    player.isExtracting = false;
    socket.emit('extract:cancelled');
  });

  // ── Cleanup no disconnect ─────────────────────────────────
  socket.on('disconnect', () => {
    clearExtractionTimer(socket.id);
  });
}

async function completeExtraction(socket: Socket, player: ReturnType<typeof getPlayerBySocket>) {
  if (!player) return;

  player.isExtracting = false;
  extractionTimers.delete(socket.id);

  try {
    // Carrega stash atual do banco
    const dbPlayer = await PlayerRepository.findById(player.playerId);
    if (!dbPlayer?.stash) {
      socket.emit('extract:fail', { reason: 'Erro ao carregar stash' });
      return;
    }

    const currentStash = (dbPlayer.stash.items as StashData) ?? [];
    const currentVersion = dbPlayer.stash.version;
    const weightLimit = dbPlayer.stash.weightLimit;

    // Funde inventário de sessão no stash permanente
    const merged = mergeInventories(currentStash, player.inventory);

    // Valida peso total do stash
    const totalWeight = merged.reduce((s, i) => s + i.weight, 0);
    if (totalWeight > weightLimit) {
      const partial = fitIntoWeight(merged, weightLimit);
      PlayerRepository.saveStash(player.playerId, partial as StashData, currentVersion);
      player.inventory           = [];
      player.inventoryWeightUsed = 0;

      // XP de extração + flush (evento crítico)
      const xpResults = grantXP(player.playerId, 'extraction_success');
      flushSkills(player.playerId);

      socket.emit('extract:ok', {
        message:    'Extração parcial — stash quase cheio',
        extracted:  partial,
        partial:    true,
        xpResults,
      });
    } else {
      PlayerRepository.saveStash(player.playerId, merged as StashData, currentVersion);
      player.inventory           = [];
      player.inventoryWeightUsed = 0;

      const xpResults = grantXP(player.playerId, 'extraction_success');
      flushSkills(player.playerId);

      socket.emit('extract:ok', {
        message:    'Extração completa!',
        extracted:  merged,
        partial:    false,
        xpResults,
      });
    }
  } catch (err) {
    console.error('[Extraction] Erro ao salvar stash:', err);
    socket.emit('extract:fail', { reason: 'Erro interno ao salvar' });
  }
}

// Funde dois inventários agrupando por itemType e recalculando peso
function mergeInventories(stash: StashData, session: { itemType: string; quantity: number; weight: number }[]): ItemStack[] {
  const map = new Map<string, ItemStack>();

  for (const item of stash) {
    map.set(item.itemType, { ...item });
  }

  for (const item of session) {
    const existing = map.get(item.itemType);
    const unitWeight = ITEM_WEIGHT_TABLE[item.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    if (existing) {
      existing.quantity += item.quantity;
      existing.weight    = existing.quantity * unitWeight;
    } else {
      map.set(item.itemType, {
        itemType: item.itemType as any,
        quantity: item.quantity,
        weight:   item.quantity * unitWeight,
      });
    }
  }

  return Array.from(map.values());
}

// Preenche inventário até o limite de peso
function fitIntoWeight(items: ItemStack[], limit: number): ItemStack[] {
  const result: ItemStack[] = [];
  let remaining = limit;

  for (const item of items) {
    const unitWeight = ITEM_WEIGHT_TABLE[item.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    const maxQty = Math.floor(remaining / unitWeight);
    if (maxQty <= 0) continue;
    const qty = Math.min(item.quantity, maxQty);
    result.push({ ...item, quantity: qty, weight: qty * unitWeight });
    remaining -= qty * unitWeight;
  }

  return result;
}

function clearExtractionTimer(socketId: string): void {
  const timer = extractionTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    extractionTimers.delete(socketId);
  }
}

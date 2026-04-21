// ============================================================
// EXTRACTION HANDLER — Zona de extração (Fase 4 — com XP)
//
// Quando o player confirma a extração, o inventário de sessão
// é fundido no stash permanente (único write no banco durante
// toda a sessão de jogo).
//
// Mudança Fase 4: grantXP('extraction_success') + flushSkills()
// garantem que o XP acumulado na sessão é persistido junto com
// o stash, no mesmo evento crítico.
// ============================================================

import type { Socket }                           from 'socket.io';
import { getRoomBySocket, getPlayerBySocket }    from '../game/room.manager';
import { inRange }                              from '../game/physics';
import { PlayerRepository }                     from '../db/repositories/PlayerRepository';
import { ITEM_WEIGHT_TABLE }                    from '@survival/shared/types';
import type { StashData, ItemStack }            from '@survival/shared/types';
import { grantXP, flushSkills, getSkills } from '../services/SkillEngine';

const EXTRACTION_DURATION_MS = 5_000; // 5s interruptíveis
const extractionTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerExtractionHandler(socket: Socket): void {

  // ── Inicia extração ───────────────────────────────────────
  socket.on('player:extract_start', async () => {
    const room   = getRoomBySocket(socket.id);
    const player = getPlayerBySocket(socket.id);
    if (!room || !player) return;

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

    clearExtractionTimer(socket.id);

    player.isExtracting = true;
    socket.emit('extract:started', {
      zoneId:     zone.id,
      zoneLabel:  zone.label,
      durationMs: EXTRACTION_DURATION_MS,
    });

    // Timer cancelado automaticamente se o player se mover
    // (movement handler chama player:extract_cancel)
    const timer = setTimeout(async () => {
      await completeExtraction(socket, player);
    }, EXTRACTION_DURATION_MS);

    extractionTimers.set(socket.id, timer);
  });

  // ── Cancela extração ──────────────────────────────────────
  socket.on('player:extract_cancel', () => {
    const player = getPlayerBySocket(socket.id);
    if (!player || !player.isExtracting) return;
    clearExtractionTimer(socket.id);
    player.isExtracting = false;
    socket.emit('extract:cancelled');
  });

  // ── Cleanup no disconnect ─────────────────────────────────
  socket.on('disconnect', () => clearExtractionTimer(socket.id));
}

async function completeExtraction(
  socket: Socket,
  player: ReturnType<typeof getPlayerBySocket>,
): Promise<void> {
  if (!player) return;

  player.isExtracting = false;
  extractionTimers.delete(socket.id);

  try {
    const dbPlayer = await PlayerRepository.findById(player.playerId);
    if (!dbPlayer?.stash) {
      socket.emit('extract:fail', { reason: 'Erro ao carregar stash' });
      return;
    }

    const currentStash   = (dbPlayer.stash.items as StashData) ?? [];
    const currentVersion = dbPlayer.stash.version;
    const weightLimit    = dbPlayer.stash.weightLimit;

    const merged      = mergeInventories(currentStash, player.inventory);
    const totalWeight = merged.reduce((s, i) => s + i.weight, 0);

    const isPartial = totalWeight > weightLimit;
    const finalStash = isPartial ? fitIntoWeight(merged, weightLimit) : merged;

    PlayerRepository.saveStash(player.playerId, finalStash as StashData, currentVersion);

    player.inventory           = [];
    player.inventoryWeightUsed = 0;

    // XP de extração + flush — evento crítico, persiste tudo junto
    const xpResults = grantXP(player.playerId, 'extraction_success');
    flushSkills(player.playerId);

    socket.emit('extract:ok', {
      message:   isPartial ? 'Extração parcial — stash quase cheio' : 'Extração completa!',
      extracted: finalStash,
      partial:   isPartial,
      xpResults,
      skills:    getSkills(player.playerId),
    });

  } catch (err) {
    console.error('[Extraction] Erro ao salvar stash:', err);
    socket.emit('extract:fail', { reason: 'Erro interno ao salvar' });
  }
}

// ── Funde inventário de sessão no stash permanente ───────────
function mergeInventories(
  stash:   StashData,
  session: { itemType: string; quantity: number; weight: number }[],
): ItemStack[] {
  const map = new Map<string, ItemStack>();

  for (const item of stash) map.set(item.itemType, { ...item });

  for (const item of session) {
    const unitWeight = ITEM_WEIGHT_TABLE[item.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    const existing   = map.get(item.itemType);
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

// ── Corta o stash ao limite de peso ──────────────────────────
function fitIntoWeight(items: ItemStack[], limit: number): ItemStack[] {
  const result: ItemStack[] = [];
  let remaining = limit;

  for (const item of items) {
    const unitWeight = ITEM_WEIGHT_TABLE[item.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    const maxQty     = Math.floor(remaining / unitWeight);
    if (maxQty <= 0) continue;
    const qty = Math.min(item.quantity, maxQty);
    result.push({ ...item, quantity: qty, weight: qty * unitWeight });
    remaining -= qty * unitWeight;
  }

  return result;
}

function clearExtractionTimer(socketId: string): void {
  const timer = extractionTimers.get(socketId);
  if (timer) { clearTimeout(timer); extractionTimers.delete(socketId); }
}

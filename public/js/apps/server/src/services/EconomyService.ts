// ============================================================
// ECONOMY SERVICE — Fase 4B
//
// Mercado dinâmico: preços flutuam com oferta e demanda global.
//
// Algoritmo de precificação:
//   pressão      = (boughtSinceReset - soldSinceReset) / SENSITIVITY
//   currentPrice = basePrice * clamp(1 + pressão, MIN_MULT, MAX_MULT)
//
// - Muita compra → preço sobe (escassez)
// - Muita venda  → preço cai (excesso de oferta)
// - Sem atividade → deriva de volta para basePrice
//
// O recálculo roda a cada RECALC_INTERVAL_MS (5 min).
// Compra e venda persistem imediatamente no banco.
// ============================================================

import { eq }                from 'drizzle-orm';
import { db }                from '../db';
import { globalEconomy, players } from '../db/schema';
import { PlayerRepository }  from '../db/repositories/PlayerRepository';
import { ITEM_WEIGHT_TABLE } from '@survival/shared/types';
import type { StashData }    from '@survival/shared/types';

// ── Parâmetros de balanceamento ───────────────────────────────
const PRICE_SENSITIVITY  = 50;    // unidades trocadas para mover 1% do preço
const PRICE_MIN_MULT     = 0.30;  // preço mínimo = 30% do base
const PRICE_MAX_MULT     = 4.00;  // preço máximo = 400% do base
const DRIFT_RATE         = 0.05;  // 5% de drift por reset em direção ao base
const RECALC_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutos

// ── Cache em memória do estado do mercado ────────────────────
interface MarketEntry {
  id:               string;
  itemType:         string;
  basePrice:        number;
  currentPrice:     number;
  stockQuantity:    number;
  soldSinceReset:   number;
  boughtSinceReset: number;
}

let marketCache = new Map<string, MarketEntry>();
let cacheLoaded = false;

// ── Resultado de transação ────────────────────────────────────
export interface TradeResult {
  ok:          boolean;
  reason?:     string;
  totalCost?:  number;
  newBalance?: number;
  stash?:      StashData;
}

// ══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════

export async function initEconomy(): Promise<void> {
  await loadMarketCache();
  scheduleRecalc();
  console.log(`[Economy] Mercado inicializado com ${marketCache.size} itens.`);
}

async function loadMarketCache(): Promise<void> {
  const rows = db.select().from(globalEconomy).all();
  marketCache = new Map(rows.map(r => [r.itemType, { ...r }]));
  cacheLoaded = true;
}

function scheduleRecalc(): void {
  setInterval(recalculatePrices, RECALC_INTERVAL_MS);
}

export function recalculatePrices(): void {
  for (const entry of marketCache.values()) {
    const netDemand  = entry.boughtSinceReset - entry.soldSinceReset;
    const pressure   = netDemand / PRICE_SENSITIVITY;
    const currentMult = entry.currentPrice / entry.basePrice;
    let   mult        = currentMult + ((1 + pressure) - currentMult) * (1 - DRIFT_RATE);
    mult = clamp(mult, PRICE_MIN_MULT, PRICE_MAX_MULT);

    const newPrice = Math.round(entry.basePrice * mult * 100) / 100;
    entry.currentPrice     = newPrice;
    entry.soldSinceReset   = 0;
    entry.boughtSinceReset = 0;

    db.update(globalEconomy)
      .set({ currentPrice: newPrice, soldSinceReset: 0, boughtSinceReset: 0, lastPriceUpdate: new Date() })
      .where(eq(globalEconomy.id, entry.id))
      .run();
  }
  console.log(`[Economy] Preços recalculados (${marketCache.size} itens)`);
}

// ══════════════════════════════════════════════════════════════
// LEITURA DO MERCADO
// ══════════════════════════════════════════════════════════════

export function getMarketSnapshot(): MarketEntry[] {
  return Array.from(marketCache.values()).map(e => ({
    ...e,
    currentPrice: Math.round(e.currentPrice * 100) / 100,
  }));
}

export function getItemPrice(itemType: string): number | null {
  return marketCache.get(itemType)?.currentPrice ?? null;
}

// ══════════════════════════════════════════════════════════════
// COMPRA — player compra item do Trader NPC
// ══════════════════════════════════════════════════════════════

export async function buyItem(
  playerId: string,
  itemType: string,
  quantity: number,
): Promise<TradeResult> {
  const entry = marketCache.get(itemType);
  if (!entry) return { ok: false, reason: 'Item não disponível no mercado' };
  if (entry.stockQuantity < quantity)
    return { ok: false, reason: `Estoque insuficiente (${entry.stockQuantity} disponíveis)` };

  const totalCost = Math.round(entry.currentPrice * quantity * 100) / 100;

  const dbPlayer = await PlayerRepository.findById(playerId);
  if (!dbPlayer) return { ok: false, reason: 'Player não encontrado' };

  if (dbPlayer.currency < totalCost)
    return { ok: false, reason: `Moeda insuficiente (você tem ${dbPlayer.currency.toFixed(2)}, precisa de ${totalCost.toFixed(2)})` };

  const stash        = (dbPlayer.stash?.items as StashData) ?? [];
  const stashVersion = dbPlayer.stash?.version ?? 1;
  const weightLimit  = dbPlayer.stash?.weightLimit ?? 500;
  const unitWeight   = ITEM_WEIGHT_TABLE[itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
  const addedWeight  = unitWeight * quantity;
  const currentWeight = stash.reduce((s, i) => s + i.weight, 0);

  if (currentWeight + addedWeight > weightLimit)
    return { ok: false, reason: 'Stash sem espaço para este item' };

  const newBalance = Math.round((dbPlayer.currency - totalCost) * 100) / 100;
  const newStash   = addToStash(stash, itemType, quantity, unitWeight * quantity);

  db.transaction(tx => {
    tx.update(players)
      .set({ currency: newBalance })
      .where(eq(players.id, playerId))
      .run();
    PlayerRepository.saveStash(playerId, newStash, stashVersion);
    tx.update(globalEconomy)
      .set({ stockQuantity: entry.stockQuantity - quantity, boughtSinceReset: entry.boughtSinceReset + quantity, updatedAt: new Date() })
      .where(eq(globalEconomy.id, entry.id))
      .run();
  });

  entry.stockQuantity    -= quantity;
  entry.boughtSinceReset += quantity;

  return { ok: true, totalCost, newBalance, stash: newStash };
}

// ══════════════════════════════════════════════════════════════
// VENDA — player vende item para o Trader NPC
// ══════════════════════════════════════════════════════════════

export async function sellItem(
  playerId: string,
  itemType: string,
  quantity: number,
): Promise<TradeResult> {
  const entry = marketCache.get(itemType);
  if (!entry) return { ok: false, reason: 'Item não aceito pelo Trader' };

  // Spread do Trader: preço de venda = 60% do preço atual
  const sellPrice = Math.round(entry.currentPrice * 0.6 * 100) / 100;
  const totalGain = Math.round(sellPrice * quantity * 100) / 100;

  const dbPlayer = await PlayerRepository.findById(playerId);
  if (!dbPlayer) return { ok: false, reason: 'Player não encontrado' };

  const stash        = (dbPlayer.stash?.items as StashData) ?? [];
  const stashVersion = dbPlayer.stash?.version ?? 1;
  const stack        = stash.find(s => s.itemType === itemType);

  if (!stack || stack.quantity < quantity)
    return { ok: false, reason: `Você não tem ${quantity}× ${itemType} no stash` };

  const newBalance = Math.round((dbPlayer.currency + totalGain) * 100) / 100;
  const newStash   = removeFromStash(stash, itemType, quantity);

  db.transaction(tx => {
    tx.update(players)
      .set({ currency: newBalance })
      .where(eq(players.id, playerId))
      .run();
    PlayerRepository.saveStash(playerId, newStash, stashVersion);
    tx.update(globalEconomy)
      .set({ stockQuantity: entry.stockQuantity + quantity, soldSinceReset: entry.soldSinceReset + quantity, updatedAt: new Date() })
      .where(eq(globalEconomy.id, entry.id))
      .run();
  });

  entry.stockQuantity  += quantity;
  entry.soldSinceReset += quantity;

  return { ok: true, totalCost: totalGain, newBalance, stash: newStash };
}

// ── Helpers ───────────────────────────────────────────────────

function addToStash(stash: StashData, itemType: string, qty: number, weight: number): StashData {
  const copy     = stash.map(s => ({ ...s }));
  const existing = copy.find(s => s.itemType === itemType);
  if (existing) { existing.quantity += qty; existing.weight += weight; }
  else copy.push({ itemType: itemType as any, quantity: qty, weight });
  return copy;
}

function removeFromStash(stash: StashData, itemType: string, qty: number): StashData {
  const unitWeight = ITEM_WEIGHT_TABLE[itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
  return stash
    .map(s => s.itemType === itemType
      ? { ...s, quantity: s.quantity - qty, weight: (s.quantity - qty) * unitWeight }
      : s)
    .filter(s => s.quantity > 0);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

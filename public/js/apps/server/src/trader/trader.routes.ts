// ============================================================
// TRADER ROUTES — Fase 4B
//
// GET  /trader/market    → snapshot atual do mercado dinâmico
// GET  /trader/balance   → saldo de moeda do player
// POST /trader/buy       → compra item do Trader NPC
// POST /trader/sell      → vende item para o Trader NPC
//
// Todas as rotas exigem autenticação (JWT via middleware).
// Preços flutuam via EconomyService (algoritmo de oferta/demanda).
// ============================================================

import type { FastifyPluginAsync } from 'fastify';
import { z }                       from 'zod';
import { authenticate }            from '../auth/auth.middleware';
import {
  getMarketSnapshot,
  buyItem,
  sellItem,
}                                  from '../services/EconomyService';
import { PlayerRepository }        from '../db/repositories/PlayerRepository';
import { ITEM_META }               from '@survival/shared/types';

// ── DTOs ──────────────────────────────────────────────────────
const BuyDTO = z.object({
  itemType: z.string().min(1),
  quantity: z.number().int().positive().max(999),
});

const SellDTO = z.object({
  itemType: z.string().min(1),
  quantity: z.number().int().positive().max(999),
});

// ── Plugin ────────────────────────────────────────────────────
export const traderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // ── GET /trader/market ────────────────────────────────────
  // Retorna todos os itens com preço atual, base, variação e estoque.
  // O cliente usa isso para renderizar a interface do Trader NPC.
  fastify.get('/market', async (_request, reply) => {
    const snapshot = getMarketSnapshot();

    const market = snapshot.map(entry => ({
      itemType:      entry.itemType,
      label:         ITEM_META[entry.itemType as keyof typeof ITEM_META]?.label ?? entry.itemType,
      currentPrice:  entry.currentPrice,
      basePrice:     entry.basePrice,
      // Variação percentual em relação ao preço base (positivo = caro, negativo = barato)
      priceChange:   Math.round(((entry.currentPrice - entry.basePrice) / entry.basePrice) * 100),
      stockQuantity: entry.stockQuantity,
      // Spread do Trader: preço de venda = 60% do preço de compra
      sellPrice:     Math.round(entry.currentPrice * 0.6 * 100) / 100,
    }));

    return reply.send({ market });
  });

  // ── GET /trader/balance ───────────────────────────────────
  fastify.get('/balance', async (request, reply) => {
    const player = await PlayerRepository.findById(request.player!.id);
    if (!player) return reply.code(404).send({ error: 'Player não encontrado' });
    return reply.send({ currency: player.currency });
  });

  // ── POST /trader/buy ──────────────────────────────────────
  fastify.post('/buy', async (request, reply) => {
    const parsed = BuyDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Dados inválidos',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { itemType, quantity } = parsed.data;
    const result = await buyItem(request.player!.id, itemType, quantity);

    if (!result.ok) {
      return reply.code(422).send({ error: result.reason });
    }

    const label = ITEM_META[itemType as keyof typeof ITEM_META]?.label ?? itemType;

    return reply.send({
      message:    `Comprou ${quantity}× ${label} por ${result.totalCost?.toFixed(2)}`,
      totalCost:  result.totalCost,
      newBalance: result.newBalance,
      stash:      result.stash,
    });
  });

  // ── POST /trader/sell ─────────────────────────────────────
  fastify.post('/sell', async (request, reply) => {
    const parsed = SellDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Dados inválidos',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { itemType, quantity } = parsed.data;
    const result = await sellItem(request.player!.id, itemType, quantity);

    if (!result.ok) {
      return reply.code(422).send({ error: result.reason });
    }

    const label = ITEM_META[itemType as keyof typeof ITEM_META]?.label ?? itemType;

    return reply.send({
      message:    `Vendeu ${quantity}× ${label} por ${result.totalCost?.toFixed(2)}`,
      totalGain:  result.totalCost,
      newBalance: result.newBalance,
      stash:      result.stash,
    });
  });
};

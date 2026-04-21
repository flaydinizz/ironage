// ============================================================
// STASH — Routes Plugin (Fastify)
//
// GET  /stash         — carrega stash permanente do player
// PUT  /stash         — salva stash após extração
// GET  /stash/weight  — calcula peso atual e capacidade restante
//
// Princípio #3 (Delayed Persistence): PUT só é chamado quando
// o player extrai com sucesso, não durante a sessão de jogo.
// ============================================================

import type { FastifyPluginAsync } from 'fastify';
import { z }                       from 'zod';
import { authenticate }            from '../auth/auth.middleware';
import { PlayerRepository }        from '../db/repositories/PlayerRepository';
import { ITEM_WEIGHT_TABLE }       from '@survival/shared/types';
import type { StashData, ItemStack } from '@survival/shared/types';

// Valida o payload de salvamento de stash
const SaveStashDTO = z.object({
  items:          z.array(z.object({
    itemType: z.string(),
    quantity: z.number().int().positive(),
    weight:   z.number().positive(),
    metadata: z.record(z.unknown()).optional(),
  })),
  version: z.number().int().nonneg(),
});

export const stashRoutes: FastifyPluginAsync = async (fastify) => {

  // Todas as rotas de stash requerem autenticação
  fastify.addHook('preHandler', authenticate);

  // ── GET /stash ───────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const player = await PlayerRepository.findById(request.player!.id);
    if (!player?.stash) {
      return reply.code(404).send({ error: 'Stash não encontrado' });
    }

    const items       = player.stash.items as StashData;
    const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);

    return reply.send({
      items,
      totalWeight:  Math.round(totalWeight * 100) / 100,
      weightLimit:  player.stash.weightLimit,
      freeCapacity: Math.round((player.stash.weightLimit - totalWeight) * 100) / 100,
      version:      player.stash.version,
    });
  });

  // ── PUT /stash ───────────────────────────────────────────
  // Chamado pelo servidor de jogo após extração bem-sucedida.
  // Em produção, este endpoint seria chamado internamente
  // pelo GameServer (não exposto diretamente ao cliente).
  fastify.put('/', async (request, reply) => {
    const parsed = SaveStashDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Payload de stash inválido',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { items, version } = parsed.data;

    // Recalcula pesos no servidor para garantir Server Authority
    // O cliente pode enviar weights corrompidos — ignoramos e recalculamos
    const trustedItems: StashData = items.map((item) => ({
      ...item,
      itemType: item.itemType as keyof typeof ITEM_WEIGHT_TABLE,
      weight:   (ITEM_WEIGHT_TABLE[item.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1)
                * item.quantity,
    })) as StashData;

    // Valida peso total
    const player = await PlayerRepository.findById(request.player!.id);
    if (!player?.stash) {
      return reply.code(404).send({ error: 'Stash não encontrado' });
    }

    const totalWeight = trustedItems.reduce((acc, i) => acc + i.weight, 0);
    if (totalWeight > player.stash.weightLimit) {
      return reply.code(422).send({
        error:  'Stash excede o limite de peso',
        limit:  player.stash.weightLimit,
        actual: totalWeight,
      });
    }

    // Persiste com controle de versão otimista
    PlayerRepository.saveStash(request.player!.id, trustedItems, version);

    return reply.send({
      message:      'Stash salvo com sucesso',
      totalWeight:  Math.round(totalWeight * 100) / 100,
      weightLimit:  player.stash.weightLimit,
      freeCapacity: Math.round((player.stash.weightLimit - totalWeight) * 100) / 100,
      newVersion:   version + 1,
    });
  });

  // ── GET /stash/weight ────────────────────────────────────
  fastify.get('/weight', async (request, reply) => {
    const player = await PlayerRepository.findById(request.player!.id);
    if (!player?.stash) {
      return reply.code(404).send({ error: 'Stash não encontrado' });
    }

    const items       = player.stash.items as StashData;
    const totalWeight = items.reduce((acc, i) => acc + i.weight, 0);
    const pct         = (totalWeight / player.stash.weightLimit) * 100;

    return reply.send({
      totalWeight:   Math.round(totalWeight * 100) / 100,
      weightLimit:   player.stash.weightLimit,
      freeCapacity:  Math.round((player.stash.weightLimit - totalWeight) * 100) / 100,
      usagePercent:  Math.round(pct * 10) / 10,
      isAlmostFull:  pct > 90,
    });
  });
};

// ============================================================
// CRAFTING ROUTES — Fase 4A
//
// GET  /crafting/recipes        — receitas desbloqueadas
// POST /crafting/craft          — executa um craft
// POST /crafting/use-item       — consome item do stash (bandage, water_flask)
// GET  /crafting/skills         — skills atuais do player
// ============================================================

import type { FastifyPluginAsync } from 'fastify';
import { z }                       from 'zod';
import { authenticate }            from '../auth/auth.middleware';
import { executeCraft, getAvailableRecipes } from '../services/CraftingService';
import { getSkills, grantXP, flushSkills }  from '../services/SkillEngine';
import { PlayerRepository }                 from '../db/repositories/PlayerRepository';
import { ITEM_META, ITEM_WEIGHT_TABLE }     from '@survival/shared/types';
import type { StashData }                   from '@survival/shared/types';

const CraftDTO = z.object({
  recipeId: z.string().min(1),
});

const UseItemDTO = z.object({
  itemType: z.string().min(1),
});

export const craftingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // ── GET /crafting/recipes ─────────────────────────────────
  // Retorna apenas receitas que o player já desbloqueou
  fastify.get('/recipes', async (request, reply) => {
    const recipes = await getAvailableRecipes(request.player!.id);
    return reply.send({ recipes });
  });

  // ── GET /crafting/skills ──────────────────────────────────
  // Retorna skills atuais (da RAM — sem hit no banco)
  fastify.get('/skills', async (request, reply) => {
    const skills = getSkills(request.player!.id);
    return reply.send({ skills });
  });

  // ── POST /crafting/craft ──────────────────────────────────
  fastify.post('/craft', async (request, reply) => {
    const parsed = CraftDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Dados inválidos',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await executeCraft(request.player!.id, parsed.data.recipeId);

    if (!result.ok) {
      return reply.code(422).send({ error: result.reason });
    }

    // Emite XP gains para o cliente (para o HUD de progressão)
    return reply.code(200).send({
      message:    `${result.output!.quantity}× ${ITEM_META[result.output!.itemType]?.label} crafted!`,
      output:     result.output,
      stash:      result.stash,
      xpResults:  result.xpResults,
    });
  });

  // ── POST /crafting/use-item ───────────────────────────────
  // Consome um item do stash (bandage, water_flask, food_ration)
  // Retorna os efeitos para o servidor de jogo aplicar via Socket.io
  // Em produção: o game server chamaria este endpoint internamente
  fastify.post('/use-item', async (request, reply) => {
    const parsed = UseItemDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos' });
    }

    const { itemType } = parsed.data;
    const meta = ITEM_META[itemType as keyof typeof ITEM_META];

    if (!meta?.onUse) {
      return reply.code(422).send({ error: 'Este item não pode ser usado diretamente' });
    }

    // Carrega stash, verifica item, consome 1 unidade
    const dbPlayer = await PlayerRepository.findById(request.player!.id);
    if (!dbPlayer?.stash) {
      return reply.code(404).send({ error: 'Stash não encontrado' });
    }

    const stash   = (dbPlayer.stash.items as StashData) ?? [];
    const stack   = stash.find(s => s.itemType === itemType);

    if (!stack || stack.quantity < 1) {
      return reply.code(422).send({ error: `${meta.label} não encontrado no stash` });
    }

    // Consome 1 unidade
    const unitWeight = ITEM_WEIGHT_TABLE[itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    stack.quantity  -= 1;
    stack.weight    -= unitWeight;
    const updatedStash = stash.filter(s => s.quantity > 0);

    PlayerRepository.saveStash(request.player!.id, updatedStash, dbPlayer.stash.version);

    return reply.code(200).send({
      message:    `${meta.label} usado!`,
      effects:    meta.onUse,   // { restoreHp?, restoreThirst? }
      stash:      updatedStash,
    });
  });
};

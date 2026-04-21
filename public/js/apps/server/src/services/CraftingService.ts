// ============================================================
// CRAFTING SERVICE — Fase 4A
//
// Crafting opera sobre o STASH PERMANENTE do jogador.
// É um evento crítico: lê e escreve no banco.
//
// Fluxo:
//   1. Valida skill mínima (via SkillEngine, em RAM)
//   2. Carrega stash do banco
//   3. Verifica ingredientes disponíveis
//   4. Consome ingredientes + adiciona output (em RAM)
//   5. Persiste stash + skills no banco (write único)
//   6. Retorna XPResult para o handler emitir ao cliente
// ============================================================

import { PlayerRepository }                    from '../db/repositories/PlayerRepository';
import { getSkillLevel, grantXP, flushSkills } from './SkillEngine';
import { RECIPE_REGISTRY }                     from '../game/recipes';
import { ITEM_WEIGHT_TABLE, ITEM_META }        from '@survival/shared/types';
import type { StashData, ItemStack, ItemType } from '@survival/shared/types';
import type { XPResult }                       from './SkillEngine';

export interface CraftResult {
  ok:         boolean;
  reason?:    string;
  output?:    { itemType: ItemType; quantity: number };
  stash?:     StashData;
  xpResults?: XPResult[];
}

// ── Executa um craft ──────────────────────────────────────────
export async function executeCraft(
  playerId: string,
  recipeId: string,
): Promise<CraftResult> {

  // 1. Receita válida?
  const recipe = RECIPE_REGISTRY[recipeId];
  if (!recipe) return { ok: false, reason: 'Receita desconhecida' };

  // 2. Skill suficiente? (RAM, sem I/O)
  const playerLevel = getSkillLevel(playerId, recipe.skillReq.skill);
  if (playerLevel < recipe.skillReq.level) {
    return {
      ok:     false,
      reason: `Requer ${recipe.skillReq.skill} nível ${recipe.skillReq.level} (você tem ${playerLevel})`,
    };
  }

  // 3. Carrega stash do banco
  const dbPlayer = await PlayerRepository.findById(playerId);
  if (!dbPlayer?.stash) return { ok: false, reason: 'Stash não encontrado' };

  const stash:       StashData = (dbPlayer.stash.items as StashData) ?? [];
  const version:     number    = dbPlayer.stash.version;
  const weightLimit: number    = dbPlayer.stash.weightLimit;

  // 4. Verifica ingredientes
  for (const ingredient of recipe.inputs) {
    const stack = stash.find(s => s.itemType === ingredient.itemType);
    if (!stack || stack.quantity < ingredient.quantity) {
      const meta = ITEM_META[ingredient.itemType];
      return { ok: false, reason: `Precisa de ${ingredient.quantity}× ${meta?.label ?? ingredient.itemType}` };
    }
  }

  // 5. Consome ingredientes (em RAM, imutável)
  let updatedStash = consumeIngredients(stash, recipe.inputs);

  // 6. Adiciona output
  const outputWeight  = (ITEM_WEIGHT_TABLE[recipe.output] ?? 1) * recipe.outputQty;
  const currentWeight = updatedStash.reduce((s, i) => s + i.weight, 0);

  if (currentWeight + outputWeight > weightLimit)
    return { ok: false, reason: 'Stash sem espaço para o item produzido' };

  updatedStash = addToStash(updatedStash, recipe.output, recipe.outputQty, outputWeight);

  // 7. Persiste stash
  PlayerRepository.saveStash(playerId, updatedStash, version);

  // 8. Concede XP + persiste skills
  const xpResults = grantXP(playerId, recipe.xpAction);
  flushSkills(playerId);

  return {
    ok:      true,
    output:  { itemType: recipe.output, quantity: recipe.outputQty },
    stash:   updatedStash,
    xpResults,
  };
}

// ── Consulta receitas disponíveis para o player ───────────────
export async function getAvailableRecipes(playerId: string) {
  const dbPlayer = await PlayerRepository.findById(playerId);
  const skills   = dbPlayer?.skills?.skillsData as Record<string, { level: number }> ?? {};

  return Object.values(RECIPE_REGISTRY)
    .filter(r => (skills[r.skillReq.skill]?.level ?? 1) >= r.skillReq.level)
    .map(r => ({
      id:           r.id,
      label:        r.label,
      description:  r.description,
      output:       r.output,
      outputQty:    r.outputQty,
      inputs:       r.inputs,
      skillReq:     r.skillReq,
      craftTimeSec: r.craftTimeSec,
    }));
}

// ── Helpers (imutáveis — não mutam o array original) ─────────

function consumeIngredients(
  stash:  StashData,
  inputs: { itemType: ItemType; quantity: number }[],
): StashData {
  const copy: StashData = stash.map(s => ({ ...s }));

  for (const input of inputs) {
    const stack      = copy.find(s => s.itemType === input.itemType)!;
    stack.quantity  -= input.quantity;
    stack.weight     = stack.quantity * (ITEM_WEIGHT_TABLE[input.itemType] ?? 1);
  }

  return copy.filter(s => s.quantity > 0);
}

function addToStash(
  stash:    StashData,
  itemType: ItemType,
  quantity: number,
  weight:   number,
): StashData {
  const copy     = stash.map(s => ({ ...s }));
  const existing = copy.find(s => s.itemType === itemType);

  if (existing) { existing.quantity += quantity; existing.weight += weight; }
  else copy.push({ itemType, quantity, weight });

  return copy;
}

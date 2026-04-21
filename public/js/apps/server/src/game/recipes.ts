// ============================================================
// RECIPES — Registro de receitas de crafting
//
// Cada receita define:
//   - inputs:       ingredientes consumidos do stash
//   - output:       item produzido + quantidade
//   - skillReq:     skill mínima necessária para desbloquear
//   - xpAction:     qual GameAction concede XP ao craftar
//   - craftTimeSec: tempo de craft (para feedback no cliente)
//
// Receitas operam sobre o STASH PERMANENTE.
// Crafting é um evento crítico: lê e escreve no banco.
// ============================================================

import type { ItemType } from '@survival/shared/types';
import type { SkillName } from '@survival/shared/types';
import type { GameAction } from '../services/SkillEngine';

export interface RecipeIngredient {
  itemType: ItemType;
  quantity: number;
}

export interface Recipe {
  id:           string;
  output:       ItemType;
  outputQty:    number;
  inputs:       RecipeIngredient[];
  skillReq:     { skill: SkillName; level: number };
  xpAction:     GameAction;
  craftTimeSec: number;
  label:        string;
  description:  string;
}

// ── Registro completo de receitas ────────────────────────────
export const RECIPE_REGISTRY: Record<string, Recipe> = {

  // ── Intermediários básicos ───────────────────────────────

  iron_ingot: {
    id: 'iron_ingot', label: 'Lingote de Ferro',
    description: 'Funde minério de ferro com carvão.',
    output: 'iron_ingot', outputQty: 1,
    inputs: [
      { itemType: 'iron_ore', quantity: 3 },
      { itemType: 'coal',     quantity: 1 },
    ],
    skillReq: { skill: 'mining', level: 2 }, xpAction: 'craft_item', craftTimeSec: 5,
  },

  wood_plank: {
    id: 'wood_plank', label: 'Tábua de Madeira',
    description: 'Serras troncos em tábuas utilizáveis.',
    output: 'wood_plank', outputQty: 2,
    inputs: [{ itemType: 'wood', quantity: 2 }],
    skillReq: { skill: 'carpentry', level: 1 }, xpAction: 'craft_item', craftTimeSec: 3,
  },

  rope: {
    id: 'rope', label: 'Corda',
    description: 'Trança fibras em uma corda resistente.',
    output: 'rope', outputQty: 1,
    inputs: [{ itemType: 'fiber', quantity: 5 }],
    skillReq: { skill: 'crafting', level: 1 }, xpAction: 'craft_item', craftTimeSec: 3,
  },

  // ── Consumíveis ──────────────────────────────────────────

  bandage: {
    id: 'bandage', label: 'Curativo',
    description: 'Estanca ferimentos. Restaura 30 HP.',
    output: 'bandage', outputQty: 2,
    inputs: [{ itemType: 'fiber', quantity: 4 }],
    skillReq: { skill: 'crafting', level: 2 }, xpAction: 'craft_item', craftTimeSec: 4,
  },

  water_flask: {
    id: 'water_flask', label: 'Cantil de Água',
    description: 'Armazena água. Restaura 50 de sede.',
    output: 'water_flask', outputQty: 1,
    inputs: [
      { itemType: 'wood_plank', quantity: 1 },
      { itemType: 'fiber',      quantity: 3 },
    ],
    skillReq: { skill: 'carpentry', level: 3 }, xpAction: 'craft_item', craftTimeSec: 5,
  },

  arrow: {
    id: 'arrow', label: 'Flechas',
    description: 'Munição para o arco. Produz 10 flechas.',
    output: 'arrow', outputQty: 10,
    inputs: [
      { itemType: 'wood_plank', quantity: 1 },
      { itemType: 'fiber',      quantity: 2 },
    ],
    skillReq: { skill: 'hunting', level: 3 }, xpAction: 'craft_item', craftTimeSec: 4,
  },

  // ── Ferramentas ──────────────────────────────────────────

  iron_pickaxe: {
    id: 'iron_pickaxe', label: 'Picareta de Ferro',
    description: 'Aumenta a coleta de minérios. Req. Mining 5.',
    output: 'iron_pickaxe', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 3 },
      { itemType: 'wood_plank', quantity: 2 },
      { itemType: 'rope',       quantity: 1 },
    ],
    skillReq: { skill: 'mining', level: 5 }, xpAction: 'craft_item', craftTimeSec: 8,
  },

  iron_axe_tool: {
    id: 'iron_axe_tool', label: 'Machado de Ferro',
    description: 'Aumenta a coleta de madeira. Req. Carpentry 5.',
    output: 'iron_axe_tool', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 2 },
      { itemType: 'wood_plank', quantity: 3 },
      { itemType: 'rope',       quantity: 1 },
    ],
    skillReq: { skill: 'carpentry', level: 5 }, xpAction: 'craft_item', craftTimeSec: 8,
  },

  // ── Armas ────────────────────────────────────────────────

  dagger: {
    id: 'dagger', label: 'Adaga',
    description: 'Arma leve de combate próximo.',
    output: 'dagger', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 2 },
      { itemType: 'rope',       quantity: 1 },
    ],
    skillReq: { skill: 'combat', level: 3 }, xpAction: 'craft_weapon', craftTimeSec: 6,
  },

  axe: {
    id: 'axe', label: 'Machado de Combate',
    description: 'Arma pesada de combate.',
    output: 'axe', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 3 },
      { itemType: 'wood_plank', quantity: 2 },
      { itemType: 'rope',       quantity: 1 },
    ],
    skillReq: { skill: 'combat', level: 5 }, xpAction: 'craft_weapon', craftTimeSec: 10,
  },

  iron_sword: {
    id: 'iron_sword', label: 'Espada de Ferro',
    description: 'Espada padrão de combate.',
    output: 'iron_sword', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 5 },
      { itemType: 'wood_plank', quantity: 1 },
      { itemType: 'rope',       quantity: 2 },
    ],
    skillReq: { skill: 'combat', level: 8 }, xpAction: 'craft_weapon', craftTimeSec: 12,
  },

  bow: {
    id: 'bow', label: 'Arco',
    description: 'Arma de longo alcance. Precisa de flechas.',
    output: 'bow', outputQty: 1,
    inputs: [
      { itemType: 'wood_plank', quantity: 4 },
      { itemType: 'rope',       quantity: 3 },
      { itemType: 'fiber',      quantity: 5 },
    ],
    skillReq: { skill: 'hunting', level: 6 }, xpAction: 'craft_weapon', craftTimeSec: 12,
  },

  // ── Armaduras ────────────────────────────────────────────

  leather_vest: {
    id: 'leather_vest', label: 'Colete de Couro',
    description: 'Proteção leve.',
    output: 'leather_vest', outputQty: 1,
    inputs: [
      { itemType: 'fiber', quantity: 15 },
      { itemType: 'rope',  quantity: 2  },
    ],
    skillReq: { skill: 'crafting', level: 4 }, xpAction: 'craft_armor', craftTimeSec: 10,
  },

  iron_helmet: {
    id: 'iron_helmet', label: 'Capacete de Ferro',
    description: 'Proteção média para a cabeça.',
    output: 'iron_helmet', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 4 },
      { itemType: 'fiber',      quantity: 5 },
    ],
    skillReq: { skill: 'crafting', level: 6 }, xpAction: 'craft_armor', craftTimeSec: 12,
  },

  iron_chestplate: {
    id: 'iron_chestplate', label: 'Peitoral de Ferro',
    description: 'Proteção pesada para o tronco.',
    output: 'iron_chestplate', outputQty: 1,
    inputs: [
      { itemType: 'iron_ingot', quantity: 8  },
      { itemType: 'fiber',      quantity: 10 },
      { itemType: 'rope',       quantity: 3  },
    ],
    skillReq: { skill: 'crafting', level: 10 }, xpAction: 'craft_armor', craftTimeSec: 20,
  },

  // ── Baús (Etapa 11) ──────────────────────────────

  chest: {
    id: 'chest', label: 'Baú Simples',
    description: 'Baú básico para organizar itens. Apenas armazenamento visual.',
    output: 'chest', outputQty: 1,
    inputs: [
      { itemType: 'wood', quantity: 10 },
      { itemType: 'rope', quantity: 1 },
    ],
    skillReq: { skill: 'carpentry', level: 1 }, xpAction: 'craft_item', craftTimeSec: 8,
  },

  storage_chest: {
    id: 'storage_chest', label: 'Baú Stash',
    description: 'Baú avançado. Permite transferir itens do inventário de sessão para o stash permanente.',
    output: 'storage_chest', outputQty: 1,
    inputs: [
      { itemType: 'wood_plank', quantity: 8 },
      { itemType: 'iron_ingot', quantity: 2 },
      { itemType: 'rope',       quantity: 2 },
    ],
    skillReq: { skill: 'carpentry', level: 4 }, xpAction: 'craft_item', craftTimeSec: 12,
  },
};

// Helper: receitas desbloqueadas para um dado conjunto de skills
export function getUnlockedRecipes(
  skills: Record<string, { level: number }>
): Recipe[] {
  return Object.values(RECIPE_REGISTRY).filter(recipe => {
    const playerLevel = skills[recipe.skillReq.skill]?.level ?? 1;
    return playerLevel >= recipe.skillReq.level;
  });
}

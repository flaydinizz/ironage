// ============================================================
// SEED — Inicializa o mercado global com todos os itens da Fase 4
//
// Run:  npx tsx src/db/seed.ts
//
// Idempotente: onConflictDoNothing() garante que rodar duas
// vezes não duplica nem sobrescreve entradas existentes.
// ============================================================

import { db }            from './index';
import { globalEconomy } from './schema';
import type { NewEconomyRecord } from './schema';

const INITIAL_ECONOMY: NewEconomyRecord[] = [
  // ── Recursos brutos ───────────────────────────────────────
  { itemType: 'iron_ore',    basePrice: 5,   currentPrice: 5,   stockQuantity: 500  },
  { itemType: 'wood',        basePrice: 3,   currentPrice: 3,   stockQuantity: 800  },
  { itemType: 'food_ration', basePrice: 2,   currentPrice: 2,   stockQuantity: 300  },
  { itemType: 'stone',       basePrice: 2,   currentPrice: 2,   stockQuantity: 600  },
  { itemType: 'fiber',       basePrice: 1,   currentPrice: 1,   stockQuantity: 1000 },
  { itemType: 'coal',        basePrice: 8,   currentPrice: 8,   stockQuantity: 200  },

  // ── Craftáveis intermediários ─────────────────────────────
  { itemType: 'iron_ingot',  basePrice: 18,  currentPrice: 18,  stockQuantity: 150  },
  { itemType: 'wood_plank',  basePrice: 7,   currentPrice: 7,   stockQuantity: 300  },
  { itemType: 'rope',        basePrice: 5,   currentPrice: 5,   stockQuantity: 200  },

  // ── Consumíveis ───────────────────────────────────────────
  { itemType: 'bandage',     basePrice: 12,  currentPrice: 12,  stockQuantity: 100  },
  { itemType: 'water_flask', basePrice: 15,  currentPrice: 15,  stockQuantity: 80   },
  { itemType: 'arrow',       basePrice: 1,   currentPrice: 1,   stockQuantity: 500  },

  // ── Ferramentas ───────────────────────────────────────────
  { itemType: 'iron_pickaxe',  basePrice: 60,  currentPrice: 60,  stockQuantity: 20 },
  { itemType: 'iron_axe_tool', basePrice: 55,  currentPrice: 55,  stockQuantity: 20 },

  // ── Armas ─────────────────────────────────────────────────
  { itemType: 'iron_sword',  basePrice: 80,  currentPrice: 80,  stockQuantity: 20   },
  { itemType: 'bow',         basePrice: 60,  currentPrice: 60,  stockQuantity: 30   },
  { itemType: 'dagger',      basePrice: 40,  currentPrice: 40,  stockQuantity: 25   },
  { itemType: 'axe',         basePrice: 50,  currentPrice: 50,  stockQuantity: 25   },

  // ── Armaduras ─────────────────────────────────────────────
  { itemType: 'leather_vest',    basePrice: 45,  currentPrice: 45,  stockQuantity: 15 },
  { itemType: 'iron_helmet',     basePrice: 70,  currentPrice: 70,  stockQuantity: 10 },
  { itemType: 'iron_chestplate', basePrice: 120, currentPrice: 120, stockQuantity: 8  },
];

async function seed() {
  console.log('🌱 Seeding global economy...');

  for (const entry of INITIAL_ECONOMY) {
    await db.insert(globalEconomy).values(entry).onConflictDoNothing();
  }

  console.log(`✅ ${INITIAL_ECONOMY.length} itens inseridos no mercado.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});

// ============================================================
// SCHEMA — stash
// Inventário permanente do jogador (salvo após extração bem-sucedida).
// Só é persistido em eventos críticos, conforme Princípio #3.
// ============================================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { players } from './players';
import { type StashData } from '@survival/shared/types';

export const stash = sqliteTable('stash', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  playerId: text('player_id')
    .notNull()
    .unique() // 1:1 com player
    .references(() => players.id, { onDelete: 'cascade' }),

  // Array de ItemStack serializado. Exemplo:
  // [{ itemType: 'iron_ore', quantity: 10, weight: 25 }, ...]
  items: text('items', { mode: 'json' })
    .notNull()
    .$type<StashData>()
    .$defaultFn(() => []),

  // Limite de peso (expansível via upgrades no jogo)
  weightLimit: real('weight_limit')
    .notNull()
    .default(500),

  // Controle de versão otimista: evita sobrescrever stash de sessões concorrentes
  version: integer('version')
    .notNull()
    .default(1),

  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type StashRecord    = typeof stash.$inferSelect;
export type NewStashRecord = typeof stash.$inferInsert;


// ============================================================
// SCHEMA — global_economy
// Estado global do mercado dinâmico (Fase 4).
// Os preços flutuam conforme oferta/demanda de todos os players.
// ============================================================

export const globalEconomy = sqliteTable('global_economy', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Identificador único do item no mercado
  itemType: text('item_type')
    .notNull()
    .unique(), // ex: 'iron_ore', 'wood', 'iron_sword'

  // Preço BASE definido pelo game design
  basePrice: real('base_price')
    .notNull(),

  // Preço ATUAL após ajuste do algoritmo de mercado
  currentPrice: real('current_price')
    .notNull(),

  // Estoque total disponível para compra nos Trader NPCs
  stockQuantity: integer('stock_quantity')
    .notNull()
    .default(0),

  // Total vendido pelos players desde o último reset de mercado
  soldSinceReset: integer('sold_since_reset')
    .notNull()
    .default(0),

  // Total comprado pelos players desde o último reset de mercado
  boughtSinceReset: integer('bought_since_reset')
    .notNull()
    .default(0),

  // Timestamp do último recálculo de preço pelo EconomyService
  lastPriceUpdate: integer('last_price_update', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),

  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type EconomyRecord    = typeof globalEconomy.$inferSelect;
export type NewEconomyRecord = typeof globalEconomy.$inferInsert;

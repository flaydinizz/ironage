// ============================================================
// SCHEMA — players
// Tabela de dados persistentes do jogador.
// Princípio "Delayed Persistence": esta tabela só é gravada em
// eventos críticos (login, extração, logout). Durante a sessão,
// o estado vive na RAM do servidor Node.js.
// ============================================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const players = sqliteTable('players', {
  // --- Identidade ---
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  username: text('username')
    .notNull()
    .unique(), // username é a chave de autenticação principal

  passwordHash: text('password_hash')
    .notNull(), // bcrypt hash — NUNCA armazenar plain text

  // --- Progressão Global ---
  level: integer('level')
    .notNull()
    .default(1), // nível global (derivado da média das skills ou de XP acumulado total)

  currency: real('currency')
    .notNull()
    .default(0), // moeda do jogo para Trader NPCs e Mercado

  totalPlaytimeSeconds: integer('total_playtime_seconds')
    .notNull()
    .default(0), // para estatísticas e conquistas

  // --- Timestamps ---
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),

  lastLogin: integer('last_login', { mode: 'timestamp' }),

  // --- Session Control ---
  // Previne login duplo e permite recovery de sessão crashada
  activeSessionId: text('active_session_id'), // null = offline
});

// --- Tipos inferidos do schema ---
export type Player    = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;

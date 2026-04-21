// ============================================================
// SCHEMA — skills
// Armazena o JSON de habilidades de cada jogador.
// Separado da tabela players para updates atômicos por skill.
//
// ⚠️  Este arquivo é SOMENTE servidor. Importa Drizzle.
//     Os tipos compartilhados ficam em @survival/shared/types.
// ============================================================

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql }                         from 'drizzle-orm';
import { players }                     from './players';
import { DEFAULT_SKILLS }              from '@survival/shared/types';
import type { SkillsData }             from '@survival/shared/types';

export const skills = sqliteTable('skills', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // FK com cascade: deletar player limpa suas skills automaticamente
  playerId: text('player_id')
    .notNull()
    .unique() // relação 1:1 — cada player tem exatamente um registro
    .references(() => players.id, { onDelete: 'cascade' }),

  // Drizzle serializa/deserializa JSON automaticamente com { mode: 'json' }
  skillsData: text('skills_data', { mode: 'json' })
    .notNull()
    .$type<SkillsData>()
    .$defaultFn(() => DEFAULT_SKILLS),

  // Útil para cálculos de offline-progression no futuro
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SkillRecord    = typeof skills.$inferSelect;
export type NewSkillRecord = typeof skills.$inferInsert;

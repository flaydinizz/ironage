// ============================================================
// SCHEMA — index (barrel + relações Drizzle)
//
// ⚠️  Este arquivo é SOMENTE servidor.
//     Tipos compartilhados estão em @survival/shared/types.
// ============================================================

// ── Tabelas ───────────────────────────────────────────────────
export { players }                        from './players';
export type { Player, NewPlayer }         from './players';

export { skills }                         from './skills';
export type { SkillRecord, NewSkillRecord } from './skills';

export { stash, globalEconomy }           from './stash-economy';
export type {
  StashRecord, NewStashRecord,
  EconomyRecord, NewEconomyRecord,
}                                         from './stash-economy';

// ── Relações (para queries com joins via Drizzle ORM) ─────────
import { relations } from 'drizzle-orm';
import { players }   from './players';
import { skills }    from './skills';
import { stash }     from './stash-economy';

export const playersRelations = relations(players, ({ one }) => ({
  skills: one(skills, { fields: [players.id], references: [skills.playerId] }),
  stash:  one(stash,  { fields: [players.id], references: [stash.playerId]  }),
}));

export const skillsRelations = relations(skills, ({ one }) => ({
  player: one(players, { fields: [skills.playerId], references: [players.id] }),
}));

export const stashRelations = relations(stash, ({ one }) => ({
  player: one(players, { fields: [stash.playerId], references: [players.id] }),
}));

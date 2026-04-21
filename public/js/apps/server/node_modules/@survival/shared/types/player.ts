// ============================================================
// SHARED TYPES — Player
//
// ⚠️  Este arquivo NÃO importa Drizzle nem Node.js.
// ============================================================

import type { SkillsData } from './skills';
import type { StashData }  from './items';

// ── Projeção pública (sem dados sensíveis) ────────────────────
export interface PublicPlayer {
  id:        string;
  username:  string;
  level:     number;
  currency:  number;
  createdAt: Date;
  lastLogin: Date | null;
}

// ── Perfil completo (uso interno do servidor) ─────────────────
export interface PlayerProfile extends PublicPlayer {
  skills: SkillsData;
  stash:  StashData;
}

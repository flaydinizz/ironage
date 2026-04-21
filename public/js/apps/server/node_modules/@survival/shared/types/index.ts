// ============================================================
// SHARED TYPES — Barrel export
//
// ⚠️  Este pacote é ISENTO de dependências de servidor.
//     Sem Drizzle, sem Node.js, sem Socket.io.
//     Tudo aqui pode ser importado tanto pelo cliente quanto
//     pelo servidor sem quebrar o bundle do cliente.
//
// Os schemas Drizzle ficam em server/src/db/schema/index.ts
// ============================================================

// ── Items & Stash ─────────────────────────────────────────────
export type {
  ItemCategory,
  ResourceType,
  WeaponType,
  ArmorType,
  CraftableType,
  ItemType,
  ItemStack,
  StashData,
  ItemMeta,
} from './items';

export {
  ITEM_WEIGHT_TABLE,
  ITEM_META,
  DEFAULT_STASH_WEIGHT_LIMIT,
} from './items';

// ── Skills ────────────────────────────────────────────────────
export type {
  SkillName,
  SkillEntry,
  SkillsData,
} from './skills';

export {
  XP_PER_LEVEL,
  DEFAULT_SKILLS,
} from './skills';

// ── Player ────────────────────────────────────────────────────
export type {
  PublicPlayer,
  PlayerProfile,
} from './player';

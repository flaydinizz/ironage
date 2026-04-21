// ============================================================
// SHARED TYPES — Skills
//
// ⚠️  Este arquivo NÃO importa Drizzle nem Node.js.
//     É consumido tanto pelo servidor quanto pelo cliente.
//
// O schema Drizzle da tabela `skills` fica em:
//   server/src/db/schema/skills.ts
// ============================================================

// ── Nomes de habilidades disponíveis no jogo ─────────────────
export type SkillName =
  | 'mining'      // mineração (ferro, carvão, pedra)
  | 'carpentry'   // madeira e construção
  | 'crafting'    // fabricação geral (cordas, armaduras, consumíveis)
  | 'farming'     // coleta de fibra e comida
  | 'hunting'     // caça de fauna
  | 'combat'      // combate PvP e PvE
  | 'stealth';    // furtividade (bônus em extrações)

// ── Entrada de skill individual ───────────────────────────────
export interface SkillEntry {
  level:    number;   // 1–100
  xp:       number;   // XP acumulado no nível atual
  xpToNext: number;   // XP necessário para avançar (calculado)
}

// ── Estado completo de skills de um player ───────────────────
export type SkillsData = Record<SkillName, SkillEntry>;

// ── Fórmula de progressão exponencial ────────────────────────
// nível  1→2  =   100 XP
// nível 10→11 ≈   216 XP
// nível 50→51 ≈ 4.690 XP
// nível 99→100 ≈ 186.000 XP
export function XP_PER_LEVEL(level: number): number {
  return Math.floor(100 * Math.pow(1.08, level - 1));
}

// ── Estado inicial para novos players ────────────────────────
export const DEFAULT_SKILLS: SkillsData = {
  mining:    { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  carpentry: { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  crafting:  { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  farming:   { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  hunting:   { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  combat:    { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
  stealth:   { level: 1, xp: 0, xpToNext: XP_PER_LEVEL(1) },
};

// ============================================================
// SKILL ENGINE — Fase 4A
//
// Responsabilidades:
//   1. Mapear ações de jogo → quais skills ganham XP e quanto
//   2. Calcular level-up com fórmula exponencial
//   3. Rastrear skills em RAM por playerId (dirty map)
//   4. Persistir no banco SOMENTE em eventos críticos
//      (extração, logout) via PlayerRepository
//
// Design: o SkillEngine mantém um Map<playerId, SkillsData>
// em memória. Isso evita reads desnecessários no banco durante
// a sessão. O dirty set marca quais players precisam de flush.
// ============================================================

import { PlayerRepository }           from '../db/repositories/PlayerRepository';
import { XP_PER_LEVEL, DEFAULT_SKILLS } from '@survival/shared/types';
import type { SkillName, SkillsData, SkillEntry } from '@survival/shared/types';

// ── Mapa de ação → grants de XP ──────────────────────────────
// Cada ação pode conceder XP em múltiplas skills simultaneamente.
// A quantidade é por unidade coletada/ação executada.

export type GameAction =
  | 'collect_iron_ore'
  | 'collect_wood'
  | 'collect_stone'
  | 'collect_fiber'
  | 'collect_coal'
  | 'collect_food_ration'
  | 'kill_fauna'
  | 'kill_player'
  | 'craft_item'
  | 'craft_weapon'
  | 'craft_armor'
  | 'extraction_success'
  | 'survive_tick'      // concedido a cada N ticks vivos (passivo)
  | 'use_stealth';

interface XPGrant { skill: SkillName; xp: number }

const ACTION_XP_TABLE: Record<GameAction, XPGrant[]> = {
  collect_iron_ore:    [{ skill: 'mining',    xp: 8  }, { skill: 'crafting', xp: 2 }],
  collect_wood:        [{ skill: 'carpentry', xp: 8  }, { skill: 'crafting', xp: 2 }],
  collect_stone:       [{ skill: 'mining',    xp: 5  }],
  collect_fiber:       [{ skill: 'farming',   xp: 6  }],
  collect_coal:        [{ skill: 'mining',    xp: 10 }],
  collect_food_ration: [{ skill: 'farming',   xp: 4  }],
  kill_fauna:          [{ skill: 'hunting',   xp: 20 }, { skill: 'combat',  xp: 8 }],
  kill_player:         [{ skill: 'combat',    xp: 40 }],
  craft_item:          [{ skill: 'crafting',  xp: 15 }],
  craft_weapon:        [{ skill: 'crafting',  xp: 20 }, { skill: 'combat',  xp: 5 }],
  craft_armor:         [{ skill: 'crafting',  xp: 18 }],
  extraction_success:  [{ skill: 'stealth',   xp: 10 }],
  survive_tick:        [{ skill: 'hunting',   xp: 1  }],  // XP passivo mínimo
  use_stealth:         [{ skill: 'stealth',   xp: 5  }],
};

// Mapeamento de resourceType → GameAction (para loot handler)
export const RESOURCE_ACTION: Record<string, GameAction> = {
  iron_ore:    'collect_iron_ore',
  wood:        'collect_wood',
  stone:       'collect_stone',
  fiber:       'collect_fiber',
  coal:        'collect_coal',
  food_ration: 'collect_food_ration',
};

// ── Estado em memória ─────────────────────────────────────────
// skills carregadas do banco no início da sessão, modificadas
// em RAM durante o jogo, persistidas em eventos críticos.

const sessionSkills = new Map<string, SkillsData>(); // playerId → skills
const dirtyPlayers  = new Set<string>();              // players com XP não persistido

// ── Level-up result ───────────────────────────────────────────
export interface XPResult {
  skill:       SkillName;
  xpGained:    number;
  newXp:       number;
  newLevel:    number;
  leveledUp:   boolean;
  xpToNext:    number;
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

// Carrega skills do banco para a RAM no início da sessão
export async function loadSkills(playerId: string): Promise<SkillsData> {
  const player = await PlayerRepository.findById(playerId);
  const skills = (player?.skills?.skillsData as SkillsData) ?? { ...DEFAULT_SKILLS };
  sessionSkills.set(playerId, skills);
  return skills;
}

// Retorna skills atuais da RAM (nunca vai ao banco)
export function getSkills(playerId: string): SkillsData {
  return sessionSkills.get(playerId) ?? { ...DEFAULT_SKILLS };
}

// Concede XP por uma ação, multiplica pela quantidade executada
// Retorna lista de resultados (uma entrada por skill modificada)
export function grantXP(
  playerId:   string,
  action:     GameAction,
  multiplier: number = 1,   // ex: quantidade coletada
): XPResult[] {
  const grants = ACTION_XP_TABLE[action];
  if (!grants?.length) return [];

  let skills = sessionSkills.get(playerId);
  if (!skills) {
    skills = { ...DEFAULT_SKILLS };
    sessionSkills.set(playerId, skills);
  }

  const results: XPResult[] = [];

  for (const grant of grants) {
    const entry   = skills[grant.skill];
    const xpGain  = Math.round(grant.xp * multiplier);
    const result  = applyXP(entry, xpGain);

    skills[grant.skill] = {
      level:    result.newLevel,
      xp:       result.newXp,
      xpToNext: result.xpToNext,
    };

    results.push({ skill: grant.skill, xpGained: xpGain, ...result });
  }

  dirtyPlayers.add(playerId);
  return results;
}

// Verifica nível de uma skill específica (para crafting e combat)
export function getSkillLevel(playerId: string, skill: SkillName): number {
  return sessionSkills.get(playerId)?.[skill]?.level ?? 1;
}

// Persiste skills no banco — chamar SOMENTE em eventos críticos
export function flushSkills(playerId: string): void {
  if (!dirtyPlayers.has(playerId)) return;
  const skills = sessionSkills.get(playerId);
  if (!skills) return;
  PlayerRepository.saveSkills(playerId, skills);
  dirtyPlayers.delete(playerId);
}

// Remove da RAM ao desconectar (sempre fazer flush antes)
export function unloadSkills(playerId: string): void {
  flushSkills(playerId);  // garante persistência se houver XP pendente
  sessionSkills.delete(playerId);
}

// ── Cálculo interno de XP e level-up ─────────────────────────

function applyXP(entry: SkillEntry, xpGain: number): Omit<XPResult, 'skill' | 'xpGained'> {
  const MAX_LEVEL = 100;
  let { level, xp } = entry;
  xp += xpGain;

  let leveledUp = false;

  // Permite level-up múltiplos em um único grant (ex: XP alto em level baixo)
  while (level < MAX_LEVEL) {
    const needed = XP_PER_LEVEL(level);
    if (xp < needed) break;
    xp -= needed;
    level++;
    leveledUp = true;
  }

  // Garante que XP não ultrapassa o cap do nível máximo
  if (level >= MAX_LEVEL) xp = 0;

  return {
    newXp:     xp,
    newLevel:  level,
    leveledUp,
    xpToNext:  level >= MAX_LEVEL ? 0 : XP_PER_LEVEL(level),
  };
}

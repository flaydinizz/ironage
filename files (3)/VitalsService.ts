// ============================================================
// VITALS SERVICE
// Fonte da verdade para todas as regras de HP e Sede.
// Usado pelo tick.loop e pelo CombatService.
// ============================================================

import type { SessionPlayer, ActiveStatusEffect } from '../game/world.state';

// ── Constantes de configuração ────────────────────────────────
export const VITALS = {
  // Thirst cai de 100 a 0 em ~30 minutos de jogo contínuo
  THIRST_DRAIN_PER_SECOND: 100 / (30 * 60),    // ≈ 0.0556/s

  // Sem água: -1 HP por segundo (morte em 100s)
  DEHYDRATION_DAMAGE_PER_SECOND: 1,

  // HP não regenera sozinho (precisa de item de cura — Fase 4)
  HP_REGEN_PER_SECOND: 0,

  // Thirst restaurado por food_ration
  FOOD_RATION_THIRST_RESTORE: 30,

  // Limiares para alertas visuais no HUD
  THIRST_WARN_THRESHOLD: 30,   // amarelo
  THIRST_CRIT_THRESHOLD: 10,   // vermelho pulsante
  HP_WARN_THRESHOLD:     40,
  HP_CRIT_THRESHOLD:     20,
};

export type VitalStatus = 'ok' | 'warn' | 'critical';

export interface VitalsSnapshot {
  hp:          number;
  maxHp:       number;
  thirst:      number;
  hpStatus:    VitalStatus;
  thirstStatus: VitalStatus;
  isDying:     boolean; // true quando thirst = 0 e HP caindo
}

// ── Aplica decaimento de vitais num delta de tempo (segundos) ─
export function drainVitals(player: SessionPlayer, dtSeconds: number): {
  died: boolean;
  thirstDrained: number;
  hpDamage: number;
} {
  const thirstDrained = VITALS.THIRST_DRAIN_PER_SECOND * dtSeconds;
  player.thirst = Math.max(0, player.thirst - thirstDrained);

  let hpDamage = 0;
  if (player.thirst === 0) {
    hpDamage = VITALS.DEHYDRATION_DAMAGE_PER_SECOND * dtSeconds;
    player.hp = Math.max(0, player.hp - hpDamage);
  }

  const died = player.hp <= 0;
  return { died, thirstDrained, hpDamage };
}

// ── Aplica dano direto (combate) ─────────────────────────────
export function applyDamage(player: SessionPlayer, amount: number): {
  hpAfter: number;
  died:    boolean;
} {
  player.hp = Math.max(0, player.hp - amount);
  return { hpAfter: player.hp, died: player.hp <= 0 };
}

// ── Restaura HP (item de cura) ────────────────────────────────
export function healPlayer(player: SessionPlayer, amount: number): number {
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return player.hp - before; // quantidade efetivamente curada
}

// ── Restaura thirst (consumir água/comida) ────────────────────
export function restoreThirst(player: SessionPlayer, amount: number): number {
  const before = player.thirst;
  player.thirst = Math.min(100, player.thirst + amount);
  return player.thirst - before;
}

// ── Snapshot de vitais para o HUD ────────────────────────────
export function getVitalsSnapshot(player: SessionPlayer): VitalsSnapshot {
  const hpPct     = (player.hp     / player.maxHp) * 100;
  const thirstPct = player.thirst;

  return {
    hp:     Math.round(player.hp),
    maxHp:  player.maxHp,
    thirst: Math.round(player.thirst),

    hpStatus:
      hpPct <= VITALS.HP_CRIT_THRESHOLD    ? 'critical' :
      hpPct <= VITALS.HP_WARN_THRESHOLD    ? 'warn'     : 'ok',

    thirstStatus:
      thirstPct <= VITALS.THIRST_CRIT_THRESHOLD ? 'critical' :
      thirstPct <= VITALS.THIRST_WARN_THRESHOLD ? 'warn'     : 'ok',

    isDying: player.thirst === 0 && player.hp < player.maxHp,
  };
}

// ── Respawn: reseta todos os vitais ──────────────────────────
export function resetVitals(player: SessionPlayer): void {
  player.hp           = player.maxHp;
  player.thirst       = 100;
  player.activeEffects = []; // cura todos os efeitos de status ao respawnar
}

// ── Aplica efeito de status (veneno, doença) ──────────────────
// Chamado pelo tick.loop quando uma FaunaAttackEvent carrega statusEffect.
// Efeitos não-stackable substituem instâncias existentes do mesmo tipo.
export function applyStatusEffect(
  player: SessionPlayer,
  effect: import('../game/fauna').StatusEffect,
): ActiveStatusEffect {
  const newEffect: ActiveStatusEffect = {
    type:         effect.type,
    damagePerSec: effect.damagePerSec,
    expiresAt:    Date.now() + effect.durationSec * 1000,
    stackId:      crypto.randomUUID(),
  };

  if (!effect.stackable) {
    // Remove efeito existente do mesmo tipo antes de adicionar
    player.activeEffects = player.activeEffects.filter(e => e.type !== effect.type);
  }

  player.activeEffects.push(newEffect);
  return newEffect;
}

// ── Processa efeitos ativos (chamado a cada tick) ─────────────
// Retorna o dano total causado pelos efeitos neste tick.
export function tickStatusEffects(
  player:    SessionPlayer,
  dtSeconds: number,
): { totalDamage: number; expired: string[]; died: boolean } {
  const now     = Date.now();
  const expired: string[] = [];
  let   totalDamage = 0;

  // Remove efeitos expirados e acumula dano dos ativos
  player.activeEffects = player.activeEffects.filter(effect => {
    if (now >= effect.expiresAt) {
      expired.push(effect.stackId);
      return false;
    }
    totalDamage += effect.damagePerSec * dtSeconds;
    return true;
  });

  if (totalDamage > 0) {
    player.hp = Math.max(0, player.hp - totalDamage);
  }

  return { totalDamage, expired, died: player.hp <= 0 };
}

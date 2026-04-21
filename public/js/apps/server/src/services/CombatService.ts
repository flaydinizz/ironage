// ============================================================
// COMBAT SERVICE
// ============================================================

import type { RoomState, SessionPlayer } from '../game/world.state';
import type { FaunaEntity, StatusEffect } from '../game/fauna';
import { FAUNA_LOOT }                    from '../game/fauna';
import { applyDamage }                   from './VitalsService';
import { ITEM_WEIGHT_TABLE }             from '@survival/shared/types';

export const COMBAT = {
  PLAYER_ATTACK_RANGE:      70,
  PLAYER_BASE_DAMAGE:       25,
  PLAYER_ATTACK_COOLDOWN_MS: 800,
  PLAYER_RANGED_RANGE:      400,
  PLAYER_RANGED_DAMAGE:     18,
};

const attackCooldowns = new Map<string, number>();

export interface AttackResult {
  hit:           boolean;
  damage:        number;
  targetDied:    boolean;
  reason?:       string;
  statusEffect?: StatusEffect;
}

export interface FaunaKillResult {
  loot: { itemType: string; quantity: number; weight: number }[];
}

// ── Player ataca fauna ────────────────────────────────────────
export function playerAttackFauna(
  attacker: SessionPlayer,
  faunaId:  string,
  room:     RoomState,
): AttackResult {
  const now  = Date.now();
  const last = attackCooldowns.get(attacker.socketId) ?? 0;

  if (now - last < COMBAT.PLAYER_ATTACK_COOLDOWN_MS) {
    return { hit: false, damage: 0, targetDied: false, reason: 'Ataque em cooldown' };
  }

  const fauna = room.fauna?.get(faunaId);
  if (!fauna || fauna.state === 'dead') {
    return { hit: false, damage: 0, targetDied: false, reason: 'Alvo inválido' };
  }

  const d = Math.hypot(
    attacker.position.x - fauna.position.x,
    attacker.position.y - fauna.position.y,
  );

  if (d > COMBAT.PLAYER_ATTACK_RANGE) {
    return { hit: false, damage: 0, targetDied: false, reason: 'Alvo fora de alcance' };
  }

  attackCooldowns.set(attacker.socketId, now);
  const damage = calcDamage(attacker);
  fauna.hp -= damage;

  if (fauna.hp <= 0) {
    fauna.state = 'dead';
    return { hit: true, damage, targetDied: true };
  }

  // Qualquer estado passivo → agride o player que atacou
  const passiveStates = ['patrol', 'ambush', 'scavenge', 'flee'];
  if (passiveStates.includes(fauna.state)) {
    fauna.state          = 'chase';
    fauna.targetSocketId = attacker.socketId;
    // Desmarca emboscada para que o behavior não aplique dano surpresa
    if (fauna.behaviors.includes('ambush')) {
      fauna.ambushTriggered = true;
    }
  }

  return { hit: true, damage, targetDied: false };
}

// ── Gera loot ao matar fauna ──────────────────────────────────
export function rollFaunaLoot(
  fauna:  FaunaEntity,
  player: SessionPlayer,
): FaunaKillResult {
  const table = FAUNA_LOOT[fauna.type] ?? [];
  const loot: FaunaKillResult['loot'] = [];

  for (const entry of table) {
    const [min, max] = entry.qty;
    const qty = min + Math.floor(Math.random() * (max - min + 1));
    if (qty <= 0) continue;
    const unitWeight = ITEM_WEIGHT_TABLE[entry.itemType as keyof typeof ITEM_WEIGHT_TABLE] ?? 1;
    const weight = qty * unitWeight;

    if (player.inventoryWeightUsed + weight <= player.inventoryWeightLimit) {
      loot.push({ itemType: entry.itemType, quantity: qty, weight });
      addToInventory(player, entry.itemType, qty, weight);
    }
  }

  return { loot };
}

// ── Player ataca player (PvP) ─────────────────────────────────
export function playerAttackPlayer(
  attacker: SessionPlayer,
  target:   SessionPlayer,
): AttackResult {
  const now  = Date.now();
  const last = attackCooldowns.get(attacker.socketId) ?? 0;

  if (now - last < COMBAT.PLAYER_ATTACK_COOLDOWN_MS) {
    return { hit: false, damage: 0, targetDied: false, reason: 'Ataque em cooldown' };
  }

  const d = Math.hypot(
    attacker.position.x - target.position.x,
    attacker.position.y - target.position.y,
  );

  if (d > COMBAT.PLAYER_ATTACK_RANGE) {
    return { hit: false, damage: 0, targetDied: false, reason: 'Alvo fora de alcance' };
  }

  attackCooldowns.set(attacker.socketId, now);
  const damage = calcDamage(attacker);
  const { died } = applyDamage(target, damage);

  return { hit: true, damage, targetDied: died };
}

export function clearCombatState(socketId: string): void {
  attackCooldowns.delete(socketId);
}

function calcDamage(_player: SessionPlayer): number {
  return COMBAT.PLAYER_BASE_DAMAGE;
}

function addToInventory(
  player:   SessionPlayer,
  itemType: string,
  quantity: number,
  weight:   number,
): void {
  const existing = player.inventory.find(i => i.itemType === itemType);
  if (existing) {
    existing.quantity += quantity;
    existing.weight   += weight;
  } else {
    player.inventory.push({ itemType: itemType as any, quantity, weight });
  }
  player.inventoryWeightUsed += weight;
}
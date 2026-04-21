// ============================================================
// FAUNA — Sistema completo de animais (Tundra / Neve / Campinas)
//
// Arquitetura data-driven:
//   FAUNA_REGISTRY   → definição estática de cada espécie (imutável)
//   FaunaEntity      → instância em runtime (estado mutável)
//   BEHAVIOR_HANDLERS → funções de IA por comportamento (composição)
//   tickFauna()      → loop principal, orquestra os behaviors
//
// Cada animal declara uma lista de Behaviors. O dispatcher
// os avalia em ordem de prioridade — o primeiro que retornar
// true interrompe a cadeia (reivindicou o tick).
// ============================================================

import type { Vec2, SessionPlayer } from './world.state';
import { MAP_WIDTH, MAP_HEIGHT, getHeight, getBiomeAt, BIOME } from './map.generator';
import type { Heightmap, BiomeMap }                            from './map.generator';

// ── Tiers de velocidade (unidades/segundo) ────────────────────
const SPEED = { baixa: 55, media: 85, alta: 120, muitaAlta: 170 } as const;

// ── Tiers de percepção (unidades de distância) ────────────────
const PERCEPTION = { baixa: 130, media: 220, alta: 340, muitaAlta: 500 } as const;

// ── Distância máxima de perseguição por inteligência ─────────
const LEASH = { baixa: 400, media: 700, alta: 1100 } as const;

// ══════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════

export type FaunaType =
  | 'lobo'          | 'urso'          | 'cervo'          | 'coelho'
  | 'raposa'        | 'bisao'         | 'javali'         | 'aguia'
  | 'rato_gelo'     | 'lobo_alfa'     | 'alce'           | 'cobra_gelo'
  | 'coruja'        | 'cao_selvagem'  | 'boi_selvagem'   | 'lince'
  | 'corvo'         | 'urso_polar'    | 'cavalo'         | 'cabra_montanha';

export type Behavior =
  | 'pack'           // caça em matilha, alerta membros próximos
  | 'pack_leader'    // buffa o aggro range de toda a matilha
  | 'territorial'    // ataca players dentro de um raio de território
  | 'flee'           // foge de qualquer player próximo
  | 'erratic'        // movimento imprevisível
  | 'opportunistic'  // foge de players, mas se aproxima de loot
  | 'charge'         // windup + investida em linha reta
  | 'aggressive'     // sempre hostil, aggro imediato ao detectar player
  | 'ambush'         // fica parado até player entrar no range mínimo
  | 'scavenger'      // se aproxima de players com HP baixo
  | 'nocturnal'      // percepção e dano dobrados entre 20h–6h
  | 'diseased'       // aplica debuff "doença" ao atacar
  | 'defensive'      // só contra-ataca se HP < 50% ou player muito próximo
  | 'stealth';       // invisível no snapshot até player estar muito perto

export type DamageType =
  | 'none' | 'bite' | 'impact' | 'charge_hit'
  | 'poison' | 'disease' | 'critical_bite';

export type ColdResistance = 'media' | 'alta' | 'muitaAlta';
export type Intelligence   = 'baixa' | 'media' | 'alta';

export type AIState =
  | 'patrol' | 'flee'   | 'chase'  | 'attack'
  | 'charge_windup' | 'charging' | 'ambush' | 'scavenge' | 'dead';

export interface StatusEffect {
  type:         'poison' | 'disease' | 'bleed';
  damagePerSec: number;
  durationSec:  number;
  stackable:    boolean;
}

// ── Definição estática de espécie (imutável, da REGISTRY) ────
export interface FaunaSpec {
  label:            string;
  hp:               number;
  maxHp:            number;
  speed:            number;
  perception:       number;
  leashRange:       number;
  attackRange:      number;
  damage:           number;
  attackCooldownMs: number;
  damageType:       DamageType;
  behaviors:        Behavior[];
  coldResistance:   ColdResistance;
  intelligence:     Intelligence;
  isHostile:        boolean;
  isConditional:    boolean;
  statusEffect?:    StatusEffect;
  packType?:        string;
  spawnCount:       number;
  homeBiomes:       number[];   // valores do enum BIOME
  loot:             { itemType: string; qty: [number, number] }[];
}

// ── Instância de runtime (estado mutável por entidade) ────────
export interface FaunaEntity extends FaunaSpec {
  id:              string;
  type:            FaunaType;
  position:        Vec2;
  origin:          Vec2;
  hp:              number;
  perception:      number;
  damage:          number;
  state:           AIState;
  targetSocketId:  string | null;
  packId:          string | null;
  patrolAngle:     number;
  lastAttackAt:    number;
  chargeTarget:    Vec2 | null;
  chargeWindupAt:  number;
  ambushTriggered: boolean;
  alertedAt:       number;
}

export interface FaunaAttackEvent {
  faunaId:        string;
  faunaType:      FaunaType;
  targetSocketId: string;
  damage:         number;
  damageType:     DamageType;
  statusEffect?:  StatusEffect;
}

// ══════════════════════════════════════════════════════════════
// REGISTRO DE ESPÉCIES
// ══════════════════════════════════════════════════════════════

function spec(s: Omit<FaunaSpec, 'maxHp'>): FaunaSpec {
  return { ...s, maxHp: s.hp };
}

export const FAUNA_REGISTRY: Record<FaunaType, FaunaSpec> = {

  lobo: spec({
    label: 'Lobo', hp: 80, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 55, damage: 18, attackCooldownMs: 1400,
    damageType: 'bite', behaviors: ['pack', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false,
    packType: 'wolf_pack', spawnCount: 12,
    homeBiomes: [BIOME.TAIGA, BIOME.TEMP_FOREST],
    loot: [
      { itemType: 'fiber',       qty: [2, 5] },
      { itemType: 'food_ration', qty: [0, 2] },
    ],
  }),

  lobo_alfa: spec({
    label: 'Lobo Alfa', hp: 150, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 60, damage: 28, attackCooldownMs: 1200,
    damageType: 'bite', behaviors: ['pack_leader', 'pack', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false,
    packType: 'wolf_pack', spawnCount: 3,
    homeBiomes: [BIOME.TAIGA, BIOME.TEMP_FOREST],
    loot: [
      { itemType: 'fiber',       qty: [4, 8] },
      { itemType: 'food_ration', qty: [1, 3] },
      { itemType: 'iron_ore',    qty: [0, 1] },
    ],
  }),

  urso: spec({
    label: 'Urso', hp: 300, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 80, damage: 40, attackCooldownMs: 2200,
    damageType: 'impact', behaviors: ['territorial'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: true, isConditional: false, spawnCount: 6,
    homeBiomes: [BIOME.TEMP_FOREST, BIOME.MOUNTAIN],
    loot: [
      { itemType: 'food_ration', qty: [3, 6] },
      { itemType: 'fiber',       qty: [5, 10] },
    ],
  }),

  urso_polar: spec({
    label: 'Urso Polar', hp: 350, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 90, damage: 55, attackCooldownMs: 2000,
    damageType: 'impact', behaviors: ['territorial', 'aggressive'],
    coldResistance: 'muitaAlta', intelligence: 'media',
    isHostile: true, isConditional: false, spawnCount: 3,
    homeBiomes: [BIOME.TUNDRA, BIOME.SNOW_PEAK],
    loot: [
      { itemType: 'food_ration', qty: [4, 8] },
      { itemType: 'fiber',       qty: [6, 12] },
    ],
  }),

  cervo: spec({
    label: 'Cervo', hp: 60, speed: SPEED.muitaAlta,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: false, spawnCount: 10,
    homeBiomes: [BIOME.GRASSLAND, BIOME.TEMP_FOREST],
    loot: [
      { itemType: 'food_ration', qty: [2, 4] },
      { itemType: 'fiber',       qty: [2, 5] },
    ],
  }),

  alce: spec({
    label: 'Alce', hp: 200, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 90, damage: 38, attackCooldownMs: 2500,
    damageType: 'charge_hit', behaviors: ['charge', 'defensive'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: true, spawnCount: 5,
    homeBiomes: [BIOME.TAIGA, BIOME.TEMP_FOREST],
    loot: [
      { itemType: 'food_ration', qty: [3, 5] },
      { itemType: 'fiber',       qty: [3, 6] },
    ],
  }),

  bisao: spec({
    label: 'Bisão', hp: 250, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 100, damage: 45, attackCooldownMs: 3000,
    damageType: 'charge_hit', behaviors: ['charge'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: true, spawnCount: 6,
    homeBiomes: [BIOME.GRASSLAND, BIOME.SAVANNA],
    loot: [
      { itemType: 'food_ration', qty: [4, 8] },
      { itemType: 'fiber',       qty: [4, 8] },
    ],
  }),

  boi_selvagem: spec({
    label: 'Boi Selvagem', hp: 220, speed: SPEED.baixa,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 85, damage: 35, attackCooldownMs: 3500,
    damageType: 'impact', behaviors: ['territorial'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: true, spawnCount: 4,
    homeBiomes: [BIOME.GRASSLAND, BIOME.SAVANNA],
    loot: [
      { itemType: 'food_ration', qty: [4, 7] },
      { itemType: 'fiber',       qty: [3, 6] },
    ],
  }),

  javali: spec({
    label: 'Javali', hp: 120, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 60, damage: 25, attackCooldownMs: 1600,
    damageType: 'bite', behaviors: ['aggressive'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: true, isConditional: false, spawnCount: 8,
    homeBiomes: [BIOME.TEMP_FOREST, BIOME.TROP_FOREST],
    loot: [
      { itemType: 'food_ration', qty: [1, 3] },
      { itemType: 'fiber',       qty: [1, 4] },
    ],
  }),

  coelho: spec({
    label: 'Coelho', hp: 20, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee', 'erratic'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: false, spawnCount: 15,
    homeBiomes: [BIOME.TUNDRA, BIOME.GRASSLAND],
    loot: [
      { itemType: 'food_ration', qty: [1, 2] },
      { itemType: 'fiber',       qty: [0, 2] },
    ],
  }),

  raposa: spec({
    label: 'Raposa', hp: 40, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.media,
    attackRange: 45, damage: 8, attackCooldownMs: 2000,
    damageType: 'bite', behaviors: ['flee', 'opportunistic'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: false, isConditional: false, spawnCount: 8,
    homeBiomes: [BIOME.GRASSLAND, BIOME.TEMP_FOREST],
    loot: [
      { itemType: 'fiber',       qty: [1, 3] },
      { itemType: 'food_ration', qty: [0, 1] },
    ],
  }),

  lince: spec({
    label: 'Lince', hp: 90, speed: SPEED.muitaAlta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 55, damage: 35, attackCooldownMs: 1000,
    damageType: 'critical_bite', behaviors: ['stealth', 'ambush', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false, spawnCount: 4,
    homeBiomes: [BIOME.TAIGA, BIOME.MOUNTAIN],
    loot: [{ itemType: 'fiber', qty: [3, 6] }],
  }),

  cobra_gelo: spec({
    label: 'Cobra do Gelo', hp: 25, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 40, damage: 10, attackCooldownMs: 2500,
    damageType: 'poison', behaviors: ['ambush'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: true, isConditional: false,
    statusEffect: { type: 'poison', damagePerSec: 3, durationSec: 8, stackable: false },
    spawnCount: 10,
    homeBiomes: [BIOME.TUNDRA, BIOME.MOUNTAIN],
    loot: [{ itemType: 'fiber', qty: [0, 2] }],
  }),

  cao_selvagem: spec({
    label: 'Cão Selvagem', hp: 70, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.alta,
    attackRange: 50, damage: 15, attackCooldownMs: 1300,
    damageType: 'bite', behaviors: ['pack', 'aggressive'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: true, isConditional: false,
    packType: 'dog_pack', spawnCount: 10,
    homeBiomes: [BIOME.GRASSLAND, BIOME.SAVANNA],
    loot: [
      { itemType: 'fiber',       qty: [1, 3] },
      { itemType: 'food_ration', qty: [0, 1] },
    ],
  }),

  rato_gelo: spec({
    label: 'Rato do Gelo', hp: 15, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 30, damage: 3, attackCooldownMs: 3000,
    damageType: 'disease', behaviors: ['diseased', 'scavenger'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: false,
    statusEffect: { type: 'disease', damagePerSec: 1.5, durationSec: 15, stackable: true },
    spawnCount: 14,
    homeBiomes: [BIOME.TUNDRA, BIOME.TAIGA],
    loot: [],
  }),

  aguia: spec({
    label: 'Águia', hp: 30, speed: SPEED.muitaAlta,
    perception: PERCEPTION.muitaAlta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false, spawnCount: 5,
    homeBiomes: [BIOME.MOUNTAIN, BIOME.SNOW_PEAK],
    loot: [{ itemType: 'fiber', qty: [0, 2] }],
  }),

  coruja: spec({
    label: 'Coruja', hp: 20, speed: SPEED.media,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee', 'nocturnal'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false, spawnCount: 6,
    homeBiomes: [BIOME.TAIGA, BIOME.TEMP_FOREST],
    loot: [],
  }),

  corvo: spec({
    label: 'Corvo', hp: 15, speed: SPEED.media,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee', 'scavenger'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: false, spawnCount: 8,
    homeBiomes: [BIOME.GRASSLAND, BIOME.TEMP_FOREST, BIOME.TAIGA, BIOME.MOUNTAIN],
    loot: [],
  }),

  cavalo: spec({
    label: 'Cavalo Selvagem', hp: 100, speed: SPEED.muitaAlta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: false, isConditional: false, spawnCount: 6,
    homeBiomes: [BIOME.GRASSLAND],
    loot: [],
  }),

  cabra_montanha: spec({
    label: 'Cabra da Montanha', hp: 80, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none', behaviors: ['flee'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false, spawnCount: 7,
    homeBiomes: [BIOME.MOUNTAIN, BIOME.SNOW_PEAK],
    loot: [{ itemType: 'fiber', qty: [1, 3] }],
  }),
};

// Loot acessível por tipo (consumido pelo CombatService)
export const FAUNA_LOOT = Object.fromEntries(
  (Object.entries(FAUNA_REGISTRY) as [FaunaType, FaunaSpec][])
    .map(([type, s]) => [type, s.loot]),
) as Record<FaunaType, FaunaSpec['loot']>;

// ══════════════════════════════════════════════════════════════
// SPAWN
// ══════════════════════════════════════════════════════════════

const MARGIN               = 150;
const PACK_CLUSTER_RADIUS  = 600;

export function spawnFauna(
  _roomId:         string,
  heightmap:       Heightmap,
  biomeMap:        BiomeMap,
  faunaCandidates: Vec2[],
): Map<string, FaunaEntity> {
  const fauna       = new Map<string, FaunaEntity>();
  let   idx         = 0;
  const packOrigins = new Map<string, Vec2>();

  for (const [type, s] of Object.entries(FAUNA_REGISTRY) as [FaunaType, FaunaSpec][]) {
    // Filtra candidatos Poisson Disc pelo bioma da espécie
    const validPts = faunaCandidates
      .filter(p => s.homeBiomes.includes(getBiomeAt(biomeMap, p.x, p.y)))
      .map(p => ({ ...p }));

    // Embaralha (Fisher-Yates parcial)
    for (let i = validPts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validPts[i], validPts[j]] = [validPts[j], validPts[i]];
    }

    for (let i = 0; i < s.spawnCount; i++) {
      let pos: Vec2;

      if (s.packType) {
        // Packs agrupados em torno de origem comum no bioma certo
        if (!packOrigins.has(s.packType)) {
          packOrigins.set(s.packType, validPts[0] ?? randomBiomePos(s.homeBiomes, biomeMap) ?? randomPos());
        }
        const origin = packOrigins.get(s.packType)!;
        let candidate: Vec2 = origin;
        let tries = 0;
        do {
          candidate = {
            x: clamp(origin.x + (Math.random() - .5) * PACK_CLUSTER_RADIUS, MARGIN, MAP_WIDTH  - MARGIN),
            y: clamp(origin.y + (Math.random() - .5) * PACK_CLUSTER_RADIUS, MARGIN, MAP_HEIGHT - MARGIN),
          };
          tries++;
        } while (tries < 20 && !s.homeBiomes.includes(getBiomeAt(biomeMap, candidate.x, candidate.y)));
        pos = candidate;
      } else if (i < validPts.length) {
        pos = validPts[i]; // usa candidato Poisson Disc
      } else {
        pos = randomBiomePos(s.homeBiomes, biomeMap) ?? randomPos(); // fallback
      }

      const id = `fauna_${idx++}`;
      const entity: FaunaEntity = {
        ...s, id,
        type:            type as FaunaType,
        position:        { ...pos },
        origin:          { ...pos },
        hp:              s.hp,
        perception:      s.perception,
        damage:          s.damage,
        state:           s.behaviors.includes('ambush') ? 'ambush' : 'patrol',
        targetSocketId:  null,
        packId:          null,
        patrolAngle:     Math.random() * Math.PI * 2,
        lastAttackAt:    0,
        chargeTarget:    null,
        chargeWindupAt:  0,
        ambushTriggered: false,
        alertedAt:       0,
      };
      fauna.set(id, entity);
    }
  }

  assignPackLeaders(fauna);
  return fauna;
}

function assignPackLeaders(fauna: Map<string, FaunaEntity>): void {
  const leaders = new Map<string, FaunaEntity>();
  for (const mob of fauna.values()) {
    if (mob.behaviors.includes('pack_leader') && mob.packType) leaders.set(mob.packType, mob);
  }
  for (const mob of fauna.values()) {
    if (mob.behaviors.includes('pack') && !mob.behaviors.includes('pack_leader') && mob.packType) {
      const leader = leaders.get(mob.packType);
      if (leader) mob.packId = leader.id;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TICK — loop de IA principal
// ══════════════════════════════════════════════════════════════

interface AICtx {
  mob:       FaunaEntity;
  players:   Map<string, SessionPlayer>;
  fauna:     Map<string, FaunaEntity>;
  heightmap: Heightmap;
  dt:        number;
  now:       number;
  isNight:   boolean;
  attacks:   FaunaAttackEvent[];
}

export function tickFauna(
  fauna:     Map<string, FaunaEntity>,
  players:   Map<string, SessionPlayer>,
  dt:        number,
  heightmap: Heightmap,
): FaunaAttackEvent[] {
  const attacks: FaunaAttackEvent[] = [];
  const now     = Date.now();
  const isNight = isNightTime();

  for (const mob of fauna.values()) {
    if (mob.state === 'dead') continue;
    runBehaviors({ mob, players, fauna, heightmap, dt, now, isNight, attacks });
  }

  return attacks;
}

// ── Dispatcher de behaviors (ordem = prioridade) ─────────────
const PRIORITY: Behavior[] = [
  'pack_leader', 'nocturnal', 'stealth', 'ambush',
  'scavenger', 'opportunistic', 'diseased',
  'charge', 'territorial', 'defensive', 'aggressive',
  'pack', 'flee', 'erratic',
];

function runBehaviors(ctx: AICtx): void {
  const { mob } = ctx;
  if (mob.hp <= 0) { mob.state = 'dead'; return; }
  if (mob.state === 'charge_windup') { doChargeWindup(ctx); return; }
  if (mob.state === 'charging')       { doCharging(ctx);     return; }

  for (const behavior of PRIORITY) {
    if (!mob.behaviors.includes(behavior)) continue;
    const handled = BEHAVIOR_HANDLERS[behavior]?.(ctx);
    if (handled) return;
  }

  doBasePatrol(ctx);
}

// ══════════════════════════════════════════════════════════════
// BEHAVIOR HANDLERS
// ══════════════════════════════════════════════════════════════

const BEHAVIOR_HANDLERS: Partial<Record<Behavior, (ctx: AICtx) => boolean>> = {

  pack_leader(ctx) {
    const { mob, fauna, players } = ctx;
    const target = nearest(mob, players, mob.perception * 1.4);
    if (target && mob.state === 'patrol') {
      mob.state = 'chase';
      mob.targetSocketId = target.socketId;
      alertPack(mob, fauna, players, target.socketId, 600);
    }
    return false;
  },

  nocturnal(ctx) {
    const { mob, isNight } = ctx;
    const base = FAUNA_REGISTRY[mob.type];
    mob.perception = isNight ? base.perception * 2   : base.perception;
    mob.damage     = isNight ? base.damage     * 1.5 : base.damage;
    return false;
  },

  stealth(_ctx) { return false; },

  ambush(ctx) {
    const { mob, players, now, attacks } = ctx;
    if (mob.ambushTriggered) return false;
    const target = nearest(mob, players, mob.perception * 0.45);
    if (!target) return true;

    mob.ambushTriggered = true;
    mob.state           = 'chase';
    mob.targetSocketId  = target.socketId;
    mob.lastAttackAt    = now;
    attacks.push({
      faunaId: mob.id, faunaType: mob.type,
      targetSocketId: target.socketId,
      damage:       Math.round(mob.damage * 1.5),
      damageType:   mob.damageType,
      statusEffect: mob.statusEffect,
    });
    return true;
  },

  scavenger(ctx) {
    const { mob, players, dt } = ctx;
    let weakest: SessionPlayer | null = null;
    let lowestHp = 40;
    for (const p of players.values()) {
      if (p.hp < lowestHp) { lowestHp = p.hp; weakest = p; }
    }
    if (!weakest) return false;
    moveTo(mob, weakest.position, dt);
    return true;
  },

  opportunistic(ctx) {
    const { mob, players, dt, heightmap } = ctx;
    const threat = nearest(mob, players, mob.perception * 0.6);
    if (threat) { fleeFrom(mob, threat.position, dt, heightmap); return true; }
    return false;
  },

  diseased(_ctx) { return false; },

  charge(ctx) {
    const { mob, players, dt, now, heightmap } = ctx;
    if (mob.state === 'patrol') {
      const target = nearest(mob, players, mob.perception);
      if (!target) return false;
      if (mob.isConditional && dist(mob.position, target.position) > mob.perception * 0.5) return false;
      mob.state = 'charge_windup'; mob.chargeTarget = { ...target.position };
      mob.chargeWindupAt = now; mob.targetSocketId = target.socketId;
      return true;
    }
    if (mob.state === 'chase' && mob.targetSocketId) {
      const target = players.get(mob.targetSocketId);
      if (!target) { mob.state = 'patrol'; return true; }
      const d = dist(mob.position, target.position);
      if (d <= mob.attackRange * 1.5 && now - mob.lastAttackAt > mob.attackCooldownMs) {
        mob.state = 'charge_windup'; mob.chargeTarget = { ...target.position }; mob.chargeWindupAt = now;
        return true;
      }
      moveTo(mob, target.position, dt, heightmap); return true;
    }
    return false;
  },

  territorial(ctx) {
    const { mob, players, dt, heightmap } = ctx;
    const RADIUS = 360;
    const target = nearest(mob, players, RADIUS);
    if (target) { mob.state = 'chase'; mob.targetSocketId = target.socketId; return handleChaseAttack(ctx, target); }
    if (dist(mob.position, mob.origin) > RADIUS * 1.6) { moveTo(mob, mob.origin, dt, heightmap); return true; }
    return false;
  },

  defensive(ctx) {
    const { mob, players } = ctx;
    const hpPct = mob.hp / mob.maxHp;
    const inFace = nearest(mob, players, mob.attackRange * 1.3);
    if (hpPct < 0.5 || inFace) {
      const target = inFace ?? nearest(mob, players, mob.perception);
      if (target) { mob.state = 'chase'; mob.targetSocketId = target.socketId; return handleChaseAttack(ctx, target); }
    }
    return false;
  },

  aggressive(ctx) {
    const { mob, players } = ctx;
    const target = nearest(mob, players, mob.perception);
    if (target) { mob.state = 'chase'; mob.targetSocketId = target.socketId; return handleChaseAttack(ctx, target); }
    doBasePatrol(ctx); return true;
  },

  pack(ctx) {
    const { mob, players, now } = ctx;
    if (mob.alertedAt && now - mob.alertedAt < 6000 && mob.targetSocketId) {
      const target = players.get(mob.targetSocketId);
      if (target) return handleChaseAttack(ctx, target);
    }
    const target = nearest(mob, players, mob.perception);
    if (target) { mob.state = 'chase'; mob.targetSocketId = target.socketId; return handleChaseAttack(ctx, target); }
    doBasePatrol(ctx); return true;
  },

  flee(ctx) {
    const { mob, players, dt, heightmap } = ctx;
    const threat = nearest(mob, players, mob.perception);
    if (threat) { mob.state = 'flee'; fleeFrom(mob, threat.position, dt, heightmap); return true; }
    if (mob.state === 'flee') mob.state = 'patrol';
    return false;
  },

  erratic(ctx) {
    const { mob, dt, heightmap } = ctx;
    if (mob.state !== 'patrol') return false;
    if (Math.random() < dt) mob.patrolAngle = Math.random() * Math.PI * 2;
    const candidateX = clamp(mob.position.x + Math.cos(mob.patrolAngle) * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
    const candidateY = clamp(mob.position.y + Math.sin(mob.patrolAngle) * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);
    const destH = getHeight(heightmap, candidateX, candidateY);
    if (destH > -3) { mob.position.x = candidateX; mob.position.y = candidateY; }
    else { mob.patrolAngle = Math.random() * Math.PI * 2; } // reorienta
    return true;
  },
};

// ══════════════════════════════════════════════════════════════
// ESTADOS ESPECIAIS DE CHARGE
// ══════════════════════════════════════════════════════════════

const CHARGE_WINDUP_MS  = 800;
const CHARGE_SPEED_MULT = 3.2;

function doChargeWindup(ctx: AICtx): void {
  if (ctx.now - ctx.mob.chargeWindupAt >= CHARGE_WINDUP_MS) ctx.mob.state = 'charging';
}

function doCharging(ctx: AICtx): void {
  const { mob, players, dt, now, attacks, heightmap } = ctx;
  if (!mob.chargeTarget) { mob.state = 'patrol'; return; }

  moveTo(mob, mob.chargeTarget, dt * CHARGE_SPEED_MULT, heightmap);

  for (const player of players.values()) {
    if (dist(mob.position, player.position) <= mob.attackRange + 10) {
      attacks.push({
        faunaId: mob.id, faunaType: mob.type,
        targetSocketId: player.socketId,
        damage:       Math.round(mob.damage * 1.4),
        damageType:   mob.damageType,
        statusEffect: mob.statusEffect,
      });
    }
  }

  if (dist(mob.position, mob.chargeTarget) < 25) {
    mob.state = 'patrol'; mob.chargeTarget = null; mob.lastAttackAt = now;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function handleChaseAttack(ctx: AICtx, target: SessionPlayer): boolean {
  const { mob, dt, now, attacks, heightmap } = ctx;
  const d = dist(mob.position, target.position);

  if (d > mob.leashRange) { mob.state = 'patrol'; mob.targetSocketId = null; return true; }

  if (d <= mob.attackRange) {
    mob.state = 'attack';
    if (now - mob.lastAttackAt >= mob.attackCooldownMs) {
      mob.lastAttackAt = now;
      attacks.push({
        faunaId: mob.id, faunaType: mob.type,
        targetSocketId: target.socketId,
        damage:       mob.damage,
        damageType:   mob.damageType,
        statusEffect: mob.statusEffect,
      });
    }
  } else {
    mob.state = 'chase';
    moveTo(mob, target.position, dt, heightmap);
  }
  return true;
}

function alertPack(leader: FaunaEntity, fauna: Map<string, FaunaEntity>, _players: Map<string, SessionPlayer>, targetId: string, radius: number): void {
  const now = Date.now();
  for (const mob of fauna.values()) {
    if (mob.packType !== leader.packType || mob.id === leader.id) continue;
    if (dist(mob.position, leader.position) > radius) continue;
    mob.targetSocketId = targetId; mob.state = 'chase'; mob.alertedAt = now;
  }
}

function doBasePatrol(ctx: AICtx): void {
  const { mob, dt, heightmap } = ctx;
  mob.state = 'patrol'; mob.patrolAngle += 0.25 * dt;

  // Patrulha preferência: permanece no bioma natal
  // Calcula ponto alvo dentro do bioma se possível
  const spec   = FAUNA_REGISTRY[mob.type];
  const radius = 200;
  let   tries  = 0;
  let   target: Vec2;
  do {
    const angle = mob.patrolAngle + (Math.random() - 0.5) * 0.6;
    target = {
      x: mob.origin.x + Math.cos(angle) * radius,
      y: mob.origin.y + Math.sin(angle) * radius,
    };
    tries++;
  } while (
    tries < 8 &&
    !spec.homeBiomes.includes(getBiomeAt(ctx.heightmap as any, target.x, target.y))
  );

  moveTo(mob, target, dt, heightmap);
}

function nearest(mob: FaunaEntity, players: Map<string, SessionPlayer>, range: number): SessionPlayer | null {
  let best: SessionPlayer | null = null; let min = range;
  for (const p of players.values()) { const d = dist(mob.position, p.position); if (d < min) { min = d; best = p; } }
  return best;
}

function moveTo(mob: FaunaEntity, target: Vec2, dt: number, heightmap?: Heightmap): void {
  const dx = target.x - mob.position.x; const dy = target.y - mob.position.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const candidateX = clamp(mob.position.x + nx * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
  const candidateY = clamp(mob.position.y + ny * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);

  if (heightmap) {
    // Bloqueia entrada em água profunda; tenta deslizar em X ou Y
    const destH = getHeight(heightmap, candidateX, candidateY);
    if (destH <= -3) {
      const slideXH = getHeight(heightmap, candidateX, mob.position.y);
      if (slideXH > -3) { mob.position.x = candidateX; return; }
      const slideYH = getHeight(heightmap, mob.position.x, candidateY);
      if (slideYH > -3) { mob.position.y = candidateY; return; }
      return; // completamente bloqueado
    }
    // Desacelera em água rasa ou montanha (não bloqueia, só move menos)
    const speedMult = destH <= -2 ? 0.4 : destH === 3 ? 0.55 : 1.0;
    mob.position.x = clamp(mob.position.x + nx * mob.speed * speedMult * dt, MARGIN, MAP_WIDTH  - MARGIN);
    mob.position.y = clamp(mob.position.y + ny * mob.speed * speedMult * dt, MARGIN, MAP_HEIGHT - MARGIN);
  } else {
    mob.position.x = candidateX;
    mob.position.y = candidateY;
  }
}

function fleeFrom(mob: FaunaEntity, threat: Vec2, dt: number, heightmap?: Heightmap): void {
  const dx = mob.position.x - threat.x; const dy = mob.position.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const candidateX = clamp(mob.position.x + nx * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
  const candidateY = clamp(mob.position.y + ny * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);

  if (heightmap) {
    const destH = getHeight(heightmap, candidateX, candidateY);
    // Fauna não foge para água profunda — tenta desviar lateralmente
    if (destH <= -3) {
      const slideXH = getHeight(heightmap, candidateX, mob.position.y);
      if (slideXH > -3) { mob.position.x = candidateX; return; }
      const slideYH = getHeight(heightmap, mob.position.x, candidateY);
      if (slideYH > -3) { mob.position.y = candidateY; return; }
      // Presa encurralada na costa: mantém posição (o player alcança)
      return;
    }
  }
  mob.position.x = candidateX;
  mob.position.y = candidateY;
}

function dist(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function randomBiomePos(biomes: number[], biomeMap: BiomeMap, attempts = 80): Vec2 | null {
  for (let i = 0; i < attempts; i++) {
    const pos = randomPos();
    if (biomes.includes(getBiomeAt(biomeMap, pos.x, pos.y))) return pos;
  }
  return null;
}

function randomPos(): Vec2 {
  return {
    x: MARGIN + Math.random() * (MAP_WIDTH  - MARGIN * 2),
    y: MARGIN + Math.random() * (MAP_HEIGHT - MARGIN * 2),
  };
}
function isNightTime(): boolean { const h = new Date().getHours(); return h >= 20 || h < 6; }

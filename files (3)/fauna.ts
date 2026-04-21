// ============================================================
// FAUNA — Sistema completo de animais (Tundra / Neve / Campinas)
//
// Arquitetura data-driven:
//   FAUNA_REGISTRY  → definição estática de cada espécie (imutável)
//   FaunaEntity     → instância em runtime (estado mutável)
//   BEHAVIOR_HANDLERS → funções de IA por comportamento (composição)
//   tickFauna()     → loop principal, orquestra os behaviors
//
// Cada animal declara uma lista de Behaviors. O dispatcher
// os avalia em ordem de prioridade — o primeiro que retornar
// true interrompe a cadeia (reivindicou o tick).
// ============================================================

import type { Vec2, SessionPlayer } from './world.state';
import { MAP_WIDTH, MAP_HEIGHT }    from './map.generator';

// ── Tiers de velocidade (unidades/segundo) ────────────────────
const SPEED = { baixa: 100, media: 160, alta: 230, muitaAlta: 320 } as const;

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
  | 'erratic'        // movimento imprevisível, muda direção aleatoriamente
  | 'opportunistic'  // foge de players, mas se aproxima de loot/inventários
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
  isConditional:    boolean;   // hostil só quando provocado/muito próximo
  statusEffect?:    StatusEffect;
  packType?:        string;    // tag de matilha compartilhada (ex: 'wolf_pack')
  spawnCount:       number;
  loot:             { itemType: string; qty: [number, number] }[];
}

// ── Instância de runtime (estado mutável por entidade) ────────
export interface FaunaEntity extends FaunaSpec {
  id:              string;
  type:            FaunaType;
  position:        Vec2;
  origin:          Vec2;
  hp:              number;       // sobrescreve spec.hp (diminui com dano)
  perception:      number;       // pode ser modificado por nocturnal
  damage:          number;       // idem
  state:           AIState;
  targetSocketId:  string | null;
  packId:          string | null;  // socketId do líder de matilha
  patrolAngle:     number;
  lastAttackAt:    number;
  chargeTarget:    Vec2 | null;
  chargeWindupAt:  number;
  ambushTriggered: boolean;
  alertedAt:       number;       // timestamp do último alerta de matilha
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

export const FAUNA_REGISTRY: Record<FaunaType, FaunaSpec> = {

  lobo: {
    label: 'Lobo',
    hp: 80, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 55, damage: 18, attackCooldownMs: 1400,
    damageType: 'bite',
    behaviors: ['pack', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false,
    packType: 'wolf_pack', spawnCount: 12,
    loot: [
      { itemType: 'fiber',       qty: [2, 5] },
      { itemType: 'food_ration', qty: [0, 2] },
    ],
  },

  lobo_alfa: {
    label: 'Lobo Alfa',
    hp: 150, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 60, damage: 28, attackCooldownMs: 1200,
    damageType: 'bite',
    behaviors: ['pack_leader', 'pack', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false,
    packType: 'wolf_pack', spawnCount: 3,
    loot: [
      { itemType: 'fiber',       qty: [4, 8] },
      { itemType: 'food_ration', qty: [1, 3] },
      { itemType: 'iron_ore',    qty: [0, 1] },
    ],
  },

  urso: {
    label: 'Urso',
    hp: 300, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 80, damage: 40, attackCooldownMs: 2200,
    damageType: 'impact',
    behaviors: ['territorial'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: true, isConditional: false,
    spawnCount: 6,
    loot: [
      { itemType: 'food_ration', qty: [3, 6] },
      { itemType: 'fiber',       qty: [5, 10] },
    ],
  },

  urso_polar: {
    label: 'Urso Polar',
    hp: 350, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 90, damage: 55, attackCooldownMs: 2000,
    damageType: 'impact',
    behaviors: ['territorial', 'aggressive'],
    coldResistance: 'muitaAlta', intelligence: 'media',
    isHostile: true, isConditional: false,
    spawnCount: 3,
    loot: [
      { itemType: 'food_ration', qty: [4, 8] },
      { itemType: 'fiber',       qty: [6, 12] },
    ],
  },

  cervo: {
    label: 'Cervo',
    hp: 60, speed: SPEED.muitaAlta,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: false,
    spawnCount: 10,
    loot: [
      { itemType: 'food_ration', qty: [2, 4] },
      { itemType: 'fiber',       qty: [2, 5] },
    ],
  },

  alce: {
    label: 'Alce',
    hp: 200, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 90, damage: 38, attackCooldownMs: 2500,
    damageType: 'charge_hit',
    behaviors: ['charge', 'defensive'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: true,
    spawnCount: 5,
    loot: [
      { itemType: 'food_ration', qty: [3, 5] },
      { itemType: 'fiber',       qty: [3, 6] },
    ],
  },

  bisao: {
    label: 'Bisão',
    hp: 250, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 100, damage: 45, attackCooldownMs: 3000,
    damageType: 'charge_hit',
    behaviors: ['charge'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: true,
    spawnCount: 6,
    loot: [
      { itemType: 'food_ration', qty: [4, 8] },
      { itemType: 'fiber',       qty: [4, 8] },
    ],
  },

  boi_selvagem: {
    label: 'Boi Selvagem',
    hp: 220, speed: SPEED.baixa,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 85, damage: 35, attackCooldownMs: 3500,
    damageType: 'impact',
    behaviors: ['territorial'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: true,
    spawnCount: 4,
    loot: [
      { itemType: 'food_ration', qty: [4, 7] },
      { itemType: 'fiber',       qty: [3, 6] },
    ],
  },

  javali: {
    label: 'Javali',
    hp: 120, speed: SPEED.media,
    perception: PERCEPTION.media, leashRange: LEASH.media,
    attackRange: 60, damage: 25, attackCooldownMs: 1600,
    damageType: 'bite',
    behaviors: ['aggressive'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: true, isConditional: false,
    spawnCount: 8,
    loot: [
      { itemType: 'food_ration', qty: [1, 3] },
      { itemType: 'fiber',       qty: [1, 4] },
    ],
  },

  coelho: {
    label: 'Coelho',
    hp: 20, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee', 'erratic'],
    coldResistance: 'media', intelligence: 'baixa',
    isHostile: false, isConditional: false,
    spawnCount: 15,
    loot: [
      { itemType: 'food_ration', qty: [1, 2] },
      { itemType: 'fiber',       qty: [0, 2] },
    ],
  },

  raposa: {
    label: 'Raposa',
    hp: 40, speed: SPEED.alta,
    perception: PERCEPTION.alta, leashRange: LEASH.media,
    attackRange: 45, damage: 8, attackCooldownMs: 2000,
    damageType: 'bite',
    behaviors: ['flee', 'opportunistic'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: false, isConditional: false,
    spawnCount: 8,
    loot: [
      { itemType: 'fiber',       qty: [1, 3] },
      { itemType: 'food_ration', qty: [0, 1] },
    ],
  },

  lince: {
    label: 'Lince',
    hp: 90, speed: SPEED.muitaAlta,
    perception: PERCEPTION.alta, leashRange: LEASH.alta,
    attackRange: 55, damage: 35, attackCooldownMs: 1000,
    damageType: 'critical_bite',
    behaviors: ['stealth', 'ambush', 'aggressive'],
    coldResistance: 'alta', intelligence: 'alta',
    isHostile: true, isConditional: false,
    spawnCount: 4,
    loot: [
      { itemType: 'fiber', qty: [3, 6] },
    ],
  },

  cobra_gelo: {
    label: 'Cobra do Gelo',
    hp: 25, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 40, damage: 10, attackCooldownMs: 2500,
    damageType: 'poison',
    behaviors: ['ambush'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: true, isConditional: false,
    statusEffect: { type: 'poison', damagePerSec: 3, durationSec: 8, stackable: false },
    spawnCount: 10,
    loot: [
      { itemType: 'fiber', qty: [0, 2] },
    ],
  },

  cao_selvagem: {
    label: 'Cão Selvagem',
    hp: 70, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.alta,
    attackRange: 50, damage: 15, attackCooldownMs: 1300,
    damageType: 'bite',
    behaviors: ['pack', 'aggressive'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: true, isConditional: false,
    packType: 'dog_pack', spawnCount: 10,
    loot: [
      { itemType: 'fiber',       qty: [1, 3] },
      { itemType: 'food_ration', qty: [0, 1] },
    ],
  },

  rato_gelo: {
    label: 'Rato do Gelo',
    hp: 15, speed: SPEED.media,
    perception: PERCEPTION.baixa, leashRange: LEASH.baixa,
    attackRange: 30, damage: 3, attackCooldownMs: 3000,
    damageType: 'disease',
    behaviors: ['diseased', 'scavenger'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: false,
    statusEffect: { type: 'disease', damagePerSec: 1.5, durationSec: 15, stackable: true },
    spawnCount: 14,
    loot: [],
  },

  aguia: {
    label: 'Águia',
    hp: 30, speed: SPEED.muitaAlta,
    perception: PERCEPTION.muitaAlta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false,
    spawnCount: 5,
    loot: [{ itemType: 'fiber', qty: [0, 2] }],
  },

  coruja: {
    label: 'Coruja',
    hp: 20, speed: SPEED.media,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee', 'nocturnal'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false,
    spawnCount: 6,
    loot: [],
  },

  corvo: {
    label: 'Corvo',
    hp: 15, speed: SPEED.media,
    perception: PERCEPTION.alta, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee', 'scavenger'],
    coldResistance: 'alta', intelligence: 'baixa',
    isHostile: false, isConditional: false,
    spawnCount: 8,
    loot: [],
  },

  cavalo: {
    label: 'Cavalo Selvagem',
    hp: 100, speed: SPEED.muitaAlta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee'],
    coldResistance: 'media', intelligence: 'media',
    isHostile: false, isConditional: false,
    spawnCount: 6,
    loot: [],
  },

  cabra_montanha: {
    label: 'Cabra da Montanha',
    hp: 80, speed: SPEED.alta,
    perception: PERCEPTION.media, leashRange: LEASH.baixa,
    attackRange: 0, damage: 0, attackCooldownMs: 99_999,
    damageType: 'none',
    behaviors: ['flee'],
    coldResistance: 'alta', intelligence: 'media',
    isHostile: false, isConditional: false,
    spawnCount: 7,
    loot: [{ itemType: 'fiber', qty: [1, 3] }],
  },
};

// Loot acessível por tipo (consumido pelo CombatService)
export const FAUNA_LOOT = Object.fromEntries(
  (Object.entries(FAUNA_REGISTRY) as [FaunaType, FaunaSpec][])
    .map(([type, spec]) => [type, spec.loot]),
) as Record<FaunaType, FaunaSpec['loot']>;

// ══════════════════════════════════════════════════════════════
// SPAWN
// ══════════════════════════════════════════════════════════════

const MARGIN = 150;
const PACK_CLUSTER_RADIUS = 600;

export function spawnFauna(roomId: string): Map<string, FaunaEntity> {
  const fauna     = new Map<string, FaunaEntity>();
  let   idx       = 0;
  const packOrigins = new Map<string, Vec2>(); // packType → Vec2 central

  for (const [type, spec] of Object.entries(FAUNA_REGISTRY) as [FaunaType, FaunaSpec][]) {
    for (let i = 0; i < spec.spawnCount; i++) {
      const id = `fauna_${idx++}`;

      // Membros de matilha nascem num cluster em torno do mesmo ponto
      let pos: Vec2;
      if (spec.packType) {
        if (!packOrigins.has(spec.packType)) {
          packOrigins.set(spec.packType, randomPos());
        }
        const center = packOrigins.get(spec.packType)!;
        pos = {
          x: clamp(center.x + (Math.random() - .5) * PACK_CLUSTER_RADIUS, MARGIN, MAP_WIDTH  - MARGIN),
          y: clamp(center.y + (Math.random() - .5) * PACK_CLUSTER_RADIUS, MARGIN, MAP_HEIGHT - MARGIN),
        };
      } else {
        pos = randomPos();
      }

      const entity: FaunaEntity = {
        ...spec,
        // campos de instância — sobreescrevem os da spec
        id,
        type:            type as FaunaType,
        position:        { ...pos },
        origin:          { ...pos },
        hp:              spec.hp,
        perception:      spec.perception,
        damage:          spec.damage,
        state:           spec.behaviors.includes('ambush') ? 'ambush' : 'patrol',
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
    if (mob.behaviors.includes('pack_leader') && mob.packType) {
      leaders.set(mob.packType, mob);
    }
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
  mob:     FaunaEntity;
  players: Map<string, SessionPlayer>;
  fauna:   Map<string, FaunaEntity>;
  dt:      number;     // delta-time em segundos
  now:     number;
  isNight: boolean;
  attacks: FaunaAttackEvent[];
}

export function tickFauna(
  fauna:   Map<string, FaunaEntity>,
  players: Map<string, SessionPlayer>,
  dt:      number,
): FaunaAttackEvent[] {
  const attacks: FaunaAttackEvent[] = [];
  const now     = Date.now();
  const isNight = isNightTime();

  for (const mob of fauna.values()) {
    if (mob.state === 'dead') continue;
    runBehaviors({ mob, players, fauna, dt, now, isNight, attacks });
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

  // Estados especiais de charge têm loop próprio
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
    // Líder detecta com range ampliado e alerta a matilha
    const target = nearest(mob, players, mob.perception * 1.4);
    if (target && mob.state === 'patrol') {
      mob.state = 'chase';
      mob.targetSocketId = target.socketId;
      alertPack(mob, fauna, players, target.socketId, 600);
    }
    return false; // delega movimento para 'pack'
  },

  nocturnal(ctx) {
    const { mob, isNight } = ctx;
    const base = FAUNA_REGISTRY[mob.type];
    mob.perception = isNight ? base.perception * 2   : base.perception;
    mob.damage     = isNight ? base.damage     * 1.5 : base.damage;
    return false; // modifica atributos, não reivindica o tick
  },

  stealth(ctx) {
    // Apenas sinaliza — buildSnapshot filtra mobs stealth pelo raio reduzido.
    // Não bloqueia outros behaviors.
    return false;
  },

  ambush(ctx) {
    const { mob, players, now, attacks } = ctx;
    if (mob.ambushTriggered) return false;

    // Detecta apenas em metade do range normal (imóvel e camuflado)
    const target = nearest(mob, players, mob.perception * 0.45);
    if (!target) return true; // fica parado esperando

    mob.ambushTriggered  = true;
    mob.state            = 'chase';
    mob.targetSocketId   = target.socketId;

    // Primeiro hit é surpresa: dano x1.5 garantido
    mob.lastAttackAt = now;
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
    // Procura o player mais fraco (HP < 40) como alvo de oportunidade
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
    const { mob, players, dt } = ctx;
    // Foge se player está perto, mas não ataca
    const threat = nearest(mob, players, mob.perception * 0.6);
    if (threat) { fleeFrom(mob, threat.position, dt); return true; }
    return false;
  },

  diseased(_ctx) {
    // Sinalizado no snapshot — mecânica de gameplay na Fase 4
    return false;
  },

  charge(ctx) {
    const { mob, players, dt, now } = ctx;
    if (mob.state === 'patrol') {
      const target = nearest(mob, players, mob.perception);
      if (!target) return false;
      // Condicional: só inicia charge se player invadir espaço pessoal
      if (mob.isConditional && dist(mob.position, target.position) > mob.perception * 0.5) {
        return false;
      }
      mob.state           = 'charge_windup';
      mob.chargeTarget    = { ...target.position };
      mob.chargeWindupAt  = now;
      mob.targetSocketId  = target.socketId;
      return true;
    }
    if (mob.state === 'chase' && mob.targetSocketId) {
      const target = players.get(mob.targetSocketId);
      if (!target) { mob.state = 'patrol'; return true; }
      const d = dist(mob.position, target.position);
      if (d <= mob.attackRange * 1.5 && now - mob.lastAttackAt > mob.attackCooldownMs) {
        mob.state          = 'charge_windup';
        mob.chargeTarget   = { ...target.position };
        mob.chargeWindupAt = now;
        return true;
      }
      moveTo(mob, target.position, dt);
      return true;
    }
    return false;
  },

  territorial(ctx) {
    const { mob, players, dt } = ctx;
    const RADIUS = 360;
    const target = nearest(mob, players, RADIUS);
    if (target) {
      mob.state = 'chase'; mob.targetSocketId = target.socketId;
      return handleChaseAttack(ctx, target);
    }
    // Volta à origem se foi puxado para fora do território
    if (dist(mob.position, mob.origin) > RADIUS * 1.6) {
      moveTo(mob, mob.origin, dt);
      return true;
    }
    return false;
  },

  defensive(ctx) {
    const { mob, players } = ctx;
    const hpPct = mob.hp / mob.maxHp;
    const inFace = nearest(mob, players, mob.attackRange * 1.3);
    if (hpPct < 0.5 || inFace) {
      const target = inFace ?? nearest(mob, players, mob.perception);
      if (target) {
        mob.state = 'chase'; mob.targetSocketId = target.socketId;
        return handleChaseAttack(ctx, target);
      }
    }
    return false;
  },

  aggressive(ctx) {
    const { mob, players } = ctx;
    const target = nearest(mob, players, mob.perception);
    if (target) {
      mob.state = 'chase'; mob.targetSocketId = target.socketId;
      return handleChaseAttack(ctx, target);
    }
    doBasePatrol(ctx);
    return true;
  },

  pack(ctx) {
    const { mob, players, fauna, now } = ctx;
    // Se foi alertado recentemente pelo líder, persegue o alvo indicado
    if (mob.alertedAt && now - mob.alertedAt < 6000 && mob.targetSocketId) {
      const target = players.get(mob.targetSocketId);
      if (target) return handleChaseAttack(ctx, target);
    }
    // Detecção própria com range padrão
    const target = nearest(mob, players, mob.perception);
    if (target) {
      mob.state = 'chase'; mob.targetSocketId = target.socketId;
      return handleChaseAttack(ctx, target);
    }
    doBasePatrol(ctx);
    return true;
  },

  flee(ctx) {
    const { mob, players, dt } = ctx;
    const threat = nearest(mob, players, mob.perception);
    if (threat) {
      mob.state = 'flee';
      fleeFrom(mob, threat.position, dt);
      return true;
    }
    if (mob.state === 'flee') mob.state = 'patrol';
    return false;
  },

  erratic(ctx) {
    const { mob, dt } = ctx;
    if (mob.state !== 'patrol') return false;
    if (Math.random() < dt) mob.patrolAngle = Math.random() * Math.PI * 2;
    mob.position.x = clamp(mob.position.x + Math.cos(mob.patrolAngle) * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
    mob.position.y = clamp(mob.position.y + Math.sin(mob.patrolAngle) * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);
    return true;
  },
};

// ══════════════════════════════════════════════════════════════
// ESTADOS ESPECIAIS DE CHARGE
// ══════════════════════════════════════════════════════════════

const CHARGE_WINDUP_MS   = 800;
const CHARGE_SPEED_MULT  = 3.2;

function doChargeWindup(ctx: AICtx): void {
  const { mob, now } = ctx;
  if (now - mob.chargeWindupAt >= CHARGE_WINDUP_MS) {
    mob.state = 'charging';
  }
  // Fica parado durante o windup (tensão antes do ataque)
}

function doCharging(ctx: AICtx): void {
  const { mob, players, dt, now, attacks } = ctx;
  if (!mob.chargeTarget) { mob.state = 'patrol'; return; }

  // Movimento rápido em linha reta
  moveTo(mob, mob.chargeTarget, dt * CHARGE_SPEED_MULT);

  // Hit em qualquer player no caminho
  for (const player of players.values()) {
    if (dist(mob.position, player.position) <= mob.attackRange + 10) {
      attacks.push({
        faunaId: mob.id, faunaType: mob.type,
        targetSocketId: player.socketId,
        damage:         Math.round(mob.damage * 1.4),
        damageType:     mob.damageType,
        statusEffect:   mob.statusEffect,
      });
    }
  }

  // Encerra ao atingir destino
  if (dist(mob.position, mob.chargeTarget) < 25) {
    mob.state        = 'patrol';
    mob.chargeTarget = null;
    mob.lastAttackAt = now;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function handleChaseAttack(ctx: AICtx, target: SessionPlayer): boolean {
  const { mob, dt, now, attacks } = ctx;
  const d = dist(mob.position, target.position);

  if (d > mob.leashRange) {
    mob.state = 'patrol'; mob.targetSocketId = null;
    return true;
  }
  if (d <= mob.attackRange) {
    mob.state = 'attack';
    if (now - mob.lastAttackAt >= mob.attackCooldownMs) {
      mob.lastAttackAt = now;
      attacks.push({
        faunaId: mob.id, faunaType: mob.type,
        targetSocketId: target.socketId,
        damage:         mob.damage,
        damageType:     mob.damageType,
        statusEffect:   mob.statusEffect,
      });
    }
  } else {
    mob.state = 'chase';
    moveTo(mob, target.position, dt);
  }
  return true;
}

function alertPack(
  leader:  FaunaEntity,
  fauna:   Map<string, FaunaEntity>,
  players: Map<string, SessionPlayer>,
  targetId: string,
  radius:  number,
): void {
  const now = Date.now();
  for (const mob of fauna.values()) {
    if (mob.packType !== leader.packType || mob.id === leader.id) continue;
    if (dist(mob.position, leader.position) > radius) continue;
    mob.targetSocketId = targetId;
    mob.state          = 'chase';
    mob.alertedAt      = now;
  }
}

function doBasePatrol(ctx: AICtx): void {
  const { mob, dt } = ctx;
  mob.state = 'patrol';
  mob.patrolAngle += 0.25 * dt;
  const r  = 180;
  const tx = mob.origin.x + Math.cos(mob.patrolAngle) * r;
  const ty = mob.origin.y + Math.sin(mob.patrolAngle) * r;
  moveTo(mob, { x: tx, y: ty }, dt);
}

function nearest(mob: FaunaEntity, players: Map<string, SessionPlayer>, range: number): SessionPlayer | null {
  let best: SessionPlayer | null = null;
  let min = range;
  for (const p of players.values()) {
    const d = dist(mob.position, p.position);
    if (d < min) { min = d; best = p; }
  }
  return best;
}

function moveTo(mob: FaunaEntity, target: Vec2, dt: number): void {
  const dx = target.x - mob.position.x;
  const dy = target.y - mob.position.y;
  const len = Math.hypot(dx, dy) || 1;
  mob.position.x = clamp(mob.position.x + (dx / len) * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
  mob.position.y = clamp(mob.position.y + (dy / len) * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);
}

function fleeFrom(mob: FaunaEntity, threat: Vec2, dt: number): void {
  const dx = mob.position.x - threat.x;
  const dy = mob.position.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  mob.position.x = clamp(mob.position.x + (dx / len) * mob.speed * dt, MARGIN, MAP_WIDTH  - MARGIN);
  mob.position.y = clamp(mob.position.y + (dy / len) * mob.speed * dt, MARGIN, MAP_HEIGHT - MARGIN);
}

function dist(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function randomPos(): Vec2 {
  return {
    x: MARGIN + Math.random() * (MAP_WIDTH  - MARGIN * 2),
    y: MARGIN + Math.random() * (MAP_HEIGHT - MARGIN * 2),
  };
}
function isNightTime(): boolean {
  const h = new Date().getHours();
  return h >= 20 || h < 6;
}
// ============================================================
// WORLD STATE — Estruturas de dados efêmeras da sessão
// Tudo aqui vive SOMENTE na RAM. Nunca é gravado no banco.
// Princípio #3: Delayed Persistence.
// ============================================================

import type { ItemType }    from '@survival/shared/types';
import type { FaunaEntity } from './fauna';
import type { Heightmap, BiomeMap } from './map.generator';

// ── Posição 2D ────────────────────────────────────────────────
export interface Vec2 {
  x: number;
  y: number;
}

// ── Nó de recurso no mapa ────────────────────────────────────
export interface ResourceNode {
  id:         string;
  type:       'iron_ore' | 'wood' | 'stone' | 'fiber' | 'coal' | 'food_ration';
  position:   Vec2;
  quantity:   number;    // quanto resta para coletar
  maxQty:     number;    // quantidade máxima (para respawn)
  respawnAt:  number | null; // timestamp ms quando vai reaparecer (null = disponível)
}

// ── Zona de extração ─────────────────────────────────────────
export interface ExtractionZone {
  id:       string;
  position: Vec2;
  radius:   number;     // raio em unidades do mapa
  label:    string;     // ex: 'Norte', 'Sul', 'Centro'
}

// ── Player em sessão (estado efêmero) ────────────────────────
export interface SessionPlayer {
  playerId:    string;
  username:    string;
  socketId:    string;
  position:    Vec2;
  velocity:    Vec2;
  hp:          number;
  maxHp:       number;
  thirst:      number;    // 0–100, decrementa com o tempo
  inventory:   SessionItem[];
  inventoryWeightUsed: number;
  inventoryWeightLimit: number;
  isExtracting: boolean;
  activeEffects: ActiveStatusEffect[];  // veneno, doença — processados no tick
  lastProcessedInput: number; // sequence number do último input processado
  joinedAt:    number;   // Date.now()
}

export interface SessionItem {
  itemType: ItemType;
  quantity: number;
  weight:   number;
}

// Efeito de status ativo num player (veneno, doença, sangramento)
// Vive na RAM — nunca persistido. Gerado por ataques da fauna.
export interface ActiveStatusEffect {
  type:         'poison' | 'disease' | 'bleed';
  damagePerSec: number;
  expiresAt:    number;   // timestamp ms
  stackId:      string;   // UUID — permite múltiplos stacks de 'disease'
}

// ── Estado completo de uma sala ───────────────────────────────
export interface RoomState {
  roomId:          string;
  players:         Map<string, SessionPlayer>; // key = socketId
  resources:       Map<string, ResourceNode>;
  fauna:           Map<string, FaunaEntity>;
  extractionZones: ExtractionZone[];
  heightmap:       Heightmap;
  biomeMap:        BiomeMap;
  tick:            number;
  createdAt:       number;
}

// ── Input de movimento vindo do cliente ──────────────────────
// O servidor NUNCA confia em posição — apenas em intenções.
export interface MoveInput {
  seq:  number;  // sequence number para reconciliação
  dx:   number;  // direção normalizada [-1, 0, 1]
  dy:   number;
  dt:   number;  // delta-time do cliente (ms) — limitado a 100ms no servidor
}

// ── Snapshot do mundo enviado ao cliente no tick ─────────────
export interface WorldSnapshot {
  tick:      number;
  players:   SnapshotPlayer[];
  resources: SnapshotResource[];
  fauna:     SnapshotFauna[];    // ← Fase 3
}

export interface SnapshotFauna {
  id:         string;
  type:       string;
  label:      string;    // nome PT-BR para exibição no cliente
  position:   Vec2;
  hpPct:      number;    // 0–100 para barra de HP acima do mob
  state:      string;
  isHostile:  boolean;   // false = passivo (cervo, coelho...)
  isAggro:    boolean;   // true = perseguindo/atacando um player agora
  stealth:    boolean;   // true = só visível dentro do visibleRange
  visibleRange: number;  // unidades — relevante apenas se stealth=true
  damageType: string;    // para VFX de hit no cliente
}

export interface SnapshotPlayer {
  socketId: string;
  username: string;
  position: Vec2;
  hp:       number;
  thirst:   number;
  isExtracting: boolean;
}

export interface SnapshotResource {
  id:       string;
  type:     ResourceNode['type'];
  position: Vec2;
  available: boolean; // false quando em respawn
}

// ============================================================
// MAP GENERATOR v4 — Biomas Grandes + Whittaker Refinado
//
// Mudanças vs v3:
//   - fractalNoise com parâmetro baseScale → biomas muito maiores
//   - Temperatura: escala 20× → regiões climáticas continentais
//   - Umidade: escala 16× com seed diferente → independente da temp
//   - Whittaker refinado com 12 biomas bem distintos
//   - BiomeMap exporta também a "softness" (0-255) para dithering
//     no cliente: pixels de borda recebem mistura graduada
// ============================================================

import type { ResourceNode, ExtractionZone, Vec2 } from './world.state';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════
export const MAP_WIDTH   = 12_000;
export const MAP_HEIGHT  = 12_000;
export const GRID_W      = 600;
export const GRID_H      = 600;
export const CELL_SIZE   = MAP_WIDTH / GRID_W;  // 20 u/célula

export const CHUNK_CELLS = 6;
export const CHUNK_SIZE  = CHUNK_CELLS * CELL_SIZE;
export const CHUNKS_W    = GRID_W / CHUNK_CELLS;  // 100
export const CHUNKS_H    = GRID_H / CHUNK_CELLS;  // 100

const SPAWN_MARGIN = 600;

// ══════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════
export type Heightmap = Int8Array;   // [-3..3]
export type BiomeMap  = Uint8Array;  // [0..12]

export const BIOME = {
  DEEP_OCEAN:  0,
  OCEAN:       1,
  SHALLOW_SEA: 2,
  BEACH:       3,
  TUNDRA:      4,
  TAIGA:       5,
  GRASSLAND:   6,
  TEMP_FOREST: 7,
  TROP_FOREST: 8,
  DESERT:      9,
  SAVANNA:     10,
  MOUNTAIN:    11,
  SNOW_PEAK:   12,
} as const;
export type BiomeValue = typeof BIOME[keyof typeof BIOME];

// ══════════════════════════════════════════════════════════════
// PRNG
// ══════════════════════════════════════════════════════════════
function makePrng(seed: number) {
  let s = (seed >>> 0) || 1;
  return (): number => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (const c of str) { h ^= c.charCodeAt(0); h = (h * 0x01000193) >>> 0; }
  return h;
}

// ══════════════════════════════════════════════════════════════
// FRACTAL VALUE NOISE
// baseScale controla o tamanho das feições:
//   baseScale=4  → feições de ~4 células (pequenas)
//   baseScale=20 → feições de ~20 células (grandes regiões)
// ══════════════════════════════════════════════════════════════
function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

function bilerp(a: number, b: number, c: number, d: number, tx: number, ty: number): number {
  const sx = smoothstep(tx), sy = smoothstep(ty);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fractalNoise(
  seed:       number,
  width:      number,
  height:     number,
  octaves     = 5,
  persistence = 0.5,
  lacunarity  = 2.0,
  baseScale   = 4,   // ← novo: maior = feições maiores
): Float32Array {
  const rand  = makePrng(seed);
  const noise = new Float32Array(width * height);
  let maxAmp = 0, amp = 1.0;
  for (let o = 0; o < octaves; o++) { maxAmp += amp; amp *= persistence; }

  for (let oct = 0; oct < octaves; oct++) {
    const freq = Math.pow(lacunarity, oct);
    const ampO = Math.pow(persistence, oct);
    // baseScale em vez do fixo /4 anterior
    const gw = Math.ceil(width  * freq / baseScale) + 2;
    const gh = Math.ceil(height * freq / baseScale) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = (x / width)  * freq * (gw - 1);
        const ny = (y / height) * freq * (gh - 1);
        const ix = Math.floor(nx), iy = Math.floor(ny);
        const x0 = Math.min(ix,     gw - 1), x1 = Math.min(ix + 1, gw - 1);
        const y0 = Math.min(iy,     gh - 1), y1 = Math.min(iy + 1, gh - 1);
        noise[y * width + x] += bilerp(
          grid[y0 * gw + x0], grid[y0 * gw + x1],
          grid[y1 * gw + x0], grid[y1 * gw + x1],
          nx - ix, ny - iy,
        ) * ampO;
      }
    }
  }
  for (let i = 0; i < noise.length; i++) noise[i] /= maxAmp;
  return noise;
}

// ══════════════════════════════════════════════════════════════
// HEIGHTMAP — geração continental
// baseScale=5 → feições de ~120 células = 2.400 unidades
// ══════════════════════════════════════════════════════════════
export function buildHeightmap(seed: number): Heightmap {
  // Duas camadas: continental (grande) + detalhe (pequena)
  const continental = fractalNoise(seed,           GRID_W, GRID_H, 4, 0.50, 2.0, 22);
  const detail      = fractalNoise(seed ^ 0x1234,  GRID_W, GRID_H, 4, 0.50, 2.0,  5);
  const map = new Int8Array(GRID_W * GRID_H);

  for (let i = 0; i < map.length; i++) {
    // Peso 70% continental + 30% detalhe → continentes grandes com costa irregular
    const n = continental[i] * 0.70 + detail[i] * 0.30;
    if      (n < -0.50) map[i] = -3;
    else if (n < -0.25) map[i] = -2;
    else if (n <  0.00) map[i] = -1;
    else if (n <  0.08) map[i] =  0;
    else if (n <  0.45) map[i] =  1;
    else if (n <  0.72) map[i] =  2;
    else                map[i] =  3;
  }
  return map;
}

// ══════════════════════════════════════════════════════════════
// TEMPERATURA — gradiente latitudinal + variação larga
// baseScale=20 → faixas climáticas de ~12.000 unidades de largura
// ══════════════════════════════════════════════════════════════
function buildTemperatureMap(seed: number): Float32Array {
  // Ruído de baixíssima frequência para variação regional grande
  const noise = fractalNoise(seed, GRID_W, GRID_H, 2, 0.40, 2.0, 20);
  const temp  = new Float32Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    // Gradiente latitudinal forte: norte=frio (0), sul=quente (1)
    const lat = y / GRID_H;
    for (let x = 0; x < GRID_W; x++) {
      const n = noise[y * GRID_W + x]; // [-1,1]
      // 65% latitude + 35% variação regional → grandes faixas tropicais/temperadas/polares
      temp[y * GRID_W + x] = Math.max(0, Math.min(1, lat * 0.65 + 0.175 + n * 0.35));
    }
  }
  return temp;
}

// ══════════════════════════════════════════════════════════════
// UMIDADE — independente da temperatura
// baseScale=16 → zonas úmidas/secas de ~8.000 unidades
// ══════════════════════════════════════════════════════════════
function buildMoistureMap(seed: number): Float32Array {
  const noise = fractalNoise(seed, GRID_W, GRID_H, 2, 0.40, 2.0, 16);
  const moist = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < moist.length; i++) moist[i] = (noise[i] + 1) / 2;
  return moist;
}

// ══════════════════════════════════════════════════════════════
// DIAGRAMA DE WHITTAKER REFINADO
// Biomas são zonas mais largas → menos fragmentação
// ══════════════════════════════════════════════════════════════
function getWhittakerBiome(h: number, t: number, m: number): number {
  // ── Aquáticos ──────────────────────────────────────────────
  if (h <= -3) return BIOME.DEEP_OCEAN;
  if (h <= -2) return BIOME.OCEAN;
  if (h <= -1) return BIOME.SHALLOW_SEA;
  if (h ===  0) return BIOME.BEACH;

  // ── Montanha/neve (altura domina) ─────────────────────────
  if (h >=  3) return t < 0.35 ? BIOME.SNOW_PEAK : BIOME.MOUNTAIN;

  // ── h = 1 ou 2: Whittaker temperatura × umidade ───────────
  //
  //  Temperatura (t):  0.0─────0.25──────0.55──────1.0
  //                    POLAR   BOREAL    TEMPER.   TROPICAL
  //
  //  Umidade (m):      0.0─────0.30──────0.60──────1.0
  //                    ÁRIDO   SECO      MODERADO  ÚMIDO

  if (t < 0.25) {
    // Polar/Ártico — frio extremo
    return m < 0.45 ? BIOME.TUNDRA : BIOME.TAIGA;
  }
  if (t < 0.55) {
    // Temperado
    if (m < 0.28) return BIOME.GRASSLAND;          // estepe temperada
    if (m < 0.65) return BIOME.TEMP_FOREST;         // floresta temperada
    return BIOME.TAIGA;                              // boreal úmido
  }
  // Tropical/Subtropical
  if (m < 0.25) return BIOME.DESERT;               // deserto quente
  if (m < 0.55) return BIOME.SAVANNA;              // savana/cerrado
  return BIOME.TROP_FOREST;                         // floresta tropical
}

export function buildBiomeMap(
  heightmap: Heightmap,
  tempMap:   Float32Array,
  moistMap:  Float32Array,
): BiomeMap {
  const biome = new Uint8Array(GRID_W * GRID_H);
  for (let i = 0; i < biome.length; i++) {
    biome[i] = getWhittakerBiome(heightmap[i], tempMap[i], moistMap[i]);
  }
  return biome;
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE CONSULTA
// ══════════════════════════════════════════════════════════════
export function getHeight(map: Heightmap, wx: number, wy: number): number {
  const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(wx / CELL_SIZE)));
  const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(wy / CELL_SIZE)));
  return map[gy * GRID_W + gx];
}

export function getBiomeAt(map: BiomeMap, wx: number, wy: number): number {
  const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(wx / CELL_SIZE)));
  const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(wy / CELL_SIZE)));
  return map[gy * GRID_W + gx];
}

export function isWalkable(map: Heightmap, wx: number, wy: number): boolean {
  return getHeight(map, wx, wy) >= -1;
}

export function isLand(map: Heightmap, wx: number, wy: number): boolean {
  return getHeight(map, wx, wy) >= 0;
}

export function getSafeSpawnPoint(
  heightmap: Heightmap,
  occupied:  Vec2[],
  rand:      () => number = Math.random,
): Vec2 {
  for (let i = 0; i < 150; i++) {
    const x = SPAWN_MARGIN + rand() * (MAP_WIDTH  - SPAWN_MARGIN * 2);
    const y = SPAWN_MARGIN + rand() * (MAP_HEIGHT - SPAWN_MARGIN * 2);
    if (getHeight(heightmap, x, y) < 1) continue; // quer terra firme (h>=1)
    const noOverlap = !occupied.some(o => Math.hypot(o.x - x, o.y - y) < 400);
    if (noOverlap) return { x, y };
  }
  // fallback: centro do mapa
  return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
}

// ══════════════════════════════════════════════════════════════
// POISSON DISC — Bridson 2007
// ══════════════════════════════════════════════════════════════
export function poissonDisc(
  minDist:   number,
  maxPoints: number,
  isValid:   (x: number, y: number) => boolean,
  rand:      () => number,
  areaW     = MAP_WIDTH,
  areaH     = MAP_HEIGHT,
  attempts  = 30,
): Vec2[] {
  const cell = minDist / Math.SQRT2;
  const gw = Math.ceil(areaW / cell);
  const gh = Math.ceil(areaH / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Vec2[] = [];
  const active: number[] = [];

  const addPt = (x: number, y: number) => {
    const i  = pts.push({ x, y }) - 1;
    const gx = Math.min(gw - 1, Math.floor(x / cell));
    const gy = Math.min(gh - 1, Math.floor(y / cell));
    grid[gy * gw + gx] = i;
    active.push(i);
  };

  let sx = rand() * areaW, sy = rand() * areaH, tries = 0;
  while (!isValid(sx, sy) && tries++ < 300) { sx = rand() * areaW; sy = rand() * areaH; }
  if (!isValid(sx, sy)) return [];
  addPt(sx, sy);

  while (active.length > 0 && pts.length < maxPoints) {
    const ai   = Math.floor(rand() * active.length);
    const base = pts[active[ai]];
    let found  = false;

    for (let k = 0; k < attempts; k++) {
      const angle = rand() * Math.PI * 2;
      const r     = minDist * (1 + rand());
      const cx    = base.x + Math.cos(angle) * r;
      const cy    = base.y + Math.sin(angle) * r;
      if (cx < 0 || cx >= areaW || cy < 0 || cy >= areaH) continue;
      if (!isValid(cx, cy)) continue;
      const gcx = Math.floor(cx / cell), gcy = Math.floor(cy / cell);
      let ok = true;
      outer: for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gcx + dx, ny = gcy + dy;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          const ni = grid[ny * gw + nx];
          if (ni >= 0 && Math.hypot(cx - pts[ni].x, cy - pts[ni].y) < minDist) {
            ok = false; break outer;
          }
        }
      }
      if (ok) { addPt(cx, cy); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

// ══════════════════════════════════════════════════════════════
// SERIALIZAÇÃO base64
// ══════════════════════════════════════════════════════════════
export function heightmapToBase64(map: Heightmap): string {
  const u8 = new Uint8Array(map.length);
  for (let i = 0; i < map.length; i++) u8[i] = (map[i] as number) + 3;
  return Buffer.from(u8).toString('base64');
}

export function biomemapToBase64(map: BiomeMap): string {
  return Buffer.from(map).toString('base64');
}

// Compat legado
export function heightmapToArray(map: Heightmap): number[] {
  return Array.from(map);
}

// ══════════════════════════════════════════════════════════════
// RECURSOS por bioma
// ══════════════════════════════════════════════════════════════
type ResourceType = ResourceNode['type'];

const RESOURCE_BIOMES: Record<ResourceType, number[]> = {
  iron_ore:    [BIOME.MOUNTAIN, BIOME.TEMP_FOREST],
  wood:        [BIOME.TAIGA, BIOME.TEMP_FOREST, BIOME.TROP_FOREST],
  stone:       [BIOME.MOUNTAIN, BIOME.SNOW_PEAK, BIOME.TEMP_FOREST],
  fiber:       [BIOME.BEACH, BIOME.GRASSLAND, BIOME.SAVANNA],
  coal:        [BIOME.MOUNTAIN, BIOME.SNOW_PEAK],
  food_ration: [BIOME.BEACH, BIOME.GRASSLAND, BIOME.SAVANNA, BIOME.TROP_FOREST],
};

const RESOURCE_CONFIG = [
  { type: 'iron_ore'    as ResourceType, count: 35, minQty: 5,  maxQty: 20, respawnMs: 120_000 },
  { type: 'wood'        as ResourceType, count: 55, minQty: 10, maxQty: 40, respawnMs:  60_000 },
  { type: 'stone'       as ResourceType, count: 45, minQty: 1,  maxQty: 1,  respawnMs:  90_000 },
  { type: 'fiber'       as ResourceType, count: 65, minQty: 5,  maxQty: 15, respawnMs:  45_000 },
  { type: 'coal'        as ResourceType, count: 25, minQty: 3,  maxQty: 12, respawnMs: 180_000 },
  { type: 'food_ration' as ResourceType, count: 30, minQty: 1,  maxQty: 5,  respawnMs:  30_000 },
];

const EZ_POSITIONS = [
  { x: MAP_WIDTH / 2,      y: 1000,             label: 'Norte'  },
  { x: MAP_WIDTH / 2,      y: MAP_HEIGHT - 1000, label: 'Sul'    },
  { x: MAP_WIDTH - 1000,   y: MAP_HEIGHT / 2,    label: 'Leste'  },
  { x: 1000,               y: MAP_HEIGHT / 2,    label: 'Oeste'  },
  { x: MAP_WIDTH / 2,      y: MAP_HEIGHT / 2,    label: 'Centro' },
  { x: MAP_WIDTH / 4,      y: MAP_HEIGHT / 4,    label: 'NO'     },
  { x: MAP_WIDTH * 3 / 4,  y: MAP_HEIGHT / 4,    label: 'NE'     },
  { x: MAP_WIDTH / 4,      y: MAP_HEIGHT * 3 / 4, label: 'SO'    },
  { x: MAP_WIDTH * 3 / 4,  y: MAP_HEIGHT * 3 / 4, label: 'SE'    },
];

// ══════════════════════════════════════════════════════════════
// GENERATE MAP — ponto de entrada
// ══════════════════════════════════════════════════════════════
export function generateMap(roomId: string): {
  heightmap:       Heightmap;
  biomeMap:        BiomeMap;
  resources:       Map<string, ResourceNode>;
  extractionZones: ExtractionZone[];
  faunaCandidates: Vec2[];
} {
  const seed      = hashStr(roomId);
  const heightmap = buildHeightmap(seed);
  const tempMap   = buildTemperatureMap(seed ^ 0xA1B2C3D4);
  const moistMap  = buildMoistureMap(seed ^ 0xE5F6A7B8);
  const biomeMap  = buildBiomeMap(heightmap, tempMap, moistMap);
  const rand      = makePrng(seed ^ 0xDEADBEEF);

  // ── Recursos via Poisson Disc ────────────────────────────────
  const resources = new Map<string, ResourceNode>();
  let nodeIdx = 0;
  for (const cfg of RESOURCE_CONFIG) {
    const valid = RESOURCE_BIOMES[cfg.type];
    const pts = poissonDisc(
      160, cfg.count * 2,
      (x, y) => valid.includes(getBiomeAt(biomeMap, x, y)),
      rand,
    );
    for (let i = 0; i < Math.min(cfg.count, pts.length); i++) {
      const id  = `res_${nodeIdx++}`;
      const qty = Math.floor(cfg.minQty + rand() * (cfg.maxQty - cfg.minQty));
      resources.set(id, { id, type: cfg.type, position: pts[i], quantity: qty, maxQty: qty, respawnAt: null });
    }
  }

  // ── Zonas de extração ─────────────────────────────────────────
  const extractionZones: ExtractionZone[] = EZ_POSITIONS.map((ez, i) => {
    let pos: Vec2 = { x: ez.x, y: ez.y };
    if (!isLand(heightmap, pos.x, pos.y)) {
      const landPts = poissonDisc(200, 1,
        (x, y) => isLand(heightmap, x, y) && Math.hypot(x - ez.x, y - ez.y) < 2000,
        rand,
      );
      if (landPts.length > 0) pos = landPts[0];
    }
    return { id: `ez_${i}`, position: pos, radius: 150, label: ez.label };
  });

  // ── Candidatos de fauna ───────────────────────────────────────
  const faunaCandidates = poissonDisc(220, 800, (x, y) => isLand(heightmap, x, y), rand);

  return { heightmap, biomeMap, resources, extractionZones, faunaCandidates };
}

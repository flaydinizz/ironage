// ============================================================
// PHYSICS — Movimento com colisão de terreno (7.3)
//
// Regras por altura:
//   -3  água profunda   → BLOQUEADO (posição revertida)
//   -2  água navegável  → velocidade ×0.40
//   -1  água rasa       → velocidade ×0.55
//    0  praia           → velocidade ×0.90
//    1  campina         → velocidade ×1.00 (base)
//    2  vale/floresta   → velocidade ×0.95
//    3  montanha        → velocidade ×0.55
// ============================================================

import type { Vec2, MoveInput, SessionPlayer } from './world.state';
import { MAP_WIDTH, MAP_HEIGHT, getHeight }     from './map.generator';
import type { Heightmap }                       from './map.generator';

export const PLAYER_SPEED      = 140;  // unidades/segundo (base, terreno h=1) — reduzido 7.4
export const MAX_DT_MS         = 100;
export const COLLECT_RANGE     = 80;
export const EXTRACTION_RADIUS = 150;

// Multiplicadores de velocidade por altura de terreno
const TERRAIN_SPEED_MULT: Record<number, number> = {
  [-3]: 0.00,   // bloqueado
  [-2]: 0.40,
  [-1]: 0.55,
   [0]: 0.90,
   [1]: 1.00,
   [2]: 0.95,
   [3]: 0.55,
};

// Retorna o multiplicador de velocidade para uma posição no mundo
export function terrainSpeedMult(heightmap: Heightmap, wx: number, wy: number): number {
  const h = getHeight(heightmap, wx, wy);
  return TERRAIN_SPEED_MULT[h] ?? 1.0;
}

// Aplica movimento com colisão de terreno
// Retorna { position, speedMult } — speedMult enviado ao cliente para
// que ele espelhe a desaceleração na predição local
export function applyMovement(
  player:    SessionPlayer,
  input:     MoveInput,
  heightmap: Heightmap,
): { position: Vec2; speedMult: number } {
  const dt  = Math.min(input.dt, MAX_DT_MS) / 1000;
  const len = Math.hypot(input.dx, input.dy);
  const ndx = len > 0 ? input.dx / len : 0;
  const ndy = len > 0 ? input.dy / len : 0;

  // Multiplica velocidade pelo terreno da posição ATUAL
  const mult = terrainSpeedMult(heightmap, player.position.x, player.position.y);

  // Se mult = 0 (água profunda), bloqueia totalmente
  if (mult === 0) {
    return { position: { ...player.position }, speedMult: 0 };
  }

  const candidateX = clamp(player.position.x + ndx * PLAYER_SPEED * mult * dt, 0, MAP_WIDTH);
  const candidateY = clamp(player.position.y + ndy * PLAYER_SPEED * mult * dt, 0, MAP_HEIGHT);

  // Verifica o terreno do DESTINO — impede entrar em água profunda
  const destMult = terrainSpeedMult(heightmap, candidateX, candidateY);
  if (destMult === 0) {
    // Tenta deslizar em X ou Y separadamente
    const slideX = clamp(player.position.x + ndx * PLAYER_SPEED * mult * dt, 0, MAP_WIDTH);
    const slideXMult = terrainSpeedMult(heightmap, slideX, player.position.y);
    if (slideXMult > 0) {
      return { position: { x: slideX, y: player.position.y }, speedMult: mult };
    }
    const slideY = clamp(player.position.y + ndy * PLAYER_SPEED * mult * dt, 0, MAP_HEIGHT);
    const slideYMult = terrainSpeedMult(heightmap, player.position.x, slideY);
    if (slideYMult > 0) {
      return { position: { x: player.position.x, y: slideY }, speedMult: mult };
    }
    // Completamente bloqueado
    return { position: { ...player.position }, speedMult: 0 };
  }

  return { position: { x: candidateX, y: candidateY }, speedMult: mult };
}

export function inRange(a: Vec2, b: Vec2, range: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= range;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

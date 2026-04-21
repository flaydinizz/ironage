// ============================================================
// DEATH HANDLER — Lógica centralizada de morte e respawn
//
// Chamado por:
//   - tick.loop   (morte por desidratação)
//   - combat.handler (morte por fauna ou PvP)
//
// Garante que o wipe de inventário e o respawn acontecem
// em um único lugar, sem duplicação de lógica.
// ============================================================

import type { Server as SocketIO } from 'socket.io';
import type { RoomState, SessionPlayer } from '../game/world.state';
import { resetVitals } from '../services/VitalsService';

const RESPAWN_DELAY_MS = 3_000; // 3s de tela de morte antes de respawnar

// Guarda socketIds que estão em processo de respawn para evitar duplo-trigger
const respawning = new Set<string>();

export function handlePlayerDeath(
  io: SocketIO,
  room: RoomState,
  player: SessionPlayer,
  killerName?: string,
): void {
  if (respawning.has(player.socketId)) return;
  respawning.add(player.socketId);

  // ── Wipe do inventário de sessão ─────────────────────────
  const lostItems  = [...player.inventory];
  player.inventory            = [];
  player.inventoryWeightUsed  = 0;
  player.isExtracting         = false;

  const message = killerName
    ? `Você foi eliminado por ${killerName}. Inventário perdido.`
    : 'Você morreu. Todo o inventário de sessão foi perdido.';

  // Notifica o player imediatamente (tela de morte no cliente)
  io.to(player.socketId).emit('player:died', {
    message,
    lostItems,
    respawnDelayMs: RESPAWN_DELAY_MS,
  });

  // Notifica os outros players da sala
  io.to(room.roomId).except(player.socketId).emit('player:other_died', {
    socketId: player.socketId,
    username: player.username,
  });

  console.log(`[Death] ${player.username} morreu | ${lostItems.length} slots perdidos | killer: ${killerName ?? 'ambiente'}`);

  // ── Respawn após delay ────────────────────────────────────
  setTimeout(() => {
    // Verifica se o player ainda está na sala (pode ter desconectado)
    if (!room.players.has(player.socketId)) {
      respawning.delete(player.socketId);
      return;
    }

    resetVitals(player);
    player.position = randomSpawn(room);

    io.to(player.socketId).emit('player:respawned', {
      position: player.position,
      hp:       player.hp,
      thirst:   player.thirst,
    });

    respawning.delete(player.socketId);
  }, RESPAWN_DELAY_MS);
}

// ── Spawn em posição sem colisão com outros players ───────────
function randomSpawn(room: RoomState): { x: number; y: number } {
  const occupied = Array.from(room.players.values()).map(p => p.position);
  let pos = { x: 0, y: 0 };
  let attempts = 0;

  do {
    pos = {
      x: 200 + Math.random() * 1600,
      y: 200 + Math.random() * 1600,
    };
    attempts++;
  } while (
    attempts < 15 &&
    occupied.some(o => Math.hypot(o.x - pos.x, o.y - pos.y) < 300)
  );

  return pos;
}

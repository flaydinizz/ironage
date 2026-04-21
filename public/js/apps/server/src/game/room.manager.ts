// ============================================================
// ROOM MANAGER — v3 (biomeMap + Poisson Disc fauna)
// ============================================================

import type { Server as SocketIO } from 'socket.io';
import type { RoomState, SessionPlayer, Vec2 } from './world.state';
import {
  generateMap,
  getSafeSpawnPoint,
  MAP_WIDTH, MAP_HEIGHT,
} from './map.generator';
import { startTickLoop, stopTickLoop } from './tick.loop';
import { spawnFauna }                  from './fauna';

const MAX_PLAYERS_PER_ROOM = 20;

const rooms        = new Map<string, RoomState>();
const socketToRoom = new Map<string, string>();

// ── Criar sala ────────────────────────────────────────────────
export function createRoom(io: SocketIO): RoomState {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { heightmap, biomeMap, resources, extractionZones, faunaCandidates } = generateMap(roomId);

  const room: RoomState = {
    roomId,
    players:         new Map(),
    resources,
    fauna:           spawnFauna(roomId, heightmap, biomeMap, faunaCandidates),
    extractionZones,
    heightmap,
    biomeMap,
    tick:            0,
    createdAt:       Date.now(),
  };

  rooms.set(roomId, room);
  startTickLoop(io, room);
  console.log(`[Room] Criada: ${roomId}`);
  return room;
}

// ── Encontrar sala disponível ou criar nova ───────────────────
export function findOrCreateRoom(io: SocketIO): RoomState {
  for (const room of rooms.values()) {
    if (room.players.size < MAX_PLAYERS_PER_ROOM) return room;
  }
  return createRoom(io);
}

// ── Player entra na sala ──────────────────────────────────────
export function joinRoom(
  io:   SocketIO,
  room: RoomState,
  data: { playerId: string; username: string; socketId: string },
): SessionPlayer {
  const occupied  = Array.from(room.players.values()).map(p => p.position);
  const spawnPos  = getSafeSpawnPoint(room.heightmap, occupied);

  const player: SessionPlayer = {
    playerId:             data.playerId,
    username:             data.username,
    socketId:             data.socketId,
    position:             spawnPos,
    velocity:             { x: 0, y: 0 },
    hp:                   100,
    maxHp:                100,
    thirst:               100,
    inventory:            [],
    inventoryWeightUsed:  0,
    inventoryWeightLimit: 30,
    isExtracting:         false,
    activeEffects:        [],
    lastProcessedInput:   0,
    joinedAt:             Date.now(),
  };

  room.players.set(data.socketId, player);
  socketToRoom.set(data.socketId, room.roomId);
  io.sockets.sockets.get(data.socketId)?.join(room.roomId);

  console.log(`[Room] ${data.username} entrou em ${room.roomId} (${room.players.size}/${MAX_PLAYERS_PER_ROOM})`);
  return player;
}

// ── Player sai da sala ────────────────────────────────────────
export function leaveRoom(socketId: string): void {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.get(socketId);
  if (player) console.log(`[Room] ${player.username} saiu de ${roomId}`);
  room.players.delete(socketId);
  socketToRoom.delete(socketId);
  if (room.players.size === 0) destroyRoom(room);
}

// ── Lookups ───────────────────────────────────────────────────
export function getRoomBySocket(socketId: string): RoomState | undefined {
  const roomId = socketToRoom.get(socketId);
  return roomId ? rooms.get(roomId) : undefined;
}

export function getPlayerBySocket(socketId: string): SessionPlayer | undefined {
  return getRoomBySocket(socketId)?.players.get(socketId);
}

// ── Destruir sala ─────────────────────────────────────────────
function destroyRoom(room: RoomState): void {
  stopTickLoop(room.roomId);
  rooms.delete(room.roomId);
  console.log(`[Room] Destruída: ${room.roomId}`);
}

// ── Stats ─────────────────────────────────────────────────────
export function getRoomStats() {
  return {
    totalRooms:   rooms.size,
    totalPlayers: Array.from(rooms.values()).reduce((s, r) => s + r.players.size, 0),
    rooms: Array.from(rooms.values()).map(r => ({
      id: r.roomId, players: r.players.size, tick: r.tick,
    })),
  };
}

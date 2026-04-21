// ============================================================
// SERVER — Entry Point
// ============================================================

import Fastify                from 'fastify';
import cors                   from '@fastify/cors';
import { Server as SocketIO } from 'socket.io';

// ── Rotas HTTP ────────────────────────────────────────────────
import { authRoutes }     from './auth/auth.routes';
import { stashRoutes }    from './auth/stash.routes';
import { craftingRoutes } from './crafting/crafting.routes';
import { traderRoutes }   from './trader/trader.routes';

// ── Socket Auth ───────────────────────────────────────────────
import { socketAuthGuard } from './auth/socket.guard';
import { AuthService }     from './auth/auth.service';

// ── DB ────────────────────────────────────────────────────────
import { isDatabaseHealthy } from './db';

// ── Game ──────────────────────────────────────────────────────
import {
  getRoomStats,
  findOrCreateRoom,
  joinRoom,
  leaveRoom,
}                                    from './game/room.manager';
import {
  heightmapToBase64,
  biomemapToBase64,
  GRID_W, GRID_H, CELL_SIZE,
  CHUNK_CELLS, CHUNKS_W, CHUNKS_H,
} from './game/map.generator';
import { registerMovementHandler }   from './handlers/movement.handler';
import { registerLootHandler }       from './handlers/loot.handler';
import { registerExtractionHandler } from './handlers/extraction.handler';
import { registerCombatHandler }     from './handlers/combat.handler';
import { registerConsumableHandler } from './handlers/consumable.handler';
import { loadSkills, unloadSkills }  from './services/SkillEngine';
import { initEconomy }               from './services/EconomyService';

// ══════════════════════════════════════════════════════════════
// FASTIFY
// ══════════════════════════════════════════════════════════════

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';

// CORS — deve ser registrado ANTES das rotas
await fastify.register(cors, {
  origin:         CLIENT_ORIGIN,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
});

// ── Rotas ─────────────────────────────────────────────────────
fastify.register(authRoutes,     { prefix: '/auth'     });
fastify.register(stashRoutes,    { prefix: '/stash'    });
fastify.register(craftingRoutes, { prefix: '/crafting' });
fastify.register(traderRoutes,   { prefix: '/trader'   });

fastify.get('/health', async () => ({
  status: 'ok',
  db:     isDatabaseHealthy() ? 'healthy' : 'unhealthy',
  uptime: Math.round(process.uptime()),
  rooms:  getRoomStats(),
}));

// ══════════════════════════════════════════════════════════════
// SOCKET.IO — usa fastify.server diretamente (sem createServer)
// ══════════════════════════════════════════════════════════════

// Aguarda Fastify inicializar todos os plugins e rotas
await fastify.ready();

const io = new SocketIO(fastify.server, {
  cors: {
    origin:  CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
  pingInterval:     10_000,
  pingTimeout:       5_000,
  maxHttpBufferSize: 4 * 1024 * 1024,  // 4MB — necessário para heightmap+biomeMap base64
});

io.use(socketAuthGuard);

io.on('connection', (socket) => {
  const { player, sessionStart } = socket.data;
  console.log(`[Socket] ✅ ${player.username} conectado (${socket.id})`);

  // Carrega skills do banco → RAM e emite ao cliente
  loadSkills(player.id)
    .then(skills => socket.emit('skill:update', { skills }))
    .catch(err => console.error(`[SkillEngine] Falha ao carregar skills de ${player.username}:`, err));

  const room          = findOrCreateRoom(io);
  const sessionPlayer = joinRoom(io, room, {
    playerId: player.id,
    username: player.username,
    socketId: socket.id,
  });

  socket.emit('game:joined', {
    roomId:          room.roomId,
    playerId:        player.id,
    spawnPosition:   sessionPlayer.position,
    mapWidth:        12000,
    mapHeight:       12000,
    gridW:           GRID_W,
    gridH:           GRID_H,
    cellSize:        CELL_SIZE,
    chunkCells:      CHUNK_CELLS,
    chunksW:         CHUNKS_W,
    chunksH:         CHUNKS_H,
    heightmap:       heightmapToBase64(room.heightmap),
    biomeMap:        biomemapToBase64(room.biomeMap),
    extractionZones: room.extractionZones,
    resources: Array.from(room.resources.values()).map(r => ({
      id:        r.id,
      type:      r.type,
      position:  r.position,
      available: r.respawnAt === null && r.quantity > 0,
    })),
  });

  registerMovementHandler(socket);
  registerLootHandler(socket);
  registerExtractionHandler(socket);
  registerCombatHandler(socket, io);
  registerConsumableHandler(socket);

  socket.on('disconnect', (reason) => {
    const sessionSeconds = Math.floor((Date.now() - sessionStart) / 1000);
    console.log(`[Socket] ❌ ${player.username} desconectou (${reason}) | ${sessionSeconds}s`);
    leaveRoom(socket.id);
    unloadSkills(player.id);
    AuthService.logout(player.id, sessionSeconds);
  });
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

await fastify.listen({ port: PORT, host: HOST });
await initEconomy();

console.log(`🚀 Iron Age server rodando em http://${HOST}:${PORT}`);
console.log(`   CORS liberado para: ${CLIENT_ORIGIN}`);
console.log(`   Ambiente: ${process.env.NODE_ENV ?? 'development'}`);

export { io };

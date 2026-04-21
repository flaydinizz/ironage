// ============================================================
// SERVER — Entry Point
// Monta Fastify (HTTP/REST) + Socket.io (WebSocket) no mesmo
// servidor Node.js para compartilhar porta e certificado TLS.
// ============================================================

import Fastify                from 'fastify';
import { createServer }       from 'http';
import { Server as SocketIO } from 'socket.io';
import { authRoutes }         from './auth/auth.routes';
import { stashRoutes }        from './stash/stash.routes';
import { craftingRoutes }     from './crafting/crafting.routes';
import { traderRoutes }       from './trader/trader.routes';
import { socketAuthGuard }    from './auth/socket.guard';
import { AuthService }        from './auth/auth.service';
import { isDatabaseHealthy }  from './db';
import { getRoomStats, findOrCreateRoom, joinRoom, leaveRoom } from './game/room.manager';
import { registerMovementHandler }   from './handlers/movement.handler';
import { registerLootHandler }       from './handlers/loot.handler';
import { registerExtractionHandler } from './handlers/extraction.handler';
import { registerCombatHandler }     from './handlers/combat.handler';
import { loadSkills, unloadSkills }  from './services/SkillEngine';
import { initEconomy }               from './services/EconomyService';

// ── HTTP Server ──────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// Compartilha o server Node nativo entre Fastify e Socket.io
const httpServer = createServer(fastify.server);

// ── Socket.io ────────────────────────────────────────────────
const io = new SocketIO(httpServer, {
  cors: {
    origin:  process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  // Configurações de performance para game server
  pingInterval:        10_000, // 10s entre pings
  pingTimeout:         5_000,  // desconecta após 5s sem pong
  maxHttpBufferSize:   1e5,    // 100KB max por mensagem
});

// ── Auth guard no handshake do Socket.io ────────────────────
io.use(socketAuthGuard);

// ── Socket handlers ──────────────────────────────────────────
io.on('connection', (socket) => {
  const { player, sessionStart } = socket.data;
  console.log(`[Socket] ${player.username} conectado (${socket.id})`);

  // Carrega skills do banco para RAM (sem bloquear — Promise)
  loadSkills(player.id).catch(err =>
    console.error(`[SkillEngine] Falha ao carregar skills de ${player.username}:`, err)
  );

  const room = findOrCreateRoom(io);
  const sessionPlayer = joinRoom(io, room, {
    playerId: player.id,
    username: player.username,
    socketId: socket.id,
  });

  // Estado inicial para o cliente
  socket.emit('game:joined', {
    roomId:          room.roomId,
    playerId:        player.id,
    spawnPosition:   sessionPlayer.position,
    mapWidth:        2000,
    mapHeight:       2000,
    extractionZones: room.extractionZones,
    resources: Array.from(room.resources.values()).map(r => ({
      id:        r.id,
      type:      r.type,
      position:  r.position,
      available: r.respawnAt === null && r.quantity > 0,
    })),
  });

  // Registra handlers de gameplay
  registerMovementHandler(socket);
  registerLootHandler(socket);
  registerExtractionHandler(socket);
  registerCombatHandler(socket, io);

  socket.on('disconnect', (reason) => {
    const sessionSeconds = Math.floor((Date.now() - sessionStart) / 1000);
    console.log(`[Socket] ${player.username} desconectou (${reason}) | ${sessionSeconds}s`);
    leaveRoom(socket.id);
    unloadSkills(player.id);   // flush dirty XP → banco, remove da RAM
    AuthService.logout(player.id, sessionSeconds);
  });
});

// ── Fastify routes ───────────────────────────────────────────
fastify.register(authRoutes,     { prefix: '/auth' });
fastify.register(stashRoutes,    { prefix: '/stash' });
fastify.register(craftingRoutes, { prefix: '/crafting' });
fastify.register(traderRoutes,   { prefix: '/trader' });

fastify.get('/health', async () => ({
  status: 'ok',
  db:     isDatabaseHealthy() ? 'healthy' : 'unhealthy',
  uptime: process.uptime(),
  rooms:  getRoomStats(),
}));

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

httpServer.listen(PORT, HOST, async () => {
  await initEconomy();
  console.log(`🚀 Game server rodando em http://${HOST}:${PORT}`);
});

export { io };

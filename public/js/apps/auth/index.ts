// ============================================================
// SERVER — Entry Point
// Monta Fastify (HTTP/REST) + Socket.io (WebSocket) no mesmo
// servidor Node.js para compartilhar porta e certificado TLS.
// ============================================================

import Fastify                from 'fastify';
import { createServer }       from 'http';
import { Server as SocketIO } from 'socket.io';
import { authRoutes }         from './auth/auth.routes';
import { socketAuthGuard }    from './auth/socket.guard';
import { AuthService }        from './auth/auth.service';
import { isDatabaseHealthy }  from './db';

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
  socket.log?.info?.(`[Socket] ${player.username} conectado (${socket.id})`);
  console.log(`[Socket] ${player.username} conectado | id=${socket.id}`);

  // Confirma conexão ao cliente com estado inicial
  socket.emit('connected', {
    message:  `Bem-vindo, ${player.username}!`,
    playerId: player.id,
    socketId: socket.id,
  });

  // ── Disconnect: cleanup de sessão ──────────────────────────
  socket.on('disconnect', (reason) => {
    const sessionSeconds = Math.floor((Date.now() - sessionStart) / 1000);
    console.log(`[Socket] ${player.username} desconectou (${reason}) | ${sessionSeconds}s de sessão`);

    // Encerra sessão e acumula playtime no banco
    AuthService.logout(player.id, sessionSeconds);
  });

  // Os event handlers das Fases 2–4 (movimento, loot, combate)
  // serão registrados aqui conforme o desenvolvimento avança.
  // Ex: socket.on('player:move', handlers.move)
});

// ── Fastify routes ───────────────────────────────────────────
fastify.register(authRoutes, { prefix: '/auth' });

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  db:     isDatabaseHealthy() ? 'healthy' : 'unhealthy',
  uptime: process.uptime(),
}));

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Game server rodando em http://${HOST}:${PORT}`);
});

export { io };

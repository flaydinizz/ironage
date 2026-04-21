// ============================================================
// AUTH — Socket.io Guard
//
// Middleware que valida o JWT no handshake do Socket.io.
// O cliente envia o token no campo auth do connect:
//
//   const socket = io('http://localhost:3001', {
//     auth: { token: 'Bearer eyJ...' }
//   });
//
// Após autenticação bem-sucedida, o player fica disponível
// em socket.data.player para todos os event handlers.
// ============================================================

import type { Socket }    from 'socket.io';
import { extractBearerToken, verifyToken } from './jwt';
import { PlayerRepository }               from '../db/repositories/PlayerRepository';
import type { PlayerProfile }             from '@survival/shared/types';

// Extende socket.data com tipagem forte
declare module 'socket.io' {
  interface SocketData {
    player: {
      id:       string;
      username: string;
      level:    number;
    };
    sessionStart: number; // Date.now() do momento da conexão
  }
}

export async function socketAuthGuard(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const raw   = socket.handshake.auth?.token as string | undefined;
  const token = extractBearerToken(raw);

  if (!token) {
    return next(new Error('AUTH_MISSING_TOKEN'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new Error('AUTH_INVALID_TOKEN'));
  }

  // Valida existência do player e sessão ativa no banco
  const player = await PlayerRepository.findById(payload.sub);

  if (!player) {
    return next(new Error('AUTH_USER_NOT_FOUND'));
  }

  if (!player.activeSessionId) {
    // Player foi deslogado por outro processo (ex: force logout admin)
    return next(new Error('AUTH_SESSION_INVALIDATED'));
  }

  // Injeta no socket para os handlers de evento
  socket.data.player       = { id: player.id, username: player.username, level: player.level };
  socket.data.sessionStart = Date.now();

  next();
}

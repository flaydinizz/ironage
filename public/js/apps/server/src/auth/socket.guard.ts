// ============================================================
// AUTH — Socket.io Guard
//
// Valida o JWT no handshake.
// Cliente conecta com: io(url, { auth: { token: 'Bearer eyJ...' } })
// ============================================================

import type { Socket }                        from 'socket.io';
import { extractBearerToken, verifyToken }    from './jwt';
import { PlayerRepository }                   from '../db/repositories/PlayerRepository';

declare module 'socket.io' {
  interface SocketData {
    player:       { id: string; username: string; level: number };
    sessionStart: number;
  }
}

export async function socketAuthGuard(
  socket: Socket,
  next:   (err?: Error) => void,
): Promise<void> {
  const token = extractBearerToken(socket.handshake.auth?.token as string | undefined);
  if (!token) return next(new Error('AUTH_MISSING_TOKEN'));

  let payload;
  try { payload = verifyToken(token); }
  catch { return next(new Error('AUTH_INVALID_TOKEN')); }

  const player = await PlayerRepository.findById(payload.sub);
  if (!player)               return next(new Error('AUTH_USER_NOT_FOUND'));
  if (!player.activeSessionId) return next(new Error('AUTH_SESSION_INVALIDATED'));

  socket.data.player       = { id: player.id, username: player.username, level: player.level };
  socket.data.sessionStart = Date.now();
  next();
}

// ============================================================
// AUTH — Middleware Fastify
// ============================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractBearerToken, verifyToken }   from './jwt';
import { PlayerRepository }                  from '../db/repositories/PlayerRepository';
import type { JWTPayload }                   from './auth.dto';

declare module 'fastify' {
  interface FastifyRequest {
    player?: { id: string; username: string; sessionId: string | null };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    return reply.code(401).send({ error: 'Token não fornecido', code: 'MISSING_TOKEN' });
  }

  let payload: JWTPayload;
  try {
    payload = verifyToken(token);
  } catch (err: any) {
    const code = err.message === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return reply.code(401).send({ error: 'Token inválido ou expirado', code });
  }

  const player = await PlayerRepository.findById(payload.sub);
  if (!player) {
    return reply.code(401).send({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
  }

  request.player = { id: player.id, username: player.username, sessionId: player.activeSessionId };
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply:  FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return;
  try {
    const payload = verifyToken(token);
    const player  = await PlayerRepository.findById(payload.sub);
    if (player) {
      request.player = { id: player.id, username: player.username, sessionId: player.activeSessionId };
    }
  } catch { /* rota pública — silencioso */ }
}

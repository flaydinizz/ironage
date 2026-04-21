// ============================================================
// AUTH — Middleware Fastify
//
// Dois hooks reutilizáveis:
//   - authenticate: valida JWT e injeta player no request
//   - optionalAuth:  idem, mas não rejeita se não houver token
//
// Uso nos plugins de rota:
//   fastify.get('/profile', { preHandler: authenticate }, handler)
// ============================================================

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { extractBearerToken, verifyToken } from './jwt';
import { PlayerRepository }               from '../db/repositories/PlayerRepository';
import type { JWTPayload }                from './auth.dto';

// Estende os tipos do Fastify para incluir o player autenticado
declare module 'fastify' {
  interface FastifyRequest {
    player?: {
      id:        string;
      username:  string;
      sessionId: string | null;
    };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
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

  // Valida se o player ainda existe no banco (segurança extra: conta deletada)
  const player = await PlayerRepository.findById(payload.sub);
  if (!player) {
    return reply.code(401).send({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
  }

  // Injeta no request para os handlers downstream
  request.player = {
    id:        player.id,
    username:  player.username,
    sessionId: player.activeSessionId,
  };
}

// Versão que não bloqueia rotas públicas
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return;

  try {
    const payload = verifyToken(token);
    const player  = await PlayerRepository.findById(payload.sub);
    if (player) {
      request.player = {
        id:        player.id,
        username:  player.username,
        sessionId: player.activeSessionId,
      };
    }
  } catch {
    // Silencioso — rota pública não precisa de auth
  }
}

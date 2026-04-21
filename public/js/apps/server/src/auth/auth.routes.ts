// ============================================================
// AUTH — Routes Plugin (Fastify)
//
// POST /auth/register
// POST /auth/login
// POST /auth/logout
// GET  /auth/me
// ============================================================

import type { FastifyPluginAsync } from 'fastify';
import { AuthService }             from './auth.service';
import { authenticate }            from './auth.middleware';
import { RegisterDTO, LoginDTO }   from './auth.dto';
import { PlayerRepository }        from '../db/repositories/PlayerRepository';

export const authRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post('/register', async (request, reply) => {
    const parsed = RegisterDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', issues: parsed.error.flatten().fieldErrors });
    }
    try {
      return reply.code(201).send(await AuthService.register(parsed.data));
    } catch (err: any) {
      if (err.code === 'USERNAME_TAKEN') return reply.code(409).send({ error: err.message, code: err.code });
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro interno' });
    }
  });

  fastify.post('/login', async (request, reply) => {
    const parsed = LoginDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', issues: parsed.error.flatten().fieldErrors });
    }
    try {
      return reply.code(200).send(await AuthService.login(parsed.data));
    } catch (err: any) {
      if (err.code === 'INVALID_CREDENTIALS')   return reply.code(401).send({ error: err.message, code: err.code });
      if (err.code === 'SESSION_ALREADY_ACTIVE') return reply.code(409).send({ error: err.message, code: err.code });
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro interno' });
    }
  });

  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const { sessionSeconds = 0 } = (request.body as any) ?? {};
    AuthService.logout(request.player!.id, Number(sessionSeconds));
    return reply.code(200).send({ message: 'Logout realizado com sucesso' });
  });

  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const player = await PlayerRepository.findById(request.player!.id);
    if (!player) return reply.code(404).send({ error: 'Player não encontrado' });
    const { passwordHash, activeSessionId, ...safe } = player as any;
    return reply.code(200).send({
      ...safe,
      skills: player.skills?.skillsData ?? null,
      stash: {
        items:       player.stash?.items       ?? [],
        weightLimit: player.stash?.weightLimit  ?? 500,
        version:     player.stash?.version      ?? 1,
      },
    });
  });
};

// ============================================================
// AUTH — Routes Plugin (Fastify)
//
// POST /auth/register  — cadastro de novo player
// POST /auth/login     — autenticação e emissão de JWT
// POST /auth/logout    — encerramento de sessão
// GET  /auth/me        — perfil do player autenticado
// ============================================================

import type { FastifyPluginAsync } from 'fastify';
import { AuthService }             from './auth.service';
import { authenticate }            from './auth.middleware';
import { RegisterDTO, LoginDTO }   from './auth.dto';
import { PlayerRepository }        from '../db/repositories/PlayerRepository';

export const authRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /auth/register ──────────────────────────────────
  fastify.post('/register', async (request, reply) => {
    const parsed = RegisterDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Dados inválidos',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await AuthService.register(parsed.data);
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err.code === 'USERNAME_TAKEN') {
        return reply.code(409).send({ error: err.message, code: err.code });
      }
      request.log.error(err, 'Erro no registro');
      return reply.code(500).send({ error: 'Erro interno no servidor' });
    }
  });

  // ── POST /auth/login ─────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const parsed = LoginDTO.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:  'Dados inválidos',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await AuthService.login(parsed.data);
      return reply.code(200).send(result);
    } catch (err: any) {
      if (err.code === 'INVALID_CREDENTIALS') {
        return reply.code(401).send({ error: err.message, code: err.code });
      }
      if (err.code === 'SESSION_ALREADY_ACTIVE') {
        return reply.code(409).send({ error: err.message, code: err.code });
      }
      request.log.error(err, 'Erro no login');
      return reply.code(500).send({ error: 'Erro interno no servidor' });
    }
  });

  // ── POST /auth/logout ────────────────────────────────────
  // Requer token válido — o servidor é quem invalida a sessão
  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.player!;

    // O cliente deve enviar o tempo de sessão para acumular playtime
    const { sessionSeconds = 0 } = (request.body as any) ?? {};

    AuthService.logout(id, Number(sessionSeconds));
    return reply.code(200).send({ message: 'Logout realizado com sucesso' });
  });

  // ── GET /auth/me ─────────────────────────────────────────
  // Retorna perfil completo do player autenticado (sem senha)
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const player = await PlayerRepository.findById(request.player!.id);

    if (!player) {
      return reply.code(404).send({ error: 'Player não encontrado' });
    }

    // Remove campos sensíveis antes de responder
    const { passwordHash, activeSessionId, ...safePlayer } = player as any;

    return reply.code(200).send({
      ...safePlayer,
      skills: player.skills?.skillsData ?? null,
      stash:  {
        items:       player.stash?.items       ?? [],
        weightLimit: player.stash?.weightLimit  ?? 500,
        version:     player.stash?.version      ?? 1,
      },
    });
  });
};

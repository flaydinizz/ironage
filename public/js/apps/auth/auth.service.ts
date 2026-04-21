// ============================================================
// AUTH — AuthService
//
// Regras de negócio de autenticação, isoladas dos transportes
// (HTTP ou Socket.io). Pode ser chamado por ambos sem duplicar lógica.
//
// Fluxo de login:
//   1. Busca player pelo username
//   2. Compara senha com bcrypt
//   3. Verifica se já há sessão ativa (previne login duplo)
//   4. Persiste activeSessionId no banco
//   5. Retorna JWT + dados públicos do player
// ============================================================

import bcrypt from 'bcryptjs';
import { PlayerRepository } from '../db/repositories/PlayerRepository';
import { signToken }        from './jwt';
import type { RegisterInput, LoginInput, AuthResponse } from './auth.dto';

const BCRYPT_ROUNDS = 12; // custo alto o suficiente sem ser lento demais no login

export class AuthService {

  // ----------------------------------------------------------
  // REGISTER — Cria novo player
  // ----------------------------------------------------------
  static async register(input: RegisterInput): Promise<AuthResponse> {
    // 1. Verifica duplicidade de username
    const existing = await PlayerRepository.findByUsername(input.username);
    if (existing) {
      throw Object.assign(new Error('Username já está em uso'), { code: 'USERNAME_TAKEN' });
    }

    // 2. Gera hash seguro da senha
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // 3. Persiste player + skills + stash numa transaction
    const player = await PlayerRepository.createPlayer({
      username:     input.username,
      passwordHash,
    });

    // 4. Gera session e JWT
    const sessionId = crypto.randomUUID();
    PlayerRepository.setActiveSession(player.id, sessionId);

    const token = signToken({ sub: player.id, username: player.username });

    return {
      token,
      player: {
        id:       player.id,
        username: player.username,
        level:    player.level,
      },
    };
  }

  // ----------------------------------------------------------
  // LOGIN — Autentica player existente
  // ----------------------------------------------------------
  static async login(input: LoginInput): Promise<AuthResponse> {
    // 1. Busca player (com timing constante para não vazar existência via timing attack)
    const player = await PlayerRepository.findByUsername(input.username);

    // Compara com hash falso se player não existe (evita timing attack)
    const hashToCompare = player?.passwordHash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
    const passwordMatch = await bcrypt.compare(input.password, hashToCompare);

    if (!player || !passwordMatch) {
      throw Object.assign(
        new Error('Usuário ou senha incorretos'),
        { code: 'INVALID_CREDENTIALS' }
      );
    }

    // 2. Bloqueia login duplo
    if (player.activeSessionId) {
      throw Object.assign(
        new Error('Já existe uma sessão ativa para este usuário'),
        { code: 'SESSION_ALREADY_ACTIVE' }
      );
    }

    // 3. Registra sessão ativa
    const sessionId = crypto.randomUUID();
    PlayerRepository.setActiveSession(player.id, sessionId);

    // 4. Emite JWT
    const token = signToken({ sub: player.id, username: player.username });

    return {
      token,
      player: {
        id:       player.id,
        username: player.username,
        level:    player.level,
      },
    };
  }

  // ----------------------------------------------------------
  // LOGOUT — Encerra sessão e persiste playtime
  // Chamado tanto pelo endpoint HTTP quanto pelo Socket 'disconnect'
  // ----------------------------------------------------------
  static logout(playerId: string, sessionSeconds: number): void {
    PlayerRepository.setActiveSession(playerId, null);
    if (sessionSeconds > 0) {
      PlayerRepository.addPlaytime(playerId, sessionSeconds);
    }
  }

  // ----------------------------------------------------------
  // FORCE LOGOUT — Admin/cleanup de sessões órfãs
  // Útil para recuperar sessões de crashes sem logout limpo
  // ----------------------------------------------------------
  static forceLogout(playerId: string): void {
    PlayerRepository.setActiveSession(playerId, null);
  }
}

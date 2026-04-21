// ============================================================
// AUTH — AuthService
// ============================================================

import bcrypt           from 'bcryptjs';
import { PlayerRepository } from '../db/repositories/PlayerRepository';
import { signToken }    from './jwt';
import type { RegisterInput, LoginInput, AuthResponse } from './auth.dto';

const BCRYPT_ROUNDS = 12;

export class AuthService {

  static async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await PlayerRepository.findByUsername(input.username);
    if (existing) {
      throw Object.assign(new Error('Username já está em uso'), { code: 'USERNAME_TAKEN' });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const player       = await PlayerRepository.createPlayer({ username: input.username, passwordHash });

    const sessionId = crypto.randomUUID();
    PlayerRepository.setActiveSession(player.id, sessionId);

    const token = signToken({ sub: player.id, username: player.username });
    return { token, player: { id: player.id, username: player.username, level: player.level } };
  }

  static async login(input: LoginInput): Promise<AuthResponse> {
    const player = await PlayerRepository.findByUsername(input.username);
    const hashToCompare = player?.passwordHash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
    const passwordMatch = await bcrypt.compare(input.password, hashToCompare);

    if (!player || !passwordMatch) {
      throw Object.assign(new Error('Usuário ou senha incorretos'), { code: 'INVALID_CREDENTIALS' });
    }
    if (player.activeSessionId) {
      // Limpa sessão órfã (server reiniciado sem logout) e permite novo login
      PlayerRepository.setActiveSession(player.id, null);
    }

    const sessionId = crypto.randomUUID();
    PlayerRepository.setActiveSession(player.id, sessionId);

    const token = signToken({ sub: player.id, username: player.username });
    return { token, player: { id: player.id, username: player.username, level: player.level } };
  }

  static logout(playerId: string, sessionSeconds: number): void {
    PlayerRepository.setActiveSession(playerId, null);
    if (sessionSeconds > 0) PlayerRepository.addPlaytime(playerId, sessionSeconds);
  }

  static forceLogout(playerId: string): void {
    PlayerRepository.setActiveSession(playerId, null);
  }
}

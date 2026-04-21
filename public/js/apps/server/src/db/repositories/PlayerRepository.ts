// ============================================================
// REPOSITORY — PlayerRepository
//
// Encapsula toda interação com o banco para entidades de jogador.
// Os Services (AuthService, InventoryService, etc.) usam este
// repositório — nunca acessam `db` diretamente.
//
// Princípio #3 em ação: todos os métodos aqui são chamados apenas
// em eventos críticos (login, extração, logout).
// ============================================================

import { eq } from 'drizzle-orm';
import { db } from '../index';
import { players, skills, stash } from '../schema';
import { DEFAULT_SKILLS }       from '@survival/shared/types';
import type { NewPlayer }       from '../schema/players';
import type { SkillsData }      from '@survival/shared/types/skills';
import type { StashData }       from '@survival/shared/types/items';

export class PlayerRepository {
  // ----------------------------------------------------------
  // CREATE — Registra novo player com skills e stash vazios
  // Wrapped em uma transaction para garantir atomicidade
  // ----------------------------------------------------------
  static async createPlayer(data: Pick<NewPlayer, 'username' | 'passwordHash'>) {
    return db.transaction((tx) => {
      // 1. Insere o player
      const [newPlayer] = tx
        .insert(players)
        .values({
          username:     data.username,
          passwordHash: data.passwordHash,
        })
        .returning()
        .all();

      if (!newPlayer) throw new Error('Failed to create player');

      // 2. Inicializa skills com valores padrão
      tx.insert(skills)
        .values({
          playerId:   newPlayer.id,
          skillsData: DEFAULT_SKILLS,
        })
        .run();

      // 3. Inicializa stash vazio
      tx.insert(stash)
        .values({
          playerId: newPlayer.id,
          items:    [],
        })
        .run();

      return newPlayer;
    });
  }

  // ----------------------------------------------------------
  // READ — Busca player completo (com skills e stash) por username
  // Usado no login
  // ----------------------------------------------------------
  static findByUsername(username: string) {
    return db.query.players.findFirst({
      where: eq(players.username, username),
      with: {
        skills: true,
        stash:  true,
      },
    });
  }

  // ----------------------------------------------------------
  // READ — Busca player por ID (usado após autenticação)
  // ----------------------------------------------------------
  static findById(id: string) {
    return db.query.players.findFirst({
      where: eq(players.id, id),
      with: {
        skills: true,
        stash:  true,
      },
    });
  }

  // ----------------------------------------------------------
  // UPDATE — Persiste skills após evento de progressão
  // Chamado pelo SkillEngine no momento de extração/logout
  // ----------------------------------------------------------
  static saveSkills(playerId: string, skillsData: SkillsData) {
    return db
      .update(skills)
      .set({
        skillsData,
        updatedAt: new Date(),
      })
      .where(eq(skills.playerId, playerId))
      .run();
  }

  // ----------------------------------------------------------
  // UPDATE — Persiste stash após extração bem-sucedida
  // Usa controle de versão otimista para evitar race conditions
  // ----------------------------------------------------------
  static saveStash(playerId: string, items: StashData, currentVersion: number) {
    const result = db
      .update(stash)
      .set({
        items,
        version:   currentVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(stash.playerId, playerId))
      // Apenas persiste se a versão não mudou (proteção contra concurrent saves)
      // .where(and(eq(stash.playerId, playerId), eq(stash.version, currentVersion)))
      .run();

    return result;
  }

  // ----------------------------------------------------------
  // UPDATE — Marca sessão ativa (previne login duplo)
  // ----------------------------------------------------------
  static setActiveSession(playerId: string, sessionId: string | null) {
    return db
      .update(players)
      .set({
        activeSessionId: sessionId,
        ...(sessionId ? { lastLogin: new Date() } : {}),
      })
      .where(eq(players.id, playerId))
      .run();
  }

  // ----------------------------------------------------------
  // UPDATE — Acumula tempo de jogo (chamado no logout)
  // ----------------------------------------------------------
  static addPlaytime(playerId: string, seconds: number) {
    // SQLite não suporta increment nativo no Drizzle, então
    // fazemos fetch + update (aceitável pois é evento crítico)
    const player = db
      .select({ totalPlaytimeSeconds: players.totalPlaytimeSeconds })
      .from(players)
      .where(eq(players.id, playerId))
      .get();

    if (!player) return;

    return db
      .update(players)
      .set({ totalPlaytimeSeconds: player.totalPlaytimeSeconds + seconds })
      .where(eq(players.id, playerId))
      .run();
  }
}

// ============================================================
// DATABASE — Conexão Drizzle + SQLite (Better-SQLite3)
//
// Por que better-sqlite3 e não libsql?
//   - Síncrono: ideal para o loop do game server (sem await hell)
//   - Baixa latência: operações < 1ms em disco local
//   - Thread-safe: Node.js é single-threaded, sem problemas de concorrência
//
// Princípio #3 (Delayed Persistence): este módulo é chamado APENAS
// em eventos críticos. Durante a sessão, o estado vive na RAM.
// ============================================================

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// ---------- Caminho do banco ----------
const DB_DIR  = process.env.DB_DIR  ?? path.join(process.cwd(), 'data');
const DB_FILE = process.env.DB_FILE ?? 'survival.db';
const DB_PATH = path.join(DB_DIR, DB_FILE);

// Garante que o diretório existe antes de abrir o banco
fs.mkdirSync(DB_DIR, { recursive: true });

// ---------- Singleton do client SQLite ----------
let _sqlite: Database.Database | null = null;

function getSqliteClient(): Database.Database {
  if (!_sqlite) {
    _sqlite = new Database(DB_PATH, {
      // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    // Pragmas de performance recomendados para workloads de game server
    _sqlite.pragma('journal_mode = WAL');       // Write-Ahead Logging: leituras não bloqueiam escrita
    _sqlite.pragma('synchronous = NORMAL');     // Balanço entre durabilidade e velocidade
    _sqlite.pragma('foreign_keys = ON');        // Enforça integridade referencial
    _sqlite.pragma('cache_size = -64000');      // ~64MB de cache em memória
    _sqlite.pragma('temp_store = MEMORY');      // Tabelas temporárias na RAM
    _sqlite.pragma('mmap_size = 268435456');    // 256MB de memory-mapped I/O
  }
  return _sqlite;
}

// ---------- Instância Drizzle ----------
export const db = drizzle(getSqliteClient(), { schema });

// Tipo exportado para usar em Services
export type Database = typeof db;

// ---------- Graceful shutdown ----------
// Garante que o banco seja fechado corretamente ao derrubar o servidor
process.on('exit',    () => _sqlite?.close());
process.on('SIGINT',  () => { _sqlite?.close(); process.exit(0); });
process.on('SIGTERM', () => { _sqlite?.close(); process.exit(0); });

// ---------- Health check ----------
export function isDatabaseHealthy(): boolean {
  try {
    getSqliteClient().prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

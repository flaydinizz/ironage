// ============================================================
// drizzle.config.ts — Configuração de migrations
// Run: npx drizzle-kit generate  (gera SQL de migration)
//      npx drizzle-kit migrate   (aplica no banco)
//      npx drizzle-kit studio    (UI visual do banco)
// ============================================================

import { defineConfig } from 'drizzle-kit';
import path from 'path';

export default defineConfig({
  dialect: 'sqlite',

  // Onde ficam os schemas
  schema: './src/db/schema/index.ts',

  // Onde as migrations serão geradas
  out: './src/db/migrations',

  dbCredentials: {
    url: path.join(process.cwd(), 'data', process.env.DB_FILE ?? 'survival.db'),
  },

  // Gera nomes de migration legíveis
  migrations: {
    prefix: 'timestamp',
  },

  verbose: true,
  strict: true,
});

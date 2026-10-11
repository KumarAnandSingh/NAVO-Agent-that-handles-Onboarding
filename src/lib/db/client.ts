import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: the root database or an open transaction. */
export type Queryable = Db | Tx;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** In-memory Postgres for tests: fresh, migrated, isolated. */
export async function createMemoryDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

async function createDb(): Promise<Db> {
  // Neon on Vercel sets DATABASE_URL; its Vercel Postgres template names it POSTGRES_URL.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    // Enough connections for a burst of visitors; Neon's pooled endpoint takes many more.
    const pool = new Pool({ connectionString: url, max: Number(process.env.NAVO_DB_POOL_MAX) || 10 });
    const db = drizzleNodePg(pool, { schema });
    // Applied on first connection (a no-op once up to date); `npm run db:migrate` can run it ahead of time.
    await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return db;
  }
  const client = new PGlite(localDataDir());
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/**
 * Where embedded Postgres keeps its files. Locally that's .data/pglite in the project. On a
 * serverless host without DATABASE_URL the project directory is read-only, so it uses the
 * instance's temp directory: the demo works, but workspaces last only as long as the
 * instance (a visitor on a fresh instance simply gets a fresh workspace). Set DATABASE_URL
 * for durable, shared storage. As a last resort it runs in memory.
 */
function localDataDir(): string | undefined {
  const candidates = process.env.VERCEL ? [path.join(tmpdir(), "navo-pglite")] : [path.join(process.cwd(), ".data", "pglite"), path.join(tmpdir(), "navo-pglite")];
  for (const dataDir of candidates) {
    try {
      mkdirSync(dataDir, { recursive: true });
      return dataDir;
    } catch (error) {
      console.warn(`Can't write ${dataDir} (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  console.warn("Using an in-memory database.");
  return undefined;
}

declare global {
  var __navoDb: Promise<Db> | undefined;
}

/**
 * Process-wide database handle. Cached on globalThis so Next.js dev reloads
 * don't open a second PGlite instance on the same data directory.
 */
export function getDb(): Promise<Db> {
  globalThis.__navoDb ??= createDb().catch((error: unknown) => {
    globalThis.__navoDb = undefined;
    throw error;
  });
  return globalThis.__navoDb;
}

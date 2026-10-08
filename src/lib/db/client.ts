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
  return db as unknown as Db;
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzleNodePg(pool, { schema });
    // Hosted deployments migrate at build time; this is a cheap no-op safety net.
    await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return db as unknown as Db;
  }
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
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

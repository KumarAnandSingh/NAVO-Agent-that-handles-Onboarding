/**
 * Applies the migrations in drizzle/ ahead of time: to DATABASE_URL when it is set (e.g. Neon),
 * otherwise to the local embedded database in .data/. The app also applies them on its first
 * connection, so this step is optional. Run with `npm run db:migrate`.
 */
import { getDb } from "../src/lib/db/client";

getDb()
  .then(() => {
    console.warn(`Migrations applied to ${process.env.DATABASE_URL ? "DATABASE_URL" : "the local embedded database"}.`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

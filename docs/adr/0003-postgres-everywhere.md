# 0003. Postgres everywhere: embedded PGlite locally, Neon when hosted

Status: Accepted

## Context
The demo must run with `npm install && npm run dev` and no external services, yet a hosted demo needs durable, shared storage. Mixing SQLite locally with Postgres in production would hide dialect bugs.

## Decision
Use Postgres in every environment through Drizzle ORM:
- **Locally and in tests:** embedded PGlite (WASM Postgres, in memory for tests).
- **Hosted:** Neon, whenever `DATABASE_URL` is set.

Migrations are generated from `src/lib/db/schema.ts` and applied on first connection. Each visitor gets an isolated workspace; workspace rows cascade-delete, which is how Reset works.

## Consequences
- One SQL dialect and one set of migrations. The same E2E suite has passed on PGlite and on real Postgres.
- Advisory locks and transactions behave like production.
- PGlite on a serverless host without `DATABASE_URL` only lasts as long as the instance, so the hosted demo should set `DATABASE_URL`.

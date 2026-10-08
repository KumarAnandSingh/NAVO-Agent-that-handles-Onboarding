# Navo: working notes for coding agents

Navo is an AI onboarding agent prototype for **Halden**, a fictional company. All data is synthetic.
Never reference real companies, employers or brands in product copy, data or docs.

## Stack
- Next.js 16 (App Router) + React 19 + strict TypeScript. Path alias `@/*` → `src/*`.
- Postgres via Drizzle ORM: embedded PGlite locally/tests (`.data/pglite`), Neon when `DATABASE_URL` is set.
- Claude via `@anthropic-ai/sdk` (model from `NAVO_MODEL`, default `claude-opus-5-5`). Every Claude feature has a deterministic fallback so the app and tests run without a key.
- Vitest (unit + integration on in-memory PGlite), Playwright (E2E).

## Layout
- `src/domain/` pure business rules: types, time/working days, state machine, dependency graph, risk, permissions. No I/O.
- `src/services/` application services (workspace seeding, onboarding state repository, policy retrieval, document reading, Ask Navo).
- `src/agent/` the single onboarding agent: orchestrator loop, tool registry, playbooks, narration.
- `src/mock-systems/` simulated HR, IT, calendar, learning, facilities, vendor.
- `src/content/` synthetic seed data and the Halden policy library.
- `src/ui/` React components and screens (CSS Modules, tokens in `src/app/globals.css`).
- `src/app/` routes and API route handlers.
- `docs/specs/` the product/architecture specs this build follows; `docs/` design docs.

## Rules
- Deterministic code owns state transitions, permissions, dependencies, dates and risk thresholds. The LLM only understands and writes language, reads documents and proposes actions; the permission engine decides.
- Every agent action goes through the tool registry (validated input, guard level, timing, audit row).
- Simulated time is IST (`src/domain/time.ts`); never use `Date.now()` for business logic, use the workspace clock.
- Schema change: edit `src/lib/db/schema.ts`, then `npm run db:generate`.

## Commands
`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e` · `npm run build`

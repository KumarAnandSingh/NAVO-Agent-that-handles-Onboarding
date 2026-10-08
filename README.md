# Navo · AI That Handles Onboarding

> Navo understands what's next, coordinates the work and steps in when needed.

Navo is an AI onboarding agent. Instead of handing a new joiner another checklist, it owns the onboarding journey: it tracks what's done and what's blocked across HR, IT, facilities and the manager, acts within clear guardrails, and only asks the joiner for what genuinely needs them.

**Track:** Employee Onboarding Companion.

> Halden is a fictional company. Every person, document, policy and system in this prototype is synthetic or simulated.

## Status

Work in progress. See [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) for the phased plan and progress.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for live Claude features
npm run dev                  # http://localhost:3000
```

No database setup is needed locally: Navo uses an embedded Postgres (PGlite) stored in `.data/`.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

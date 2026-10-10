# Load test

`npm run load-test -- --base <url> --visitors 50` starts 50 visitors in the same second. Each visitor runs a full journey:

1. Open the app, which seeds the visitor's own workspace.
2. Jump to the pre-joining chapter, which replays a week of events.
3. Advance time twice, so the agent runs.
4. Ask Navo a question.
5. Have HR issue the Employee ID.
6. Reload the state.

It fails if any request errors, or if any visitor sees another visitor's workspace. CI runs it on real Postgres on every push (the `postgres` job).

## Results

Measured on 10 Oct 2026 with a production build (`next start`, one Node process), on a 4-core container with local Postgres 16, offline AI.

**One visitor:**

| Step | ms |
|---|---|
| Open app (seed workspace) | 318 |
| Jump to pre-joining (replays a week) | 864 |
| Advance time (agent run) | 227 / 263 |
| Ask Navo | 243 |
| HR issues the ID | 140 |
| Reload state | 199 |

**50 visitors starting in the same second:** 350 requests in 76 s, **0 errors**, 50 separate workspaces.

| Step | p50 ms | p95 ms | max ms |
|---|---|---|---|
| Open app (seed workspace) | 11,618 | 12,769 | 12,783 |
| Jump to pre-joining | 22,241 | 24,520 | 29,292 |
| Advance time (agent run) | 8,695 | 10,489 | 12,089 |
| Advance time again | 8,726 | 10,629 | 12,489 |
| Ask Navo | 8,623 | 14,969 | 16,535 |
| HR issues the ID | 6,479 | 7,598 | 7,944 |
| Reload state | 4,449 | 6,328 | 6,626 |

## What it shows

- **Correctness holds under load.** No errors, no lost events, and every visitor stays in their own workspace.
- **Latency is queueing in one Node process.** A visitor's work is fast on its own (0.1–0.9 s per step), but 50 simultaneous journeys share one JavaScript thread. On Vercel each request can run on its own function instance, so the same burst spreads out. A self-hosted deployment would run several Node processes behind a load balancer.
- **Use Postgres, not embedded PGlite, for concurrent visitors.** The same test against PGlite (one in-process connection) took 10–19 s just to seed and failed 44 of 350 requests. PGlite is for local development and tests.

## Fixed because of this test

1. **Ask Navo.** When a tool timed out under load, Ask returned a 500. It now answers "I couldn't check your onboarding just now" instead.
2. **HR issuing the Employee ID.** Issuing an ID that was still blocked (the joiner's forms weren't in) left a failed background event. The API now refuses with a clear message, and a second issue does nothing.
3. **Building a screen.** Its independent queries now run in parallel.
4. **The Postgres pool.** It is configurable (`NAVO_DB_POOL_MAX`, default 10, up from a fixed 5).

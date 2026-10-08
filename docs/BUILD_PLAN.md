# Build plan

Navo is built in eight phases. Each phase ends with passing quality gates and a push.

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: project setup, design tokens, NavoFace, database schema, synthetic Halden seed, CI | Done |
| 2 | Domain engines: state machine, dependency graph, working days, risk, permissions, SLA + unit tests | Done |
| 3 | Agent: orchestrator, tool registry, playbooks, mock HR/IT/calendar/learning/facilities/vendor, events + simulated clock, scenarios A and B + integration tests | Done |
| 4 | Demo stage UI: presenter panel, phone (all 20 journey screens), agent runtime panel with tool replay, HR owner console, activity and Ask sheets, `/phone` and `/hr` pages | Done |
| 5 | Claude features: Ask Navo with policy retrieval and citations, document reading and clarification, narration, offline fallbacks, synthetic sample images | Next |
| 6 | Guided auto-play, intro and impact screens, keyboard shortcuts | |
| 7 | End-to-end tests, coverage, accessibility | |
| 8 | Vercel deployment, technical design document, README, demo video script | |

## Key decisions

- **Single agent, explicit tools.** One onboarding agent with a tool registry; every call is validated, permission-checked and logged.
- **Deterministic core, LLM at the edges.** State transitions, dependencies, deadlines, risk thresholds and permissions are plain code with unit tests. Claude handles language understanding, grounded answers, document reading and narration, and can only propose actions.
- **Event-driven simulation.** External systems (HR, IT, vendor, facilities) are mocked and respond through scheduled events on a simulated IST clock, so the demo is reproducible and "Advance time" is real.
- **Workspaces.** Every demo visitor gets an isolated, seeded workspace; Reset rebuilds it.
- **Offline mode.** Without an API key, Claude features fall back to deterministic behaviour so anyone can run the demo and the test suite.
- **Real 2026 calendar.** The design's story (risk spotted on a Thursday, Friday is the last working day, Day 1 on a Monday) is kept on real 2026 dates: Day 1 is Monday 19 October 2026. All demo dates live in `src/content/timeline.ts`.
- **"Advance time" tells the story, the engine does the work.** The presenter's button moves the clock event by event until something the joiner would notice happens, so quiet daily checks don't each need a click. Chapter jumps replay the story through the real engine from a fresh workspace; "Skip to Monday" and similar keep everything the presenter did and only move the clock.
- **Truthful screens.** Every number and claim on screen is computed from state: the loaner offer quotes the time IT will commit to, Day 30 lists what is still open, a partial Day 1 pickup shows what Navo is still sorting, and queued events that became moot (a reply window after the reply) are cancelled rather than left in "Up next".
- **Day-1 risk closes on Day 1.** Before Day 1, Navo plans against Day-1 risk; once Day 1 starts, anything still open is simply overdue and Navo nudges the joiner about their own items.

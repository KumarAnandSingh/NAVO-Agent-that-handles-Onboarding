# Handoff: where Navo stands and how to resume

Read this first when picking the work up in a new session or on a new machine.
Last updated: 8 Oct 2026 (competition deadline: **12 Oct 2026**).

## Where the code is

- Repo: `KumarAnandSingh/new`, branch **`claude/sweet-fermi-dhassn`** (all work is here).
- Pull request into `main`: https://github.com/KumarAnandSingh/new/pull/1 (open; merge when ready).
- CI (GitHub Actions): lint, typecheck, unit + integration tests with coverage floors, build, and a Playwright end-to-end job.

## Resume locally

```bash
git clone https://github.com/KumarAnandSingh/new.git navo && cd navo
git checkout claude/sweet-fermi-dhassn
npm ci
cp .env.example .env.local      # add ANTHROPIC_API_KEY here for live Claude features (optional)
npm run dev                     # http://localhost:3000 (stage), /phone, /hr
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:e2e` (needs the build).

For a coding agent: read `CLAUDE.md` (working rules), this file, then `docs/BUILD_PLAN.md`.

## Status

| Phase | Status |
|---|---|
| 1. Foundation: Next.js, Postgres schema, synthetic Halden seed, NavoFace, CI | Done |
| 2. Deterministic engines: state machine, dependencies, working days, risk, permissions, SLA | Done |
| 3. Agent: orchestrator, tool registry, playbooks, mock HR/IT/vendor/facilities, events, simulated clock | Done |
| 4. Demo stage UI: presenter, phone (20 screens), runtime panel, HR console | Done |
| 5. Claude: Ask Navo with verified citations, document reading, narration, budget, fallbacks | Done |
| 6. Guided demo (25 beats), intro brief, impact screen, keyboard shortcuts | Done |
| 7. Playwright end-to-end, accessibility (axe), coverage floors | Done |
| 8. Deploy, technical design document, README, demo video script | **In progress** |

Numbers at handoff: 122 unit/integration tests and 9 end-to-end tests passing; ~92% line coverage.

## What's left

1. **Deploy to Vercel** (needs you, about 5 minutes). The Vercel connection used by the
   coding session isn't allowed to create projects, so do this in the dashboard:
   1. vercel.com → Add New → Project → import `KumarAnandSingh/new`.
   2. Framework: Next.js (auto). No build settings to change.
   3. Environment variables: `ANTHROPIC_API_KEY` (your key), optionally `NAVO_MODEL`.
   4. Deploy. To deploy this branch before merging, merge PR #1 first or set the
      production branch to `claude/sweet-fermi-dhassn` in Project → Settings → Git.
   5. Recommended: Storage → Create → Neon Postgres → connect to the project. It sets
      `DATABASE_URL`; redeploy. Without it the demo still works, but each serverless
      instance keeps its own in-memory-like database (a cold start gives a fresh demo).
2. **Technical design document**: `docs/TECHNICAL_DESIGN.md` (architecture and flow
   diagrams, setup and deployment, code walkthrough, assumptions).
3. **README** final pass with the hosted link, and a **demo video script**
   (`docs/DEMO_VIDEO_SCRIPT.md`) for the YouTube recording.
4. Record the video, merge PR #1, submit.

## Decisions to keep

- Company **Halden** (fictional), product **Navo**, tagline **"AI That Handles Onboarding"**.
  Nothing related to Reliance or Jio anywhere: code, data, docs, images.
- Track: **Business Case #2, Employee Onboarding Companion**.
- Primary design: `docs/design/Navo_Prototype.dc.html` (+ `NavoFace.dc.html`). Specs in `docs/specs/`.
- AI model: Claude (`claude-opus-5-5` default, `NAVO_MODEL` to change). Every Claude
  feature has a deterministic fallback; the app and all tests run without a key.
- Hosting: Vercel (the account on as567687@gmail.com); database Neon when `DATABASE_URL` is set, embedded PGlite otherwise.
- Synthetic data only. Never paste API keys into chat; set them as environment variables.
- Don't commit the business-cases document, the email screenshots or any branded images.

## Demo story in one paragraph

Anand Mehta joins Halden on Mon 19 Oct 2026. He uploads a missing address proof, clarifies
one unreadable date, and confirms pre-filled forms. On Thu 15 Oct Navo's daily check finds
the Employee ID 2 days late with zero working days of slack for the laptop, reminds HR on its
own (§4.1), and plans an escalation (§4.2) and a loaner fallback. Either HR issues the ID
(scenario "HR responds") or, if HR stays silent, Navo asks Anand to approve a loaner and
escalates to HR Ops after 24 hours. One pickup is booked for Day 1; week 1 brings a benefits
deadline and a booked walkthrough; Day 30 ends on figures computed from the run.

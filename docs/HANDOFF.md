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

1. **Make the hosted link public** (needs you, about 5 minutes). The repo is already connected
   to your Vercel project **v0-studyify** (team "kumaranandsingh's projects"), which builds every
   push to this branch. The preview for the latest commit built successfully:
   https://v0-studyify-git-claude-sweet-f-d1833c-kumaranandsinghs-projects.vercel.app
   (previews may ask for a Vercel login; production URLs are public). To finish:
   1. Vercel → v0-studyify → Settings → General: rename the project (e.g. `navo-halden`) so the
      public URL doesn't say "studyify".
   2. Settings → Environment Variables: add `ANTHROPIC_API_KEY` (Production and Preview).
   3. Either merge PR #1 into `main`, or Settings → Git → set the production branch to
      `claude/sweet-fermi-dhassn`; then redeploy. The production URL is the hosted link.
   4. Recommended: Storage → Create → Neon Postgres → connect to the project (sets
      `DATABASE_URL`), then redeploy. Without it the demo still works, but each serverless
      instance keeps its own temporary database (a cold start gives a fresh demo).
   The coding session's Vercel connection can't manage this project (403), so these steps are
   done in the dashboard.
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

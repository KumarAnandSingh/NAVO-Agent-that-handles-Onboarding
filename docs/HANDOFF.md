# Handoff: where Navo stands and how to resume

Read this first when picking the work up in a new session or on a new machine.
Last updated: 10 Oct 2026 (competition deadline: **12 Oct 2026**).

## Where the code is

- **Repository:** `KumarAnandSingh/new`.
- **`main`:** has the first full Navo build, merged via https://github.com/KumarAnandSingh/new/pull/1.
- **Working branch `claude/sweet-fermi-dhassn`:** has everything since: the AI gateway, the benchmark, policy upload, the cohort radar, Hindi, the code-quality work, the new tests and the new docs. Merge it into `main` with a new pull request when ready.
- **CI (GitHub Actions)** runs:
  - lint and typecheck;
  - tests with coverage floors;
  - the offline AI benchmark;
  - build;
  - a dependency audit;
  - end-to-end on PGlite;
  - Postgres 16 (migrations, end-to-end, 50-visitor load test);
  - a nightly live benchmark, only when a key secret exists.

## Resume locally

```bash
git clone https://github.com/KumarAnandSingh/new.git navo && cd navo
git checkout claude/sweet-fermi-dhassn
npm ci
npm run dev                     # http://localhost:3000 (stage), /phone, /hr
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run eval`, `npm run build`, then `npm run test:e2e` (needs the build).

For a coding agent: read `CLAUDE.md` (working rules), this file, then `docs/adr/README.md`.

## Status

| Area | Status |
|---|---|
| Agent, deterministic engines, simulated systems, 20-screen joiner app, HR console, guided demo | Done |
| AI gateway: per-task routing (Haiku, Sonnet, Opus) with a fallback chain, prompt caching, personal-data guard, budget, usage and cost panel | Done |
| Bring your own key: connect and test in the runtime panel; never stored or logged | Done |
| AI quality benchmark (offline in CI, live nightly with a key) | Done |
| HR policy upload (split, version, cite at once); cohort risk radar with what-ifs; Hindi for Ask Navo | Done |
| Code quality: large modules split, no casts through `unknown`, static styles in CSS modules, 8 decision records, dependency audit | Done |
| Tests: 264 unit, integration, property and component tests; 13 end-to-end on PGlite and Postgres; load test | Done |
| Docs: technical design, enterprise architecture, security and privacy (DPDP), cost model, API reference, AI quality, load test | Done |
| Product video with voice-over (3 min 43 s, retimed to the narration): policy upload, cohort radar, Hindi and bring-your-own-key scenes | Done |
| Deploy, make the repository public, upload the video, submit | **Needs the owner** |

## What's left (needs you)

1. **Hosted link.** In Vercel, open the project connected to this repository:
   1. Rename the project to `navo` (Settings → General).
   2. Set the production branch to `main` (Settings → Git). Merge the working branch into `main` first.
   3. Add **Neon Postgres** from Storage, which sets `DATABASE_URL`.
   4. **Don't** add `ANTHROPIC_API_KEY`: the demo runs offline, and visitors can bring their own key.
   5. Redeploy, then open the production URL in a private window.
2. **Make the repository public** (Settings → General → Change visibility).
3. **Upload the video** (`video/out/navo-demo-voiced.mp4`) to YouTube as Public or Unlisted, with its captions (`navo-demo-voiced.srt`). To re-record the voice, see `video/README.md` → Add a voice-over.
4. Put the hosted link and the video link in the README table, then submit. `docs/SUBMISSION.md` maps every requirement to where it is met.

## Decisions to keep

- Company **Halden** (fictional), product **Navo**, tagline **"AI That Handles Onboarding"**.
  No real company, employer or brand names anywhere: code, data, docs, images.
- Track: **Business Case #2, Employee Onboarding Companion**.
- Primary design: `docs/design/Navo_Prototype.dc.html` (+ `NavoFace.dc.html`). Specs in `docs/specs/`.
- AI routing: Haiku 5.5 for status updates, Sonnet 5.5 for Ask Navo, Opus 5.5 for documents,
  each with a fallback model; env overrides per task (`NAVO_MODEL_*`) or for all (`NAVO_MODEL`).
  Every Claude feature has a deterministic fallback; the app and all tests run without a key.
- No money is spent on the API. The hosted demo has no server key; visitors bring their own
  (kept in the browser tab, never stored or logged). No live AI numbers are published.
- The personal-data guard covers chat and narration only; document reading keeps the image
  (consent, named fields, masked storage).
- Hosting: Vercel (the repo owner's account); database Neon when `DATABASE_URL` is set, embedded PGlite otherwise. Use Postgres for concurrent visitors (see `docs/LOAD_TEST.md`).
- Synthetic data only. Never paste API keys into chat; set them as environment variables.
- Don't commit the business-cases document, the email screenshots or any branded images.

## Demo story in one paragraph

Anand Mehta joins Halden on Mon 19 Oct 2026. He uploads a missing address proof, clarifies
one unreadable date, and confirms pre-filled forms. On Thu 15 Oct Navo's daily check finds
the Employee ID 2 days late with zero working days of slack for the laptop, reminds HR on its
own (Section 4.1), and plans an escalation (Section 4.2) and a loaner fallback. Either HR issues the ID
(scenario "HR responds") or, if HR stays silent, Navo asks Anand to approve a loaner and
escalates to HR Ops after 24 hours. One pickup is booked for Day 1; week 1 brings a benefits
deadline and a booked walkthrough; Day 30 ends on figures computed from the run.

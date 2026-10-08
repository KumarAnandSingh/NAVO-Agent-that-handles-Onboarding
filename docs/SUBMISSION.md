# Submission checklist

**AI Innovation Lab, Season 2, Round 2.** Track: **Business Case #2, Employee Onboarding Companion**. Deadline: **12 October 2026**.

This page maps each submission requirement to where it is met in this repository.

| Requirement | Where | Status |
|---|---|---|
| **1. Project completion.** Fully functional prototype. | The app: demo stage `/`, joiner app `/phone`, HR console `/hr`, the guided demo, both HR scenarios, Ask Navo | Done |
| **2. Documentation (1).** Project overview, including the track selected | [Technical design §1](TECHNICAL_DESIGN.md#1-project-overview), [README](../README.md) | Done |
| **2. Documentation (2).** System architecture diagrams (flow diagrams) | [Technical design §2–§7, §12](TECHNICAL_DESIGN.md#2-system-architecture): system, agent run sequence, task state machine, dependency chain, Ask Navo verification, event loop, data model, deployment | Done |
| **2. Documentation (3).** Setup and deployment instructions | [Technical design §11 Setup](TECHNICAL_DESIGN.md#11-setup), [§12 Deployment](TECHNICAL_DESIGN.md#12-deployment), [README quick start](../README.md#quick-start) | Done |
| **2. Documentation (4).** Code explanations and assumptions | [Technical design §13 Code walkthrough](TECHNICAL_DESIGN.md#13-code-walkthrough), [§14 Assumptions](TECHNICAL_DESIGN.md#14-assumptions), [§15 Limitations](TECHNICAL_DESIGN.md#15-limitations-and-future-work) | Done |
| **3. Demo video.** YouTube link showing key features and the user experience | Script: [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md). Link: _to be added_ | To record |
| **4. Submission platform.** Code on personal GitHub, shared with the documents and the video | This repository. It must be **public** so reviewers need no access requests. | To make public |
| **Hosted link** (if hosted) | Vercel. Link: _to be added_ | To deploy |
| **Comprehensive unit tests** | `tests/unit` (9 files), `tests/integration` (8 files), `tests/e2e` (5 specs). 122 + 9 tests, about 92% line coverage, floors enforced in CI. See [Technical design §10](TECHNICAL_DESIGN.md#10-testing-strategy) | Done |

## How the evaluation criteria are addressed

| Criterion | Evidence |
|---|---|
| **Innovation** | An agent that owns the journey, not a chatbot or checklist. It reasons about Day-1 risk from working-day lead times and acts before anyone notices. It asks the joiner only for decisions that are theirs. It explains every action with the policy behind it. Claude's output is verified by code (citations, facts and document fields). |
| **Technical complexity** | Event-driven simulation on an IST working-day clock. A dependency graph with critical-chain projection. A permission engine. A tool registry with audit. Idempotent events under advisory locks. Claude tool use with a verification loop, vision document reading with structured output, and a call budget. |
| **Code quality** | Strict TypeScript, Zod at every boundary, pure domain rules separate from I/O, one tool registry for every action. Lint and typecheck run in CI. |
| **Testing and reliability** | Unit tests for every domain rule. Integration tests for both stories and the failure cases (timeouts, invalid input, denied actions, duplicate and failing events, conflicting updates). Claude edge cases run against a scripted fake. Playwright journeys and axe accessibility scans. Coverage floors are enforced. |
| **Documentation** | This repository's [technical design](TECHNICAL_DESIGN.md), README, specs and demo script. |
| **Demo quality** | A 3-minute guided demo on the live engine with captions, an HR view and an impact screen computed from the run. |

## Before submitting

- [ ] Merge the working branch into `main`, so the default branch shows Navo.
- [ ] Make the repository **public** (Settings → General → Danger zone → Change visibility).
- [ ] Deploy to Vercel with `ANTHROPIC_API_KEY` and Neon Postgres. Open the production URL in a private window to confirm it loads without a login.
- [ ] Record and upload the demo video (Public or Unlisted) using the [script](DEMO_VIDEO_SCRIPT.md).
- [ ] Add the hosted link and the video link to the README table and to the submission email.
- [ ] Send the GitHub link, the hosted link and the video link before 12 October 2026.

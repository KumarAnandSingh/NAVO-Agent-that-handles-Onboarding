# Submission checklist

**AI Innovation Lab, Season 2, Round 2.** Track: **Business Case #2, Employee Onboarding Companion**. Deadline: **12 October 2026**.

This page maps each submission requirement to where it is met in this repository.

| Requirement | Where | Status |
|---|---|---|
| **1. Project completion.** Fully functional prototype. | The app: demo stage `/`, joiner app `/phone`, HR console `/hr`, the guided demo, both HR scenarios, Ask Navo | Done |
| **2. Documentation (1).** Project overview, including the track selected | [Technical design Section 1](TECHNICAL_DESIGN.md#1-project-overview), [README](../README.md), [enterprise architecture](ENTERPRISE_ARCHITECTURE.md) | Done |
| **2. Documentation (2).** System architecture diagrams (flow diagrams) | [Technical design Sections 2–7, Section 12](TECHNICAL_DESIGN.md#2-system-architecture): system, agent run sequence, task state machine, dependency chain, Ask Navo verification, event loop, data model, deployment | Done |
| **2. Documentation (3).** Setup and deployment instructions | [Technical design Section 11 Setup](TECHNICAL_DESIGN.md#11-setup), [Section 12 Deployment](TECHNICAL_DESIGN.md#12-deployment), [README quick start](../README.md#quick-start) | Done |
| **2. Documentation (4).** Code explanations and assumptions | [Technical design Section 13 Code walkthrough](TECHNICAL_DESIGN.md#13-code-walkthrough), [Section 14 Assumptions](TECHNICAL_DESIGN.md#14-assumptions), [Section 15 Limitations](TECHNICAL_DESIGN.md#15-limitations-and-future-work), [API reference](API.md), [decision records](adr/README.md), [security and privacy](SECURITY_PRIVACY.md), [cost model](COST_MODEL.md) | Done |
| **3. Demo video.** YouTube link showing key features and the user experience | Rendered from the real app with `npm run video` ([video/README.md](../video/README.md)), then retimed to a recorded voice-over and played at 1.5× speed: 2 min 31 s, with narration, word-highlighted subtitles in sync with the voice, and sound effects. In the repository: [`docs/media/navo-demo.mp4`](media/navo-demo.mp4), shown at the top of the README. YouTube link: _to be added after upload_ | Video ready; upload to YouTube |
| **4. Submission platform.** Code on personal GitHub, shared with the documents and the video | This repository. It must be **public** so reviewers need no access requests. | To make public |
| **Hosted link** (if hosted) | Vercel. Link: _to be added_ | To deploy |
| **Comprehensive unit tests** | The test folders:<ul><li>`tests/unit`: 15 files, including property-based tests</li><li>`tests/integration`: 18 files</li><li>`tests/components`: 6 files</li><li>`tests/e2e`: 8 specs</li></ul>264 + 13 tests. Coverage with the UI included is 90.8% of lines; server code reaches 85.1% of branches. Floors are enforced in CI, which also runs an AI quality benchmark, a dependency audit, Postgres end-to-end runs and a 50-visitor load test. See [Technical design Section 10](TECHNICAL_DESIGN.md#10-testing-strategy) | Done |

## How the evaluation criteria are addressed

| Criterion | Evidence |
|---|---|
| **Innovation** | **An agent that owns the journey**, not a chatbot or checklist. It reasons about Day-1 risk from working-day lead times and acts before anyone notices. It asks the joiner only for decisions that are theirs, and a "no" stands.<br><br>**A cohort risk radar with what-ifs** shows HR where Day 1 would break if a team slowed down. HR can publish a policy that Navo cites at once, and Ask Navo answers in Hindi. Every Claude output is verified by code. |
| **Technical complexity** | **The engine:** an event-driven simulation on an IST working-day clock; a dependency graph with critical-chain projection; a permission engine; a 22-tool registry with audit; idempotent events under advisory locks.<br><br>**The AI gateway:** per-task model routing with a fallback chain on errors and refusals, prompt caching, a personal-data guard, a call budget, a usage and cost log, and per-request visitor keys.<br><br>**AI features:** Claude tool use with citation verification; vision document reading with structured output; policy ingestion with versioning. |
| **Code quality** | **Structure:** strict TypeScript with no `any` and no casts through `unknown`; Zod at every boundary; pure domain rules separate from I/O; one tool registry and one AI gateway. Large modules are split by responsibility, and static styles live in CSS modules.<br><br>**Process:** eight [decision records](adr/README.md); lint, typecheck and a dependency audit in CI. |
| **Testing and reliability** | **Counts:** 264 unit, integration, property-based and component tests; 13 end-to-end tests on PGlite and on real Postgres; axe accessibility scans.<br><br>**Specialised suites:** an [AI benchmark](AI_QUALITY.md) graded by code; a [50-visitor load test](LOAD_TEST.md) with 0 errors; a journey sweep that checks every screen at every step.<br><br>**Coverage floors** are enforced. Several real bugs were found and fixed by these tests. |
| **Documentation** | The [technical design](TECHNICAL_DESIGN.md), [enterprise architecture](ENTERPRISE_ARCHITECTURE.md), [security and privacy](SECURITY_PRIVACY.md) (DPDP), [cost model](COST_MODEL.md), [API reference](API.md), [decision records](adr/README.md), README, specs and the video script. |
| **Demo quality** | A guided demo on the live engine with captions, an HR view, the cohort radar and an impact screen computed from the run. A product video is rendered from the real app. Visitors can switch the hosted demo to live Claude with their own key. |

## Before submitting

- [ ] Merge the working branch into `main`, so the default branch shows Navo.
- [ ] Make the repository **public** (Settings → General → Danger zone → Change visibility).
- [ ] Deploy to Vercel with Neon Postgres. No API key is needed: the demo runs offline, and visitors can connect their own. Open the production URL in a private window to confirm it loads without a login.
- [ ] Upload `video/out/navo-demo.mp4` to YouTube (Public or Unlisted), optionally with `navo-demo.srt` as captions. To add a voice, see [video/README.md](../video/README.md).
- [ ] Add the hosted link and the video link to the README table and to the submission email.
- [ ] Send the GitHub link, the hosted link and the video link before 12 October 2026.

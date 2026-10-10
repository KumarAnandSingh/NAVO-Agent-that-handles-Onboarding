# AI quality benchmark

A fixed set of test cases with known good answers, graded by code. It measures whether Navo's AI features do the right thing. It runs on every push, offline and for free. It can also run against live Claude.

```bash
npm run eval              # offline: grades Navo's rule-based fallbacks (what CI runs)
npm run eval -- --live    # with ANTHROPIC_API_KEY: grades Claude through the real gateway
npm run eval -- --json    # also writes the full report to evals/<mode>.json
```

## What it covers

| Suite | Cases | What a pass means |
|---|---|---|
| Ask Navo | 14 questions (`src/eval/cases.ts`) | Cites the right Halden policy, and cites only sections it retrieved. States the facts from the joiner's live state. Says "I don't know" and points to HR when a question is out of scope. Never claims an action only HR can take, even when told to in the question. Stays plain and short. |
| Document reading | 3 synthetic samples | Reads every readable field exactly. Flags the smudged date instead of guessing it. |
| Status updates | One of each of the 6 kinds | Keeps every name, number, date and ticket from the facts, and adds no number of its own. |

The Ask cases run on a fixed state: the HR-silent story on Thursday at 09:15, just after Navo reminded HR about the late Employee ID.

## How it grades

Every check is a rule in `src/eval/grade.ts`. No model grades another model, so a score means the same thing on every run, and a reviewer can read why a case failed.

- **Citations** are checked against the sections that `search_policies` actually returned.
- **Facts** are patterns the answer must contain, such as "Priya Nair", "1,200" or "Building B".
- **Forbidden claims** look for phrases like "I've issued your Employee ID". "I can't issue IDs" is fine.
- **Document fields** must match exactly, at a confidence of at least 0.8. A field that can't be read must come back empty or below that confidence.

## Offline results

Measured on 10 Oct 2026 with `npm run eval`:

| Suite | Cases | Passed | Written by Claude | Avg latency |
|---|---|---|---|---|
| Ask Navo | 14 | 13 (93%) | 0 | 14 ms |
| Document reading | 3 | 3 (100%) | 0 | 0 ms |
| Status updates | 6 | 6 (100%) | 0 | 0 ms |

The one failure is on purpose. "If my machine isn't there on my first morning, what happens?" is worded so that Navo's keyword rules miss it. It shows where Claude adds value over the fallback.

Running the benchmark found and fixed two real gaps in the offline answers:

1. The pickup answer didn't say where to collect.
2. "Who can see my documents?" retrieved the wrong section, because the synonym map lacked "see" → "view, access".

The document and status-update suites pass trivially offline: the fallback is the recorded reading and the template. They exist to measure Claude.

## Live results

No live numbers are published here. This project spends no money on the API, so a live run needs a key.

- **Run it yourself:** `ANTHROPIC_API_KEY=… npm run eval -- --live` makes about 40 calls and prints the estimated cost at list price.
- **Nightly in CI:** the `AI quality (live Claude)` workflow runs every night only if the repository has an `ANTHROPIC_API_KEY` secret. It posts the report to the run summary. Without the secret it is skipped.

A live run goes through the same gateway as the app: model routing, fallbacks, the personal-data guard, citation checks and the call budget. The report shows, for each case, who wrote the output: a Claude model, or Navo's rules after a fallback. That makes a model that keeps failing verification visible.

## CI gate

`npm run eval` exits non-zero if any offline case fails, except those marked `paraphrase`. A change that breaks a grounded answer, a citation or a document check fails the build.

# Cost model

What live Claude costs per onboarding. These figures are measured from the real code paths, not guessed. Run `npm run cost-model` to reproduce them; it makes no API calls.

## How it is measured

`scripts/cost-model.ts` runs one full onboarding per scenario through the real AI gateway: documents, forms, the pre-joining risk, Day 1 and the weeks after, to Day 30. It then asks six typical Ask Navo questions.

A recording stand-in for Claude answers the way the model would: it rewrites status updates, reads the documents' fields, and for Ask runs one tool round then answers. Every call and every prompt is measured, then priced at list price for the model the gateway routes each task to.

- **Text tokens:** about 3.6 characters per token.
- **Document images:** 900 × 1100 pixels, about 1,320 tokens each.
- **Output per call** can't be measured without the API, so it is an assumption, stated below and on the high side: status update 150 tokens, document 350, Ask round 170, each including low-effort thinking.

## Result: about 7 US cents per joiner

One joiner, documents to Day 30, plus six Ask Navo questions. List prices per million input / output tokens: Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.

| Task | Model | Calls | Input tokens | Output tokens | Cost | With prompt caching |
|---|---|---|---|---|---|---|
| Status updates | Haiku 5.5 | 3–5 | 678–1,175 | 450–750 | $0.0003–0.0005 | same |
| Document reading | Opus 5.5 | 2 | 3,118 | 700 | $0.0265 | same |
| Ask Navo (6 questions) | Sonnet 5.5 | 12 | 13,811 | 2,040 | $0.0480 | $0.0398 |
| **Total per onboarding** | | **17–19** | | | **$0.075** | **$0.067** |

The ranges cover both stories:
- **HR responds:** 3 status updates.
- **HR stays silent:** 5 status updates, because of the escalation and the loaner question.

## Routing and caching

| Setup | Cost per onboarding | Saving |
|---|---|---|
| Every task on Opus 5.5 | $0.134–0.142 | — |
| Routed per task (this build) | $0.075 | 44–47% |
| Routed, with prompt caching on Ask | $0.067 | 50–53% |

## At scale

| Joiners a year | Routed, cached | Every task on Opus |
|---|---|---|
| 1,000 | about $67 | about $138 |
| 10,000 | about $670 | about $1,380 |
| 100,000 | about $6,700 | about $13,800 |

These cover model calls only. Hosting (Next.js functions and Postgres) and integration costs are separate.

## What drives the cost, and the levers

- **Ask Navo is about 60% of the cost.** It grows with the number of questions a joiner asks.

  | Lever | Effect |
  |---|---|
  | Answer common questions from Navo's rules first | Free |
  | Route short factual questions to Haiku | Cheaper |
  | Keep prompt caching on | Already built |

- **Document reading is about 35%.** Opus is used on purpose, because a wrong digit in an ID is costly. Each document is read once. A cheaper model could pre-read, with Opus only for low-confidence fields; that would need the benchmark to show no loss of accuracy.
- **Status updates cost almost nothing** on Haiku, and code fact-checks every rewrite.
- **Offline costs nothing.** Every feature has a deterministic fallback. The public demo runs offline unless a visitor connects their own key.

## Limits of this estimate

- Output tokens and thinking are assumptions. A live run of the benchmark (`npm run eval -- --live`) measures real usage. The runtime panel shows real tokens and cost per task whenever live AI is on.
- Haiku 5.5 is priced at its rate for prompts up to 100,000 tokens; Navo's prompts are far smaller.
- Check current pricing before budgeting.

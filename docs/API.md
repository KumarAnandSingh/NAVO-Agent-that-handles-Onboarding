# API reference

Navo's HTTP API is a set of Next.js route handlers under `/api`. The app uses it, and so do the end-to-end and load tests.

**Common to every endpoint:**
- Each request is validated with Zod.
- Each visitor works in their own workspace, identified by the `navo_ws` cookie (httpOnly, SameSite=Lax, Secure in production). The first request without one seeds a new workspace and sets the cookie.
- Most endpoints answer with a fresh **view model** (`vm`): everything every screen shows, built by the pure presenter (`src/services/view-model/types.ts`).

## Common headers

| Header | Direction | Meaning |
|---|---|---|
| `content-type: application/json` | request | Required on POST bodies. |
| `x-navo-claude-key: sk-ant-…` | request, optional | The visitor's own Anthropic key, for this request only. The server never stores or logs it. Ignored when the deployment sets `NAVO_BYOK=off`. Without it, the deployment's own key is used if set, else Navo runs offline. |
| `set-cookie: navo_ws=…` | response | Set on the first request of a new visitor. |

## Errors

Every error answers `{ "error": string }` with a message that is safe to show. Validation errors also carry `issues`.

| Status | When |
|---|---|
| 400 | Invalid body (the first validation message is the `error`), an action that can't be done now (`"Tap what you collected"`), or a rejected policy upload |
| 403 | `POST /api/ai` when visitor keys are disabled |
| 404 | Unknown workspace or record |
| 409 | Someone else changed the record: refresh and try again |
| 500 | Unexpected; the message is always `"Something went wrong"` and the details stay in the server log |

## `GET /api/state`

The current view model.

```json
{ "vm": { "chapter": "pre_joining", "home": { "headline": "One risk to Monday. I'm on it." }, "runtime": { "ai": { "mode": "offline" } } } }
```

`vm.runtime.ai` reports:
- how this request reaches Claude: `offline`, `server` or `visitor`;
- whether visitor keys are allowed (`byok`);
- the model routes;
- usage per task and model: calls, fallbacks, average latency, tokens and estimated cost;
- how many personal numbers were masked.

## `POST /api/employee`

What the joiner does in the app. The body is one of these:

| `action` | Other fields | Effect |
|---|---|---|
| `upload_sample` | `sampleId`: a synthetic sample, e.g. `"electricity-bill"` | Reads the document (Claude vision, or the recorded reading offline). Deterministic rules verify it, ask about one field, or ask for another copy. |
| `confirm_field` | `documentType`, `value` (`YYYY-MM-DD`) | Confirms the one unclear field |
| `emergency_contact` | `value` (5–120 characters) | Saves the contact |
| `submit_forms` | | Submits pre-filled forms; fails with the fields still needed |
| `complete_training` | | Marks security training done |
| `decide_approval` | `approvalId`, `decision`: `approved` or `declined` | Answers Navo's question, e.g. a loaner laptop. A "no" stands. |
| `confirm_pickup` | `collected`: array of `id`, `laptop`, `kit` (at least one) | Closes what was collected; Navo follows up on the rest |
| `enrol_benefits` | | Enrols in health cover |
| `pulse` | `score`: 1–5 | Records the Day-30 pulse |
| `book_walkthrough` | | Asks Navo to book the suggested walkthrough |

Response: `{ "vm": … }`. The agent's runs triggered by the action appear in `vm.runtime.runs` with every tool call.

## `POST /api/hr`

What HR does in the console.

| `action` | Other fields | Effect |
|---|---|---|
| `generate_id` | | HR issues the Employee ID. Navo raises the IT requests within a minute. Refused while the ID is still blocked; a second issue does nothing. |
| `preview_policy` | `policy` (below) | Splits the text into sections with refs, without saving. Response: `{ "preview": … }` |
| `publish_policy` | `policy` (below) | Saves it to this workspace. Ask Navo and the agent can cite it at once. Response: `{ "published": …, "vm": … }` |

`policy` fields:

| Field | Required | Rules |
|---|---|---|
| `title` | yes | 3–120 characters |
| `version` | yes | Like `1.0` or `2.1`; must be higher than the version it replaces |
| `text` | yes | 40 to 30,000 characters of text or Markdown |
| `effectiveDate` | no | `YYYY-MM-DD`; defaults to the simulated date |
| `replaces` | no | The id of a library policy this is a newer version of |
| `category` | no | |

```json
{
  "action": "publish_policy",
  "policy": { "title": "Relocation support", "version": "1.0", "text": "# Relocation support\n\n## Who is eligible\n…" }
}
```

```json
{
  "published": {
    "documentId": "hr-1a2b3c4d~ws_…",
    "version": "1.0",
    "effectiveDate": "2026-10-07",
    "sections": [{ "ref": "§9.1", "title": "Who is eligible", "body": "…" }]
  },
  "vm": { … }
}
```

## `POST /api/ask`

Ask Navo a question, in English or Hindi.

```json
{ "question": "What if HR doesn't respond?" }
```

```json
{
  "answer": {
    "text": "I reminded Priya Nair at 09:17 today. If there's no reply by tomorrow at 09:17, I escalate to the HR Ops lead (§4.2). …",
    "checked": ["Onboarding standards and escalation §4.2", "Navo's follow-ups", "Day 1 risk"],
    "citations": [{ "ref": "§4.2", "title": "Escalation", "document": "Onboarding standards and escalation" }],
    "composedBy": "fallback",
    "fallbackReason": "offline",
    "showActivity": true
  },
  "vm": { … }
}
```

**Who wrote the answer:**
- `composedBy` is `claude` or `fallback`.
- With Claude, `model` names the model that wrote it.
- With the fallback, `fallbackReason` says why: `offline`, a timeout, an unverified citation, the daily budget, and so on.

**Citations:** every cited ref was returned by the policy search in this conversation.

## `POST /api/ai`

Tests a visitor's own key, free, using the Models API. The key goes in `x-navo-claude-key`; there is no body.

```json
{ "ok": true, "models": [{ "id": "claude-sonnet-5-5", "name": "Sonnet 5.5", "available": true }] }
```

A failure answers status 400, e.g. `{ "ok": false, "error": "Anthropic rejected this key. Check that you copied all of it." }`.

## `POST /api/demo`

Presenter controls for the demo.

| `action` | Other fields | Effect |
|---|---|---|
| `advance` | | Processes events until the joiner would notice something. Response adds `processed`. |
| `reset` | `scenario` (optional) | Rebuilds the workspace from seed |
| `scenario` | `scenario`: `hr_responds` or `hr_silent` | Changes how HR behaves from now on |
| `it_delay` | | IT reports a two-working-day slip on the laptop |
| `chapter` | `chapter`: 0–5 | Jumps to a chapter by replaying the story through the engine |
| `day30` | | Skips to the 30-day mark |
| `skip` | `to`: `risk_day`, `day1`, `pickup`, `day1_end` or `week1` | Skips ahead to a story moment |

Response: `{ "vm": …, "processed": [{ "type", "label", "outcome" }] }`.

## Rate limits and budgets

The deployment's own key has a daily cap (`NAVO_DAILY_LLM_CALL_LIMIT`, default 400). Every workspace has a daily cap on any key (`NAVO_WORKSPACE_DAILY_LLM_CALL_LIMIT`, default 80). Past a cap, AI features answer from Navo's rules.

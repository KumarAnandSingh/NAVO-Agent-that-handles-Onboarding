# Security and privacy

Navo handles the most sensitive data a new joiner shares: identity numbers, bank details, family details and documents. This prototype uses **synthetic data only**. This page describes the controls it builds, and what a production deployment in India would add to meet the Digital Personal Data Protection Act, 2023 (DPDP).

## Data Navo handles

| Data | Where it comes from | Where it goes | Built control |
|---|---|---|---|
| Name, role, joining date, manager | HR system (simulated) | Screens, agent decisions | Read only through audited tools |
| Aadhaar, PAN | Uploaded documents | Masked on screen (`XXXX XXXX 3051`) | Stored masked; full numbers not kept in the seed |
| Bank account | Cancelled cheque | Payroll form, masked (`•••• 4821`) | Masked storage; "asks first" in the permission engine |
| Family details | Offer form | Health-cover answers | Read only for benefits questions |
| Phone, email, emergency contact | The joiner | Forms | Masked before chat and narration text reaches the model |
| Document images | The joiner's upload | Document reading model | Consent screen; only named fields requested; fallback when offline |
| Questions to Ask Navo | The joiner | Model, if live AI is on | Personal-data guard, read-only tools, citation checks |

## Built controls

**Personal-data guard** (`src/services/llm/guard.ts`)
- Before chat or narration text goes to the model, Aadhaar, PAN, phone, bank-account, IFSC and email values are replaced with placeholders such as `[PHONE_1]`.
- The model's reply has them swapped back, so the joiner sees their own details and the model never does.
- Only counts by kind are logged.
- A property-based test checks the text round-trips exactly and that no long number leaks.

**Document reading**
- This keeps the image, because verification needs it.
- The joiner sees a privacy screen first ("How I protect your documents").
- The model is asked only for the named fields.
- Results are verified by deterministic rules, and unclear fields go back to the joiner rather than being guessed.

**Least privilege for the AI**
- Ask Navo can only call read tools.
- The joiner is fixed by the server, so a question can't read another person's onboarding.
- Acting tools go through the permission engine:

  | Who can do it | Actions |
  |---|---|
  | Navo alone | Reminders, IT tickets, scheduling, escalation after 24 hours |
  | The joiner, when Navo asks | Personal data, bank details, asset changes such as a loaner laptop |
  | HR only | Employee IDs, start dates |

**Prompt injection**
- The system prompt tells the model to ignore instructions in the question.
- An unknown tool name returns an error and nothing runs.
- A test covers an injection that asks Navo to issue an Employee ID.
- The quality benchmark grades every answer for claims of actions only HR can take.

**Visitor keys (bring your own key)**
- A visitor's Anthropic key lives in their browser tab (`sessionStorage`) and is cleared when the tab closes.
- It is sent only as a header to Navo's own API, over HTTPS when hosted.
- The server uses it for that request only and never stores or logs it. A test checks the database and the logs after a failing call.
- The free key check uses the Models API, so testing a key costs nothing.

**Audit trail**
- Every agent run, tool call (with arguments and result), state change and notification is recorded with a timestamp.
- The joiner sees "What Navo did, and why".
- HR sees the same activity per joiner.

**Isolation**
- Every visitor gets their own workspace (an httpOnly, SameSite=Lax cookie, Secure in production).
- Uploaded policies are scoped to the workspace.
- Reset deletes all of a workspace's rows.

**Application security**
- Zod validation at every API boundary.
- One error mapper, which never returns internal error text.
- React escaping, with no raw HTML and no third-party scripts.
- No secrets in the repository; history is checked.
- CI fails on high or critical advisories in production dependencies.

## DPDP Act 2023: how a production deployment maps to it

| DPDP principle | What Navo does today | What production adds |
|---|---|---|
| **Consent and notice** (s. 5–6) | Privacy screen before documents; asks before using personal data or bank details | Recorded, itemised consent with timestamps; notice in English and the joiner's language |
| **Purpose limitation** | Documents used only for onboarding (Section 8.1 of the document-handling policy); the agent reads only what a task needs | A purpose tag on each data field, enforced by the tool registry |
| **Data minimisation** | Only named fields requested from documents; masked storage; placeholders before chat and narration reach the model | Field-level encryption; drop document images after verification |
| **Accuracy** | Unclear fields go back to the joiner; low-confidence readings are never accepted | Correction requests from the joiner, with an audit trail |
| **Storage limitation** | Demo workspaces expire after 48 hours; Reset deletes everything | Retention schedule per data type; automatic deletion after onboarding plus the legal period |
| **Security safeguards** (s. 8(5)) | Least-privilege AI tools, audit trail, isolation, input validation, dependency audit | SSO and role-based access, encryption keys in a key manager, penetration testing, breach detection |
| **Breach notification** (s. 8(6)) | Not applicable to synthetic data | Incident runbook: notify the Data Protection Board and affected joiners |
| **Rights of the data principal** (s. 11–14) | The joiner sees what Navo holds and did | Self-service access, correction and erasure requests |
| **Cross-border transfer** (s. 16) | The model provider is an external processor | An enterprise model endpoint in an approved region with zero data retention, under a data processing agreement |
| **Children's data** | Not applicable (adult joiners) | Not applicable |

## Threats considered

| Threat | Mitigation |
|---|---|
| A joiner's question tries to make Navo act ("issue my ID now") | Read-only tools in chat; permission engine; benchmark check for forbidden claims |
| The model invents a policy | Citations must match retrieved sections; low relevance gives "I don't know" |
| Leaking personal numbers to the model provider | Guard for chat and narration; documents only with consent and named fields |
| Stealing a visitor's API key | Kept in the tab only, sent only to Navo's origin, never stored server-side; no third-party scripts |
| One visitor seeing another's data | Cookie-scoped workspaces; a load test checks isolation under 50 concurrent visitors |
| Runaway AI cost | Daily global and per-workspace call caps; offline fallbacks |
| Abuse of the hosted demo | No server key by default; visitors bring their own |

## Not built

This prototype has no production authentication, encryption-key management, retention jobs or penetration test. A real deployment needs these before it handles real joiner data.

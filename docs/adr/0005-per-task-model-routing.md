# 0005. Each AI task gets its own model, effort and fallback chain

Status: Accepted

## Context
Navo's AI tasks differ a lot. Status-update rewrites are short and fact-checked by code. Ask Navo is a few rounds of tool use. Document reading is vision work where a wrong digit is costly. One model for everything either overpays or under-delivers. Models are sometimes overloaded or decline a request.

## Decision
A single gateway (`src/services/llm/gateway.ts`) routes each task (`src/services/llm/models.ts`):

| Task | Primary model | Fallback |
|---|---|---|
| Status updates | Haiku 5.5 | Sonnet 5.5 |
| Ask Navo | Sonnet 5.5 | Opus 5.5 |
| Document reading | Opus 5.5 | Sonnet 5.5 |

Effort is set explicitly per task.

The gateway moves to the next model when one of these happens: overload, a 5xx error, rate limiting, a model the key can't use, a dropped connection, or a refusal (`stop_reason: "refusal"`). Every attempt is recorded with its model, latency, tokens and cache use. The Ask tool loop uses prompt caching. Environment variables can pin a model per task or for all tasks.

## Consequences
- Cost and speed per task are visible in the runtime panel and the benchmark.
- Refusals are handled in the same client-side chain as errors, rather than through the server-side refusal fallback parameter, so one code path covers both.
- A mid-conversation model switch is safe: the API drops thinking blocks the new model can't read, and the request still succeeds.

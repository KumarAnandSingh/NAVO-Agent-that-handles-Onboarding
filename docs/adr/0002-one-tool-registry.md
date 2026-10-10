# 0002. Every agent action goes through one audited tool registry

Status: Accepted

## Context
An agent that can send reminders, raise IT tickets and request approvals needs one place where inputs are checked, permissions are enforced and actions are recorded. Scattered side effects can't be audited.

## Decision
Each capability is defined once with `defineTool` (`src/agent/tools/`). A definition carries:
- a Zod input schema;
- a guard level (read, policy, ask first, never);
- a summary for the audit log.

The registry validates input, applies the permission engine and times the call. It writes one audit row per call, including failures and denials. Ask Navo's Claude tools are a read-only subset of the same registry.

## Consequences
- The runtime panel shows exactly what the agent did, with arguments and results.
- A prompt injection in Ask Navo can't reach an acting tool: it isn't offered, and an unknown tool name returns an error.
- Adding a capability means writing a tool definition, which is a small cost.

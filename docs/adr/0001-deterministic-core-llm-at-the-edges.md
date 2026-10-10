# 0001. Deterministic code owns state; the LLM handles language

Status: Accepted

## Context
Onboarding decisions carry consequences: chasing HR, ordering a loaner laptop, telling a joiner Day 1 is safe. An LLM is good at language and reading documents, but it isn't reliable as the authority on dates, permissions or state transitions. Judges and HR teams need to trust the agent's actions and be able to audit them.

## Decision
Deterministic code owns these: task state transitions, dependency evaluation, working-day dates, Day-1 risk thresholds, SLAs and permissions (`src/domain/`). Claude understands questions, writes messages, reads documents and plans read-only tool calls. Code verifies everything Claude produces before it is used:
- citations must have been retrieved;
- rewrites must keep every fact;
- document fields go through deterministic verification.

## Consequences
- The agent behaves the same with or without a model, so it is testable and every feature has a fallback.
- Risk and permission logic is unit-tested directly.
- We give up some flexibility: a new kind of decision needs code, not just a prompt.

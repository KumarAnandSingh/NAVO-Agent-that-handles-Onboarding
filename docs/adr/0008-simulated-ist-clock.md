# 0008. Business time comes from a simulated IST clock per workspace

Status: Accepted

## Context
The story spans weeks: offer, pre-joining, Day 1 and Day 30. Lead times are in Indian working days, and a demo must show a late Employee ID turning into a Day-1 risk in minutes.

## Decision
Each workspace has its own simulated clock (`simNow`), in IST. All business logic takes time from it:
- working days and holidays (`src/domain/time.ts`);
- SLAs;
- risk;
- scheduled events.

`Date.now()` is used only for operational concerns, such as the daily call budget and latency.

## Consequences
- The whole journey is reproducible and testable at exact moments, such as Thursday 09:15 and Friday after the cutoff.
- Moving to real time is a matter of advancing the clock from wall time; no business logic changes.

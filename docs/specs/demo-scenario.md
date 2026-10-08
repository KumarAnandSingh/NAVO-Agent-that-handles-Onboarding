# Golden Demo Scenario

## Objective

Demonstrate that the agent can observe state, detect a dependency, reason about risk, take an action, update state and reduce employee effort.

## Initial state

Employee:
- Anand Mehta
- Senior Product Manager
- joining Monday, 20 Oct 2026

Simulated date:
- Thursday, 16 Oct 2026

State:
- offer signed
- identity documents verified
- bank details confirmed
- Employee ID delayed
- background verification in progress
- laptop not yet provisioned
- laptop depends on Employee ID
- VPN depends on laptop
- security training pending
- manager 1:1 scheduled

## Demo sequence

### Scene 1 — Employee home

Show:
- almost ready for Day 1
- one thing needs the employee
- several things handled by agent
- laptop dependency risk

### Scene 2 — Agent activity

Show:
- detected Employee ID delay
- inspected laptop dependency
- identified Day-1 risk

### Scene 3 — Agent action

Agent calls mock HR follow-up tool.

Activity:
"I followed up with HR because your Employee ID is blocking laptop provisioning."

### Scene 4 — Advance simulated time

Demo control triggers HR response.

Employee ID becomes completed.

### Scene 5 — Agent reacts

Agent notices the dependency is resolved.

Agent calls create_it_request.

Laptop status becomes requested/in progress.

### Scene 6 — Employee update

"Your Employee ID is ready. I've sent the laptop request to IT. No action needed from you."

### Scene 7 — Policy Q&A

Employee asks:
"Can I work from home on Friday?"

Agent retrieves synthetic WFH policy and answers with employee context.

### Scene 8 — Day 1

Show personalised schedule and relevant policies.

## What judges should see

The demo must make these transitions obvious:

Observe → Reason → Act → State Change → Communicate

## Demo control

A development-only control bar should allow:
- set date/time
- trigger HR response
- trigger IT delay
- reset state
- select scenario

This is a demo aid, not part of the employee product.

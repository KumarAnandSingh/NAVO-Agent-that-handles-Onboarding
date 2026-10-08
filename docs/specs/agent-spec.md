# Agent Specification

## Agent identity

A single primary onboarding agent with explicit tools and services beneath it.

Avoid creating multiple agents merely to make the architecture look sophisticated.

## Agent loop

1. Receive event, user input or scheduled trigger.
2. Gather relevant employee context.
3. Inspect onboarding state.
4. Retrieve policy/knowledge when required.
5. Evaluate dependencies and risks using deterministic domain logic.
6. Use the model for contextual reasoning where appropriate.
7. Select next-best action.
8. Ask for approval when required.
9. Execute tool/action.
10. Mutate persisted state.
11. Record an auditable activity event.
12. Notify employee/owner if needed.
13. Re-evaluate downstream dependencies.

## Tool contract examples

### get_employee_context
Returns synthetic profile and relevant onboarding attributes.

### get_onboarding_state
Returns task, dependency, owner and risk state.

### get_policy
Retrieves relevant policy content from the synthetic knowledge base.

### create_hr_followup
Creates a mock HR follow-up and updates activity/state.

### create_it_request
Creates a mock IT provisioning request and updates state.

### schedule_meeting
Creates a mock calendar event.

### send_reminder
Sends a mock reminder to an owner/employee.

### calculate_onboarding_risk
Uses deterministic rules to calculate known workflow risks.

## Deterministic vs LLM responsibilities

### Deterministic
- state transitions
- permission checks
- dependency resolution
- deadline calculation
- date/time arithmetic
- risk thresholds that have explicit business rules

### LLM
- natural language understanding
- policy answer composition
- contextual summaries
- exception interpretation
- selecting among permitted actions when contextual reasoning is genuinely needed

## Autonomy levels

### Auto
Low-risk read or workflow actions.

### Recommend
Agent recommends an action but waits for employee/owner choice.

### Approval required
Sensitive actions must wait for human approval.

## Explainability

Expose product-level rationale only:
- what changed
- why the action happened
- what the agent did
- what happens next

Never expose hidden chain-of-thought.

# Testing Strategy

## Testing philosophy

Tests are not only for green CI. They protect the agent's business behaviour.

## Unit tests

### State transitions

Examples:
- PENDING → COMPLETED
- WAITING → IN_PROGRESS
- BLOCKED → IN_PROGRESS after dependency completion
- NEEDS_USER → COMPLETED after user action

### Dependency engine

Test:
- prerequisite incomplete → dependent remains blocked
- prerequisite completed → dependent becomes eligible
- multiple dependencies
- circular dependency rejection

### Risk engine

Test:
- joining date approaching
- dependency blocked
- task overdue
- no risk

### Permission engine

Test:
- safe actions auto-execute
- sensitive actions require approval
- unauthorised action rejected

### Policy retrieval

Test:
- matching policy found
- no relevant policy
- outdated policy excluded where appropriate

### Tool validation

Test invalid/missing input and deterministic error handling.

## Integration tests

### Agent action

Event
→ state inspection
→ decision
→ tool invocation
→ state mutation
→ activity log

### Policy question

User question
→ retrieval
→ grounded answer

## E2E golden path

Employee ID delayed
→ risk detected
→ HR follow-up
→ Employee ID created
→ laptop request
→ state updated
→ employee informed

## Reliability scenarios

Test:
- model timeout
- tool timeout
- tool validation failure
- missing policy
- missing employee
- conflicting state
- duplicate event

## Quality gates

Before submission:
- unit tests pass
- integration tests pass
- E2E passes
- typecheck passes
- lint passes
- build succeeds

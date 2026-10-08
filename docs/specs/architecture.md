# Technical Architecture

## Guiding principle

Build the smallest real system that can demonstrate agentic onboarding end-to-end.

## Logical architecture

```text
                 Employee UI / HR Console
                           |
                           v
                     API / App Layer
                           |
                           v
                  Agent Orchestrator
                           |
        +------------------+-------------------+
        |                  |                   |
      State             Knowledge           Tools
      Engine             / RAG                |
        |                  |          +--------+--------+
        |                  |          |        |        |
        |                  |         HR       IT    Calendar
        |                  |          |        |        |
        +------------------+----------+--------+--------+
                           |
                           v
                      Mock systems
                           |
                           v
                      Persistent DB
```

## Recommended implementation style

Prefer a modular monolith.

Keep domain logic separated from UI and provider-specific code.

Suggested modules:

```text
app/
  employee/
  journey/
  activity/
  ask/
  admin-demo/

agent/
  orchestrator/
  tools/
  prompts/
  policies/

services/
  onboarding-state/
  dependency-engine/
  risk-engine/
  policy-retrieval/

mock-systems/
  hr/
  it/
  calendar/
  learning/

lib/
  db/
  logging/
  validation/

api/

tests/

docs/
```

## Persistence

Persist:
- employee
- onboarding tasks
- task dependencies
- owners
- task events
- agent activities
- mock system records
- policy documents/metadata

## Event model

Important events could include:
- DOCUMENT_UPLOADED
- DOCUMENT_VERIFIED
- EMPLOYEE_ID_CREATED
- EMPLOYEE_ID_DELAYED
- IT_REQUEST_CREATED
- IT_REQUEST_UPDATED
- MANAGER_CONFIRMATION_RECEIVED
- TASK_OVERDUE
- DAY1_RISK_DETECTED

Events should lead to real state transitions where applicable.

## Security boundaries

- synthetic data only
- environment variables for secrets
- no credentials in source
- no real internal system access
- explicit action permission model

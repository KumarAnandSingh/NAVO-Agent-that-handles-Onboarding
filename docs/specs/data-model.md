# Data Model

## Employee

```text
Employee
- id
- name
- role
- department
- managerId
- buddyId
- location
- joiningDate
- employmentStatus
```

## OnboardingTask

```text
OnboardingTask
- id
- name
- description
- ownerType
- ownerId
- status
- priority
- deadline
- dependencyIds[]
- blockedReason
- evidence[]
- nextAction
- riskLevel
- sourceSystem
- createdAt
- updatedAt
```

## Dependency

```text
Dependency
- id
- prerequisiteTaskId
- dependentTaskId
- type
- status
```

Example:
Employee ID → Laptop → VPN

## AgentActivity

```text
AgentActivity
- id
- timestamp
- actor
- eventType
- summary
- relatedTaskId
- relatedEntityId
- action
- result
- userVisible
```

## PolicyDocument

```text
PolicyDocument
- id
- title
- category
- version
- effectiveDate
- content
- metadata
```

## MockSystemRecord

Use separate records or domain tables for:
- HR requests
- IT requests
- calendar events
- training items

Keep provider-specific details behind service/tool boundaries.

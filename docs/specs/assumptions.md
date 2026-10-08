# Assumptions & Limitations

## Prototype assumptions

1. HR, IT, calendar and learning systems are mocked.
2. All employee, company, task and policy data is synthetic.
3. The application demonstrates representative enterprise workflows rather than production integrations.
4. Notification and communication actions are simulated unless an explicitly safe external integration is chosen.
5. Authentication may be simplified for the prototype unless required for the deployed environment.

## AI assumptions

1. LLMs are not treated as authoritative sources for deterministic business rules.
2. Policy answers are grounded in the synthetic knowledge base.
3. Sensitive actions require human approval.
4. The system records tool/action activity for auditability.

## Known limitations to disclose

- No real HRIS integration
- No real ITSM integration
- No production identity/access management
- Synthetic policy set
- Prototype-level observability
- Prototype-level scale/performance

## Submission principle

Do not present simulated outcomes as production results.

Label clearly:
- synthetic data
- mocked systems
- simulated events
- prototype assumptions
- target metrics vs measured metrics

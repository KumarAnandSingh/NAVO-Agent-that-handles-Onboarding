# 0007. The personal-data guard covers chat and narration, not document reading

Status: Accepted

## Context
Joiners share Aadhaar, PAN, bank and phone numbers. Chat and status updates rarely need those values. Document reading does: verifying a document means reading it.

## Decision
For chat (Ask Navo) and narration, the gateway swaps personal numbers for placeholders such as `[PHONE_1]` before text leaves Navo, and swaps them back in Claude's reply. This covers Aadhaar, PAN, phone, bank account, IFSC and email. Placeholders are numbered deterministically, so a multi-round conversation sends the same history every round. Only counts by kind are logged.

Document reading keeps the image, under these controls:
- the joiner's consent;
- asking only for the named fields;
- masked storage of results;
- deterministic verification.

## Consequences
- The model never sees personal numbers in chat or narration, and the joiner still sees their own details.
- Document reading sends personal data to the model provider, so a production deployment should use an enterprise endpoint with zero data retention.

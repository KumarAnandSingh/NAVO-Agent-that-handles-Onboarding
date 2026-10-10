# Architecture decision records

Short records of the decisions that shape Navo: the context, the choice and what it costs. A new decision gets the next number. A reversed decision is marked superseded, not deleted.

| # | Decision | Status |
|---|---|---|
| [0001](0001-deterministic-core-llm-at-the-edges.md) | Deterministic code owns state; the LLM handles language | Accepted |
| [0002](0002-one-tool-registry.md) | Every agent action goes through one audited tool registry | Accepted |
| [0003](0003-postgres-everywhere.md) | Postgres everywhere: embedded PGlite locally, Neon when hosted | Accepted |
| [0004](0004-offline-first-bring-your-own-key.md) | Offline by default, with visitors bringing their own Claude key | Accepted |
| [0005](0005-per-task-model-routing.md) | Each AI task gets its own model, effort and fallback chain | Accepted |
| [0006](0006-lexical-retrieval.md) | Lexical BM25 retrieval over the policy library, not a vector store | Accepted |
| [0007](0007-personal-data-guard-scope.md) | The personal-data guard covers chat and narration, not document reading | Accepted |
| [0008](0008-simulated-ist-clock.md) | Business time comes from a simulated IST clock per workspace | Accepted |

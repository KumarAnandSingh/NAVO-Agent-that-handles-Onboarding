# 0006. Lexical BM25 retrieval over the policy library, not a vector store

Status: Accepted

## Context
Ask Navo must cite Halden's policies and never invent one. The library is a few dozen sections, plus whatever HR uploads. A vector database adds an embedding provider, a service to run and non-deterministic ranking that is hard to test.

## Decision
Use a small, dependency-free BM25 ranker (`src/services/policy-retrieval/bm25.ts`). It has light stemming, a synonym map (including common Hindi words) and a minimum relevance score, below which Navo says it doesn't know.

Only the policy version in force on the simulated date is searchable. HR uploads are split into sections and searchable at once.

## Consequences
- Retrieval is fast, explainable and fully deterministic, and the AI benchmark grades it in CI.
- It misses paraphrases with no shared words. Claude's tool use covers many of those when live, and the benchmark keeps a paraphrase case to show the gap.
- At thousands of documents, a hybrid lexical-and-vector index behind the same `search_policies` tool would be the next step, with no change for callers.

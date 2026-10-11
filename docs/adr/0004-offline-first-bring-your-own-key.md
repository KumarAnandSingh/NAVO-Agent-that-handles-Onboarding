# 0004. Offline by default, with visitors bringing their own Claude key

Status: Accepted

## Context
The hosted demo is public. A server-side API key in a public demo is a cost and abuse risk, and the competition doesn't require live AI. Reviewers should still be able to see real Claude behaviour.

## Decision
- Every AI feature has a deterministic fallback, so the demo is complete with no key.
- The deployment runs offline by default.
- A visitor can connect their own Anthropic key in the app. It is tested for free with the Models API.
- The key is kept in the browser tab (`sessionStorage`) and sent only in a header with Navo's own API calls. The server uses it for that request, never stores or logs it, and a test checks this.
- A deployment can still set its own key, protected by a daily call budget. `NAVO_BYOK=off` disables visitor keys.

## Consequences
- The hosted demo costs nothing to run, and live AI is one step away for anyone with a key.
- The browser holds the key while the tab is open, so cross-site scripting protection matters. Mitigations:
  - the app loads no third-party scripts and renders no raw HTML (React escapes all text);
  - the key is cleared when the tab closes.
- The global budget applies to the deployment's key only; a visitor's key is capped per workspace.

/**
 * Bring your own key: a visitor can connect their own Claude API key to try live AI on a
 * deployment that runs offline. The browser keeps it in sessionStorage and sends it in this
 * header; the server uses it for that request only and never stores or logs it.
 */
export const CLAUDE_KEY_HEADER = "x-navo-claude-key";

/** The shape of an Anthropic API key, checked before the key is used. */
export const CLAUDE_KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

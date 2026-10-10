/**
 * The visitor's own Claude key, kept in sessionStorage: it lives only in this browser tab
 * and is gone when the tab closes. Sent in a header with Navo's own API calls, nowhere else.
 * Storage can be blocked (private windows, strict settings), so every access is guarded.
 */
import { CLAUDE_KEY_HEADER } from "@/lib/claude-key";

const STORAGE_KEY = "navo.claudeKey";

export function readClaudeKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveClaudeKey(key: string): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
    return true;
  } catch {
    return false;
  }
}

export function forgetClaudeKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Headers carrying the key, or none when no key is connected. */
export function keyHeaders(key: string | null = readClaudeKey()): Record<string, string> {
  return key ? { [CLAUDE_KEY_HEADER]: key } : {};
}

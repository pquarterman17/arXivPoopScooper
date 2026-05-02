/**
 * Inbox persistence — localStorage save/load for the staged-paper inbox.
 *
 * Extracted from paper_scraper.html boot block (lines 1564–1581 pre-refactor)
 * as part of plan #9 Phase B. Two functions, one localStorage key.
 *
 * **State coupling:** both functions read/write `globalThis.inbox`, which
 * the boot block declares as `var` so the binding shows up on globalThis.
 * (A top-level `let` in a classic <script> is script-scoped only — module
 * code can't reach it. The `var` upgrade is the minimum surgical change to
 * let extraction work without rewriting every `inbox = ...` call site.)
 *
 * Module loaded once via main.js's import. The public API is shimmed onto
 * window so legacy callers (the dozen `saveInbox()` calls in the boot
 * block) keep resolving.
 */

const KEY = 'scq-scraper-inbox';

export function saveInbox() {
  try {
    localStorage.setItem(KEY, JSON.stringify(globalThis.inbox ?? []));
  } catch (e) {
    console.warn('[Scraper] Failed to save inbox:', e.message);
  }
}

export function loadInbox() {
  try {
    globalThis.inbox = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    globalThis.inbox = [];
  }
}

// Window shims so legacy boot-block call sites (saveInbox(), loadInbox())
// keep resolving. A `var` declaration of `inbox` in the boot block makes
// `globalThis.inbox` and the boot block's `inbox` the same slot.
globalThis.saveInbox = saveInbox;
globalThis.loadInbox = loadInbox;

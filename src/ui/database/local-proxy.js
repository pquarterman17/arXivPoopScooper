/**
 * arXiv-fetch helper that prefers the local serve.py proxy.
 *
 * Extracted from paper_database.html boot block (lines 227–248 pre-refactor)
 * as part of plan #8 boot-block polish. Three small functions:
 *
 *   - isLocalhost()          — true if we're served via http://localhost
 *                              or http://127.0.0.1, false otherwise.
 *   - toLocalProxy(url)      — translate an arxiv.org/api/query URL to the
 *                              equivalent /api/arxiv?... path on serve.py.
 *                              Returns null for any other URL.
 *   - arxivFetch(url)        — when localhost, try the local proxy first
 *                              (avoids CORS, sets a real User-Agent server
 *                              side); fall back to direct fetch on any
 *                              error or when not localhost.
 *
 * Two existing modules (add-website-modal.js, suggestions-banner.js)
 * already consume `globalThis.arxivFetch`. Pre-extraction they depended
 * on the inline boot block's identically-named function being defined
 * before module evaluation. Post-extraction the dependency is explicit:
 * main.js imports this module and the boot block reads it through the
 * shim. The two-underscore prefixes from the original (`_isLocalhost`,
 * `_toLocalProxy`) are preserved on globalThis to keep any existing
 * boot-block reads resolving.
 */

export function isLocalhost() {
  const h = globalThis.location?.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function toLocalProxy(url) {
  const m = String(url).match(/https?:\/\/(?:export\.)?arxiv\.org\/api\/query\?(.*)/);
  if (m) return `/api/arxiv?${m[1]}`;
  return null;
}

export async function arxivFetch(url) {
  if (isLocalhost()) {
    const local = toLocalProxy(url);
    if (local) {
      try {
        const resp = await fetch(local);
        if (resp.ok) return resp;
        // Non-OK: fall through to direct
      } catch {
        // Network error against the local proxy — fall through to direct
      }
    }
  }
  return fetch(url);
}

// Window shims. The two-underscore variants keep any existing boot-block
// reference resolving — pre-refactor they were the canonical names in
// paper_database.html.
globalThis.arxivFetch = arxivFetch;
globalThis._isLocalhost = isLocalhost;
globalThis._toLocalProxy = toLocalProxy;

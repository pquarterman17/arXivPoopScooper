/**
 * Network helpers for the scraper UI: localhost detection, local-proxy URL
 * rewriting, and the corsFetch wrapper that picks the right path.
 *
 * Extracted from paper_scraper.html boot block (lines 375–453 pre-refactor)
 * as part of plan #9 Phase B. Note this is a *different* implementation
 * from src/ui/database/local-proxy.js — the scraper version handles three
 * upstream hosts (arxiv, crossref-search, crossref-DOI) and falls back to
 * public CORS proxies when not localhost. The database version only knows
 * about arxiv. They could be unified eventually, but that needs an audit
 * of every caller's expectations on resp.ok / thrown errors first.
 *
 * Why a separate file from local-proxy.js: the surface is different (3
 * upstream hosts vs. 1; throws on total failure vs. always returning a
 * Response) and the call sites are scoped to their own pages. Sharing
 * would either complicate this module or change one of the two surfaces.
 */

// Two CORS proxies, tried in order when direct fetch fails. allorigins is
// the more reliable of the two; corsproxy.io is the fallback.
export const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

export function isLocalhost() {
  const h = globalThis.location?.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * Translate an upstream API URL to the equivalent serve.py proxy path.
 * Returns null when the URL doesn't match any known upstream — caller
 * should fall back to direct fetch in that case.
 */
export function toLocalProxy(url) {
  const s = String(url);
  const arxiv = s.match(/https?:\/\/(?:export\.)?arxiv\.org\/api\/query\?(.*)/);
  if (arxiv) return `/api/arxiv?${arxiv[1]}`;
  const crSearch = s.match(/https?:\/\/api\.crossref\.org\/works\?(.*)/);
  if (crSearch) return `/api/crossref/search?${crSearch[1]}`;
  const crDoi = s.match(/https?:\/\/api\.crossref\.org\/works\/(.+)/);
  if (crDoi) return `/api/crossref/${crDoi[1]}`;
  return null;
}

/**
 * Fetch a URL via the best available path:
 *   - On localhost with a known upstream: local proxy only (return its
 *     Response unconditionally — caller checks resp.ok). Proxy errors
 *     should fail fast rather than silently fall through to public CORS
 *     proxies, which would just timeout for localhost-only deployments.
 *   - Otherwise: try direct, then each CORS_PROXY in order. Each attempt
 *     has an 8s timeout. Throws AggregateError-style message if none
 *     succeed.
 *
 * Caller contract: returns a Response on success (resp.ok may be false
 * for HTTP 4xx/5xx — caller's responsibility); throws Error on total
 * network failure.
 */
export async function corsFetch(url) {
  if (isLocalhost()) {
    const local = toLocalProxy(url);
    if (local) {
      const resp = await fetch(local);
      return resp;
    }
  }

  const errors = [];
  const TIMEOUT = 8000;

  async function timedFetch(fetchUrl, label) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const resp = await fetch(fetchUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) return resp;
      errors.push(`${label}: HTTP ${resp.status}`);
    } catch (e) {
      clearTimeout(timer);
      const msg = e.name === 'AbortError' ? 'timeout' : e.message;
      errors.push(`${label}: ${msg}`);
    }
    return null;
  }

  const direct = await timedFetch(url, 'Direct');
  if (direct) return direct;

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const resp = await timedFetch(CORS_PROXIES[i](url), `Proxy ${i + 1}`);
    if (resp) return resp;
  }

  throw new Error(`All sources failed.\n${errors.join('\n')}`);
}

// Window shims for the boot-block callers (5 corsFetch + 2 isLocalhost
// references) and for connection-test.js, which reads globalThis.CORS_PROXIES
// to enumerate which paths to probe.
globalThis.corsFetch = corsFetch;
globalThis.isLocalhost = isLocalhost;
globalThis.toLocalProxy = toLocalProxy;
globalThis.CORS_PROXIES = CORS_PROXIES;

/**
 * Scraper connection-test panel.
 *
 * Probes arXiv via each available fetch path (local proxy on localhost;
 * direct + CORS proxies otherwise) and renders the result into the
 * `#conn-status` / `#conn-details` / `#conn-retest` elements at the top
 * of paper_scraper.html.
 *
 * Extracted from paper_scraper.html boot block (lines 455–528 pre-refactor)
 * as part of plan #9 Phase B. Imports `CORS_PROXIES` + `isLocalhost`
 * directly from cors-fetch.js — both modules live in the same dir so the
 * dependency is explicit (not via globalThis).
 *
 * Single public entry point: `runConnectionTest()`. Shimmed onto
 * globalThis so the boot block's `setTimeout(runConnectionTest, 500)` at
 * page-load + the `data-action="runConnectionTest"` listener (registered
 * in main.js's ACTIONS) both resolve to the same function.
 */

import { CORS_PROXIES, isLocalhost } from './cors-fetch.js';

// One-paper lookup is much lighter on rate limits than a search query.
const ARXIV_TEST_QUERY = 'id_list=2401.00001&max_results=1';
const ARXIV_TEST_URL = `https://arxiv.org/api/query?${ARXIV_TEST_QUERY}`;

async function probeOnePath(label, fetchUrl, timeout = 8000) {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const resp = await fetch(fetchUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - t0);
    if (resp.ok) return { label, ok: true, ms };
    return { label, ok: false, error: `HTTP ${resp.status}`, ms };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const msg = e.name === 'AbortError' ? 'timeout' : e.message || 'NetworkError';
    return { label, ok: false, error: msg, ms };
  }
}

export async function runConnectionTest() {
  const statusEl = document.getElementById('conn-status');
  const detailsEl = document.getElementById('conn-details');
  const retestEl = document.getElementById('conn-retest');
  if (!statusEl || !detailsEl || !retestEl) return;

  statusEl.textContent = 'testing...';
  statusEl.style.color = 'var(--text2)';
  retestEl.style.display = 'none';
  detailsEl.style.display = 'none';

  // Only probe the path that's actually used in production for this host
  // — no need to probe all 4 every time.
  const probes = [];
  if (isLocalhost()) {
    probes.push(probeOnePath('Local proxy', `/api/arxiv?${ARXIV_TEST_QUERY}`));
  } else {
    probes.push(probeOnePath('Direct', ARXIV_TEST_URL));
    CORS_PROXIES.forEach((fn, i) =>
      probes.push(probeOnePath(`Proxy ${i + 1}`, fn(ARXIV_TEST_URL)))
    );
  }

  const results = await Promise.all(probes);
  const working = results.filter(r => r.ok);

  if (working.length > 0) {
    const best = working.sort((a, b) => a.ms - b.ms)[0];
    statusEl.innerHTML = `<span style="color:var(--green)">connected</span> <span style="color:var(--text3)">(${best.label}, ${best.ms}ms)</span>`;
  } else if (window.location.protocol === 'file:') {
    statusEl.innerHTML = `<span style="color:var(--orange)">blocked (file://)</span>`;
  } else {
    statusEl.innerHTML = `<span style="color:var(--red)">unreachable</span>`;
  }

  detailsEl.innerHTML = results.map(r => {
    const icon = r.ok
      ? '<span style="color:var(--green)">&#10003;</span>'
      : '<span style="color:var(--red)">&#10007;</span>';
    const info = r.ok ? `${r.ms}ms` : r.error;
    return `${icon} ${r.label}: ${info}`;
  }).join('<br>') + `<br><span style="color:var(--text3)">Protocol: ${window.location.protocol}</span>`;

  detailsEl.style.display = 'block';
  retestEl.style.display = 'inline';
}

globalThis.runConnectionTest = runConnectionTest;

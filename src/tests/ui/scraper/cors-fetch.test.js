// @vitest-environment jsdom

/**
 * Plan #9 Phase B — extraction regression for cors-fetch.js.
 *
 * Mocks the global `fetch` to exercise each branch:
 *   - Localhost + known upstream  -> local proxy only (no fallback)
 *   - Localhost + unknown URL     -> falls through to direct
 *   - Non-localhost + ok direct   -> direct only
 *   - Non-localhost + direct fail -> tries CORS proxies in order
 *   - Total failure               -> throws AggregateError-style message
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let _origFetch;
beforeEach(() => {
  for (const k of ['corsFetch', 'isLocalhost', 'toLocalProxy', 'CORS_PROXIES']) {
    delete globalThis[k];
  }
  _origFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = _origFetch;
});

async function load() {
  return await import('../../../ui/scraper/cors-fetch.js?v=' + Math.random());
}

function setHostname(hostname) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(`http://${hostname}/`),
  });
}

describe('toLocalProxy', () => {
  it('rewrites arxiv.org/api/query', async () => {
    const { toLocalProxy } = await load();
    expect(toLocalProxy('http://arxiv.org/api/query?id_list=2401.00001'))
      .toBe('/api/arxiv?id_list=2401.00001');
  });

  it('rewrites export.arxiv.org subdomain', async () => {
    const { toLocalProxy } = await load();
    expect(toLocalProxy('https://export.arxiv.org/api/query?cat=q'))
      .toBe('/api/arxiv?cat=q');
  });

  it('rewrites crossref search endpoint', async () => {
    const { toLocalProxy } = await load();
    expect(toLocalProxy('https://api.crossref.org/works?query=transmon'))
      .toBe('/api/crossref/search?query=transmon');
  });

  it('rewrites crossref DOI endpoint', async () => {
    const { toLocalProxy } = await load();
    expect(toLocalProxy('https://api.crossref.org/works/10.1103/PhysRevB.99.012345'))
      .toBe('/api/crossref/10.1103/PhysRevB.99.012345');
  });

  it('returns null for unrelated URLs', async () => {
    const { toLocalProxy } = await load();
    expect(toLocalProxy('https://example.com/foo')).toBe(null);
  });
});

describe('isLocalhost', () => {
  it.each(['localhost', '127.0.0.1'])('returns true for %s', async (h) => {
    setHostname(h);
    const { isLocalhost } = await load();
    expect(isLocalhost()).toBe(true);
  });

  it('returns false for github.io', async () => {
    setHostname('pquarterman17.github.io');
    const { isLocalhost } = await load();
    expect(isLocalhost()).toBe(false);
  });
});

describe('corsFetch', () => {
  it('uses local proxy on localhost for known upstream and returns whatever it gets', async () => {
    setHostname('localhost');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, _from: 'proxy' });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    const resp = await corsFetch('http://arxiv.org/api/query?id_list=x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/arxiv?id_list=x');
    // Note: resp.ok is false but corsFetch returns it anyway — caller checks
    expect(resp._from).toBe('proxy');
  });

  it('on localhost with non-arxiv URL, falls through to direct', async () => {
    setHostname('localhost');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, _from: 'direct' });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    const resp = await corsFetch('https://example.com/foo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/foo');
    expect(resp._from).toBe('direct');
  });

  it('non-localhost: direct OK -> returns direct, does not try proxies', async () => {
    setHostname('pquarterman17.github.io');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, _from: 'direct' });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    const resp = await corsFetch('http://arxiv.org/api/query?id_list=x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resp._from).toBe('direct');
  });

  it('non-localhost: direct fails, falls back through both CORS proxies in order', async () => {
    setHostname('pquarterman17.github.io');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })   // direct fails
      .mockResolvedValueOnce({ ok: false, status: 503 })   // proxy 1 fails
      .mockResolvedValueOnce({ ok: true, _from: 'proxy 2' });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    const resp = await corsFetch('http://arxiv.org/api/query?id_list=x');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('allorigins.win');
    expect(fetchMock.mock.calls[2][0]).toContain('corsproxy.io');
    expect(resp._from).toBe('proxy 2');
  });

  it('non-localhost: all paths fail -> throws with combined error list', async () => {
    setHostname('pquarterman17.github.io');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 504 });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    await expect(corsFetch('http://arxiv.org/api/query?id_list=x'))
      .rejects.toThrow(/All sources failed/);
  });

  it('non-localhost: thrown errors get classified (timeout vs message)', async () => {
    setHostname('pquarterman17.github.io');
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(abortErr)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, _from: 'proxy 2' });
    globalThis.fetch = fetchMock;
    const { corsFetch } = await load();
    const resp = await corsFetch('http://arxiv.org/api/query?id_list=x');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(resp._from).toBe('proxy 2');
  });
});

describe('window shims', () => {
  it('exposes corsFetch + isLocalhost + toLocalProxy + CORS_PROXIES at import', async () => {
    await load();
    expect(typeof globalThis.corsFetch).toBe('function');
    expect(typeof globalThis.isLocalhost).toBe('function');
    expect(typeof globalThis.toLocalProxy).toBe('function');
    expect(Array.isArray(globalThis.CORS_PROXIES)).toBe(true);
    expect(globalThis.CORS_PROXIES.length).toBe(2);
  });
});

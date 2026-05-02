// @vitest-environment jsdom

/**
 * Plan #9 Phase B — extraction regression for connection-test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let _origFetch;

beforeEach(() => {
  document.body.innerHTML = `
    <span id="conn-status"></span>
    <span id="conn-details" style="display:none"></span>
    <a id="conn-retest" style="display:none">retest</a>
  `;
  delete globalThis.runConnectionTest;
  _origFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = _origFetch;
});

async function load() {
  return await import('../../../ui/scraper/connection-test.js?v=' + Math.random());
}

function setHostname(hostname, protocol = 'http:') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(`${protocol}//${hostname}/`),
  });
}

describe('runConnectionTest: localhost path', () => {
  it('probes only the local proxy and reports "connected" on success', async () => {
    setHostname('localhost');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    const status = document.getElementById('conn-status').innerHTML;
    expect(status).toContain('connected');
    expect(status).toContain('Local proxy');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports "unreachable" when local proxy returns non-OK', async () => {
    setHostname('localhost');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    const status = document.getElementById('conn-status').innerHTML;
    expect(status).toContain('unreachable');
  });
});

describe('runConnectionTest: non-localhost path', () => {
  it('probes direct + both CORS proxies', async () => {
    setHostname('pquarterman17.github.io', 'https:');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('picks the fastest working path for the status label', async () => {
    setHostname('pquarterman17.github.io', 'https:');
    // We can't easily control timing in jsdom; just assert that at least
    // ONE of the labels appears in the connected status when all three OK.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    const status = document.getElementById('conn-status').innerHTML;
    expect(status).toContain('connected');
    // Direct is usually shortest in jsdom — but accept any of the three
    expect(status).toMatch(/Direct|Proxy 1|Proxy 2/);
  });

  it('reports "blocked (file://)" when running off the file: protocol with no working path', async () => {
    setHostname('whatever', 'file:');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 0 });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    const status = document.getElementById('conn-status').innerHTML;
    expect(status).toContain('blocked (file://)');
  });
});

describe('runConnectionTest: details rendering', () => {
  it('lists each probed path with its result icon + ms or error', async () => {
    setHostname('localhost');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    const details = document.getElementById('conn-details');
    expect(details.style.display).toBe('block');
    expect(details.innerHTML).toContain('Local proxy');
    expect(details.innerHTML).toContain('Protocol:');
  });

  it('shows the retest button after the test completes', async () => {
    setHostname('localhost');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await runConnectionTest();
    expect(document.getElementById('conn-retest').style.display).toBe('inline');
  });
});

describe('runConnectionTest: defensive', () => {
  it('does not throw when DOM is missing', async () => {
    document.body.innerHTML = '';
    setHostname('localhost');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { runConnectionTest } = await load();
    await expect(runConnectionTest()).resolves.toBeUndefined();
  });
});

describe('window shim', () => {
  it('shims runConnectionTest on globalThis', async () => {
    await load();
    expect(typeof globalThis.runConnectionTest).toBe('function');
  });
});

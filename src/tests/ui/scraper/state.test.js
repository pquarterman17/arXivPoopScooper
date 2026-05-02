// @vitest-environment jsdom

/**
 * Plan #9 Phase B — state.js manifest contract.
 *
 * state.js doesn't own storage (the boot block's `var` declarations do),
 * but it documents the manifest of cross-module bindings and provides
 * an idempotent initState() that backfills safe defaults.
 */

import { describe, it, expect, beforeEach } from 'vitest';

const NAMES = [
  'searchResults', 'selectedIdxs', 'inbox', 'savedQueries', 'existingIds',
  'quickResults', 'quickSelected', 'activeSources',
  'dbReady', 'lastFetchTime',
];

beforeEach(() => {
  for (const k of NAMES) delete globalThis[k];
  delete globalThis.initState;
});

async function load() {
  return await import('../../../ui/scraper/state.js?v=' + Math.random());
}

describe('state manifest', () => {
  it('stateNames() returns all 10 documented bindings', async () => {
    const { stateNames } = await load();
    const names = stateNames();
    expect(names).toEqual(NAMES);
  });

  it('returned array is a copy, not a reference to internal state', async () => {
    const { stateNames } = await load();
    stateNames().push('not-in-manifest');
    expect(stateNames()).toEqual(NAMES);
  });
});

describe('initState', () => {
  it('initialises every undefined binding to a typed default', async () => {
    const { initState } = await load();
    initState();
    expect(globalThis.searchResults).toEqual([]);
    expect(globalThis.selectedIdxs).toBeInstanceOf(Set);
    expect(globalThis.inbox).toEqual([]);
    expect(globalThis.savedQueries).toEqual([]);
    expect(globalThis.existingIds).toBeInstanceOf(Set);
    expect(globalThis.quickResults).toEqual([]);
    expect(globalThis.quickSelected).toBeInstanceOf(Set);
    expect(globalThis.activeSources).toEqual({});
    expect(globalThis.dbReady).toBe(false);
    expect(globalThis.lastFetchTime).toBe(null);
  });

  it('preserves existing values (idempotent on repeated call)', async () => {
    globalThis.inbox = [{ id: 'pinned' }];
    globalThis.dbReady = true;
    const { initState } = await load();
    initState();
    expect(globalThis.inbox).toEqual([{ id: 'pinned' }]);
    expect(globalThis.dbReady).toBe(true);
  });
});

describe('window shim', () => {
  it('shims initState onto globalThis', async () => {
    await load();
    expect(typeof globalThis.initState).toBe('function');
  });
});

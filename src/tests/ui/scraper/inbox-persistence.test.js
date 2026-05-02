// @vitest-environment jsdom

/**
 * Plan #9 Phase B — extraction regression for inbox-persistence.js.
 *
 * The module reads/writes globalThis.inbox via localStorage. These tests
 * lock the on-disk format (single key, JSON-encoded array) and the
 * import-time window-shim contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  delete globalThis.inbox;
  delete globalThis.saveInbox;
  delete globalThis.loadInbox;
});

async function load() {
  // Re-import each test so the side-effect window shims fire fresh on
  // top of the cleared globals.
  return await import('../../../ui/scraper/inbox-persistence.js?v=' + Math.random());
}

describe('inbox-persistence', () => {
  it('shims saveInbox + loadInbox onto globalThis at import time', async () => {
    await load();
    expect(typeof globalThis.saveInbox).toBe('function');
    expect(typeof globalThis.loadInbox).toBe('function');
  });

  it('saveInbox writes globalThis.inbox to the canonical key', async () => {
    const mod = await load();
    globalThis.inbox = [{ id: '2401.00001', title: 'A' }];
    mod.saveInbox();
    const stored = JSON.parse(localStorage.getItem('scq-scraper-inbox'));
    expect(stored).toEqual([{ id: '2401.00001', title: 'A' }]);
  });

  it('saveInbox treats undefined globalThis.inbox as empty array', async () => {
    const mod = await load();
    globalThis.inbox = undefined;
    mod.saveInbox();
    expect(localStorage.getItem('scq-scraper-inbox')).toBe('[]');
  });

  it('loadInbox populates globalThis.inbox from localStorage', async () => {
    localStorage.setItem('scq-scraper-inbox', JSON.stringify([{ id: 'x' }]));
    const mod = await load();
    mod.loadInbox();
    expect(globalThis.inbox).toEqual([{ id: 'x' }]);
  });

  it('loadInbox falls back to [] on missing key', async () => {
    const mod = await load();
    mod.loadInbox();
    expect(globalThis.inbox).toEqual([]);
  });

  it('loadInbox falls back to [] on corrupt JSON without throwing', async () => {
    localStorage.setItem('scq-scraper-inbox', '{not json');
    const mod = await load();
    expect(() => mod.loadInbox()).not.toThrow();
    expect(globalThis.inbox).toEqual([]);
  });

  it('saveInbox swallows quota-exceeded without throwing', async () => {
    const mod = await load();
    globalThis.inbox = [{ id: 'x' }];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };
    try {
      expect(() => mod.saveInbox()).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('round-trip preserves inbox structure', async () => {
    const mod = await load();
    const original = [
      { id: '2401.00001', title: 'A', selected: true },
      { id: '2401.00002', title: 'B', tags: ['x', 'y'] },
    ];
    globalThis.inbox = original;
    mod.saveInbox();
    globalThis.inbox = undefined;  // wipe in-memory
    mod.loadInbox();
    expect(globalThis.inbox).toEqual(original);
  });
});

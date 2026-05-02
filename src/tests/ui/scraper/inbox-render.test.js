// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SHIMS = ['renderInbox', 'updateInboxNote', 'approveOne', 'dismissOne',
               'approveAll', 'clearInbox'];

beforeEach(() => {
  for (const k of [...SHIMS, 'inbox', 'dbReady', 'CFG', 'esc',
                   'addPaperToDB', 'saveInbox', 'updateInboxBadge',
                   'updateStats']) {
    delete globalThis[k];
  }
  document.body.innerHTML = `
    <div id="inbox-list"></div>
    <div id="search-status"></div>
  `;
  globalThis.CFG = { sources: { arxiv: { label: 'arXiv' } } };
  globalThis.esc = (s) => String(s ?? '');
  globalThis.saveInbox = vi.fn();
  globalThis.updateInboxBadge = vi.fn();
  globalThis.updateStats = vi.fn();
  globalThis.addPaperToDB = vi.fn();
});

async function load() {
  return await import('../../../ui/scraper/inbox-render.js?v=' + Math.random());
}

describe('window shims', () => {
  it('exposes all 6 functions on globalThis', async () => {
    await load();
    for (const name of SHIMS) {
      expect(typeof globalThis[name]).toBe('function');
    }
  });
});

describe('renderInbox', () => {
  it('renders empty-state when inbox is empty', async () => {
    globalThis.inbox = [];
    await load();
    globalThis.renderInbox();
    expect(document.getElementById('inbox-list').innerHTML).toContain('Inbox is empty');
  });

  it('renders one card per paper with title + id + actions', async () => {
    globalThis.inbox = [
      { id: '2401.00001', title: 'A', shortAuthors: 'Smith', year: 2024,
        summary: 's', source: 'arxiv', tags: [], url: 'http://x' },
    ];
    await load();
    globalThis.renderInbox();
    const html = document.getElementById('inbox-list').innerHTML;
    expect(html).toContain('A');
    expect(html).toContain('2401.00001');
    expect(html).toContain('data-action="approveOne"');
    expect(html).toContain('data-action="dismissOne"');
  });
});

describe('updateInboxNote', () => {
  it('writes the note onto the matching inbox entry + saves', async () => {
    globalThis.inbox = [{ id: 'x', note: '' }];
    await load();
    globalThis.updateInboxNote(0, 'follow up');
    expect(globalThis.inbox[0].note).toBe('follow up');
    expect(globalThis.saveInbox).toHaveBeenCalled();
  });

  it('is a no-op for an out-of-range index', async () => {
    globalThis.inbox = [];
    await load();
    expect(() => globalThis.updateInboxNote(99, 'x')).not.toThrow();
    expect(globalThis.saveInbox).not.toHaveBeenCalled();
  });
});

describe('approveOne', () => {
  it('does nothing when dbReady is false', async () => {
    globalThis.inbox = [{ id: 'x', source: 'arxiv' }];
    globalThis.dbReady = false;
    await load();
    globalThis.approveOne(0);
    expect(globalThis.addPaperToDB).not.toHaveBeenCalled();
    expect(globalThis.inbox.length).toBe(1);
  });

  it('adds to DB, removes from inbox, and refreshes UI when dbReady', async () => {
    globalThis.inbox = [{ id: 'x', title: 'T', source: 'arxiv' }];
    globalThis.dbReady = true;
    await load();
    globalThis.approveOne(0);
    expect(globalThis.addPaperToDB).toHaveBeenCalledWith({ id: 'x', title: 'T', source: 'arxiv' });
    expect(globalThis.inbox.length).toBe(0);
    expect(globalThis.updateStats).toHaveBeenCalled();
  });
});

describe('dismissOne', () => {
  it('splices the entry out and refreshes', async () => {
    globalThis.inbox = [{ id: 'a', source: 'arxiv' }, { id: 'b', source: 'arxiv' }];
    await load();
    globalThis.dismissOne(0);
    expect(globalThis.inbox.length).toBe(1);
    expect(globalThis.inbox[0].id).toBe('b');
  });
});

describe('approveAll + clearInbox', () => {
  it('approveAll adds every paper + empties + reports count', async () => {
    globalThis.inbox = [{ id: 'a', source: 'arxiv' }, { id: 'b', source: 'arxiv' }];
    globalThis.dbReady = true;
    await load();
    globalThis.approveAll();
    expect(globalThis.addPaperToDB).toHaveBeenCalledTimes(2);
    expect(globalThis.inbox).toEqual([]);
    expect(document.getElementById('search-status').textContent).toContain('Added 2 papers');
  });

  it('approveAll does nothing when dbReady=false', async () => {
    globalThis.inbox = [{ id: 'a', source: 'arxiv' }];
    globalThis.dbReady = false;
    await load();
    globalThis.approveAll();
    expect(globalThis.addPaperToDB).not.toHaveBeenCalled();
    expect(globalThis.inbox.length).toBe(1);
  });

  it('clearInbox empties on confirm', async () => {
    globalThis.inbox = [{ id: 'a', source: 'arxiv' }, { id: 'b', source: 'arxiv' }];
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await load();
    globalThis.clearInbox();
    expect(globalThis.inbox).toEqual([]);
  });

  it('clearInbox cancels on user reject', async () => {
    globalThis.inbox = [{ id: 'a', source: 'arxiv' }];
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    await load();
    globalThis.clearInbox();
    expect(globalThis.inbox.length).toBe(1);
  });
});

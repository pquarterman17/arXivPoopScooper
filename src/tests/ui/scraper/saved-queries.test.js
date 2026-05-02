// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SHIMS = ['loadSavedQueries', 'saveSavedQueries', 'renderSavedQueries',
               'openAddQueryModal', 'closeModal', 'confirmSaveQuery',
               'saveCurrentSearch', 'removeSavedQuery', 'runSavedQuery',
               'runAllSavedQueries'];

beforeEach(() => {
  for (const k of [...SHIMS, 'savedQueries', 'activeSources', 'CFG', 'esc',
                   'switchTab', 'doSearch', 'searchArxiv', 'searchCrossref',
                   'searchPhysRev', 'existingIds', 'inbox', 'saveInbox',
                   'updateInboxBadge', 'updateStats', 'lastFetchTime']) {
    delete globalThis[k];
  }
  localStorage.clear();
  document.body.innerHTML = `
    <input id="search-input" />
    <input id="modal-query" />
    <select id="modal-source"><option value="arxiv">arxiv</option></select>
    <div id="query-modal"></div>
    <div id="saved-queries-list"></div>
  `;
  globalThis.CFG = { sources: { arxiv: { label: 'arXiv' } } };
  globalThis.esc = (s) => String(s ?? '');
  globalThis.savedQueries = [];
  globalThis.activeSources = { arxiv: true };
});

async function load() {
  return await import('../../../ui/scraper/saved-queries.js?v=' + Math.random());
}

describe('window shims', () => {
  it('exposes all 10 functions on globalThis', async () => {
    await load();
    for (const name of SHIMS) {
      expect(typeof globalThis[name]).toBe('function');
    }
  });
});

describe('persistence', () => {
  it('saveSavedQueries + loadSavedQueries round-trip via localStorage', async () => {
    await load();
    globalThis.savedQueries = [{ query: 'transmon', source: 'arxiv' }];
    globalThis.saveSavedQueries();
    globalThis.savedQueries = [];
    globalThis.loadSavedQueries();
    expect(globalThis.savedQueries).toEqual([{ query: 'transmon', source: 'arxiv' }]);
  });

  it('loadSavedQueries falls back to [] on missing key', async () => {
    await load();
    globalThis.loadSavedQueries();
    expect(globalThis.savedQueries).toEqual([]);
  });

  it('loadSavedQueries falls back to [] on corrupt JSON without throwing', async () => {
    localStorage.setItem('scq-scraper-queries', '{not json');
    await load();
    expect(() => globalThis.loadSavedQueries()).not.toThrow();
    expect(globalThis.savedQueries).toEqual([]);
  });
});

describe('renderSavedQueries', () => {
  it('renders empty-state on empty list', async () => {
    await load();
    globalThis.renderSavedQueries();
    expect(document.getElementById('saved-queries-list').innerHTML)
      .toContain('No saved queries yet');
  });

  it('renders one row per saved query with the right data attrs', async () => {
    globalThis.savedQueries = [
      { query: 'transmon', source: 'arxiv' },
      { query: 'tantalum', source: 'arxiv' },
    ];
    await load();
    globalThis.renderSavedQueries();
    const html = document.getElementById('saved-queries-list').innerHTML;
    expect(html).toContain('data-action="runSavedQuery"');
    expect(html).toContain('data-action="removeSavedQueryStop"');
    expect(html).toContain('transmon');
    expect(html).toContain('tantalum');
  });
});

describe('add/remove/save flows', () => {
  it('confirmSaveQuery pushes a new entry, dedupes, closes modal', async () => {
    document.getElementById('modal-query').value = 'transmon';
    await load();
    globalThis.confirmSaveQuery();
    expect(globalThis.savedQueries).toEqual([{ query: 'transmon', source: 'arxiv' }]);

    // Second call with same value: no duplicate
    globalThis.confirmSaveQuery();
    expect(globalThis.savedQueries.length).toBe(1);
  });

  it('saveCurrentSearch picks the active source', async () => {
    document.getElementById('search-input').value = 'qubit';
    globalThis.activeSources = { arxiv: false, prb: true };
    globalThis.CFG = { sources: { arxiv: {}, prb: {} } };
    await load();
    globalThis.saveCurrentSearch();
    expect(globalThis.savedQueries[0].source).toBe('prb');
  });

  it('removeSavedQuery splices + persists + rerenders', async () => {
    globalThis.savedQueries = [
      { query: 'a', source: 'arxiv' },
      { query: 'b', source: 'arxiv' },
    ];
    await load();
    globalThis.removeSavedQuery(0);
    expect(globalThis.savedQueries.length).toBe(1);
    expect(globalThis.savedQueries[0].query).toBe('b');
    expect(JSON.parse(localStorage.getItem('scq-scraper-queries')).length).toBe(1);
  });
});

describe('runSavedQuery', () => {
  it('writes the query into the search input, sets active source, switches tab, runs doSearch', async () => {
    globalThis.savedQueries = [{ query: 'transmon', source: 'arxiv' }];
    globalThis.switchTab = vi.fn();
    globalThis.doSearch = vi.fn().mockResolvedValue();
    await load();
    await globalThis.runSavedQuery(0);
    expect(document.getElementById('search-input').value).toBe('transmon');
    expect(globalThis.activeSources).toEqual({ arxiv: true });
    expect(globalThis.switchTab).toHaveBeenCalledWith('search');
    expect(globalThis.doSearch).toHaveBeenCalled();
  });
});

describe('runAllSavedQueries', () => {
  it('alerts when no queries are saved', async () => {
    const alertMock = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    await load();
    await globalThis.runAllSavedQueries();
    expect(alertMock).toHaveBeenCalled();
  });
});

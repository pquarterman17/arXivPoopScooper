// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SHIMS = ['quickSetQuery', 'quickDoSearch', 'quickToggleSelect',
               'quickSelectAll', 'quickSelectNone', 'quickUpdateSelectionCount',
               'quickToggleAbstract', 'quickRenderResults',
               'quickExportSelected', 'quickDownloadExport'];

beforeEach(() => {
  for (const k of [...SHIMS, 'quickResults', 'quickSelected', 'esc',
                   'getArxivSortParams', 'corsFetch', 'doSearch',
                   'showStatusError']) {
    delete globalThis[k];
  }
  document.body.innerHTML = `
    <input id="quick-search-input" />
    <input id="search-input" />
    <input id="year-from" />
    <input id="year-to" />
    <button id="quick-search-btn">Search</button>
    <select id="quick-sort-order"><option value="date-desc">date</option></select>
    <div id="quick-status"></div>
    <div id="quick-results"></div>
    <div id="quick-results-actions"></div>
    <span id="quick-selection-count"></span>
    <div id="quick-export-area"></div>
  `;
  globalThis.esc = (s) => String(s ?? '');
  globalThis.quickResults = [];
  globalThis.quickSelected = new Set();
});

async function load() {
  return await import('../../../ui/scraper/quick-search.js?v=' + Math.random());
}

describe('window shims', () => {
  it('exposes all 10 functions on globalThis', async () => {
    await load();
    for (const name of SHIMS) {
      expect(typeof globalThis[name]).toBe('function');
    }
  });
});

describe('selection helpers', () => {
  beforeEach(() => {
    globalThis.quickResults = [
      { arxivId: 'a', title: 'A', summary: '', year: 2024, authors: ['X'], categories: [] },
      { arxivId: 'b', title: 'B', summary: '', year: 2024, authors: ['Y'], categories: [] },
    ];
  });

  it('quickToggleSelect adds + removes', async () => {
    await load();
    globalThis.quickToggleSelect(0);
    expect(globalThis.quickSelected.has(0)).toBe(true);
    globalThis.quickToggleSelect(0);
    expect(globalThis.quickSelected.has(0)).toBe(false);
  });

  it('quickSelectAll selects every result', async () => {
    await load();
    globalThis.quickSelectAll();
    expect(globalThis.quickSelected.size).toBe(2);
  });

  it('quickSelectNone clears', async () => {
    await load();
    globalThis.quickSelected.add(0); globalThis.quickSelected.add(1);
    globalThis.quickSelectNone();
    expect(globalThis.quickSelected.size).toBe(0);
  });

  it('quickUpdateSelectionCount writes "<n> selected" into the count el', async () => {
    await load();
    globalThis.quickSelected.add(0);
    globalThis.quickUpdateSelectionCount();
    expect(document.getElementById('quick-selection-count').textContent).toBe('1 selected');
  });
});

describe('quickToggleAbstract', () => {
  it('toggles .collapsed on the matching abstract element', async () => {
    document.body.innerHTML += '<div id="quick-abstract-3" class="collapsed"></div>';
    await load();
    globalThis.quickToggleAbstract(3);
    expect(document.getElementById('quick-abstract-3').classList.contains('collapsed')).toBe(false);
  });

  it('is a no-op when the element is missing', async () => {
    await load();
    expect(() => globalThis.quickToggleAbstract(99)).not.toThrow();
  });
});

describe('quickExportSelected', () => {
  it('alerts when nothing is selected', async () => {
    await load();
    const alertMock = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    globalThis.quickExportSelected();
    expect(alertMock).toHaveBeenCalled();
  });

  it('renders the JSON export box for selected papers', async () => {
    globalThis.quickResults = [
      { arxivId: 'a', title: 'A', summary: 's', year: 2024, authors: ['X Y'], categories: ['quant-ph'] },
    ];
    globalThis.quickSelected = new Set([0]);
    await load();
    globalThis.quickExportSelected();
    const html = document.getElementById('quick-export-area').innerHTML;
    expect(html).toContain('Export for Claude');
    expect(html).toContain('quick-export-json');
  });
});

describe('quickRenderResults', () => {
  it('renders cards with arxivId, title, and tags', async () => {
    globalThis.quickResults = [
      { arxivId: '2401.00001', title: 'A', summary: '', year: 2024,
        authors: ['Smith'], categories: ['quant-ph'] },
    ];
    await load();
    globalThis.quickRenderResults();
    const html = document.getElementById('quick-results').innerHTML;
    expect(html).toContain('2401.00001');
    expect(html).toContain('quant-ph');
    expect(html).toContain('data-action="quickToggleSelect"');
  });
});

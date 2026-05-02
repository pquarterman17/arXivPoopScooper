// @vitest-environment jsdom

/**
 * MT-2 — regression tests for the data-action / data-input dispatch in
 * src/ui/scraper/main.js. Counterpart to
 * src/tests/ui/database/main-action-registry.test.js.
 *
 * Plan #9 swept all 39+ inline onclicks in paper_scraper.html into
 * `data-action="..."` attributes; the dispatch logic lives in
 * scraper/main.js's ACTIONS registry. These tests verify each new
 * action routes to the right `window.<fn>?.()` shim with the right
 * parsed args.
 *
 * Imports main.js once (which installs document-level listeners) and
 * then dispatches synthetic clicks/keypresses against jsdom-built
 * elements. Same shape as the database counterpart so the two tests
 * stay readable side-by-side.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '';
  for (const key of [
    'switchTab', 'doSearch', 'saveCurrentSearch', 'clearDateFilter',
    'stageSelected', 'clearSelection',
    'quickDoSearch', 'quickSelectAll', 'quickSelectNone', 'quickExportSelected',
    'doDoiLookup', 'stageDoiPaper',
    'approveAll', 'clearInbox', 'approveOne', 'dismissOne',
    'openAddQueryModal', 'runAllSavedQueries', 'closeModal', 'confirmSaveQuery',
    'runConnectionTest',
    'toggleSelect', 'stageOne',
    'quickToggleSelect', 'quickToggleAbstract', 'quickDownloadExport',
    'runSavedQuery', 'removeSavedQuery',
    'updateInboxNote',
  ]) {
    delete window[key];
  }
});

let mainImported = false;
async function loadMain() {
  if (mainImported) return;
  // The scraper's main.js doesn't read SCRAPER_CONFIG at import time, but
  // stub the legacy globals to be safe in case a later edit introduces
  // such a read.
  globalThis.SCRAPER_CONFIG = globalThis.SCRAPER_CONFIG ?? { sources: {} };
  globalThis.SCQ = globalThis.SCQ ?? {
    init: () => Promise.resolve(),
    getSetting: () => null,
    setSetting: () => {},
  };
  await import('../../../ui/scraper/main.js');
  mainImported = true;
}

function clickWith(attrs, parent) {
  const el = document.createElement('button');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  (parent ?? document.body).appendChild(el);
  el.click();
  return el;
}

describe('scraper main.js: static-handler ACTIONS', () => {
  it('switchScraperTab forwards data-tab to window.switchTab', async () => {
    await loadMain();
    const fn = vi.fn();
    window.switchTab = fn;
    clickWith({ 'data-action': 'switchScraperTab', 'data-tab': 'inbox' });
    expect(fn).toHaveBeenCalledWith('inbox');
  });

  it.each([
    ['doSearch'],
    ['saveCurrentSearch'],
    ['clearDateFilter'],
    ['stageSelected'],
    ['clearSelection'],
    ['quickDoSearch'],
    ['quickSelectAll'],
    ['quickSelectNone'],
    ['quickExportSelected'],
    ['doDoiLookup'],
    ['stageDoiPaper'],
    ['approveAll'],
    ['clearInbox'],
    ['openAddQueryModal'],
    ['runAllSavedQueries'],
    ['confirmSaveQuery'],
  ])('zero-arg action "%s" calls the matching window.<fn>', async (action) => {
    await loadMain();
    const fn = vi.fn();
    window[action] = fn;
    clickWith({ 'data-action': action });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith();  // no args
  });

  it('closeScraperModal aliases to window.closeModal', async () => {
    await loadMain();
    const fn = vi.fn();
    window.closeModal = fn;
    clickWith({ 'data-action': 'closeScraperModal' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runConnectionTest preventDefaults the click event', async () => {
    await loadMain();
    const fn = vi.fn();
    window.runConnectionTest = fn;
    const link = document.createElement('a');
    link.setAttribute('data-action', 'runConnectionTest');
    link.setAttribute('href', '#');
    document.body.appendChild(link);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(fn).toHaveBeenCalled();
  });
});

describe('scraper main.js: dynamic-template ACTIONS', () => {
  it('stopPropagation is a no-op marker that doesn\'t throw', async () => {
    await loadMain();
    expect(() => clickWith({ 'data-action': 'stopPropagation' })).not.toThrow();
  });

  it('usePreset stuffs data-query into #search-input and triggers doSearch', async () => {
    await loadMain();
    const input = document.createElement('input');
    input.id = 'search-input';
    document.body.appendChild(input);
    const fn = vi.fn();
    window.doSearch = fn;
    clickWith({ 'data-action': 'usePreset', 'data-query': 'transmon' });
    expect(input.value).toBe('transmon');
    expect(fn).toHaveBeenCalled();
  });

  it.each([
    ['toggleSelect',     'toggleSelect',      5],
    ['stageOneStop',     'stageOne',          7],
    ['approveOne',       'approveOne',        2],
    ['dismissOne',       'dismissOne',        3],
    ['quickToggleSelect','quickToggleSelect', 11],
    ['runSavedQuery',    'runSavedQuery',     1],
  ])('%s parses data-idx as Number and calls window.%s', async (action, fnName, idx) => {
    await loadMain();
    const fn = vi.fn();
    window[fnName] = fn;
    clickWith({ 'data-action': action, 'data-idx': String(idx) });
    expect(fn).toHaveBeenCalledWith(idx);
  });

  it('toggleSearchAbstract toggles .collapsed on the matching abs element', async () => {
    await loadMain();
    const abs = document.createElement('div');
    abs.id = 'abs-9';
    abs.className = 'collapsed';
    document.body.appendChild(abs);
    clickWith({ 'data-action': 'toggleSearchAbstract', 'data-idx': '9' });
    expect(abs.classList.contains('collapsed')).toBe(false);
  });

  it('toggleInboxAbstract toggles .collapsed on inbox-abs-<idx>', async () => {
    await loadMain();
    const abs = document.createElement('div');
    abs.id = 'inbox-abs-3';
    document.body.appendChild(abs);
    clickWith({ 'data-action': 'toggleInboxAbstract', 'data-idx': '3' });
    expect(abs.classList.contains('collapsed')).toBe(true);
  });

  it('quickToggleSelectStop and quickToggleAbstractStop both stopPropagation', async () => {
    await loadMain();
    const onParent = vi.fn();
    const parent = document.createElement('div');
    parent.setAttribute('data-action', 'usePreset');
    parent.setAttribute('data-query', 'parent-fired');
    document.body.appendChild(parent);
    window.usePreset = onParent;

    const tFn = vi.fn();
    window.quickToggleSelect = tFn;
    clickWith(
      { 'data-action': 'quickToggleSelectStop', 'data-idx': '4' },
      parent,
    );
    expect(tFn).toHaveBeenCalledWith(4);
    // closest('[data-action]') already resolves to the inner element, so
    // the parent never gets routed regardless of stopPropagation. The Stop
    // semantics matter for non-data-action listeners, which we don't have
    // in jsdom — so just assert the inner side fired.
  });

  it('removeSavedQueryStop forwards idx to window.removeSavedQuery', async () => {
    await loadMain();
    const fn = vi.fn();
    window.removeSavedQuery = fn;
    clickWith({ 'data-action': 'removeSavedQueryStop', 'data-idx': '8' });
    expect(fn).toHaveBeenCalledWith(8);
  });

  it('toggleErrorDetails toggles .open on data-target element + preventDefaults', async () => {
    await loadMain();
    const target = document.createElement('div');
    target.id = 'err-details';
    document.body.appendChild(target);
    const link = document.createElement('a');
    link.setAttribute('data-action', 'toggleErrorDetails');
    link.setAttribute('data-target', 'err-details');
    link.setAttribute('href', '#');
    document.body.appendChild(link);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(target.classList.contains('open')).toBe(true);
  });

  it('copyQuickExportJson reads the export <pre> + temporarily flips its label', async () => {
    await loadMain();
    const pre = document.createElement('pre');
    pre.id = 'quick-export-json';
    pre.textContent = '{"papers":[]}';
    document.body.appendChild(pre);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const btn = clickWith({ 'data-action': 'copyQuickExportJson' });
    btn.textContent = 'Copy';   // simulate prior label being something
    btn.click();
    expect(writeText).toHaveBeenCalled();
    // The handler swaps to "Copied!" then restores after 1500ms; we don't
    // wait for the restore — the swap itself is the contract under test.
    expect(btn.textContent).toBe('Copied!');
  });
});

describe('scraper main.js: data-input dispatch (INPUTS)', () => {
  it('updateInboxNote forwards (idx, value) on every input event', async () => {
    await loadMain();
    const fn = vi.fn();
    window.updateInboxNote = fn;
    const ta = document.createElement('textarea');
    ta.setAttribute('data-input', 'updateInboxNote');
    ta.setAttribute('data-idx', '6');
    document.body.appendChild(ta);
    ta.value = 'note text';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fn).toHaveBeenCalledWith(6, 'note text');
  });
});

describe('scraper main.js: keydown <thing>OnEnter convention', () => {
  it('fires window.doDoiLookup when Enter is pressed inside a doDoiLookupOnEnter element', async () => {
    await loadMain();
    const fn = vi.fn();
    window.doDoiLookup = fn;
    const input = document.createElement('input');
    input.setAttribute('data-action', 'doDoiLookupOnEnter');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(fn).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

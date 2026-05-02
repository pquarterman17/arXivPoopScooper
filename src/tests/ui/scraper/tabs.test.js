// @vitest-environment jsdom

/**
 * Plan #9 Phase B — extraction regression for tabs.js.
 *
 * Three small DOM mutators (switchTab / updateInboxBadge / updateStats).
 * No state writes; the tests build a minimal DOM matching the production
 * markup and assert visibility / classList / textContent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '';
  for (const k of ['inbox', 'dbReady', 'lastFetchTime', 'SCQ',
                   'switchTab', 'updateInboxBadge', 'updateStats',
                   'renderInbox']) {
    delete globalThis[k];
  }
});

async function load() {
  return await import('../../../ui/scraper/tabs.js?v=' + Math.random());
}

function buildPanels() {
  for (const t of ['search', 'inbox', 'quick', 'doi']) {
    const panel = document.createElement('div');
    panel.id = `panel-${t}`;
    panel.style.display = 'block';
    document.body.appendChild(panel);
    const btn = document.createElement('button');
    btn.id = `tab-${t}`;
    document.body.appendChild(btn);
  }
}

describe('tabs: switchTab', () => {
  it('shows the requested panel and hides the others', async () => {
    buildPanels();
    const mod = await load();
    mod.switchTab('inbox');
    expect(document.getElementById('panel-inbox').style.display).toBe('block');
    expect(document.getElementById('panel-search').style.display).toBe('none');
    expect(document.getElementById('panel-quick').style.display).toBe('none');
    expect(document.getElementById('panel-doi').style.display).toBe('none');
  });

  it('marks only the active tab button', async () => {
    buildPanels();
    const mod = await load();
    mod.switchTab('quick');
    expect(document.getElementById('tab-quick').classList.contains('active')).toBe(true);
    expect(document.getElementById('tab-search').classList.contains('active')).toBe(false);
    expect(document.getElementById('tab-inbox').classList.contains('active')).toBe(false);
    expect(document.getElementById('tab-doi').classList.contains('active')).toBe(false);
  });

  it('calls renderInbox when entering the inbox tab', async () => {
    buildPanels();
    const fn = vi.fn();
    globalThis.renderInbox = fn;
    const mod = await load();
    mod.switchTab('inbox');
    expect(fn).toHaveBeenCalled();
  });

  it('does not call renderInbox when entering a non-inbox tab', async () => {
    buildPanels();
    const fn = vi.fn();
    globalThis.renderInbox = fn;
    const mod = await load();
    mod.switchTab('search');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when DOM is incomplete', async () => {
    // No panels in DOM — only the tab buttons missing
    const mod = await load();
    expect(() => mod.switchTab('search')).not.toThrow();
  });
});

describe('tabs: updateInboxBadge', () => {
  it('shows badge with inbox count when non-empty', async () => {
    document.body.innerHTML = '<span id="inbox-badge"></span><span id="stat-inbox"></span>';
    globalThis.inbox = [{ id: 'a' }, { id: 'b' }];
    const mod = await load();
    mod.updateInboxBadge();
    expect(document.getElementById('inbox-badge').style.display).toBe('inline-block');
    expect(document.getElementById('inbox-badge').textContent).toBe('2');
    expect(document.getElementById('stat-inbox').textContent).toBe('2');
  });

  it('hides badge when inbox is empty', async () => {
    document.body.innerHTML = '<span id="inbox-badge" style="display:inline-block">3</span><span id="stat-inbox">3</span>';
    globalThis.inbox = [];
    const mod = await load();
    mod.updateInboxBadge();
    expect(document.getElementById('inbox-badge').style.display).toBe('none');
    expect(document.getElementById('stat-inbox').textContent).toBe('0');
  });

  it('treats undefined inbox as empty', async () => {
    document.body.innerHTML = '<span id="inbox-badge"></span><span id="stat-inbox"></span>';
    globalThis.inbox = undefined;
    const mod = await load();
    expect(() => mod.updateInboxBadge()).not.toThrow();
    expect(document.getElementById('stat-inbox').textContent).toBe('0');
  });
});

describe('tabs: updateStats', () => {
  it('reads SCQ.getStats().papers when dbReady is true', async () => {
    document.body.innerHTML = '<span id="stat-db"></span><span id="stat-last"></span>';
    globalThis.dbReady = true;
    globalThis.SCQ = { getStats: () => ({ papers: 42 }) };
    const mod = await load();
    mod.updateStats();
    expect(document.getElementById('stat-db').textContent).toBe('42');
  });

  it('does not call SCQ.getStats when dbReady is false', async () => {
    document.body.innerHTML = '<span id="stat-db"></span><span id="stat-last"></span>';
    globalThis.dbReady = false;
    const fn = vi.fn(() => ({ papers: 99 }));
    globalThis.SCQ = { getStats: fn };
    const mod = await load();
    mod.updateStats();
    expect(fn).not.toHaveBeenCalled();
  });

  it('renders "never" when lastFetchTime is null', async () => {
    document.body.innerHTML = '<span id="stat-db"></span><span id="stat-last"></span>';
    globalThis.lastFetchTime = null;
    const mod = await load();
    mod.updateStats();
    expect(document.getElementById('stat-last').textContent).toBe('never');
  });

  it('renders the time string when lastFetchTime is a Date', async () => {
    document.body.innerHTML = '<span id="stat-db"></span><span id="stat-last"></span>';
    const t = new Date(2026, 0, 15, 14, 32, 5);
    globalThis.lastFetchTime = t;
    const mod = await load();
    mod.updateStats();
    expect(document.getElementById('stat-last').textContent).toBe(t.toLocaleTimeString());
  });
});

describe('tabs: window shims', () => {
  it('all three exports are shimmed onto globalThis at import time', async () => {
    await load();
    expect(typeof globalThis.switchTab).toBe('function');
    expect(typeof globalThis.updateInboxBadge).toBe('function');
    expect(typeof globalThis.updateStats).toBe('function');
  });
});

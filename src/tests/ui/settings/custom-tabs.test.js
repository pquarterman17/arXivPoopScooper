// @vitest-environment jsdom

/**
 * Tests for the Collaboration + Overleaf custom tabs and the test-button
 * extras that mount under Storage/Digest/Email schema tabs.
 *
 * These tabs don't go through the schema-form pipeline; they hand-build
 * their UI via DOM APIs. The tests verify they (a) render the expected
 * controls, (b) call into the ctx mini-API to read/write the browser DB
 * settings table, and (c) for test-buttons, fire fetch with the correct
 * endpoint URL.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderCollaborationTab } from '../../../ui/settings/tabs/collaboration-tab.js';
import { renderOverleafTab } from '../../../ui/settings/tabs/overleaf-tab.js';
import {
  mountStorageExtras,
  mountDigestExtras,
  mountEmailExtras,
} from '../../../ui/settings/tabs/test-buttons.js';

let body;
let store;
let ctx;
let setStatus;

beforeEach(() => {
  document.body.innerHTML = '';
  body = document.createElement('div');
  document.body.appendChild(body);
  store = {};
  setStatus = vi.fn();
  ctx = {
    setStatus,
    getDbSetting: (k) => store[k],
    setDbSetting: (k, v) => { store[k] = v; },
  };
});

// ─── Collaboration tab ───

describe('Collaboration tab', () => {
  it('renders folder-path input + two action buttons + last-sync line', () => {
    renderCollaborationTab(body, ctx);
    expect(body.querySelector('#shared-folder-path')).toBeTruthy();
    expect(body.querySelector('#merge-shared-file')).toBeTruthy();
    const buttons = body.querySelectorAll('.settings-v2-action-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toMatch(/download/i);
    expect(buttons[1].textContent).toMatch(/merge/i);
    expect(body.querySelector('#collab-last-sync')).toBeTruthy();
  });

  it('pre-fills the folder path from the existing setting', () => {
    store.collaboration = { sharedFolderPath: '/home/me/shared', lastSyncAt: null };
    renderCollaborationTab(body, ctx);
    expect(body.querySelector('#shared-folder-path').value).toBe('/home/me/shared');
  });

  it('persists path to the DB setting on blur', () => {
    renderCollaborationTab(body, ctx);
    const input = body.querySelector('#shared-folder-path');
    input.value = '  /new/path  ';
    input.dispatchEvent(new Event('change'));
    expect(store.collaboration).toEqual(expect.objectContaining({
      sharedFolderPath: '/new/path',
    }));
    expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/saved/i), 'ok');
  });

  it('clicking Download calls the legacy globalThis._syncToSharedFolder', () => {
    const sync = vi.fn();
    globalThis._syncToSharedFolder = sync;
    try {
      renderCollaborationTab(body, ctx);
      body.querySelectorAll('.settings-v2-action-btn')[0].click();
      expect(sync).toHaveBeenCalledOnce();
    } finally {
      delete globalThis._syncToSharedFolder;
    }
  });

  it('renders Last Sync timestamp when present', () => {
    store.collaboration = { lastSyncAt: '2026-05-01T12:00:00Z' };
    renderCollaborationTab(body, ctx);
    const meta = body.querySelector('#collab-last-sync');
    expect(meta.textContent).toMatch(/Last sync/);
  });

  it('renders "Never synced" when no timestamp', () => {
    renderCollaborationTab(body, ctx);
    expect(body.querySelector('#collab-last-sync').textContent).toMatch(/never/i);
  });
});

// ─── Overleaf tab ───

describe('Overleaf tab', () => {
  it('renders Git URL, bib filename, and auto-sync controls', () => {
    renderOverleafTab(body, ctx);
    const inputs = body.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBe(2);
    expect(inputs[0].placeholder).toMatch(/overleaf/i);
    expect(inputs[1].placeholder).toBe('references.bib');
    expect(body.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it('pre-fills from existing config including default bib filename', () => {
    renderOverleafTab(body, ctx);
    const inputs = body.querySelectorAll('input[type="text"]');
    expect(inputs[0].value).toBe('');
    expect(inputs[1].value).toBe('references.bib');
    expect(body.querySelector('input[type="checkbox"]').checked).toBe(true);
  });

  it('pre-fills from saved overleafConfig', () => {
    store.overleafConfig = {
      git_url: 'https://git.overleaf.com/abc',
      bib_filename: 'mybib.bib',
      auto_sync: false,
    };
    renderOverleafTab(body, ctx);
    const inputs = body.querySelectorAll('input[type="text"]');
    expect(inputs[0].value).toBe('https://git.overleaf.com/abc');
    expect(inputs[1].value).toBe('mybib.bib');
    expect(body.querySelector('input[type="checkbox"]').checked).toBe(false);
  });

  it('persists every field change to overleafConfig', () => {
    renderOverleafTab(body, ctx);
    const [urlInput, bibInput] = body.querySelectorAll('input[type="text"]');
    const cb = body.querySelector('input[type="checkbox"]');
    urlInput.value = 'https://x.git';
    urlInput.dispatchEvent(new Event('change'));
    bibInput.value = 'r.bib';
    bibInput.dispatchEvent(new Event('change'));
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    expect(store.overleafConfig).toEqual({
      git_url: 'https://x.git',
      bib_filename: 'r.bib',
      auto_sync: false,
    });
  });

  it('shows the setup CLI hint', () => {
    renderOverleafTab(body, ctx);
    expect(body.querySelector('.settings-v2-meta').innerHTML).toMatch(/overleaf_sync\.py/);
  });
});

// ─── Test-button extras ───

describe('Test-button extras', () => {
  it('mountStorageExtras adds a Verify-DB-Path section', () => {
    mountStorageExtras(body, ctx);
    const section = body.querySelector('.settings-v2-test-section');
    expect(section).toBeTruthy();
    expect(section.querySelector('.settings-v2-test-title').textContent).toMatch(/db path/i);
  });

  it('mountDigestExtras adds a Send-Test-Digest section', () => {
    mountDigestExtras(body, ctx);
    expect(body.querySelector('.settings-v2-test-title').textContent).toMatch(/test digest/i);
  });

  it('mountEmailExtras adds a Test-SMTP section', () => {
    mountEmailExtras(body, ctx);
    expect(body.querySelector('.settings-v2-test-title').textContent).toMatch(/smtp/i);
  });

  it('clicking the test button POSTs to the right endpoint and shows the result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, path: '/db.sqlite', size: 2048, papers: 17 }),
    });
    try {
      mountStorageExtras(body, ctx);
      const btn = body.querySelector('.settings-v2-test-btn');
      btn.click();
      // Wait for the async chain to settle
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/test/db-path', { method: 'POST' });
      const result = body.querySelector('.settings-v2-test-result');
      expect(result.textContent).toMatch(/OK/);
      expect(result.textContent).toMatch(/17 papers/);
      expect(result.dataset.kind).toBe('ok');
    } finally {
      delete globalThis.fetch;
    }
  });

  it('shows error result when endpoint returns ok:false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'File not found: /nope.db' }),
    });
    try {
      mountStorageExtras(body, ctx);
      body.querySelector('.settings-v2-test-btn').click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      const result = body.querySelector('.settings-v2-test-result');
      expect(result.textContent).toMatch(/Failed/);
      expect(result.textContent).toMatch(/not found/);
      expect(result.dataset.kind).toBe('error');
    } finally {
      delete globalThis.fetch;
    }
  });

  it('handles network errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network down'));
    try {
      mountEmailExtras(body, ctx);
      body.querySelector('.settings-v2-test-btn').click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      const result = body.querySelector('.settings-v2-test-result');
      expect(result.textContent).toMatch(/Network down/);
      expect(result.dataset.kind).toBe('error');
    } finally {
      delete globalThis.fetch;
    }
  });
});

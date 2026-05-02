// @vitest-environment jsdom

/**
 * Plan #8 — escape-html extraction regression.
 */

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  delete globalThis.escapeHtml;
});

async function load() {
  return await import('../../../ui/database/escape-html.js?v=' + Math.random());
}

describe('escapeHtml', () => {
  it('shims globalThis.escapeHtml at import time', async () => {
    await load();
    expect(typeof globalThis.escapeHtml).toBe('function');
  });

  it('escapes the four primary HTML special characters', async () => {
    const { escapeHtml } = await load();
    // Browser textContent->innerHTML always escapes < > & for HTML safety
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('preserves plain text unchanged', async () => {
    const { escapeHtml } = await load();
    expect(escapeHtml('Tantalum transmons')).toBe('Tantalum transmons');
  });

  it('returns "" for null / undefined / empty input', async () => {
    const { escapeHtml } = await load();
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('coerces non-string input to string before escaping', async () => {
    const { escapeHtml } = await load();
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(false)).toBe('false');
  });

  it('zero (a falsy number) still produces "0", not ""', async () => {
    /* Pre-refactor `if (!text) return ''` returned '' for 0. New
     * implementation uses `text == null || text === ''` so 0 round-trips. */
    const { escapeHtml } = await load();
    expect(escapeHtml(0)).toBe('0');
  });

  it('output is safe to inject into innerHTML and re-parses to the original text', async () => {
    const { escapeHtml } = await load();
    const dangerous = '<img src=x onerror="alert(1)">';
    const escaped = escapeHtml(dangerous);
    const wrap = document.createElement('div');
    wrap.innerHTML = escaped;
    // No <img> got created — the entire string round-trips as text
    expect(wrap.querySelector('img')).toBeNull();
    expect(wrap.textContent).toBe(dangerous);
  });
});

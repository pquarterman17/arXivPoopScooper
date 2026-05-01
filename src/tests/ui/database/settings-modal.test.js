/**
 * Regression tests for bug #8 in bug-audit-2026-04-30.md.
 *
 * `_addSource` derived `key = label.toLowerCase().replace(/[^a-z0-9]/g, '')`,
 * which collapses to '' for punctuation-only labels like '(PRL)'. Two such
 * sources would share key='' and silently overwrite each other when settings
 * are flushed to the config dict (`cfg.sources['']`). The fix lives in
 * `_deriveSourceKey`, exported for direct testing.
 */

import { describe, it, expect } from 'vitest';
import { _deriveSourceKey } from '../../../ui/database/settings-modal.js';

describe('_deriveSourceKey (#8 empty-key fallback)', () => {
  it('slugifies an alphanumeric label as before', () => {
    expect(_deriveSourceKey('PRB', [])).toBe('prb');
    expect(_deriveSourceKey('Phys Rev B', [])).toBe('physrevb');
  });

  it('does NOT return an empty key for a punctuation-only label (the bug)', () => {
    // Pre-fix code returned '' for any label whose chars are all stripped by
    // /[^a-z0-9]/g — e.g. "???" or "()". Note: "(PRL)" survives as "prl"
    // because the parens are stripped but the letters remain; only labels
    // with NO alphanumerics hit the bug.
    const k = _deriveSourceKey('???', []);
    expect(k).not.toBe('');
    expect(k).toMatch(/^src[a-z0-9]+$/);
  });

  it('does not collide when called twice with the same punctuation-only label', () => {
    const a = _deriveSourceKey('???', []);
    const b = _deriveSourceKey('???', [a]);
    expect(a).not.toBe(b);
  });

  it('does not collide when slugified key already exists', () => {
    const a = _deriveSourceKey('PRB', ['prb']);
    expect(a).not.toBe('prb');
    expect(a.startsWith('prb_')).toBe(true);
  });

  it('is robust to null / undefined / numeric labels', () => {
    expect(_deriveSourceKey(null, []).length).toBeGreaterThan(0);
    expect(_deriveSourceKey(undefined, []).length).toBeGreaterThan(0);
    expect(_deriveSourceKey(42, [])).toBe('42');
  });
});

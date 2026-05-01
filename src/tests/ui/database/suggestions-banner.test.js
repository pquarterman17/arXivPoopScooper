/**
 * Regression tests for bug #7 in bug-audit-2026-04-30.md.
 *
 * suggestions-banner exports renderSuggestions / autoFetchOnLoad /
 * toggleSuggestions, all of which previously did `document.getElementById(...)
 * .style.display = 'block'` with no null check. If the banner DOM is absent
 * (test env, alt page layout, banner removed by user), every load callback
 * would throw and prevent further app boot.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderSuggestions,
  toggleSuggestions,
} from '../../../ui/database/suggestions-banner.js';

beforeEach(() => {
  // Clean DOM — explicitly NO #suggestions-banner / #sug-list / etc.
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('suggestions-banner null-guards (#7)', () => {
  it('renderSuggestions returns silently when the banner element is absent', () => {
    expect(() => renderSuggestions()).not.toThrow();
  });

  it('toggleSuggestions returns silently when the banner element is absent', () => {
    expect(() => toggleSuggestions()).not.toThrow();
    // Calling again should still not throw (idempotent under missing DOM).
    expect(() => toggleSuggestions()).not.toThrow();
  });

  it('renderSuggestions is a no-op only when ALL five elements are missing', () => {
    // Partial DOM (banner alone) should still no-op rather than crash on
    // the next missing element.
    document.body.innerHTML = '<div id="suggestions-banner"></div>';
    expect(() => renderSuggestions()).not.toThrow();
  });
});

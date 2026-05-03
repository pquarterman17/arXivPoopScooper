/**
 * Bug-hunter #3 regression: the search-config-bridge's onReady callback
 * must rebuild `activeSources` after the bridge mutates SCRAPER_CONFIG.
 *
 * Without this wiring, a user_config override that disables a source is
 * silently ignored on the scraper page until the user manually toggles
 * (or reloads after activeSources is somehow re-derived).
 *
 * We verify by parsing the actual `src/ui/scraper/main.js` text for the
 * presence of a `bootstrapSearchConfig([...])` call that includes a
 * reference to `rebuildActiveSources`. Brittle but cheap, and the test
 * id makes the breakage immediately legible if a future refactor drops
 * the callback.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(here, '../../../ui/scraper/main.js');
const mainSrc = readFileSync(mainPath, 'utf-8');

describe('scraper main.js — bug-hunter #3 onReady wiring', () => {
  it('calls bootstrapSearchConfig with at least one onReady callback', () => {
    // `bootstrapSearchConfig([...])` — array argument required for onReady.
    expect(mainSrc).toMatch(/bootstrapSearchConfig\s*\(\s*\[/);
  });

  it('the onReady array references rebuildActiveSources', () => {
    // The exact form is `() => globalThis.rebuildActiveSources?.()`.
    // Match loosely so refactors that keep the spirit (calling the
    // rebuild function) don't break the test.
    expect(mainSrc).toMatch(/rebuildActiveSources/);
  });
});

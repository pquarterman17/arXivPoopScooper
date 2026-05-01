/**
 * Regression test for bug #1 in bug-audit-2026-04-30.md.
 *
 * scraper_config.js is loaded as a classic <script> in paper_database.html
 * and paper_scraper.html. ES2015 `const` at the top level of a classic
 * script does NOT create a property on `window` / `globalThis` — it goes
 * into the script's lexical environment. The migrated ES modules read
 * `globalThis.SCRAPER_CONFIG`, so the binding has to be `var` (or
 * explicitly assigned to `globalThis`).
 *
 * The classic-script semantics aren't reproducible 1:1 in vitest (which
 * loads the file as a module), but we can guard against the regression
 * with a textual check on the source: the top-level declaration must not
 * be `const SCRAPER_CONFIG`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const src = readFileSync(resolve(repoRoot, 'scraper_config.js'), 'utf8');

describe('scraper_config.js global visibility', () => {
  it('does NOT declare SCRAPER_CONFIG with `const` (would hide it from globalThis)', () => {
    // Match a top-of-line `const SCRAPER_CONFIG` (allow leading whitespace).
    expect(src).not.toMatch(/^\s*const\s+SCRAPER_CONFIG\b/m);
  });

  it('declares SCRAPER_CONFIG with `var` OR assigns it to `globalThis`/`window`', () => {
    const hasVar = /^\s*var\s+SCRAPER_CONFIG\b/m.test(src);
    const hasGlobalAssign =
      /\b(?:globalThis|window)\.SCRAPER_CONFIG\s*=/.test(src);
    expect(hasVar || hasGlobalAssign).toBe(true);
  });
});

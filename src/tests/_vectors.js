/**
 * Helpers to load language-neutral test vectors from tests/vectors/.
 *
 * The JSON fixture format and category list live in tests/vectors/README.md;
 * this module just provides the loader. Each vector ships through both
 * vitest (here) and pytest (tests/conftest.py) so JS and Python stay in
 * lockstep.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VECTOR_ROOT = resolve(process.cwd(), 'tests', 'vectors');

/**
 * Load every vector in a category, sorted by filename for deterministic
 * test ordering. Adds a `_file` field so failure messages identify the
 * source file.
 *
 * @param {string} category — e.g. 'config-merge'
 * @returns {Array<object>}
 */
export function loadVectors(category) {
  const dir = join(VECTOR_ROOT, category);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { _file: f, ...data };
  });
}

/**
 * Normalize a JS minimal-validator error string into `{path, kind}`. The
 * Python jsonschema validator emits `(path, validator)` natively; this maps
 * the JS string-based output into the same shape so vectors can compare
 * across both.
 *
 * @param {string} err — message of the form "$.path.to.x: <reason>"
 */
export function normalizeJsError(err) {
  const colonIdx = err.indexOf(': ');
  const path = colonIdx > -1 ? err.slice(0, colonIdx) : err;
  const reason = colonIdx > -1 ? err.slice(colonIdx + 2) : '';
  return { path, kind: _kindFromReason(reason) };
}

function _kindFromReason(reason) {
  // Order matters: more specific phrases come first.
  if (reason === 'required') return 'required';
  if (reason.startsWith('expected ') && reason.includes('got ')) return 'type';
  if (reason.startsWith('must be one of ')) return 'enum';
  if (reason.startsWith('must equal const ')) return 'const';
  if (reason.startsWith('minLength ')) return 'minLength';
  if (reason.startsWith('maxLength ')) return 'maxLength';
  if (reason.startsWith('minimum ')) return 'minimum';
  if (reason.startsWith('maximum ')) return 'maximum';
  if (reason.includes('does not match pattern')) return 'pattern';
  if (reason.includes('not a valid email')) return 'format';
  if (reason === 'duplicate item') return 'uniqueItems';
  if (reason === 'unknown property') return 'additionalProperties';
  if (reason.startsWith('did not match any anyOf')) return 'anyOf';
  return 'unknown';
}

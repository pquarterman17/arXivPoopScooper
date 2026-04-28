import { describe, it, expect } from 'vitest';
import { validate } from '../../config/loader.js';
import { loadVectors, normalizeJsError } from '../_vectors.js';

const vectors = loadVectors('schema-validation');

/**
 * Compare two error lists as sets of (path, kind) tuples (order-independent).
 * The error message text differs between the JS minimal validator and the
 * Python jsonschema reference, so the vectors specify only path + kind.
 */
function asSet(errors) {
  return new Set(errors.map((e) => `${e.path}::${e.kind}`));
}

describe('schema-validation vectors', () => {
  it.each(vectors)('$_file: $name', (v) => {
    const raw = validate(v.payload, v.schema);
    const got = raw.map(normalizeJsError);
    expect(asSet(got)).toEqual(asSet(v.expectedErrors));
  });
});

import { describe, it, expect } from 'vitest';
import { schemaAwareMerge } from '../../config/loader.js';
import { loadVectors } from '../_vectors.js';

const vectors = loadVectors('config-merge');

describe('config-merge vectors', () => {
  it.each(vectors)('$_file: $name', (v) => {
    const result = schemaAwareMerge(v.defaults, v.override, v.schema);
    expect(result).toEqual(v.expected);
  });
});

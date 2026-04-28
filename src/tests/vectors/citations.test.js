import { describe, it, expect } from 'vitest';
import { formatBibTeX, formatPlainText } from '../../services/citations.js';
import { loadVectors } from '../_vectors.js';

const vectors = loadVectors('citations');

describe('citations vectors', () => {
  it.each(vectors)('$_file: $name', (v) => {
    if (v.expectedTxt !== undefined) {
      const txt = formatPlainText(v.paper, v.config ?? {}, v.style);
      expect(txt).toBe(v.expectedTxt);
    }
    if (v.expectedBib !== undefined) {
      const bib = formatBibTeX(v.paper, v.config ?? {});
      expect(bib).toBe(v.expectedBib);
    }
  });
});

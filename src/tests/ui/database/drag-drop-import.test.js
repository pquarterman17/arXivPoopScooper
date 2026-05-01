/**
 * Pure-function tests for src/ui/database/drag-drop-import.js
 *
 * findArxivId and findDOI are regex-based sniffers used to recognize
 * a dropped PDF's identifier from its first-page text. They have no
 * DOM or SCQ dependencies and are the primary correctness surface of
 * the module — the rest is upload plumbing + status rendering.
 */

import { describe, it, expect } from 'vitest';
import { findArxivId, findDOI } from '../../../ui/database/drag-drop-import.js';

describe('findArxivId', () => {
  it('matches the canonical arXiv:YYMM.NNNNN form', () => {
    expect(findArxivId('See arXiv:2401.12345 for details')).toBe('2401.12345');
  });

  it('matches the 5-digit suffix form', () => {
    expect(findArxivId('arXiv:2401.123456 something')).toBe('2401.12345');
  });

  it('matches an arxiv.org/abs/ URL', () => {
    expect(findArxivId('https://arxiv.org/abs/2305.04567')).toBe('2305.04567');
  });

  it('matches a bare YYMM.NNNNN substring', () => {
    expect(findArxivId('Reference 2110.09876 in the text')).toBe('2110.09876');
  });

  it('is case-insensitive on the prefix', () => {
    expect(findArxivId('ARXIV:2401.12345')).toBe('2401.12345');
    expect(findArxivId('Arxiv.org/abs/2401.12345')).toBe('2401.12345');
  });

  it('returns null when nothing matches', () => {
    expect(findArxivId('No identifier here')).toBeNull();
    expect(findArxivId('')).toBeNull();
  });

  it('rejects bare numbers shorter than the YYMM.NNNN floor', () => {
    expect(findArxivId('123.456')).toBeNull();
    expect(findArxivId('1234.123')).toBeNull();
  });

  it('returns the first match when multiple are present', () => {
    expect(findArxivId('arXiv:2401.11111 and 2402.22222')).toBe('2401.11111');
  });
});

describe('findDOI', () => {
  it('matches "doi: 10.X/Y" style', () => {
    expect(findDOI('doi: 10.1103/PhysRevLett.123.456789')).toBe('10.1103/PhysRevLett.123.456789');
  });

  it('matches a doi.org URL', () => {
    expect(findDOI('https://doi.org/10.1038/nphys1234')).toBe('10.1038/nphys1234');
  });

  it('matches a bare 10.X/Y substring', () => {
    expect(findDOI('Cite as 10.1126/science.abc1234 or similar')).toBe('10.1126/science.abc1234');
  });

  it('strips trailing punctuation', () => {
    expect(findDOI('See 10.1103/PhysRev.42.123, also...')).toBe('10.1103/PhysRev.42.123');
    expect(findDOI('(10.1103/PhysRev.42.123)')).toBe('10.1103/PhysRev.42.123');
    expect(findDOI('cited at 10.1038/foo.bar.')).toBe('10.1038/foo.bar');
  });

  it('returns null when nothing looks like a DOI', () => {
    expect(findDOI('No identifier here')).toBeNull();
    expect(findDOI('')).toBeNull();
  });

  it('is case-insensitive on the prefix', () => {
    expect(findDOI('DOI: 10.1103/X.123')).toBe('10.1103/X.123');
    expect(findDOI('DOI.org/10.1103/X.123')).toBe('10.1103/X.123');
  });
});

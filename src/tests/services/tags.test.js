import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as tags from '../../services/tags.js';

describe('services/tags', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  describe('counts and listAll', () => {
    beforeEach(() => {
      seedPaper({ id: '1', tags: ['a', 'b', 'c'] });
      seedPaper({ id: '2', tags: ['a', 'b'] });
      seedPaper({ id: '3', tags: ['a'] });
    });

    it('counts orders by frequency desc, then alphabetical', () => {
      expect(tags.counts()).toEqual([
        { tag: 'a', count: 3 },
        { tag: 'b', count: 2 },
        { tag: 'c', count: 1 },
      ]);
    });

    it('listAll returns alphabetical distinct tags', () => {
      expect(tags.listAll()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('per-paper ops', () => {
    it('addToPaper adds and is idempotent', () => {
      seedPaper({ id: '1', tags: ['x'] });
      expect(tags.addToPaper('1', 'y')).toEqual(['x', 'y']);
      expect(tags.addToPaper('1', 'y')).toEqual(['x', 'y']);
    });

    it('removeFromPaper removes if present', () => {
      seedPaper({ id: '1', tags: ['a', 'b'] });
      expect(tags.removeFromPaper('1', 'a')).toEqual(['b']);
      expect(tags.removeFromPaper('1', 'nope')).toEqual(['b']);
    });

    it('setForPaper dedupes the input', () => {
      seedPaper({ id: '1' });
      expect(tags.setForPaper('1', ['a', 'a', 'b'])).toEqual(['a', 'b']);
    });

    it('getForPaper returns parsed array', () => {
      seedPaper({ id: '1', tags: ['x', 'y'] });
      expect(tags.getForPaper('1')).toEqual(['x', 'y']);
    });

    it('getForPaper on missing paper returns empty array', () => {
      expect(tags.getForPaper('nope')).toEqual([]);
    });
  });

  describe('rename across all papers', () => {
    beforeEach(() => {
      seedPaper({ id: '1', tags: ['old', 'b'] });
      seedPaper({ id: '2', tags: ['old'] });
      seedPaper({ id: '3', tags: ['c'] });
    });

    it('updates every paper containing the tag', () => {
      const touched = tags.rename('old', 'new');
      expect(touched).toBe(2);
      expect(tags.getForPaper('1')).toEqual(['new', 'b']);
      expect(tags.getForPaper('2')).toEqual(['new']);
      expect(tags.getForPaper('3')).toEqual(['c']);
    });

    it('dedupes if the rename would collide with an existing tag', () => {
      // Paper 1: ['old', 'b'] — rename 'old' → 'b'
      tags.setForPaper('1', ['old', 'b']);
      tags.rename('old', 'b');
      expect(tags.getForPaper('1')).toEqual(['b']);
    });

    it('returns 0 and does nothing when old===new', () => {
      expect(tags.rename('a', 'a')).toBe(0);
    });
  });

  describe('deleteEverywhere', () => {
    it('removes the tag from every paper', () => {
      seedPaper({ id: '1', tags: ['a', 'b'] });
      seedPaper({ id: '2', tags: ['b'] });
      seedPaper({ id: '3', tags: ['a'] });
      const touched = tags.deleteEverywhere('a');
      expect(touched).toBe(2);
      expect(tags.getForPaper('1')).toEqual(['b']);
      expect(tags.getForPaper('2')).toEqual(['b']);
      expect(tags.getForPaper('3')).toEqual([]);
    });

    it('returns 0 when no paper has the tag', () => {
      seedPaper({ id: '1', tags: ['x'] });
      expect(tags.deleteEverywhere('y')).toBe(0);
    });
  });
});

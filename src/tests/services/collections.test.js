import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as collections from '../../services/collections.js';

describe('services/collections', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('add is idempotent — same paper twice in the same collection is one row', () => {
    seedPaper({ id: '1' });
    collections.add('Reading', '1');
    collections.add('Reading', '1');
    expect(collections.listPapers('Reading')).toHaveLength(1);
  });

  it('listNames returns alphabetical distinct names', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    collections.add('Z', '1');
    collections.add('A', '1');
    collections.add('A', '2');
    expect(collections.listNames()).toEqual(['A', 'Z']);
  });

  it('listWithCounts groups by name', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    collections.add('A', '1');
    collections.add('A', '2');
    collections.add('B', '1');
    expect(collections.listWithCounts()).toEqual([
      { name: 'A', count: 2 },
      { name: 'B', count: 1 },
    ]);
  });

  it('listForPaper shows the collections one paper is in', () => {
    seedPaper({ id: '1' });
    collections.add('B', '1');
    collections.add('A', '1');
    expect(collections.listForPaper('1')).toEqual(['A', 'B']);
  });

  it('listPapers orders newest-added first', () => {
    seedPaper({ id: '1', date_added: '2024-01-01' });
    seedPaper({ id: '2', date_added: '2024-05-01' });
    collections.add('R', '1');
    collections.add('R', '2');
    expect(collections.listPapers('R').map((p) => p.id)).toEqual(['2', '1']);
  });

  it('rename moves all paper_ids to the new name', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    collections.add('Old', '1');
    collections.add('Old', '2');
    collections.rename('Old', 'New');
    expect(collections.listPapers('New').map((p) => p.id).sort()).toEqual(['1', '2']);
    expect(collections.listPapers('Old')).toEqual([]);
  });

  it('rename is a no-op when old===new', () => {
    seedPaper({ id: '1' });
    collections.add('A', '1');
    expect(() => collections.rename('A', 'A')).not.toThrow();
    expect(collections.listPapers('A')).toHaveLength(1);
  });

  it('rename handles target collisions by collapsing duplicates', () => {
    // Paper 1 in both 'Old' and 'New' — after rename Old→New, only one row remains
    seedPaper({ id: '1' });
    collections.add('Old', '1');
    collections.add('New', '1');
    collections.rename('Old', 'New');
    expect(collections.listPapers('New')).toHaveLength(1);
    expect(collections.listPapers('Old')).toEqual([]);
  });

  it('remove drops a single paper from a collection', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    collections.add('R', '1');
    collections.add('R', '2');
    collections.remove('R', '1');
    expect(collections.listPapers('R').map((p) => p.id)).toEqual(['2']);
  });

  it('deleteAll empties the collection', () => {
    seedPaper({ id: '1' });
    collections.add('A', '1');
    collections.deleteAll('A');
    expect(collections.listNames()).toEqual([]);
  });

  it('add throws on missing args', () => {
    expect(() => collections.add('', '1')).toThrow();
    expect(() => collections.add('A', null)).toThrow();
  });
});

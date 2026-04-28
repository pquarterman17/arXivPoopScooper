import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as highlights from '../../services/highlights.js';

describe('services/highlights', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('add inserts a new highlight and returns its id', () => {
    seedPaper({ id: '1' });
    const id = highlights.add('1', 'a quote');
    expect(id).toBeGreaterThan(0);
    const list = highlights.listForPaper('1');
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('a quote');
    expect(list[0].color).toBe('#58a6ff');
  });

  it('add dedupes against same (paper_id, text)', () => {
    seedPaper({ id: '1' });
    const id1 = highlights.add('1', 'same text');
    const id2 = highlights.add('1', 'same text');
    expect(id1).toBe(id2);
    expect(highlights.listForPaper('1')).toHaveLength(1);
  });

  it('add accepts page and color', () => {
    seedPaper({ id: '1' });
    highlights.add('1', 'on page 4', { page: 4, color: '#ff0000' });
    const [h] = highlights.listForPaper('1');
    expect(h.page).toBe(4);
    expect(h.color).toBe('#ff0000');
  });

  it('listForPaper orders by id (insertion order)', () => {
    seedPaper({ id: '1' });
    highlights.add('1', 'first');
    highlights.add('1', 'second');
    expect(highlights.listForPaper('1').map((h) => h.text)).toEqual(['first', 'second']);
  });

  it('remove deletes one by id', () => {
    seedPaper({ id: '1' });
    const id = highlights.add('1', 'gone');
    highlights.remove(id);
    expect(highlights.listForPaper('1')).toEqual([]);
  });

  it('clearForPaper removes all for a paper', () => {
    seedPaper({ id: '1' });
    highlights.add('1', 'a');
    highlights.add('1', 'b');
    highlights.clearForPaper('1');
    expect(highlights.listForPaper('1')).toEqual([]);
  });

  it('add throws on missing args', () => {
    expect(() => highlights.add('', 'text')).toThrow();
    expect(() => highlights.add('1', '')).toThrow();
  });
});

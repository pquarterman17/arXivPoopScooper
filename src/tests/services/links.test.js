import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as links from '../../services/links.js';

describe('services/links', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('add inserts a link in canonical order', () => {
    seedPaper({ id: 'b' });
    seedPaper({ id: 'a' });
    links.add('b', 'a');
    expect(links.listForPaper('a').map((p) => p.id)).toEqual(['b']);
    expect(links.listForPaper('b').map((p) => p.id)).toEqual(['a']);
  });

  it('add is idempotent regardless of argument order', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    links.add('1', '2');
    links.add('2', '1');
    expect(links.listForPaper('1')).toHaveLength(1);
  });

  it('add throws on missing or self-link', () => {
    expect(() => links.add('', 'b')).toThrow();
    expect(() => links.add('a', 'a')).toThrow(/itself/);
  });

  it('remove deletes regardless of direction', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    links.add('1', '2');
    links.remove('2', '1');
    expect(links.listForPaper('1')).toEqual([]);
  });

  it('exists reports correctly in either direction', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    seedPaper({ id: '3' });
    links.add('1', '2');
    expect(links.exists('1', '2')).toBe(true);
    expect(links.exists('2', '1')).toBe(true);
    expect(links.exists('1', '3')).toBe(false);
    expect(links.exists('1', '1')).toBe(false);
  });

  it('listForPaper returns metadata for the linked papers', () => {
    seedPaper({ id: '1', title: 'A', short_authors: 'A. Author', year: 2024 });
    seedPaper({ id: '2', title: 'B', short_authors: 'B. Other', year: 2023 });
    links.add('1', '2');
    const [linked] = links.listForPaper('1');
    expect(linked).toMatchObject({ id: '2', title: 'B', short_authors: 'B. Other', year: 2023 });
  });
});

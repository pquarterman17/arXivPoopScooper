import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as papers from '../../services/papers.js';

describe('services/papers', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  describe('insert + getById', () => {
    it('round-trips basic fields', () => {
      papers.insert({
        id: '2401.12345',
        title: 'Coherence',
        authors: 'A. Adams, B. Bell',
        shortAuthors: 'Adams, Bell',
        year: 2024,
        tags: ['transmon', 'TLS'],
        keyResults: ['T1 = 100 us'],
        summary: 'Two-level system loss.',
      });
      const p = papers.getById('2401.12345');
      expect(p.id).toBe('2401.12345');
      expect(p.title).toBe('Coherence');
      expect(p.authors).toBe('A. Adams, B. Bell');
      expect(p.short_authors).toBe('Adams, Bell');
      expect(p.year).toBe(2024);
      expect(p.tags).toEqual(['transmon', 'TLS']);
      expect(p.key_results).toEqual(['T1 = 100 us']);
    });

    it('coerces camelCase aliases to snake_case columns', () => {
      papers.insert({
        id: '1',
        title: 'X',
        authors: 'A',
        arxivId: '1',
        entryType: 'published',
        dateAdded: '2024-05-01',
      });
      const p = papers.getById('1');
      expect(p.arxiv_id).toBe('1');
      expect(p.entry_type).toBe('published');
      expect(p.date_added).toBe('2024-05-01');
    });

    it('ensures a read_status row exists', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      const p = papers.getById('1');
      expect(p.is_read).toBe(0);
      expect(p.priority).toBe(0);
    });

    it('replaces an existing paper on conflict (INSERT OR REPLACE)', () => {
      papers.insert({ id: '1', title: 'Old', authors: 'A', tags: [] });
      papers.insert({ id: '1', title: 'New', authors: 'B', tags: ['x'] });
      const p = papers.getById('1');
      expect(p.title).toBe('New');
      expect(p.tags).toEqual(['x']);
    });

    it('throws without an id', () => {
      expect(() => papers.insert({ title: 'X' })).toThrow(/id is required/);
    });

    it('returns null for missing ids', () => {
      expect(papers.getById('nope')).toBeNull();
    });

    it('with withRelations: true loads figures/highlights/collections/links', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      papers.insert({ id: '2', title: 'Y', authors: 'B' });
      db.run("INSERT INTO figures (paper_id, figure_key, file_path) VALUES (?, ?, ?)", ['1', 'fig1', '/x.jpg']);
      db.run("INSERT INTO collections (name, paper_id) VALUES (?, ?)", ['Reading', '1']);
      db.run("INSERT INTO paper_links (paper_a, paper_b) VALUES (?, ?)", ['1', '2']);
      const p = papers.getById('1', { withRelations: true });
      expect(p.figures).toHaveLength(1);
      expect(p.collections).toEqual(['Reading']);
      expect(p.links.map((l) => l.id)).toEqual(['2']);
    });
  });

  describe('listAll', () => {
    it('orders by date_added desc', () => {
      seedPaper({ id: '1', date_added: '2024-01-01' });
      seedPaper({ id: '2', date_added: '2024-05-01' });
      seedPaper({ id: '3', date_added: '2024-03-01' });
      expect(papers.listAll().map((p) => p.id)).toEqual(['2', '3', '1']);
    });

    it('hydrates tags as arrays', () => {
      seedPaper({ id: '1', tags: ['a', 'b'] });
      const [p] = papers.listAll();
      expect(p.tags).toEqual(['a', 'b']);
    });

    it('joins note text into the paper view', () => {
      seedPaper({ id: '1' });
      db.run("INSERT INTO notes (paper_id, content, last_edited) VALUES (?, ?, ?)", ['1', 'my note', '2024-01-01']);
      const [p] = papers.listAll();
      expect(p.note).toBe('my note');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      seedPaper({ id: '1', title: 'Transmon coherence', summary: 'About T1' });
      seedPaper({ id: '2', title: 'Crystal symmetry', summary: 'Topology' });
      seedPaper({ id: '3', title: 'TLS in tantalum', summary: 'Surface oxide effects' });
    });

    it('returns all papers for an empty query', () => {
      expect(papers.search('').map((p) => p.id).sort()).toEqual(['1', '2', '3']);
    });

    it('LIKE-matches in title', () => {
      expect(papers.search('transmon').map((p) => p.id)).toEqual(['1']);
    });

    it('LIKE-matches in summary', () => {
      expect(papers.search('oxide').map((p) => p.id)).toEqual(['3']);
    });

    it('returns empty array when nothing matches', () => {
      expect(papers.search('zzzzzz')).toEqual([]);
    });

    it('escapes FTS-special chars without crashing', () => {
      expect(() => papers.search('"transmon"')).not.toThrow();
    });
  });

  describe('update', () => {
    it('patches only the listed columns', () => {
      papers.insert({ id: '1', title: 'Old', authors: 'A' });
      papers.update('1', { title: 'New', summary: 'Updated' });
      const p = papers.getById('1');
      expect(p.title).toBe('New');
      expect(p.summary).toBe('Updated');
      expect(p.authors).toBe('A');
    });

    it('serializes tags array to JSON', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      papers.update('1', { tags: ['x', 'y'] });
      const p = papers.getById('1');
      expect(p.tags).toEqual(['x', 'y']);
    });

    it('camelCase keys are accepted', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      papers.update('1', { entryType: 'published', shortAuthors: 'A' });
      const p = papers.getById('1');
      expect(p.entry_type).toBe('published');
      expect(p.short_authors).toBe('A');
    });

    it('ignores unknown keys silently', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      expect(() => papers.update('1', { hackme: '; DROP TABLE papers' })).not.toThrow();
      expect(papers.getById('1').title).toBe('X');
    });

    it('no-op when patch is empty', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      expect(() => papers.update('1', {})).not.toThrow();
    });
  });

  describe('remove', () => {
    it('deletes the paper and its 1:N relations', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      db.run("INSERT INTO figures (paper_id, figure_key, file_path) VALUES (?, ?, ?)", ['1', 'k', '/p']);
      db.run("INSERT INTO notes (paper_id, content, last_edited) VALUES (?, ?, ?)", ['1', 'note', '2024']);
      db.run("INSERT INTO collections (name, paper_id) VALUES (?, ?)", ['c', '1']);

      papers.remove('1');

      expect(papers.getById('1')).toBeNull();
      expect(papers.exists('1')).toBe(false);
      expect(db.scalar('SELECT COUNT(*) FROM figures WHERE paper_id = ?', ['1'])).toBe(0);
      expect(db.scalar('SELECT COUNT(*) FROM notes WHERE paper_id = ?', ['1'])).toBe(0);
      expect(db.scalar('SELECT COUNT(*) FROM collections WHERE paper_id = ?', ['1'])).toBe(0);
    });

    it('removes both directions of paper_links', () => {
      papers.insert({ id: '1', title: 'X', authors: 'A' });
      papers.insert({ id: '2', title: 'Y', authors: 'B' });
      db.run("INSERT INTO paper_links (paper_a, paper_b) VALUES ('1', '2')");
      papers.remove('1');
      expect(db.scalar('SELECT COUNT(*) FROM paper_links')).toBe(0);
    });
  });

  describe('exists', () => {
    it('reports true / false correctly', () => {
      seedPaper({ id: 'a' });
      expect(papers.exists('a')).toBe(true);
      expect(papers.exists('nope')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('counts everything', () => {
      seedPaper({ id: '1' });
      seedPaper({ id: '2' });
      db.run("UPDATE read_status SET is_read = 1 WHERE paper_id = ?", ['1']);
      db.run("INSERT INTO figures (paper_id, figure_key, file_path) VALUES (?, ?, ?)", ['1', 'f', '/p']);
      db.run("INSERT INTO collections (name, paper_id) VALUES (?, ?)", ['c', '1']);
      const s = papers.getStats();
      expect(s.papers).toBe(2);
      expect(s.read).toBe(1);
      expect(s.unread).toBe(1);
      expect(s.figures).toBe(1);
      expect(s.collections).toBe(1);
    });
  });
});

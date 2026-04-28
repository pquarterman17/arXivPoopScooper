import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs from 'sql.js';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as merge from '../../services/database-merge.js';
import * as papers from '../../services/papers.js';
import * as notes from '../../services/notes.js';
import * as readStatus from '../../services/read-status.js';

/**
 * Build a sibling sql.js DB (the "other" db that gets merged in) using
 * the same schema as the main test fixture. Returns its bytes.
 */
async function buildOtherDb(setup) {
  const SQL = await initSqlJs();
  const other = new SQL.Database();
  // Use the same stripped-FTS schema as freshDB
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  let schema = await fs.readFile(path.resolve('data/migrations/001_initial.sql'), 'utf8');
  schema = schema.replace(/CREATE\s+VIRTUAL\s+TABLE[^;]*USING\s+fts5[^;]*;/gi, '');
  schema = schema.replace(/CREATE\s+TRIGGER[^;]+papers_fts[\s\S]*?END\s*;/gi, '');
  other.exec(schema);
  setup(other);
  const bytes = other.export();
  other.close();
  return bytes;
}

function insertPaper(target, p) {
  target.run(
    `INSERT INTO papers (id, title, authors, short_authors, year, summary, tags, arxiv_id, date_added, entry_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id, p.title || 'Title', p.authors || 'A. Author', p.short_authors || 'Author',
      p.year || 2024, p.summary || '',
      JSON.stringify(p.tags || []),
      p.id, p.date_added || '2024-01-15', p.entry_type || 'preprint',
    ],
  );
  target.run('INSERT OR IGNORE INTO read_status (paper_id) VALUES (?)', [p.id]);
}

describe('services/database-merge', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  describe('mergeFromDatabase', () => {
    it('inserts new papers from the other db', async () => {
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'new1', title: 'New paper', authors: 'X. Y.' });
      });
      const stats = merge.mergeFromDatabase(bytes);
      expect(stats).toEqual({ added: 1, updated: 0, skipped: 0 });
      expect(papers.getById('new1').title).toBe('New paper');
    });

    it('skips an unchanged existing paper', async () => {
      seedPaper({ id: 'p1', title: 'Same', summary: 'Same summary' });
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1', title: 'Same', summary: 'Same summary' });
      });
      const stats = merge.mergeFromDatabase(bytes);
      expect(stats).toEqual({ added: 0, updated: 0, skipped: 1 });
    });

    it('longer summary wins on update', async () => {
      seedPaper({ id: 'p1', summary: 'short' });
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1', summary: 'a much longer and more detailed summary' });
      });
      const stats = merge.mergeFromDatabase(bytes);
      expect(stats.updated).toBe(1);
      expect(papers.getById('p1').summary).toBe('a much longer and more detailed summary');
    });

    it('tags are unioned across both dbs', async () => {
      seedPaper({ id: 'p1', tags: ['a', 'b'] });
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1', tags: ['b', 'c'] });
      });
      merge.mergeFromDatabase(bytes);
      expect(papers.getById('p1').tags.sort()).toEqual(['a', 'b', 'c']);
    });

    it('blank fields get filled from the other db', async () => {
      seedPaper({ id: 'p1' });
      const bytes = await buildOtherDb((other) => {
        other.run("UPDATE papers SET doi = '10.1/example', journal = 'PRL' WHERE id = ?", ['p1']);
        // Re-insert with same id+doi+journal so the SELECT picks it up
        insertPaper(other, { id: 'p1' });
        other.run("UPDATE papers SET doi = '10.1/example', journal = 'PRL' WHERE id = ?", ['p1']);
      });
      merge.mergeFromDatabase(bytes);
      expect(papers.getById('p1').doi).toBe('10.1/example');
      expect(papers.getById('p1').journal).toBe('PRL');
    });

    it('read_status: OR for is_read, max for priority', async () => {
      seedPaper({ id: 'p1' });
      readStatus.setPriority('p1', 1);
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1' });
        other.run('UPDATE read_status SET is_read = 1, priority = 3 WHERE paper_id = ?', ['p1']);
      });
      merge.mergeFromDatabase(bytes);
      expect(readStatus.get('p1')).toEqual({ is_read: 1, priority: 3 });
    });

    it('notes: newer last_edited wins', async () => {
      seedPaper({ id: 'p1' });
      notes.set('p1', 'old');
      // Manually backdate the local note
      db.run("UPDATE notes SET last_edited = '2024-01-01T00:00:00Z' WHERE paper_id = ?", ['p1']);
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1' });
        other.run("INSERT INTO notes (paper_id, content, last_edited) VALUES ('p1', 'new', '2025-01-01T00:00:00Z')");
      });
      merge.mergeFromDatabase(bytes);
      expect(notes.get('p1').content).toBe('new');
    });

    it('notes: older last_edited is ignored', async () => {
      seedPaper({ id: 'p1' });
      notes.set('p1', 'newer');
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1' });
        other.run("INSERT INTO notes (paper_id, content, last_edited) VALUES ('p1', 'older', '2020-01-01T00:00:00Z')");
      });
      merge.mergeFromDatabase(bytes);
      expect(notes.get('p1').content).toBe('newer');
    });

    it('highlights are deduped by (paper_id, text)', async () => {
      seedPaper({ id: 'p1' });
      db.run("INSERT INTO highlights (paper_id, text, color) VALUES ('p1', 'quote A', '#000')");
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1' });
        other.run("INSERT INTO highlights (paper_id, text, color) VALUES ('p1', 'quote A', '#fff')");
        other.run("INSERT INTO highlights (paper_id, text, color) VALUES ('p1', 'quote B', '#000')");
      });
      merge.mergeFromDatabase(bytes);
      const hl = db.query('SELECT text FROM highlights WHERE paper_id = ?', ['p1']);
      expect(hl.map((r) => r.text).sort()).toEqual(['quote A', 'quote B']);
    });

    it('paper_links only carry over when both ends exist locally', async () => {
      seedPaper({ id: 'p1' });
      seedPaper({ id: 'p2' });
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'p1' });
        insertPaper(other, { id: 'p2' });
        insertPaper(other, { id: 'p3' });
        other.run("INSERT INTO paper_links (paper_a, paper_b) VALUES ('p1', 'p2')");
        other.run("INSERT INTO paper_links (paper_a, paper_b) VALUES ('p1', 'p3')");
      });
      merge.mergeFromDatabase(bytes);
      // p1↔p2 link comes over (both exist locally now); p1↔p3 also comes over
      // because p3 was inserted as a new paper. Confirm both links exist.
      const links = db.query('SELECT paper_a, paper_b FROM paper_links ORDER BY paper_b');
      expect(links).toEqual([
        { paper_a: 'p1', paper_b: 'p2' },
        { paper_a: 'p1', paper_b: 'p3' },
      ]);
    });

    it('does not mutate the caller-passed bytes', async () => {
      seedPaper({ id: 'p1' });
      const bytes = await buildOtherDb((other) => {
        insertPaper(other, { id: 'new1' });
      });
      const before = bytes.slice();
      merge.mergeFromDatabase(bytes);
      // sql.js Database constructor copies the input, so the original buffer
      // is unchanged
      expect(bytes).toEqual(before);
    });
  });

  describe('exportCollectionBytes', () => {
    const MINIMAL_SCHEMA = `
      CREATE TABLE papers (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL,
        short_authors TEXT, year INTEGER, journal TEXT DEFAULT '', volume TEXT DEFAULT '',
        pages TEXT DEFAULT '', doi TEXT DEFAULT '', arxiv_id TEXT DEFAULT '', url TEXT DEFAULT '',
        group_name TEXT DEFAULT '', date_added TEXT DEFAULT '', tags TEXT DEFAULT '[]',
        summary TEXT DEFAULT '', key_results TEXT DEFAULT '[]', cite_bib TEXT DEFAULT '',
        cite_txt TEXT DEFAULT '', pdf_path TEXT DEFAULT '', entry_type TEXT DEFAULT 'preprint',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE figures (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_id TEXT NOT NULL,
        figure_key TEXT NOT NULL, file_path TEXT NOT NULL, label TEXT DEFAULT '',
        caption TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, UNIQUE(paper_id, figure_key));
      CREATE TABLE notes (paper_id TEXT PRIMARY KEY, content TEXT DEFAULT '', last_edited TEXT DEFAULT '');
      CREATE TABLE highlights (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_id TEXT NOT NULL,
        text TEXT NOT NULL, page INTEGER DEFAULT NULL, color TEXT DEFAULT '#58a6ff',
        created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE collections (name TEXT NOT NULL, paper_id TEXT NOT NULL, PRIMARY KEY (name, paper_id));
      CREATE TABLE paper_links (paper_a TEXT NOT NULL, paper_b TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (paper_a, paper_b),
        CHECK (paper_a < paper_b));
      CREATE TABLE read_status (paper_id TEXT PRIMARY KEY, is_read INTEGER DEFAULT 0, priority INTEGER DEFAULT 0);
    `;

    it('returns null for an empty collection', () => {
      expect(merge.exportCollectionBytes('NoSuch', { schemaSQL: MINIMAL_SCHEMA })).toBeNull();
    });

    it('returns Uint8Array bytes that round-trip through merge', async () => {
      // Build source: papers + read_status + notes + a collection
      seedPaper({ id: 'p1', title: 'Alpha' });
      seedPaper({ id: 'p2', title: 'Beta' });
      seedPaper({ id: 'p3', title: 'Gamma' });
      db.run("INSERT INTO collections (name, paper_id) VALUES ('R', 'p1')");
      db.run("INSERT INTO collections (name, paper_id) VALUES ('R', 'p2')");
      readStatus.setRead('p1', true);
      notes.set('p2', 'a note');

      const bytes = merge.exportCollectionBytes('R', { schemaSQL: MINIMAL_SCHEMA });
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      // Round-trip: create a fresh empty DB and merge the export in
      db._reset();
      await freshDB();
      const stats = merge.mergeFromDatabase(bytes);
      expect(stats.added).toBe(2); // p1 + p2
      expect(papers.exists('p1')).toBe(true);
      expect(papers.exists('p2')).toBe(true);
      expect(papers.exists('p3')).toBe(false); // p3 wasn't in the collection
      expect(notes.get('p2').content).toBe('a note');
    });

    it('throws without schemaSQL', () => {
      expect(() => merge.exportCollectionBytes('R', {})).toThrow(/schemaSQL/);
    });

    it('only links between papers in the export are included', async () => {
      seedPaper({ id: 'p1' });
      seedPaper({ id: 'p2' });
      seedPaper({ id: 'p3' });
      db.run("INSERT INTO collections (name, paper_id) VALUES ('R', 'p1')");
      db.run("INSERT INTO collections (name, paper_id) VALUES ('R', 'p2')");
      // p1↔p2 in collection; p1↔p3 cross-boundary
      db.run("INSERT INTO paper_links (paper_a, paper_b) VALUES ('p1', 'p2')");
      db.run("INSERT INTO paper_links (paper_a, paper_b) VALUES ('p1', 'p3')");

      const bytes = merge.exportCollectionBytes('R', { schemaSQL: MINIMAL_SCHEMA });
      // Open the export DB and inspect it
      const SQL = await initSqlJs();
      const exp = new SQL.Database(bytes);
      const stmt = exp.prepare('SELECT paper_a, paper_b FROM paper_links');
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      exp.close();
      expect(rows).toEqual([{ paper_a: 'p1', paper_b: 'p2' }]);
    });
  });
});

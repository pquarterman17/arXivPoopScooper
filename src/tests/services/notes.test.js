import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as notes from '../../services/notes.js';

describe('services/notes', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('get returns null for an unset note', () => {
    seedPaper({ id: '1' });
    expect(notes.get('1')).toBeNull();
  });

  it('set creates a note and stamps last_edited', () => {
    seedPaper({ id: '1' });
    const ts = notes.set('1', 'hello');
    const n = notes.get('1');
    expect(n.content).toBe('hello');
    expect(n.last_edited).toBe(ts);
    // ISO timestamp with T and Z
    expect(ts).toMatch(/T.*Z$/);
  });

  it('set overwrites an existing note', () => {
    seedPaper({ id: '1' });
    notes.set('1', 'first');
    notes.set('1', 'second');
    expect(notes.get('1').content).toBe('second');
  });

  it('remove deletes the note', () => {
    seedPaper({ id: '1' });
    notes.set('1', 'gone');
    notes.remove('1');
    expect(notes.get('1')).toBeNull();
  });

  it('listRecent skips empty/whitespace notes', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    seedPaper({ id: '3' });
    notes.set('1', 'real');
    notes.set('2', '   ');
    notes.set('3', '');
    expect(notes.listRecent().map((n) => n.paper_id)).toEqual(['1']);
  });

  it('listRecent orders by last_edited desc', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    db.run("INSERT INTO notes (paper_id, content, last_edited) VALUES (?, 'A', '2024-01-01T00:00:00Z')", ['1']);
    db.run("INSERT INTO notes (paper_id, content, last_edited) VALUES (?, 'B', '2024-05-01T00:00:00Z')", ['2']);
    expect(notes.listRecent().map((n) => n.paper_id)).toEqual(['2', '1']);
  });
});

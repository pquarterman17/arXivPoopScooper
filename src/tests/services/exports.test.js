import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as exports from '../../services/exports.js';
import * as collections from '../../services/collections.js';
import * as notes from '../../services/notes.js';
import * as highlights from '../../services/highlights.js';
import * as readStatus from '../../services/read-status.js';

describe('services/exports', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  describe('collectionToBibTeX', () => {
    it('joins all collection members with two newlines', () => {
      seedPaper({ id: '1', title: 'A', authors: 'X', short_authors: 'X', year: 2024 });
      seedPaper({ id: '2', title: 'B', authors: 'Y', short_authors: 'Y', year: 2024 });
      collections.add('R', '1');
      collections.add('R', '2');
      const bib = exports.collectionToBibTeX('R');
      expect(bib).toContain('@article{x2024,');
      expect(bib).toContain('@article{y2024,');
      expect(bib.split('@article{').length).toBe(3); // 1 leading + 2 entries
    });

    it('returns empty string for an empty collection', () => {
      expect(exports.collectionToBibTeX('NoSuch')).toBe('');
    });
  });

  describe('collectionToPlainText', () => {
    it('numbers each entry [1], [2], ...', () => {
      seedPaper({ id: '1', title: 'A', authors: 'X', short_authors: 'X', year: 2024, date_added: '2024-01-01' });
      seedPaper({ id: '2', title: 'B', authors: 'Y', short_authors: 'Y', year: 2024, date_added: '2024-02-01' });
      collections.add('R', '1');
      collections.add('R', '2');
      const txt = exports.collectionToPlainText('R');
      expect(txt).toMatch(/^\[1\] /);
      expect(txt).toMatch(/\n\[2\] /);
    });
  });

  describe('collectionToJson', () => {
    it('includes core paper fields, collections, and read status', () => {
      seedPaper({ id: '1', title: 'A', authors: 'X', tags: ['t1', 't2'] });
      collections.add('R', '1');
      readStatus.setRead('1', true);
      readStatus.setPriority('1', 2);
      const out = exports.collectionToJson('R');
      expect(out.name).toBe('R');
      expect(out.papers).toHaveLength(1);
      const p = out.papers[0];
      expect(p.title).toBe('A');
      expect(p.tags).toEqual(['t1', 't2']);
      expect(p.collections).toEqual(['R']);
      expect(p.is_read).toBe(true);
      expect(p.priority).toBe(2);
    });

    it('omits notes by default (privacy)', () => {
      seedPaper({ id: '1' });
      notes.set('1', 'private thought');
      collections.add('R', '1');
      const p = exports.collectionToJson('R').papers[0];
      expect(p.note).toBeUndefined();
    });

    it('includes notes when explicitly requested', () => {
      seedPaper({ id: '1' });
      notes.set('1', 'private thought');
      collections.add('R', '1');
      const p = exports.collectionToJson('R', { includeNotes: true }).papers[0];
      expect(p.note).toBe('private thought');
    });

    it('includes highlights by default', () => {
      seedPaper({ id: '1' });
      highlights.add('1', 'a quote', { page: 3 });
      collections.add('R', '1');
      const p = exports.collectionToJson('R').papers[0];
      expect(p.highlights).toEqual([{ text: 'a quote', page: 3, color: '#58a6ff' }]);
    });

    it('omits highlights when disabled', () => {
      seedPaper({ id: '1' });
      highlights.add('1', 'a quote');
      collections.add('R', '1');
      const p = exports.collectionToJson('R', { includeHighlights: false }).papers[0];
      expect(p.highlights).toBeUndefined();
    });

    it('exportedAt is an ISO timestamp', () => {
      const out = exports.collectionToJson('Empty');
      expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('databaseToJson', () => {
    it('exports every paper', () => {
      seedPaper({ id: '1' });
      seedPaper({ id: '2' });
      seedPaper({ id: '3' });
      const out = exports.databaseToJson();
      expect(out.papers).toHaveLength(3);
      expect(out.papers.map((p) => p.id).sort()).toEqual(['1', '2', '3']);
    });
  });
});

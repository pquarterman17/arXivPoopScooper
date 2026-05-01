/**
 * Tests for src/ui/database/helpers.js
 *
 * getAllTags and getFiltered are the read paths render() depends on.
 * Both work over globalThis.PAPERS plus the legacy filter `var`s
 * (searchQuery / selectedTags / readFilter / priorityFilter /
 * typeFilter / activeCollection / pdfSearchEnabled / pdfSearchHits).
 * SCQ.getCollectionsForPaper / searchPdfText are stubbed.
 *
 * These are pure functions of inputs — no DOM, no fetch — so jsdom
 * isn't strictly required, but vitest defaults to it and the tests
 * don't care.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllTags, getFiltered } from '../../../ui/database/helpers.js';

const SAVED = {};
const STATE_KEYS = [
  'PAPERS', 'SCQ', 'searchQuery', 'selectedTags',
  'readFilter', 'priorityFilter', 'typeFilter',
  'activeCollection', 'pdfSearchEnabled', 'pdfSearchHits',
];

beforeEach(() => {
  for (const k of STATE_KEYS) SAVED[k] = globalThis[k];
});

afterEach(() => {
  for (const k of STATE_KEYS) globalThis[k] = SAVED[k];
});

function paper(o) {
  return {
    id: 'x',
    title: '',
    authors: '',
    tags: [],
    summary: '',
    group: '',
    _read: false,
    _priority: 0,
    _note: '',
    keyResults: [],
    entryType: 'preprint',
    ...o,
  };
}

function setupDefaults() {
  globalThis.searchQuery = '';
  globalThis.selectedTags = new Set();
  globalThis.readFilter = 'all';
  globalThis.priorityFilter = 'any';
  globalThis.typeFilter = 'all';
  globalThis.activeCollection = null;
  globalThis.pdfSearchEnabled = false;
  globalThis.pdfSearchHits = {};
  globalThis.SCQ = {
    getCollectionsForPaper: () => [],
    searchPdfText: () => ({}),
    hasPdfIndex: () => true,
  };
}

describe('getAllTags', () => {
  it('returns sorted unique tags across all papers', () => {
    globalThis.PAPERS = [
      paper({ tags: ['transmon', 'aluminum'] }),
      paper({ tags: ['TLS', 'transmon'] }),
      paper({ tags: ['niobium'] }),
    ];
    expect(getAllTags()).toEqual(['TLS', 'aluminum', 'niobium', 'transmon']);
  });

  it('returns [] when PAPERS is empty', () => {
    globalThis.PAPERS = [];
    expect(getAllTags()).toEqual([]);
  });
});

describe('getFiltered', () => {
  beforeEach(() => setupDefaults());

  it('returns all papers when no filter is active', () => {
    globalThis.PAPERS = [paper({ id: '1' }), paper({ id: '2' })];
    expect(getFiltered().map(p => p.id)).toEqual(['1', '2']);
  });

  it('matches search across title / authors / tags / summary / group / id / note / keyResults', () => {
    globalThis.PAPERS = [
      paper({ id: '1', title: 'Transmon coherence' }),
      paper({ id: '2', authors: 'A. Transmon' }),
      paper({ id: '3', tags: ['transmon'] }),
      paper({ id: '4', summary: 'about transmons' }),
      paper({ id: '5', group: 'Transmon Lab' }),
      paper({ id: '6', _note: 'transmon notes' }),
      paper({ id: '7', keyResults: ['transmon T1'] }),
      paper({ id: '8', title: 'Unrelated' }),
    ];
    globalThis.searchQuery = 'transmon';
    expect(getFiltered().map(p => p.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('matches partial paper id (case-sensitive substring on id)', () => {
    globalThis.PAPERS = [paper({ id: '2401.12345' }), paper({ id: '2402.99999' })];
    globalThis.searchQuery = '2401';
    expect(getFiltered().map(p => p.id)).toEqual(['2401.12345']);
  });

  it('requires every selected tag (AND, not OR)', () => {
    globalThis.PAPERS = [
      paper({ id: '1', tags: ['a', 'b'] }),
      paper({ id: '2', tags: ['a'] }),
      paper({ id: '3', tags: ['b'] }),
    ];
    globalThis.selectedTags = new Set(['a', 'b']);
    expect(getFiltered().map(p => p.id)).toEqual(['1']);
  });

  it('readFilter "read" / "unread"', () => {
    globalThis.PAPERS = [
      paper({ id: 'r', _read: true }),
      paper({ id: 'u', _read: false }),
    ];
    globalThis.readFilter = 'read';
    expect(getFiltered().map(p => p.id)).toEqual(['r']);
    globalThis.readFilter = 'unread';
    expect(getFiltered().map(p => p.id)).toEqual(['u']);
  });

  it('priorityFilter "starred" matches anything ≥ 1; "high" matches only 3', () => {
    globalThis.PAPERS = [
      paper({ id: '0', _priority: 0 }),
      paper({ id: '1', _priority: 1 }),
      paper({ id: '3', _priority: 3 }),
    ];
    globalThis.priorityFilter = 'starred';
    expect(getFiltered().map(p => p.id)).toEqual(['1', '3']);
    globalThis.priorityFilter = 'high';
    expect(getFiltered().map(p => p.id)).toEqual(['3']);
  });

  it('typeFilter falls back to "preprint" when entryType is missing', () => {
    globalThis.PAPERS = [
      paper({ id: 'pre', entryType: undefined }),
      paper({ id: 'pub', entryType: 'published' }),
    ];
    globalThis.typeFilter = 'preprint';
    expect(getFiltered().map(p => p.id)).toEqual(['pre']);
  });

  it('activeCollection restricts to papers in that collection', () => {
    globalThis.PAPERS = [paper({ id: 'in' }), paper({ id: 'out' })];
    globalThis.SCQ.getCollectionsForPaper = (id) => (id === 'in' ? ['Lab'] : []);
    globalThis.activeCollection = 'Lab';
    expect(getFiltered().map(p => p.id)).toEqual(['in']);
  });

  it('falls back to PDF FTS when surface search misses', () => {
    globalThis.PAPERS = [
      paper({ id: 'has-pdf', title: 'Nothing matching' }),
      paper({ id: 'no-pdf', title: 'Nothing matching either' }),
    ];
    globalThis.searchQuery = 'inside-pdf';
    globalThis.pdfSearchEnabled = true;
    globalThis.SCQ.searchPdfText = () => ({ 'has-pdf': ['snippet'] });
    const result = getFiltered();
    expect(result.map(p => p.id)).toEqual(['has-pdf']);
    expect(globalThis.pdfSearchHits['has-pdf']).toEqual(['snippet']);
  });
});

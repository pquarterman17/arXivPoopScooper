/**
 * Tests for src/ui/database/related-papers.js
 *
 * getRelatedPapers reads from globalThis.PAPERS and globalThis.SCQ. We
 * stub both for the test, since the module's logic (link / authors /
 * tags / group matching + manual-link-first sort) is what we want to
 * cover, not the SCQ persistence layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRelatedPapers } from '../../../ui/database/related-papers.js';

function paper(overrides) {
  return {
    id: 'x',
    title: 't',
    authors: 'A. Author',
    tags: [],
    group: '',
    ...overrides,
  };
}

let savedPAPERS, savedSCQ;

beforeEach(() => {
  savedPAPERS = globalThis.PAPERS;
  savedSCQ = globalThis.SCQ;
});

afterEach(() => {
  globalThis.PAPERS = savedPAPERS;
  globalThis.SCQ = savedSCQ;
});

function setup({ papers, links = {} }) {
  globalThis.PAPERS = papers;
  globalThis.SCQ = {
    getLinkedPapers: (id) => (links[id] || []).map(linkedId => ({ id: linkedId })),
  };
}

describe('getRelatedPapers', () => {
  it('returns [] when nothing matches', () => {
    setup({
      papers: [
        paper({ id: 'me', authors: 'A. Author', tags: ['foo'], group: 'X' }),
        paper({ id: 'other', authors: 'B. Different', tags: ['bar'], group: 'Y' }),
      ],
    });
    const me = globalThis.PAPERS[0];
    expect(getRelatedPapers(me)).toEqual([]);
  });

  it('skips the paper itself', () => {
    setup({
      papers: [paper({ id: 'me', authors: 'A. Author' })],
    });
    expect(getRelatedPapers(globalThis.PAPERS[0])).toEqual([]);
  });

  it('flags shared authors when 2+ author surnames overlap', () => {
    setup({
      papers: [
        paper({ id: 'me', authors: 'A. Smith, B. Jones, C. Lee' }),
        paper({ id: 'p1', authors: 'A. Smith, B. Jones' }),  // 2 shared → match
        paper({ id: 'p2', authors: 'A. Smith' }),            // 1 shared → no
      ],
    });
    const result = getRelatedPapers(globalThis.PAPERS[0]);
    expect(result).toHaveLength(1);
    expect(result[0].paper.id).toBe('p1');
    expect(result[0].reasons[0]).toMatch(/shared authors/);
  });

  it('flags shared tags when 2+ overlap', () => {
    setup({
      papers: [
        paper({ id: 'me', tags: ['transmon', 'aluminum', 'TLS'] }),
        paper({ id: 'p1', tags: ['transmon', 'aluminum'] }),  // 2 → match
        paper({ id: 'p2', tags: ['transmon'] }),              // 1 → no
      ],
    });
    const result = getRelatedPapers(globalThis.PAPERS[0]);
    expect(result.map(r => r.paper.id)).toEqual(['p1']);
    expect(result[0].reasons[0]).toMatch(/tags:/);
  });

  it('flags same group', () => {
    setup({
      papers: [
        paper({ id: 'me', group: 'Princeton' }),
        paper({ id: 'p1', group: 'Princeton' }),
        paper({ id: 'p2', group: 'MIT' }),
      ],
    });
    const result = getRelatedPapers(globalThis.PAPERS[0]);
    expect(result.map(r => r.paper.id)).toEqual(['p1']);
    expect(result[0].reasons).toContain('same group');
  });

  it('combines multiple match reasons', () => {
    setup({
      papers: [
        paper({ id: 'me', authors: 'A. Smith, B. Jones', tags: ['t1', 't2'], group: 'X' }),
        paper({ id: 'p1', authors: 'A. Smith, B. Jones', tags: ['t1', 't2'], group: 'X' }),
      ],
    });
    const result = getRelatedPapers(globalThis.PAPERS[0]);
    expect(result).toHaveLength(1);
    expect(result[0].reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('sorts manually linked papers first', () => {
    setup({
      papers: [
        paper({ id: 'me', group: 'X' }),
        paper({ id: 'group-mate', group: 'X' }),
        paper({ id: 'linked' }),
      ],
      links: { me: ['linked'] },
    });
    const result = getRelatedPapers(globalThis.PAPERS[0]);
    expect(result[0].paper.id).toBe('linked');
    expect(result[0].reasons[0]).toBe('linked manually');
  });
});

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  normalizeArxivId, buildSearchUrl, parseAtom, searchArxiv, sortPapers, sortParams,
} from '../../services/arxiv.js';

const { DOMParser } = new JSDOM().window;
const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');

describe('normalizeArxivId', () => {
  it.each([
    ['2401.12345', '2401.12345'],
    ['2401.12345v2', '2401.12345'],
    ['arXiv:2401.12345', '2401.12345'],
    ['https://arxiv.org/abs/2401.12345', '2401.12345'],
    ['https://arxiv.org/abs/2401.12345v3', '2401.12345'],
    ['https://arxiv.org/pdf/2401.12345v1.pdf', '2401.12345'],
    ['  2401.12345  ', '2401.12345'],
    ['cond-mat/0301001', 'cond-mat/0301001'],
    ['cond-mat/0301001v2', 'cond-mat/0301001'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeArxivId(input)).toBe(expected);
  });

  it.each([
    [''],
    [null],
    [undefined],
    [123],
    ['nothing here'],
  ])('returns null for invalid input: %s', (input) => {
    expect(normalizeArxivId(input)).toBeNull();
  });
});

describe('sortParams', () => {
  it('maps known sort values', () => {
    expect(sortParams('relevance')).toMatch(/relevance/);
    expect(sortParams('updated')).toMatch(/lastUpdated/);
    expect(sortParams('date-asc')).toMatch(/ascending/);
    expect(sortParams('date-desc')).toMatch(/descending/);
  });

  it('falls back to date-desc for unknowns', () => {
    expect(sortParams('weird')).toBe(sortParams('date-desc'));
  });
});

describe('buildSearchUrl', () => {
  it('builds a free-text query URL', () => {
    const url = buildSearchUrl({ query: 'transmon', maxResults: 10 });
    // arXiv API expects `all:` literal, not %3A — matches legacy scraper behavior
    expect(url).toContain('search_query=all:transmon');
    expect(url).toContain('max_results=10');
    expect(url).toContain('start=0');
  });

  it('encodes special chars in query', () => {
    const url = buildSearchUrl({ query: 'two-level system' });
    expect(url).toContain('two-level%20system');
  });

  it('appends journalRef AND filter', () => {
    const url = buildSearchUrl({ query: 'foo', journalRef: 'Phys.+Rev.+Lett.' });
    expect(url).toContain('+AND+jr:Phys.+Rev.+Lett.');
  });

  it('clamps maxResults to [1, 100]', () => {
    expect(buildSearchUrl({ query: 'a', maxResults: 0 })).toContain('max_results=1');
    expect(buildSearchUrl({ query: 'a', maxResults: 999 })).toContain('max_results=100');
  });

  it('uses id_list when idList is provided', () => {
    const url = buildSearchUrl({ idList: ['2401.12345', '2403.00001v2'] });
    // The list is joined and then URL-encoded as a single value
    expect(url).toMatch(/id_list=2401\.12345(%2C|,)2403\.00001/);
    expect(url).not.toContain('search_query');
  });

  it('throws when neither query nor idList is provided', () => {
    expect(() => buildSearchUrl({})).toThrow(/query.*idList/);
  });
});

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v2</id>
    <title>
      Coherence in
      transmon qubits
    </title>
    <summary>
      We measure T1 and T2.
    </summary>
    <published>2024-01-15T18:00:00Z</published>
    <author><name>Alice Adams</name></author>
    <author><name>Bob Bell</name></author>
    <category term="cond-mat.supr-con"/>
    <category term="quant-ph"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.99999v1</id>
    <title>Another paper</title>
    <summary>About something.</summary>
    <published>2024-01-10T12:00:00Z</published>
    <author><name>One A. One</name></author>
    <author><name>Two B. Two</name></author>
    <author><name>Three C. Three</name></author>
    <author><name>Four D. Four</name></author>
    <category term="cond-mat.mes-hall"/>
  </entry>
</feed>`;

describe('parseAtom', () => {
  it('parses every <entry> into a paper object', () => {
    const papers = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(papers).toHaveLength(2);
  });

  it('strips arxiv URL + version from id', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.id).toBe('2401.12345');
    expect(p1.arxivId).toBe('2401.12345');
  });

  it('collapses internal whitespace in title and summary', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.title).toBe('Coherence in transmon qubits');
    expect(p1.summary).toBe('We measure T1 and T2.');
  });

  it('extracts year from published timestamp', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.year).toBe(2024);
  });

  it('joins authors with commas; abbreviates if more than 3', () => {
    const [p1, p2] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.authors).toBe('Alice Adams, Bob Bell');
    expect(p1.shortAuthors).toBe('Adams, Bell');
    expect(p2.shortAuthors).toBe('One et al.');
  });

  it('collects categories', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.categories).toEqual(['cond-mat.supr-con', 'quant-ph']);
  });

  it('uses the source label from opts', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml, source: 'prl' });
    expect(p1.source).toBe('prl');
  });

  it('builds the abs URL from the normalized id', () => {
    const [p1] = parseAtom(SAMPLE_ATOM, { parseXml });
    expect(p1.url).toBe('https://arxiv.org/abs/2401.12345');
  });
});

describe('searchArxiv', () => {
  it('throws on HTTP 429 with a useful message', async () => {
    const fakeFetch = async () => ({ ok: false, status: 429, text: async () => '' });
    await expect(searchArxiv('q', { fetch: fakeFetch, parseXml })).rejects.toThrow(/rate-limited/);
  });

  it('throws on other HTTP errors with the status code', async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, text: async () => '' });
    await expect(searchArxiv('q', { fetch: fakeFetch, parseXml })).rejects.toThrow(/HTTP 500/);
  });

  it('end-to-end fetch + parse', async () => {
    const fakeFetch = async (url) => {
      expect(url).toContain('search_query=all:transmon');
      return { ok: true, status: 200, text: async () => SAMPLE_ATOM };
    };
    const papers = await searchArxiv('transmon', { fetch: fakeFetch, parseXml });
    expect(papers.map((p) => p.id)).toEqual(['2401.12345', '2401.99999']);
  });
});

describe('sortPapers', () => {
  const papers = [
    { title: 'B', published: '2024-03-01', shortAuthors: 'Smith, Jones' },
    { title: 'A', published: '2024-05-01', shortAuthors: 'Adams' },
    { title: 'C', published: '2024-01-01', shortAuthors: 'Wong' },
  ];

  it('sorts by date desc by default', () => {
    expect(sortPapers(papers, 'date-desc').map((p) => p.title)).toEqual(['A', 'B', 'C']);
  });

  it('sorts by date asc', () => {
    expect(sortPapers(papers, 'date-asc').map((p) => p.title)).toEqual(['C', 'B', 'A']);
  });

  it('sorts by author surname', () => {
    expect(sortPapers(papers, 'author').map((p) => p.shortAuthors)).toEqual(['Adams', 'Smith, Jones', 'Wong']);
  });

  it('sorts by title alphabetically', () => {
    expect(sortPapers(papers, 'title').map((p) => p.title)).toEqual(['A', 'B', 'C']);
  });

  it('relevance is a no-op (preserves input order)', () => {
    expect(sortPapers(papers, 'relevance')).toEqual(papers);
  });

  it('does not mutate the input array', () => {
    const before = papers.slice();
    sortPapers(papers, 'date-asc');
    expect(papers).toEqual(before);
  });
});

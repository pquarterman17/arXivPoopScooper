import { describe, it, expect } from 'vitest';
import { extractDoi, formatBibTeX, formatPlainText } from '../../services/doi.js';

describe('extractDoi', () => {
  it('returns null for empty / nullish input', () => {
    expect(extractDoi('')).toBeNull();
    expect(extractDoi(null)).toBeNull();
    expect(extractDoi(undefined)).toBeNull();
  });

  it('returns a bare DOI as-is', () => {
    expect(extractDoi('10.1103/PhysRevLett.123.456789')).toBe('10.1103/PhysRevLett.123.456789');
  });

  it('extracts from a doi.org URL', () => {
    expect(extractDoi('https://doi.org/10.1038/nphys1234')).toBe('10.1038/nphys1234');
    expect(extractDoi('http://DOI.org/10.1038/nphys1234')).toBe('10.1038/nphys1234');
  });

  it('extracts from an APS journal abstract URL', () => {
    expect(extractDoi('https://journals.aps.org/prb/abstract/10.1103/PhysRevB.42.123'))
      .toBe('10.1103/PhysRevB.42.123');
  });

  it('extracts from a CrossRef API URL', () => {
    expect(extractDoi('https://api.crossref.org/works/10.1103/PhysRevX.10.011001'))
      .toBe('10.1103/PhysRevX.10.011001');
  });

  it('extracts from "doi: 10.X/Y" prefix style', () => {
    expect(extractDoi('doi: 10.1126/science.abc1234')).toBe('10.1126/science.abc1234');
    expect(extractDoi('DOI:10.1126/science.abc1234')).toBe('10.1126/science.abc1234');
  });

  it('strips trailing punctuation', () => {
    expect(extractDoi('10.1103/PhysRev.42.123,')).toBe('10.1103/PhysRev.42.123');
    expect(extractDoi('See 10.1038/foo.bar)')).toBe('10.1038/foo.bar');
    expect(extractDoi('10.1038/foo.bar.')).toBe('10.1038/foo.bar');
  });

  it('returns null when no DOI is present', () => {
    expect(extractDoi('arXiv:2401.12345')).toBeNull();
    expect(extractDoi('plain text with no identifier')).toBeNull();
  });
});

describe('formatBibTeX', () => {
  it('produces an @article entry with standard fields', () => {
    const out = formatBibTeX({
      doi: '10.1103/PhysRevB.42.123',
      title: 'Coherent transmon qubits',
      authors: 'Alice Smith, Bob Jones',
      year: 2024,
      journal: 'Phys. Rev. B',
      volume: '42',
      pages: '123',
    });
    expect(out).toMatch(/^@article\{/);
    expect(out).toContain('title     = {Coherent transmon qubits}');
    expect(out).toContain('author    = {Smith, Alice and Jones, Bob}');
    expect(out).toContain('journal   = {Phys. Rev. B}');
    expect(out).toContain('doi       = {10.1103/PhysRevB.42.123}');
  });

  it('builds a citekey from first-surname + year + first-title-word', () => {
    const out = formatBibTeX({
      authors: 'Alice Smith',
      year: 2024,
      title: 'Coherent transmon qubits',
    });
    expect(out).toMatch(/^@article\{smith2024coherent,/);
  });

  it('handles missing fields without crashing', () => {
    const out = formatBibTeX({});
    expect(out).toContain('@article{unknownarticle');
    expect(out).toContain('doi       = {}');
  });
});

describe('formatPlainText', () => {
  it('formats two authors with "and"', () => {
    expect(formatPlainText({
      authors: 'Alice Smith, Bob Jones',
      title: 'A paper',
      journal: 'Phys. Rev. B',
      volume: '42',
      pages: '123',
      year: 2024,
      doi: '10.1/x',
    })).toBe('A. Smith and B. Jones, "A paper," Phys. Rev. B 42, 123 (2024). https://doi.org/10.1/x');
  });

  it('formats 3+ authors with comma + ", and"', () => {
    expect(formatPlainText({
      authors: 'Alice Smith, Bob Jones, Carol Lee',
      title: 't',
      journal: 'J',
      year: 2024,
      doi: '10.1/x',
    })).toContain('A. Smith, B. Jones, and C. Lee');
  });

  it('formats single author', () => {
    const out = formatPlainText({
      authors: 'Alice Smith',
      title: 't',
      journal: 'J',
      year: 2024,
      doi: '10.1/x',
    });
    expect(out).toMatch(/^A\. Smith, /);
  });

  it('uses "Unknown" when no authors', () => {
    const out = formatPlainText({
      title: 't',
      journal: 'J',
      year: 2024,
      doi: '10.1/x',
    });
    expect(out).toMatch(/^Unknown,/);
  });

  it('omits volume/pages cleanly when missing', () => {
    expect(formatPlainText({
      authors: 'Alice Smith',
      title: 't',
      journal: 'J',
      year: 2024,
      doi: '10.1/x',
    })).toBe('A. Smith, "t," J (2024). https://doi.org/10.1/x');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { formatBibTeX, formatPlainText, applyCitations } from '../../services/citations.js';

const ARXIV_PAPER = {
  id: '2401.12345',
  arxivId: '2401.12345',
  title: 'Coherence in transmon qubits',
  authors: 'Alice Adams, Bob Bell',
  shortAuthors: 'Adams, Bell',
  year: 2024,
  source: 'arxiv',
  url: 'https://arxiv.org/abs/2401.12345',
};

const PUBLISHED_PAPER = {
  id: 'doi-paper-1',
  title: 'Surface oxides in tantalum',
  authors: 'C. Researcher, D. Coauthor',
  shortAuthors: 'Researcher, Coauthor',
  year: 2024,
  journal: 'Phys. Rev. Lett.',
  volume: '132',
  pages: '012345',
  doi: '10.1103/PhysRevLett.132.012345',
  url: 'https://doi.org/10.1103/PhysRevLett.132.012345',
};

describe('formatBibTeX', () => {
  it('produces a valid bib entry for an arXiv preprint', () => {
    const bib = formatBibTeX(ARXIV_PAPER);
    expect(bib).toContain('@article{adamsbell2024,');
    expect(bib).toContain('title = {Coherence in transmon qubits}');
    expect(bib).toContain('author = {Alice Adams, Bob Bell}');
    expect(bib).toContain('eprint = {2401.12345}');
    expect(bib).toContain('archivePrefix = {arXiv}');
    expect(bib.trim().endsWith('}')).toBe(true);
  });

  it('emits doi for published papers', () => {
    const bib = formatBibTeX(PUBLISHED_PAPER);
    expect(bib).toContain('doi = {10.1103/PhysRevLett.132.012345}');
    expect(bib).toContain('journal = {Phys. Rev. Lett.}');
    expect(bib).toContain('volume = {132}');
    expect(bib).toContain('pages = {012345}');
  });

  it('omits doi when includeDoi=false', () => {
    const bib = formatBibTeX(PUBLISHED_PAPER, { includeDoi: false });
    expect(bib).not.toContain('doi =');
  });

  it('omits arxiv eprint when includeArxivId=false', () => {
    const bib = formatBibTeX(ARXIV_PAPER, { includeArxivId: false });
    expect(bib).not.toContain('eprint');
    expect(bib).not.toContain('archivePrefix');
  });

  it('cite key is shortAuthor + year, lowercase, alpha-only', () => {
    const p = { ...ARXIV_PAPER, shortAuthors: "O'Brien, K. Doe", year: 2025 };
    const bib = formatBibTeX(p);
    expect(bib).toMatch(/^@article\{obrienkdoe2025,/);
  });

  it('returns empty string for null paper', () => {
    expect(formatBibTeX(null)).toBe('');
  });
});

describe('formatPlainText', () => {
  it('matches the legacy PRL format byte-for-byte for an arXiv paper', () => {
    // Reproduces the output of the legacy scraper_config.js formatPlainText().
    expect(formatPlainText(ARXIV_PAPER)).toBe(
      'Alice Adams, Bob Bell, "Coherence in transmon qubits," arXiv:2401.12345 (2024).'
    );
  });

  it('matches the legacy PRL format for a published paper', () => {
    expect(formatPlainText(PUBLISHED_PAPER)).toBe(
      'C. Researcher, D. Coauthor, "Surface oxides in tantalum," Phys. Rev. Lett., 132, 012345 (2024), doi:10.1103/PhysRevLett.132.012345.'
    );
  });

  it('falls back to year only when no doi and not arxiv', () => {
    const paper = { authors: 'A. Dev', title: 'Local note', year: 2024 };
    expect(formatPlainText(paper)).toBe('A. Dev, "Local note," (2024).');
  });

  it('respects defaultStyle from config (apa)', () => {
    const out = formatPlainText(PUBLISHED_PAPER, { defaultStyle: 'apa' });
    expect(out).toContain('(2024). Surface oxides in tantalum');
    expect(out).toContain('https://doi.org/10.1103/PhysRevLett.132.012345');
  });

  it('respects defaultStyle from config (ieee)', () => {
    const out = formatPlainText(PUBLISHED_PAPER, { defaultStyle: 'ieee' });
    expect(out).toContain('vol. 132');
    expect(out).toContain('pp. 012345');
    expect(out).toContain('doi: 10.1103/PhysRevLett.132.012345');
  });

  it('falls back to prl on unknown style with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    formatPlainText(ARXIV_PAPER, { defaultStyle: 'made-up' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('applyCitations', () => {
  it('writes cite_bib + cite_txt onto a paper without mutating it', () => {
    const paper = { ...ARXIV_PAPER };
    const out = applyCitations(paper);
    expect(out).not.toBe(paper);
    expect(out.cite_bib).toContain('@article{');
    expect(out.cite_txt).toContain('arXiv:');
    expect(paper.cite_bib).toBeUndefined();
  });
});

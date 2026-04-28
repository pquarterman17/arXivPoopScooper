import { describe, it, expect } from 'vitest';
import { autoTag, applyAutoTags } from '../../services/auto-tag.js';

const RULES = {
  rules: [
    { tag: 'transmon', patterns: ['transmon', 'Xmon'] },
    { tag: 'aluminum', patterns: ['Al ', 'Al-based', 'aluminum'] },
    { tag: 'TLS', patterns: ['TLS', 'two-level system'] },
    { tag: 'specific', patterns: ['CapitalSpecific'], caseSensitive: true },
  ],
};

describe('autoTag', () => {
  it('matches single substring (case-insensitive)', () => {
    expect(autoTag('A transmon paper', RULES)).toEqual(['transmon']);
    expect(autoTag('A TRANSMON paper', RULES)).toEqual(['transmon']);
  });

  it('matches multiple tags from one text', () => {
    expect(autoTag('transmon TLS aluminum', RULES)).toEqual(['transmon', 'aluminum', 'TLS']);
  });

  it('preserves rule list order in output, not text order', () => {
    expect(autoTag('TLS transmon', RULES)).toEqual(['transmon', 'TLS']);
  });

  it('skips tags already in `existing`', () => {
    expect(autoTag('transmon TLS', RULES, ['transmon'])).toEqual(['TLS']);
  });

  it('respects caseSensitive flag', () => {
    expect(autoTag('capitalspecific', RULES)).toEqual([]);
    expect(autoTag('CapitalSpecific', RULES)).toEqual(['specific']);
  });

  it('avoids "Al" matching "algorithm" by relying on trailing space in pattern', () => {
    expect(autoTag('Algorithm description', RULES)).toEqual([]);
    expect(autoTag('Al thin film', RULES)).toEqual(['aluminum']);
  });

  it('returns empty array for empty/missing input', () => {
    expect(autoTag('', RULES)).toEqual([]);
    expect(autoTag(null, RULES)).toEqual([]);
    expect(autoTag('text', null)).toEqual([]);
    expect(autoTag('text', { rules: null })).toEqual([]);
  });

  it('does not output duplicate tags even if multiple patterns match', () => {
    const r = { rules: [{ tag: 'm', patterns: ['cat', 'dog'] }] };
    expect(autoTag('a cat and a dog', r)).toEqual(['m']);
  });
});

describe('applyAutoTags', () => {
  it('appends suggestions to paper.tags without dropping existing', () => {
    const paper = { title: 'transmon study', summary: 'TLS effects', tags: ['existing'] };
    const out = applyAutoTags(paper, RULES);
    expect(out.tags).toEqual(['existing', 'transmon', 'TLS']);
  });

  it('uses summary OR abstract field', () => {
    const a = { title: 'Foo', abstract: 'transmon' };
    const b = { title: 'Foo', summary: 'transmon' };
    expect(applyAutoTags(a, RULES).tags).toContain('transmon');
    expect(applyAutoTags(b, RULES).tags).toContain('transmon');
  });

  it('returns the input unchanged when there are no suggestions', () => {
    const paper = { title: 'foo', summary: 'bar', tags: ['x'] };
    expect(applyAutoTags(paper, RULES)).toBe(paper);
  });

  it('returns the input unchanged when paper is null/undefined', () => {
    expect(applyAutoTags(null, RULES)).toBeNull();
    expect(applyAutoTags(undefined, RULES)).toBeUndefined();
  });
});

describe('auto-tag against the real shipped rules', () => {
  it('the shipped auto-tag-rules file does not crash autoTag', async () => {
    const fs = await import('node:fs/promises');
    const rules = JSON.parse(await fs.readFile('src/config/defaults/auto-tag-rules.json', 'utf8'));
    const tags = autoTag('transmon qubit coherence in tantalum resonators', rules);
    expect(tags).toContain('transmon');
    expect(tags).toContain('qubit');
    expect(tags).toContain('tantalum');
    expect(tags).toContain('resonator');
    expect(tags).toContain('coherence');
  });
});

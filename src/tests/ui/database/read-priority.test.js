/**
 * Tests for src/ui/database/read-priority.js
 *
 * Only renderStars is purely a function of (PAPERS, paperId) → HTML
 * string; the rest mutate state through SCQ + render() and are better
 * covered as integration tests once the harness exists. This file
 * locks in the star-rendering contract: 3 buttons, "filled" class
 * applied for ranks ≤ current priority.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderStars } from '../../../ui/database/read-priority.js';

let savedPAPERS;

beforeEach(() => { savedPAPERS = globalThis.PAPERS; });
afterEach(() => { globalThis.PAPERS = savedPAPERS; });

describe('renderStars', () => {
  it('renders 3 buttons regardless of priority', () => {
    globalThis.PAPERS = [{ id: 'p', _priority: 0 }];
    const html = renderStars('p');
    expect((html.match(/<button/g) || []).length).toBe(3);
  });

  it('marks no buttons filled when priority is 0', () => {
    globalThis.PAPERS = [{ id: 'p', _priority: 0 }];
    const html = renderStars('p');
    expect(html).not.toMatch(/filled/);
  });

  it('fills the first N stars for priority N', () => {
    globalThis.PAPERS = [{ id: 'p', _priority: 2 }];
    const html = renderStars('p');
    expect((html.match(/star-btn filled/g) || []).length).toBe(2);
  });

  it('fills all 3 stars at priority 3', () => {
    globalThis.PAPERS = [{ id: 'p', _priority: 3 }];
    const html = renderStars('p');
    expect((html.match(/star-btn filled/g) || []).length).toBe(3);
  });

  it('emits the right onclick handler with paperId + star index', () => {
    globalThis.PAPERS = [{ id: 'paper-42', _priority: 0 }];
    const html = renderStars('paper-42');
    expect(html).toContain("setStarRating('paper-42', 1, event)");
    expect(html).toContain("setStarRating('paper-42', 2, event)");
    expect(html).toContain("setStarRating('paper-42', 3, event)");
  });

  it('renders empty stars when paper not found', () => {
    globalThis.PAPERS = [];
    const html = renderStars('missing');
    expect((html.match(/<button/g) || []).length).toBe(3);
    expect(html).not.toMatch(/filled/);
  });
});

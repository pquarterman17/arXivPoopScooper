// @vitest-environment jsdom

/**
 * Plan #9 Phase B — doi-lookup extraction regression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  for (const k of ['doDoiLookup', 'renderDoiResult', 'stageDoiPaper',
                   '_doiLookupPaper', 'inbox', 'existingIds', 'CFG',
                   'autoTag', 'esc', 'corsFetch', 'saveInbox',
                   'updateInboxBadge']) {
    delete globalThis[k];
  }
  document.body.innerHTML = `
    <input id="doi-input" />
    <button id="doi-btn">Lookup</button>
    <div id="doi-status"></div>
    <div id="doi-result"></div>
  `;
});

async function load() {
  return await import('../../../ui/scraper/doi-lookup.js?v=' + Math.random());
}

describe('window shims', () => {
  it('exposes doDoiLookup, renderDoiResult, stageDoiPaper', async () => {
    await load();
    expect(typeof globalThis.doDoiLookup).toBe('function');
    expect(typeof globalThis.renderDoiResult).toBe('function');
    expect(typeof globalThis.stageDoiPaper).toBe('function');
  });
});

describe('doDoiLookup empty-input guard', () => {
  it('emits a status message when input is blank, does not call corsFetch', async () => {
    globalThis.corsFetch = vi.fn();
    await load();
    document.getElementById('doi-input').value = '';
    await globalThis.doDoiLookup();
    expect(globalThis.corsFetch).not.toHaveBeenCalled();
    expect(document.getElementById('doi-status').textContent).toMatch(/Enter a DOI/);
  });
});

describe('doDoiLookup DOI extraction', () => {
  beforeEach(() => {
    globalThis.CFG = { sources: {} };
    globalThis.existingIds = new Set();
    globalThis.autoTag = () => [];
    globalThis.esc = (s) => String(s);
  });

  async function setupSuccess(doiInput) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        message: {
          title: ['T'],
          author: [{ given: 'A', family: 'Smith' }],
          published: { 'date-parts': [[2024, 1, 1]] },
          'container-title': ['Phys. Rev. B'],
          ISSN: [],
        },
      }),
    });
    globalThis.corsFetch = fetchMock;
    document.getElementById('doi-input').value = doiInput;
    await load();
    await globalThis.doDoiLookup();
    return fetchMock;
  }

  it('extracts DOI from a raw "10.xxxx/yy" input', async () => {
    const fetchMock = await setupSuccess('10.1103/PhysRevB.99.012345');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.crossref.org/works/10.1103/PhysRevB.99.012345');
  });

  it('extracts DOI from a doi.org URL', async () => {
    const fetchMock = await setupSuccess('https://doi.org/10.1103/PhysRevB.99.012345');
    expect(fetchMock.mock.calls[0][0]).toContain('/10.1103/PhysRevB.99.012345');
  });

  it('extracts DOI from an APS abstract URL', async () => {
    const fetchMock = await setupSuccess('https://journals.aps.org/prb/abstract/10.1103/PhysRevB.99.012345');
    expect(fetchMock.mock.calls[0][0]).toContain('/10.1103/PhysRevB.99.012345');
  });
});

describe('stageDoiPaper', () => {
  it('returns a no-op when no paper has been parked', async () => {
    globalThis.inbox = [];
    await load();
    expect(() => globalThis.stageDoiPaper()).not.toThrow();
    expect(globalThis.inbox).toEqual([]);
  });

  it('pushes the parked paper into the inbox + clears the result panel', async () => {
    globalThis.inbox = [];
    globalThis.saveInbox = vi.fn();
    globalThis.updateInboxBadge = vi.fn();
    await load();
    globalThis._doiLookupPaper = { id: '10.x/y', title: 'T' };
    document.getElementById('doi-result').innerHTML = '<div>previous</div>';
    globalThis.stageDoiPaper();
    expect(globalThis.inbox.length).toBe(1);
    expect(globalThis.inbox[0].id).toBe('10.x/y');
    expect(globalThis.inbox[0].note).toBe('');
    expect(globalThis.saveInbox).toHaveBeenCalled();
    expect(globalThis.updateInboxBadge).toHaveBeenCalled();
    expect(document.getElementById('doi-result').innerHTML).toBe('');
  });

  it('does not double-add a paper already in the inbox', async () => {
    globalThis.inbox = [{ id: '10.x/y', title: 'old' }];
    globalThis.saveInbox = vi.fn();
    globalThis.updateInboxBadge = vi.fn();
    await load();
    globalThis._doiLookupPaper = { id: '10.x/y', title: 'new' };
    globalThis.stageDoiPaper();
    expect(globalThis.inbox.length).toBe(1);
    expect(globalThis.inbox[0].title).toBe('old');
  });
});

/**
 * DB → in-memory state loader (plan #8 strangler-fig migration).
 *
 * `loadPapersFromDB` reads every row from the papers table (joined with
 * notes + read_status), normalizes JSON fields via the local _jp helper,
 * pulls each paper's figures into the FIGS map, and assigns the result
 * to the legacy `PAPERS` global so render() and getFiltered() can see it.
 *
 * The legacy boot block (SCQ.init().then(...)) still owns the boot order
 * and reaches loadPapersFromDB through the window shim main.js installs,
 * along with every tag-manager / suggestions-banner action that wants to
 * rebuild the in-memory copy after a mutation.
 */

function _scq() { return globalThis.SCQ; }

function _jp(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function loadPapersFromDB() {
  const SCQ = _scq();
  const rows = SCQ.getAllPapers();
  const PAPERS = rows.map(r => ({
    id: r.id,
    title: r.title,
    authors: r.authors,
    shortAuthors: r.short_authors || '',
    year: r.year,
    group: r.group_name || '',
    dateAdded: r.date_added || '',
    tags: _jp(r.tags, []),
    summary: r.summary || '',
    keyResults: _jp(r.key_results, []),
    url: r.url || '',
    citeBib: r.cite_bib || '',
    citeTxt: r.cite_txt || '',
    entryType: r.entry_type || 'preprint',
    figures: [],
    _read: !!r.is_read,
    _priority: r.priority || 0,
    _note: r.note || '',
    _lastEdited: r.last_edited || '',
  }));

  const FIGS = {};
  PAPERS.forEach(p => {
    const figs = SCQ.getFigures(p.id);
    p.figures = figs.map(f => ({ key: f.figure_key, label: f.label, desc: f.caption }));
    figs.forEach(f => { FIGS[f.figure_key] = f.file_path; });
  });

  // Reassign the legacy slots — modules read PAPERS / FIGS via globalThis.
  globalThis.PAPERS = PAPERS;
  globalThis.FIGS = FIGS;
}

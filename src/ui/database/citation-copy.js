/**
 * "Copy for Word" actions in the library row + toolbar (plan #8).
 *
 * Both call sites are inline `onclick=` attributes in the rendered table
 * and the export toolbar, so the functions are shimmed onto `window` from
 * main.js until those handlers migrate.
 *
 * `PAPERS` is reassigned by `loadPapersFromDB()` in the legacy block, so
 * we read `globalThis.PAPERS` each call rather than capturing a reference
 * at import time. The legacy file does `window.PAPERS = PAPERS;` after
 * every reassignment to keep the binding fresh.
 *
 * `copyText` is a top-level `function` in the legacy block, so it's
 * already on `window`. We call it via `globalThis.copyText`.
 */

export function copyForWord(paperId, btnId) {
  const papers = globalThis.PAPERS || [];
  const p = papers.find(x => x.id === paperId);
  if (!p) return;
  globalThis.copyText(p.citeTxt, btnId);
}

export function copyAllForWord(btnId) {
  const papers = globalThis.PAPERS || [];
  const txt = papers.map((p, i) => '[' + (i + 1) + '] ' + p.citeTxt).join('\n\n');
  globalThis.copyText(txt, btnId);
}

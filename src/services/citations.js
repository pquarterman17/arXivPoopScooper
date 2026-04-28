/**
 * Citations service. Format paper objects as BibTeX or plain-text citations.
 *
 * Replaces the function-typed `formatBibTeX` / `formatPlainText` entries in
 * the legacy scraper_config.js — those couldn't live in JSON. The "prl" style
 * here matches what the legacy code produced byte-for-byte (verified by the
 * golden test in citations.test.js).
 *
 * Style is taken from the citations config (`defaultStyle`) or passed
 * explicitly. Currently supported plain-text styles: "prl". Other styles
 * fall back to "prl" with a console.warn — extend the switch in
 * `formatPlainText()` to add aps/apa/ieee variants when needed.
 *
 * No DOM, no globals. Pure functions of (paper, config|style).
 */

/**
 * @param {object} paper       — paper object (id, title, authors, year, doi, journal, etc.)
 * @param {object} [config]    — citations config (from getConfig('citations'))
 * @returns {string} BibTeX citation
 */
export function formatBibTeX(paper, config = {}) {
  if (!paper) return '';
  const includeDoi = config.includeDoi !== false;
  const includeArxiv = config.includeArxivId !== false;
  const includeUrl = config.includeUrl !== false;

  const shortAuth = (paper.shortAuthors || paper.short_authors || 'Unknown').replace(/[^a-zA-Z]/g, '');
  const year = paper.year || new Date().getFullYear();
  const key = (shortAuth + year).toLowerCase();

  const lines = [`@article{${key},`];
  lines.push(`  title = {${paper.title || ''}},`);
  lines.push(`  author = {${paper.authors || ''}},`);
  lines.push(`  year = {${year}},`);
  if (paper.journal) lines.push(`  journal = {${paper.journal}},`);
  if (paper.volume) lines.push(`  volume = {${paper.volume}},`);
  if (paper.pages) lines.push(`  pages = {${paper.pages}},`);
  if (includeDoi && paper.doi) lines.push(`  doi = {${paper.doi}},`);
  const aid = paper.arxivId || paper.arxiv_id || (paper.source === 'arxiv' ? paper.id : '');
  if (includeArxiv && aid) {
    lines.push(`  eprint = {${aid}},`);
    lines.push('  archivePrefix = {arXiv},');
  }
  if (includeUrl) lines.push(`  url = {${paper.url || ''}}`);
  // strip trailing comma on the last field if present, then close brace
  const last = lines[lines.length - 1];
  if (last.endsWith(',')) lines[lines.length - 1] = last.slice(0, -1);
  lines.push('}');
  return lines.join('\n');
}

/**
 * @param {object} paper       — paper object
 * @param {object} [config]    — citations config (uses .defaultStyle)
 * @param {string} [styleOverride] — force a specific style
 * @returns {string} plain-text citation
 */
export function formatPlainText(paper, config = {}, styleOverride) {
  if (!paper) return '';
  const style = styleOverride || config.defaultStyle || 'prl';
  switch (style) {
    case 'prl':
    case 'aps':
      return _formatPRL(paper, config);
    case 'apa':
      return _formatAPA(paper, config);
    case 'ieee':
      return _formatIEEE(paper, config);
    default:
      console.warn(`[services/citations] unknown style "${style}", falling back to prl`);
      return _formatPRL(paper, config);
  }
}

/**
 * Format both bib and plain-text in one call. Updates the paper's
 * cite_bib / cite_txt fields. Used during ingest.
 */
export function applyCitations(paper, config = {}) {
  if (!paper) return paper;
  return {
    ...paper,
    cite_bib: formatBibTeX(paper, config),
    cite_txt: formatPlainText(paper, config),
  };
}

// ─── style implementations ───

function _formatPRL(paper, config) {
  const includeDoi = config.includeDoi !== false;
  const year = paper.year || new Date().getFullYear();
  let cite = `${paper.authors || ''}, "${paper.title || ''},"`;
  if (paper.journal) cite += ` ${paper.journal}`;
  if (paper.volume) cite += `, ${paper.volume}`;
  if (paper.pages) cite += `, ${paper.pages}`;
  if (includeDoi && paper.doi) {
    cite += ` (${year}), doi:${paper.doi}`;
  } else if (paper.source === 'arxiv' || paper.arxivId || paper.arxiv_id) {
    const aid = paper.arxivId || paper.arxiv_id || paper.id;
    cite += ` arXiv:${aid} (${year})`;
  } else {
    cite += ` (${year})`;
  }
  cite += '.';
  return cite;
}

function _formatAPA(paper, config) {
  const year = paper.year || new Date().getFullYear();
  const includeDoi = config.includeDoi !== false;
  const authors = paper.authors || '';
  let cite = `${authors} (${year}). ${paper.title || ''}.`;
  if (paper.journal) cite += ` ${paper.journal}`;
  if (paper.volume) cite += `, ${paper.volume}`;
  if (paper.pages) cite += `, ${paper.pages}`;
  cite += '.';
  if (includeDoi && paper.doi) cite += ` https://doi.org/${paper.doi}`;
  return cite;
}

function _formatIEEE(paper, config) {
  const year = paper.year || new Date().getFullYear();
  const includeDoi = config.includeDoi !== false;
  let cite = `${paper.authors || ''}, "${paper.title || ''},"`;
  if (paper.journal) cite += ` ${paper.journal}`;
  if (paper.volume) cite += `, vol. ${paper.volume}`;
  if (paper.pages) cite += `, pp. ${paper.pages}`;
  cite += `, ${year}`;
  if (includeDoi && paper.doi) cite += `. doi: ${paper.doi}`;
  cite += '.';
  return cite;
}

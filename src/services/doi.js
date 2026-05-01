/**
 * DOI utilities (DOM-free).
 *
 * Normalizes a free-form input (raw DOI, doi.org URL, journal abstract URL)
 * into a bare DOI string, and provides BibTeX / plain-text citation
 * formatters for CrossRef metadata.
 *
 * Used by the scraper's DOI lookup tab and by the database's
 * "Add Website / Link" modal — both originally had local copies of these
 * helpers; this module centralizes them.
 */

/**
 * Extract a bare DOI from a string. Returns null if no DOI is found.
 *
 * Recognised forms:
 *   - bare DOI: 10.1103/PhysRevLett.123.456789
 *   - doi.org URL: https://doi.org/10.1103/...
 *   - APS abstract URL: https://journals.aps.org/prb/abstract/10.1103/...
 *   - CrossRef API URL: https://api.crossref.org/works/10.1103/...
 *   - "doi: 10.X/Y" prefix style
 *
 * Trailing punctuation `.,;:)\]` is stripped — common in inline references.
 */
export function extractDoi(input) {
  if (!input) return null;
  const s = String(input).trim();

  const apsMatch = s.match(/journals\.aps\.org\/\w+\/abstract\/(10\.\d{4,}\/\S+)/);
  if (apsMatch) return _strip(apsMatch[1]);

  const doiOrgMatch = s.match(/doi\.org\/(10\.\d{4,}\/\S+)/i);
  if (doiOrgMatch) return _strip(doiOrgMatch[1]);

  const apiMatch = s.match(/api\.crossref\.org\/works\/(10\.\d{4,}\/\S+)/);
  if (apiMatch) return _strip(apiMatch[1]);

  const prefixMatch = s.match(/doi:\s*(10\.\S+)/i);
  if (prefixMatch) return _strip(prefixMatch[1]);

  const rawMatch = s.match(/(10\.\d{4,}\/\S+)/);
  if (rawMatch) return _strip(rawMatch[1]);

  return null;
}

function _strip(doi) {
  return doi.replace(/[.,;:)\]]+$/, '');
}

/**
 * Format CrossRef-style metadata as a BibTeX `@article` entry.
 *
 * `metadata` shape: { doi, title, authors, year, journal, volume, pages }
 * — `authors` is the comma-separated string CrossRef returns
 * ("Alice Smith, Bob Jones, ...").
 */
export function formatBibTeX({ doi, title, authors, year, journal, volume, pages }) {
  const authList = (authors || '').split(',').filter(a => a.trim());
  const firstSurname = authList[0]?.trim().split(/\s+/).pop()?.toLowerCase() || 'unknown';
  const titleWord = (title || '').split(/\s+/)[0]?.replace(/[^a-z]/gi, '')?.toLowerCase() || 'article';
  const key = `${firstSurname}${year || ''}${titleWord}`;

  const bibAuthors = authList.map(a => {
    const parts = a.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
    }
    return a.trim();
  }).join(' and ');

  return `@article{${key},
  title     = {${title || ''}},
  author    = {${bibAuthors}},
  journal   = {${journal || ''}},
  volume    = {${volume || ''}},
  pages     = {${pages || ''}},
  year      = {${year || ''}},
  doi       = {${doi || ''}}
}`;
}

/**
 * Format CrossRef-style metadata as a Physical-Review-style plain-text
 * citation: "I. Surname, J. Other, and K. Last, "Title," Journal Vol, pp (Year). https://doi.org/X"
 */
export function formatPlainText({ doi, title, authors, year, journal, volume, pages }) {
  const authList = (authors || '').split(',').filter(a => a.trim());
  const formatted = authList.map(a => {
    const parts = a.trim().split(/\s+/);
    if (parts.length >= 2) {
      const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
      return `${initials} ${parts[parts.length - 1]}`;
    }
    return a.trim();
  });

  let authorStr;
  if (formatted.length > 2) {
    authorStr = formatted.slice(0, -1).join(', ') + ', and ' + formatted[formatted.length - 1];
  } else if (formatted.length === 2) {
    authorStr = formatted.join(' and ');
  } else {
    authorStr = formatted[0] || 'Unknown';
  }

  return `${authorStr}, "${title || ''}," ${journal || ''}${volume ? ` ${volume}` : ''}${pages ? `, ${pages}` : ''} (${year || ''}). https://doi.org/${doi || ''}`;
}

/**
 * Quick Search tab — lightweight arXiv-only search with selection +
 * JSON export ("for Claude" workflow).
 *
 * Extracted from paper_scraper.html boot block (~lines 391–575 pre-extraction)
 * as part of plan #9 Phase B. Nine functions, all shimmed onto globalThis.
 *
 * Also pulls in the four keydown-Enter listeners that wired up
 * Quick/Main/year-from/year-to inputs to their respective doSearch
 * variants. They run at module-eval time (which is after DOM parse but
 * before DOMContentLoaded) so getElementById finds the inputs.
 *
 * **Cross-module deps:**
 *   - state: quickResults, quickSelected
 *   - boot-block helpers: esc, showStatusError
 *   - search-tab.js: doSearch, getArxivSortParams (both shimmed)
 *   - cors-fetch.js: corsFetch (shimmed)
 */

function quickSetQuery(q) {
  document.getElementById('quick-search-input').value = q;
  quickDoSearch();
}

async function quickDoSearch() {
  const query = document.getElementById('quick-search-input').value.trim();
  const status = document.getElementById('quick-status');
  if (!query) {
    status.textContent = 'Enter a query above and click Search (or press Enter).';
    status.className = 'status';
    document.getElementById('quick-search-input').focus();
    return;
  }

  const btn = document.getElementById('quick-search-btn');
  btn.disabled = true;
  btn.textContent = 'Searching...';
  status.textContent = `Querying arXiv for "${query}"...`;
  status.className = 'status';

  try {
    const sortValue = document.getElementById('quick-sort-order').value;
    const sortParams = getArxivSortParams(sortValue);
    const encodedQuery = encodeURIComponent(query);
    const url = `https://arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=25&${sortParams}`;

    const resp = await corsFetch(url);
    if (!resp.ok) throw new Error(resp.status === 429 ? 'Rate limited — wait a moment and retry' : 'arXiv returned ' + resp.status);
    const xml = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    const entries = doc.querySelectorAll('entry');
    globalThis.quickResults = [];
    entries.forEach(entry => {
      const id = entry.querySelector('id')?.textContent || '';
      const arxivId = id.replace('http://arxiv.org/abs/', '').replace(/v\d+$/, '');
      const title = (entry.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim();
      const summary = (entry.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim();
      const published = entry.querySelector('published')?.textContent || '';
      const year = published ? new Date(published).getFullYear() : '';
      const authors = [...entry.querySelectorAll('author name')].map(n => n.textContent);
      const categories = [...entry.querySelectorAll('category')].map(c => c.getAttribute('term'));

      quickResults.push({ arxivId, title, summary, year, authors, categories, published });
    });

    if (sortValue === 'author') {
      quickResults.sort((a, b) => {
        const aName = (a.authors[0] || '').split(' ').pop();
        const bName = (b.authors[0] || '').split(' ').pop();
        return aName.localeCompare(bName);
      });
    } else if (sortValue === 'date-asc') {
      quickResults.sort((a, b) => (a.published || '').localeCompare(b.published || ''));
    }

    quickSelected.clear();
    status.textContent = `Found ${quickResults.length} results for "${query}"`;
    document.getElementById('quick-results-actions').style.display = quickResults.length > 0 ? 'flex' : 'none';
    quickRenderResults();

  } catch (err) {
    showStatusError(status, 'Search failed — check your connection.', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search';
  }
}

function quickToggleSelect(idx) {
  if (quickSelected.has(idx)) quickSelected.delete(idx);
  else quickSelected.add(idx);
  quickUpdateSelectionCount();
  quickRenderResults();
}

function quickSelectAll() {
  quickResults.forEach((_, i) => quickSelected.add(i));
  quickUpdateSelectionCount();
  quickRenderResults();
}

function quickSelectNone() {
  quickSelected.clear();
  quickUpdateSelectionCount();
  quickRenderResults();
}

function quickUpdateSelectionCount() {
  document.getElementById('quick-selection-count').textContent = quickSelected.size + ' selected';
}

function quickToggleAbstract(idx) {
  const el = document.getElementById('quick-abstract-' + idx);
  if (el) el.classList.toggle('collapsed');
}

function quickRenderResults() {
  const container = document.getElementById('quick-results');
  container.innerHTML = quickResults.map((r, i) => {
    const shortAuthors = r.authors.length > 3
      ? r.authors[0].split(' ').pop() + ' et al.'
      : r.authors.map(a => a.split(' ').pop()).join(', ');
    return `
    <div class="quick-result-card ${quickSelected.has(i) ? 'selected' : ''}" data-action="quickToggleSelect" data-idx="${i}">
      <input type="checkbox" ${quickSelected.has(i) ? 'checked' : ''} data-action="quickToggleSelectStop" data-idx="${i}">
      <div class="quick-result-info">
        <div class="quick-result-title">${esc(r.title)}</div>
        <div class="quick-result-meta">
          <span class="quick-result-id">${esc(r.arxivId)}</span> &mdash;
          ${esc(shortAuthors)} (${r.year})
        </div>
        <div class="quick-result-abstract collapsed" id="quick-abstract-${i}">${esc(r.summary)}</div>
        <button class="quick-toggle-abstract" data-action="quickToggleAbstractStop" data-idx="${i}">show/hide abstract</button>
        <div class="quick-result-tags">
          ${r.categories.slice(0, 4).map(c => `<span class="quick-result-tag">${esc(c)}</span>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

function quickExportSelected() {
  if (quickSelected.size === 0) { alert('Select at least one paper.'); return; }

  const papers = [...quickSelected].map(i => quickResults[i]).map(r => {
    const shortAuthors = r.authors.length > 3
      ? r.authors[0].split(' ').pop() + ' et al.'
      : r.authors.map(a => a.split(' ').pop()).join(', ');
    return {
      id: r.arxivId,
      title: r.title,
      authors: r.authors.join(', '),
      shortAuthors: shortAuthors,
      year: r.year,
      summary: r.summary.substring(0, 300) + (r.summary.length > 300 ? '...' : ''),
      categories: r.categories
    };
  });

  const json = JSON.stringify(papers, null, 2);

  document.getElementById('quick-export-area').innerHTML = `
    <div class="quick-export-box">
      <h3>Export for Claude (${papers.length} papers)</h3>
      <p style="font-size:12px;color:var(--text2);margin-bottom:8px">
        Copy this JSON and paste it to Claude with: "Add these papers to the database"
      </p>
      <pre id="quick-export-json">${esc(json)}</pre>
      <div class="actions">
        <button data-action="copyQuickExportJson">Copy JSON</button>
        <button data-action="quickDownloadExport">Download JSON</button>
      </div>
    </div>`;
}

function quickDownloadExport() {
  const json = document.getElementById('quick-export-json').textContent;
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'arxiv-papers-to-add.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Enter-key listeners on the search inputs ───
// Run at module-eval time (after DOM parse, before DOMContentLoaded).
// All four reference functions that live in search-tab.js or this file —
// arrow-body lookups happen at keydown time via globalThis fallthrough.

const _quickInput = document.getElementById('quick-search-input');
if (_quickInput) {
  _quickInput.addEventListener('keydown', e => { if (e.key === 'Enter') quickDoSearch(); });
}
const _searchInput = document.getElementById('search-input');
if (_searchInput) {
  _searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}
const _yearFrom = document.getElementById('year-from');
if (_yearFrom) {
  _yearFrom.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}
const _yearTo = document.getElementById('year-to');
if (_yearTo) {
  _yearTo.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

globalThis.quickSetQuery = quickSetQuery;
globalThis.quickDoSearch = quickDoSearch;
globalThis.quickToggleSelect = quickToggleSelect;
globalThis.quickSelectAll = quickSelectAll;
globalThis.quickSelectNone = quickSelectNone;
globalThis.quickUpdateSelectionCount = quickUpdateSelectionCount;
globalThis.quickToggleAbstract = quickToggleAbstract;
globalThis.quickRenderResults = quickRenderResults;
globalThis.quickExportSelected = quickExportSelected;
globalThis.quickDownloadExport = quickDownloadExport;

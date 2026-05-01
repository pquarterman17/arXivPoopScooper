/**
 * Suggestions banner + auto-fetch (plan #8 strangler-fig migration).
 *
 * Two related concerns colocated because they share the same
 * `scraperInbox` localStorage queue and the same render path:
 *
 *   1. Banner: surfaces papers the scraper page staged for review.
 *      loadSuggestions reads the inbox, filters out anything already
 *      in PAPERS, and re-renders the banner. Per-row Add/Ignore
 *      buttons mutate the inbox.
 *
 *   2. Auto-fetch: on each page load (after a 4-hour cooldown), runs
 *      every saved scraper query against arXiv, appends new hits to
 *      scraperInbox, and re-renders.
 *
 * Both are bootstrapped from the legacy loadPapersFromDB() — those
 * three calls are still made via window-shimmed names, so the module
 * exports loadSuggestions, autoFetchOnLoad, and installSourceStyles
 * for the boot path.
 *
 * Internal state (scraperInbox, suggestionsOpen, fetchTs/savedQueries
 * keys) lives in module scope; nothing else needs to read them.
 */

let scraperInbox = [];
let suggestionsOpen = true;

const AUTO_FETCH_TS_KEY = 'scq-scraper-last-autofetch';
const SAVED_QUERIES_KEY = 'scq-scraper-queries';
const INBOX_KEY = 'scq-scraper-inbox';

function _cfg() { return globalThis.SCRAPER_CONFIG; }
function _scq() { return globalThis.SCQ; }
function _arxivFetch(...a) { return globalThis.arxivFetch(...a); }

function _esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _saveSugInbox() {
  try {
    localStorage.setItem(INBOX_KEY, JSON.stringify(scraperInbox));
  } catch (e) { console.warn('[Suggestions] save failed:', e.message); }
}

export function installSourceStyles() {
  const style = document.createElement('style');
  let css = '';
  for (const [key, src] of Object.entries(_cfg().sources)) {
    const c = src.color;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    css += `.sug-source.${key} { background: rgba(${r},${g},${b},0.15); color: ${c}; }\n`;
  }
  style.textContent = css;
  document.head.appendChild(style);
}

export function loadSuggestions() {
  try {
    scraperInbox = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]');
  } catch { scraperInbox = []; }

  const PAPERS = globalThis.PAPERS || [];
  const existingIds = new Set(PAPERS.map(p => p.id));
  scraperInbox = scraperInbox.filter(p => !existingIds.has(p.id));

  _saveSugInbox();
  renderSuggestions();
}

export function renderSuggestions() {
  const banner = document.getElementById('suggestions-banner');
  const list = document.getElementById('sug-list');
  const countEl = document.getElementById('sug-count');
  const body = document.getElementById('suggestions-body');
  const toggle = document.getElementById('sug-toggle');

  if (scraperInbox.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  countEl.textContent = scraperInbox.length;
  body.classList.toggle('open', suggestionsOpen);
  toggle.classList.toggle('open', suggestionsOpen);

  const sourceLabel = {};
  for (const [k, s] of Object.entries(_cfg().sources)) sourceLabel[k] = s.label;

  list.innerHTML = scraperInbox.map((p, i) => `
    <div class="sug-card">
      <div class="sug-card-info">
        <div class="sug-card-title">${_esc(p.title)}</div>
        <div class="sug-card-meta">
          <span class="sug-source ${p.source || 'arxiv'}">${sourceLabel[p.source] || (p.source || 'arxiv').toUpperCase()}</span>
          <span>${_esc(p.shortAuthors || '')} (${p.year || ''})</span>
          <span style="color:var(--text3)">${_esc(p.id)}</span>
        </div>
        <div class="sug-card-abstract">${_esc((p.summary || '').substring(0, 200))}</div>
        ${(p.tags && p.tags.length) ? `<div class="sug-card-tags">${p.tags.map(t => `<span>${_esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="sug-card-actions">
        <button class="sug-btn sug-btn-add" onclick="sugAdd(${i})" title="Add to database as unread">+ Add</button>
        <button class="sug-btn sug-btn-ignore" onclick="sugIgnore(${i})" title="Dismiss this suggestion">Ignore</button>
        <a href="${_esc(p.url || '')}" target="_blank" class="sug-btn-link" title="View on source">&nearr;</a>
      </div>
    </div>
  `).join('');
}

export function toggleSuggestions() {
  suggestionsOpen = !suggestionsOpen;
  document.getElementById('suggestions-body').classList.toggle('open', suggestionsOpen);
  document.getElementById('sug-toggle').classList.toggle('open', suggestionsOpen);
}

export function sugAdd(idx) {
  const paper = scraperInbox[idx];
  if (!paper) return;

  const cfg = _cfg();
  const SCQ = _scq();
  const dateAdded = new Date().toISOString().slice(0, 10);
  const citeBib = cfg.formatBibTeX(paper);
  const citeTxt = cfg.formatPlainText(paper);
  const srcCfg = (cfg.sources && cfg.sources[paper.source]) || {};
  const entryType = srcCfg.type === 'arxiv-jr' ? 'published' : 'preprint';

  SCQ.addPaper({
    id: paper.id, title: paper.title, authors: paper.authors || '',
    shortAuthors: paper.shortAuthors || 'Unknown',
    year: paper.year || new Date().getFullYear(),
    journal: paper.journal || '', doi: paper.doi || '',
    arxiv_id: paper.source === 'arxiv' ? paper.id : '',
    url: paper.url || '', group_name: '',
    dateAdded, tags: paper.tags || [],
    summary: paper.summary ? paper.summary.substring(0, 500) : '',
    keyResults: [], citeBib, citeTxt,
    pdf_path: paper.source === 'arxiv' ? `pdfs/${paper.id}.pdf` : '',
    entry_type: entryType,
  });

  if (paper.note && paper.note.trim()) {
    SCQ.setNote(paper.id, paper.note.trim());
  }

  scraperInbox.splice(idx, 1);
  _saveSugInbox();
  if (typeof globalThis.loadPapersFromDB === 'function') globalThis.loadPapersFromDB();
  if (typeof globalThis.render === 'function') globalThis.render();
  renderSuggestions();
}

export function sugIgnore(idx) {
  scraperInbox.splice(idx, 1);
  _saveSugInbox();
  renderSuggestions();
}

export function dismissAllSuggestions() {
  if (scraperInbox.length === 0) return;
  if (!confirm('Dismiss all ' + scraperInbox.length + ' suggestions?')) return;
  scraperInbox = [];
  _saveSugInbox();
  renderSuggestions();
}

// ─── Auto-fetch (runs saved scraper queries on page load) ───

function _autoTag(title, abs) {
  const cfg = _cfg();
  const text = (title + ' ' + abs).toLowerCase();
  const tags = [];
  for (const [tag, kws] of Object.entries(cfg.tags)) {
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase())) { tags.push(tag); break; }
    }
  }
  return tags;
}

function _parseArxivXml(xml, source) {
  const cfg = _cfg();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entries = doc.querySelectorAll('entry');
  const papers = [];
  const srcCfg = cfg.sources[source] || {};

  entries.forEach(entry => {
    const idUrl = entry.querySelector('id')?.textContent || '';
    const arxivId = idUrl.replace('http://arxiv.org/abs/', '').replace(/v\d+$/, '');
    const title = (entry.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summary = (entry.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const published = entry.querySelector('published')?.textContent || '';
    const year = published ? new Date(published).getFullYear() : '';
    const authors = [...entry.querySelectorAll('author name')].map(n => n.textContent);
    const categories = [...entry.querySelectorAll('category')].map(c => c.getAttribute('term'));
    const doi = entry.querySelector('doi')?.textContent.trim() || '';
    const journalRef = entry.querySelector('journal_ref')?.textContent.trim() || '';
    const shortAuthors = authors.length > 3
      ? authors[0].split(' ').pop() + ' et al.'
      : authors.map(a => a.split(' ').pop()).join(', ');

    papers.push({
      id: arxivId, title, summary, year, published,
      authors: authors.join(', '), shortAuthors, categories,
      source, url: `https://arxiv.org/abs/${arxivId}`,
      doi, journal: journalRef || srcCfg.journalName || '',
      tags: _autoTag(title, summary),
    });
  });
  return papers;
}

async function _fetchForSource(query, sourceKey) {
  const cfg = _cfg();
  const src = cfg.sources[sourceKey];
  if (!src) throw new Error(`Unknown source: ${sourceKey}`);
  const maxResults = cfg.autoFetch?.maxResultsPerQuery || 25;

  let url;
  if (src.type === 'arxiv') {
    url = `https://arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
  } else if (src.type === 'arxiv-jr') {
    url = `https://arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}+AND+jr:${src.journalRef}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
  } else {
    throw new Error(`Unsupported source type: ${src.type}`);
  }

  const resp = await _arxivFetch(url);
  if (!resp.ok) throw new Error(sourceKey + ' ' + resp.status);
  return _parseArxivXml(await resp.text(), sourceKey);
}

export async function autoFetchOnLoad() {
  const cfg = _cfg();
  if (cfg.autoFetch?.enabled === false) return;

  let savedQueries = [];
  try { savedQueries = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '[]'); }
  catch { return; }
  if (savedQueries.length === 0) return;

  const cooldownHrs = cfg.autoFetch?.cooldownHours || 4;
  const cooldownMs = cooldownHrs * 60 * 60 * 1000;
  const lastFetch = parseInt(localStorage.getItem(AUTO_FETCH_TS_KEY) || '0', 10);
  const now = Date.now();
  if (now - lastFetch < cooldownMs) {
    const hoursAgo = ((now - lastFetch) / 3600000).toFixed(1);
    console.log(`[Auto-fetch] Skipping — last fetch was ${hoursAgo}h ago (cooldown: ${cooldownHrs}h)`);
    return;
  }

  const statusEl = document.getElementById('sug-fetch-status');
  const banner = document.getElementById('suggestions-banner');
  banner.style.display = 'block';
  statusEl.textContent = 'Checking for new papers...';

  const PAPERS = globalThis.PAPERS || [];
  const existingIds = new Set(PAPERS.map(p => p.id));
  const inboxIds = new Set(scraperInbox.map(p => p.id));
  let totalNew = 0;
  const delay = cfg.autoFetch?.delayBetweenQueries || 1500;

  for (let i = 0; i < savedQueries.length; i++) {
    const q = savedQueries[i];
    statusEl.textContent = `Fetching ${i + 1}/${savedQueries.length}: "${q.query}"`;
    try {
      const results = await _fetchForSource(q.query, q.source);
      results.forEach(paper => {
        if (!existingIds.has(paper.id) && !inboxIds.has(paper.id)) {
          scraperInbox.push({ ...paper, note: '', stagedAt: new Date().toISOString() });
          inboxIds.add(paper.id);
          totalNew++;
        }
      });
    } catch (e) {
      console.warn(`[Auto-fetch] "${q.query}" failed:`, e.message);
    }
    if (i < savedQueries.length - 1) await new Promise(r => setTimeout(r, delay));
  }

  localStorage.setItem(AUTO_FETCH_TS_KEY, String(now));
  _saveSugInbox();

  if (totalNew > 0) {
    statusEl.textContent = `Found ${totalNew} new paper${totalNew > 1 ? 's' : ''}`;
    statusEl.style.color = 'var(--green)';
    renderSuggestions();
  } else {
    statusEl.textContent = 'No new papers found';
    if (scraperInbox.length === 0) {
      setTimeout(() => { banner.style.display = 'none'; statusEl.textContent = ''; }, 3000);
    }
  }

  setTimeout(() => {
    statusEl.style.transition = 'opacity 1s';
    statusEl.style.opacity = '0';
    setTimeout(() => {
      statusEl.style.opacity = '1';
      statusEl.style.transition = '';
      statusEl.textContent = '';
    }, 1000);
  }, 5000);

  console.log(`[Auto-fetch] Done. ${totalNew} new papers from ${savedQueries.length} queries.`);
}

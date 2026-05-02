/**
 * Saved Queries panel — persist named query+source combos in localStorage,
 * render the list, run-on-click, run-all-with-rate-limit.
 *
 * Extracted from paper_scraper.html boot block (~lines 444–577 pre-extraction)
 * as part of plan #9 Phase B. Ten functions, all shimmed onto globalThis.
 *
 * **Cross-module deps:**
 *   - state: savedQueries, activeSources, existingIds, inbox, lastFetchTime
 *   - boot-block helpers: CFG, esc
 *   - tabs.js: switchTab, updateInboxBadge, updateStats
 *   - search-tab.js: doSearch, searchArxiv, searchCrossref, searchPhysRev
 *   - inbox-persistence.js: saveInbox
 */

const STORAGE_KEY = 'scq-scraper-queries';

function loadSavedQueries() {
  try {
    globalThis.savedQueries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    globalThis.savedQueries = [];
  }
}

function saveSavedQueries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedQueries));
}

function renderSavedQueries() {
  const container = document.getElementById('saved-queries-list');
  if (!container) return;
  if (savedQueries.length === 0) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:4px">No saved queries yet</div>';
    return;
  }
  container.innerHTML = savedQueries.map((q, i) => `
    <div class="saved-query" data-action="runSavedQuery" data-idx="${i}">
      <span class="source-badge ${q.source}">${(CFG.sources[q.source] || {}).label || q.source.toUpperCase()}</span>
      <span class="q-text">${esc(q.query)}</span>
      <span class="q-remove" data-action="removeSavedQueryStop" data-idx="${i}">&times;</span>
    </div>
  `).join('');
}

function openAddQueryModal() {
  const q = document.getElementById('search-input').value.trim();
  document.getElementById('modal-query').value = q;
  document.getElementById('query-modal').classList.add('show');
}

function closeModal() {
  document.getElementById('query-modal').classList.remove('show');
}

function confirmSaveQuery() {
  const query = document.getElementById('modal-query').value.trim();
  const source = document.getElementById('modal-source').value;
  if (!query) return;

  if (!savedQueries.some(q => q.query === query && q.source === source)) {
    savedQueries.push({ query, source });
    saveSavedQueries();
    renderSavedQueries();
  }
  closeModal();
}

function saveCurrentSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  const source = Object.keys(activeSources).find(k => activeSources[k]) || Object.keys(CFG.sources)[0];
  if (!savedQueries.some(q => q.query === query && q.source === source)) {
    savedQueries.push({ query, source });
    saveSavedQueries();
    renderSavedQueries();
  }
}

function removeSavedQuery(idx) {
  savedQueries.splice(idx, 1);
  saveSavedQueries();
  renderSavedQueries();
}

async function runSavedQuery(idx) {
  const q = savedQueries[idx];
  document.getElementById('search-input').value = q.query;
  for (const key of Object.keys(CFG.sources)) {
    activeSources[key] = (key === q.source);
    const el = document.getElementById('src-' + key);
    if (el) el.classList.toggle('active', activeSources[key]);
  }
  switchTab('search');
  await doSearch();
}

async function runAllSavedQueries() {
  if (savedQueries.length === 0) { alert('No saved queries to run.'); return; }

  const btn = document.getElementById('run-all-btn');
  btn.textContent = 'Running...';
  btn.disabled = true;

  const status = document.getElementById('search-status');
  let totalNew = 0;

  for (let i = 0; i < savedQueries.length; i++) {
    const q = savedQueries[i];
    status.textContent = `Running query ${i + 1}/${savedQueries.length}: "${q.query}" (${q.source})...`;

    try {
      let results = [];
      const srcCfg = CFG.sources[q.source] || {};
      if (srcCfg.type === 'arxiv') results = await searchArxiv(q.query);
      else if (srcCfg.type === 'crossref') results = await searchCrossref(q.query, q.source);
      else results = await searchPhysRev(q.query, q.source);

      results.forEach(paper => {
        if (!existingIds.has(paper.id) && !inbox.some(p => p.id === paper.id)) {
          inbox.push({ ...paper, note: '', stagedAt: new Date().toISOString() });
          totalNew++;
        }
      });
    } catch (e) {
      console.warn(`Query "${q.query}" failed:`, e.message);
    }

    const delay = CFG.autoFetch?.delayBetweenQueries || 1500;
    if (i < savedQueries.length - 1) await new Promise(r => setTimeout(r, delay));
  }

  saveInbox();
  updateInboxBadge();
  globalThis.lastFetchTime = new Date();
  updateStats();

  status.textContent = `Done! Found ${totalNew} new papers across ${savedQueries.length} queries.`;
  status.className = 'status success';

  btn.textContent = 'Run all saved queries';
  btn.disabled = false;

  if (totalNew > 0) switchTab('inbox');
}

globalThis.loadSavedQueries = loadSavedQueries;
globalThis.saveSavedQueries = saveSavedQueries;
globalThis.renderSavedQueries = renderSavedQueries;
globalThis.openAddQueryModal = openAddQueryModal;
globalThis.closeModal = closeModal;
globalThis.confirmSaveQuery = confirmSaveQuery;
globalThis.saveCurrentSearch = saveCurrentSearch;
globalThis.removeSavedQuery = removeSavedQuery;
globalThis.runSavedQuery = runSavedQuery;
globalThis.runAllSavedQueries = runAllSavedQueries;

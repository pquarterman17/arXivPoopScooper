/**
 * Inbox tab — render staged papers + approve/dismiss/approve-all/clear actions.
 *
 * Extracted from paper_scraper.html boot block as part of plan #9 Phase B.
 * Six functions, all shimmed onto globalThis. Persistence is handled by
 * the separately-extracted inbox-persistence.js (saveInbox/loadInbox).
 *
 * **Cross-module deps (read at call time via globalThis bare-name fallthrough):**
 *   - state: inbox, dbReady
 *   - boot-block helpers: CFG, esc, addPaperToDB
 *   - inbox-persistence.js: saveInbox
 *   - tabs.js: updateInboxBadge, updateStats
 */

function renderInbox() {
  const container = document.getElementById('inbox-list');

  if (inbox.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>Inbox is empty</h3><p>Search for papers and add them to the inbox for review.</p></div>';
    return;
  }

  container.innerHTML = inbox.map((r, i) => `
    <div class="paper-card" id="inbox-card-${i}">
      <div class="card-top">
        <div class="card-info">
          <div class="card-title">${esc(r.title)}</div>
          <div class="card-meta">
            <span class="card-source ${r.source}">${(CFG.sources[r.source] || {}).label || r.source.toUpperCase()}</span>
            <span class="card-id">${esc(r.id)}</span>
            <span>${esc(r.shortAuthors)} (${r.year})</span>
          </div>
          <div class="card-abstract collapsed" id="inbox-abs-${i}">${esc(r.summary)}</div>
          <button class="toggle-abs" data-action="toggleInboxAbstract" data-idx="${i}">show/hide abstract</button>
          <div class="card-tags" id="inbox-tags-${i}">
            ${(r.tags || []).map(t => `<span class="card-tag auto">${esc(t)}</span>`).join('')}
          </div>
          <div class="inbox-note">
            <textarea placeholder="Add a quick note about this paper..." data-input="updateInboxNote" data-idx="${i}">${esc(r.note || '')}</textarea>
          </div>
        </div>
        <div class="card-actions" style="flex-direction:column;gap:6px">
          <button class="btn btn-sm btn-green" data-action="approveOne" data-idx="${i}">Approve</button>
          <button class="btn btn-sm btn-red" data-action="dismissOne" data-idx="${i}">Dismiss</button>
          <a href="${esc(r.url)}" target="_blank" class="btn btn-sm btn-outline" style="text-decoration:none;text-align:center">&nearr;</a>
        </div>
      </div>
    </div>
  `).join('');
}

function updateInboxNote(idx, value) {
  if (inbox[idx]) {
    inbox[idx].note = value;
    saveInbox();
  }
}

function approveOne(idx) {
  const paper = inbox[idx];
  if (!paper || !dbReady) return;
  addPaperToDB(paper);
  inbox.splice(idx, 1);
  saveInbox();
  updateInboxBadge();
  renderInbox();
  updateStats();
}

function dismissOne(idx) {
  inbox.splice(idx, 1);
  saveInbox();
  updateInboxBadge();
  renderInbox();
}

function approveAll() {
  if (!dbReady || inbox.length === 0) return;
  const count = inbox.length;
  inbox.forEach(paper => addPaperToDB(paper));
  globalThis.inbox = [];
  saveInbox();
  updateInboxBadge();
  renderInbox();
  updateStats();

  const status = document.getElementById('search-status');
  if (status) {
    status.textContent = `Added ${count} papers to database. Remember to save the database!`;
    status.className = 'status success';
  }
}

function clearInbox() {
  if (inbox.length === 0) return;
  if (!confirm(`Clear ${inbox.length} papers from inbox?`)) return;
  globalThis.inbox = [];
  saveInbox();
  updateInboxBadge();
  renderInbox();
}

globalThis.renderInbox = renderInbox;
globalThis.updateInboxNote = updateInboxNote;
globalThis.approveOne = approveOne;
globalThis.dismissOne = dismissOne;
globalThis.approveAll = approveAll;
globalThis.clearInbox = clearInbox;

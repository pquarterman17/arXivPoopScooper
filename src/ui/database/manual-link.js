/**
 * Manual paper-linking modal (plan #8 strangler-fig migration).
 *
 * `showLinkPaperModal` renders a checklist of all other papers; toggling
 * a checkbox calls `toggleManualLink` which writes to the SCQ link table.
 * Both are reachable from inline onclick/onchange in render() output.
 */

function _scq() { return globalThis.SCQ; }

export function showLinkPaperModal(paperId) {
  const SCQ = _scq();
  const PAPERS = globalThis.PAPERS || [];
  const currentLinks = SCQ.getLinkedPapers(paperId).map(l => l.id);
  const others = PAPERS.filter(p => p.id !== paperId);
  const target = PAPERS.find(p => p.id === paperId);
  const targetLabel = target?.shortAuthors || paperId;
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="min-width:360px;max-width:460px">
        <h3>Link related papers to ${targetLabel}</h3>
        <div class="link-picker-list">
          ${others.map(p => `
            <label class="link-picker-item">
              <input type="checkbox" ${currentLinks.includes(p.id) ? 'checked' : ''}
                onchange="toggleManualLink('${paperId}', '${p.id}', this.checked)">
              <span>${p.shortAuthors} (${p.year}) — ${p.title.substring(0, 50)}${p.title.length > 50 ? '…' : ''}</span>
            </label>
          `).join('')}
        </div>
        <div class="modal-btns">
          <button class="modal-btn primary" onclick="closeModal()">Done</button>
        </div>
      </div>
    </div>`;
}

export function toggleManualLink(fromId, toId, checked) {
  if (checked) {
    _scq().linkPapers(fromId, toId);
  } else {
    _scq().unlinkPapers(fromId, toId);
  }
}

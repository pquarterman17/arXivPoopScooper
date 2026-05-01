/**
 * Read status, star priority, and the three table filters
 * (plan #8 strangler-fig migration).
 *
 *   - toggleReadStatus / setStarRating mutate the in-memory paper object
 *     and persist via SCQ; renderStars produces the star-button HTML.
 *   - setReadFilter / setPriorityFilter / setTypeFilter write the legacy
 *     `var readFilter` / `priorityFilter` / `typeFilter` slots through
 *     globalThis so the legacy `getFiltered` (still inline) sees the
 *     change on the next render.
 *
 * All six are called from inline onclick attributes.
 */

function _scq() { return globalThis.SCQ; }
function _paper(id) { return (globalThis.PAPERS || []).find(p => p.id === id); }
function _render() {
  if (typeof globalThis.render === 'function') globalThis.render();
}

export function toggleReadStatus(paperId, event) {
  if (event) event.stopPropagation();
  const p = _paper(paperId);
  if (!p) return;
  const newStatus = !p._read;
  p._read = newStatus;
  _scq().setReadStatus(paperId, newStatus);
  _render();
}

export function setStarRating(paperId, stars, event) {
  if (event) event.stopPropagation();
  const p = _paper(paperId);
  if (!p) return;
  const newPriority = (p._priority === stars) ? 0 : stars;
  p._priority = newPriority;
  _scq().setPriority(paperId, newPriority);
  _render();
}

export function renderStars(paperId) {
  const p = _paper(paperId);
  const current = p ? p._priority : 0;
  return [1, 2, 3].map(s =>
    `<button class="star-btn ${s <= current ? 'filled' : ''}" onclick="setStarRating('${paperId}', ${s}, event)" title="${s} star${s > 1 ? 's' : ''}">&#9733;</button>`
  ).join('');
}

export function setReadFilter(filter) {
  globalThis.readFilter = filter;
  document.querySelectorAll('.filter-read-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-read-btn[data-readfilter="${filter}"]`)?.classList.add('active');
  _render();
}

export function setPriorityFilter(filter) {
  globalThis.priorityFilter = filter;
  document.querySelectorAll('.priority-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.priority-filter-btn[data-pf="${filter}"]`)?.classList.add('active');
  _render();
}

export function setTypeFilter(filter) {
  globalThis.typeFilter = filter;
  _render();
}

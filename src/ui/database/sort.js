/**
 * Library table sorting (plan #8 strangler-fig migration).
 *
 * The header `<th>` elements still use inline `onclick="toggleSort(...)"`
 * and template literals call `sortArrow(col)` / `sortedClass(col)` during
 * render, so all four functions are shimmed onto `window` from main.js
 * until the table render itself migrates.
 *
 * The sort state object lives in the legacy boot block as `let tableSort`.
 * Because modules can't see top-level `let` bindings from a regular
 * `<script>`, the legacy file does `window.tableSort = tableSort;` once at
 * boot. We mutate properties on that shared object — never reassign it —
 * so both sides stay in sync.
 *
 * `render()` is still a legacy global; we call it via `globalThis.render`
 * until the render path migrates.
 */

function _state() {
  return globalThis.tableSort;
}

export function toggleSort(col) {
  const s = _state();
  if (!s) return;
  if (s.col === col) {
    s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  } else {
    s.col = col;
    s.dir = (col === 'title' || col === 'shortAuthors' || col === 'group') ? 'asc' : 'desc';
  }
  if (typeof globalThis.render === 'function') globalThis.render();
}

export function sortPapers(papers) {
  const s = _state();
  const col = s.col;
  const dir = s.dir === 'asc' ? 1 : -1;
  return [...papers].sort((a, b) => {
    let va, vb;
    if (col === 'priority' || col === '_priority') { va = a._priority || 0; vb = b._priority || 0; }
    else if (col === 'read' || col === '_read') { va = a._read ? 1 : 0; vb = b._read ? 1 : 0; }
    else if (col === 'date_added' || col === 'dateAdded') { va = a.dateAdded || ''; vb = b.dateAdded || ''; }
    else { va = a[col] || ''; vb = b[col] || ''; }
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}

export function sortArrow(col) {
  const s = _state();
  if (s.col !== col) return '<span class="sort-arrow">&#8597;</span>';
  return `<span class="sort-arrow">${s.dir === 'asc' ? '&#9650;' : '&#9660;'}</span>`;
}

export function sortedClass(col) {
  return _state().col === col ? 'sorted' : '';
}

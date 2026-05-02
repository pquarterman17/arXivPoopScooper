/**
 * Collaboration tab — custom (non-schema) Settings v2 panel.
 *
 * Surfaces the same OneDrive-shared-folder workflow that the legacy
 * settings modal had: save a folder path, "Download for Shared Folder"
 * (writes the DB to disk so the user drops it into the shared folder),
 * "Merge from Shared" (loads a foreign .db via the existing merge
 * pipeline). Settings persist via `SCQ.setSetting('collaboration', ...)`
 * to the browser-side DB settings table — same key as before, so
 * users with existing collaboration settings see them carried over.
 *
 * The legacy `syncToSharedFolder` and `mergeSharedFile` helpers in
 * `src/ui/database/collaboration.js` are reused. They read / write
 * by DOM id, so this tab uses the same `id="shared-folder-path"` and
 * `id="merge-shared-file"` ids as the legacy modal.
 */

export function renderCollaborationTab(body, ctx) {
  const lead = document.createElement('p');
  lead.className = 'settings-v2-domain-desc';
  lead.textContent =
    'Share collections with collaborators via OneDrive. Save a folder path, then export your DB into it for others to merge — or merge a teammate\'s shared .db into your library.';
  body.appendChild(lead);

  const settings = ctx.getDbSetting('collaboration') || {};

  // ─── Shared folder path ───
  const pathRow = document.createElement('div');
  pathRow.className = 'schema-row schema-string';
  const pathLbl = document.createElement('span');
  pathLbl.className = 'schema-label';
  pathLbl.textContent = 'OneDrive shared folder';
  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.id = 'shared-folder-path'; // legacy `syncToSharedFolder` reads by this id
  pathInput.placeholder = 'e.g. C:\\Users\\you\\OneDrive\\Shared\\Lab Research';
  pathInput.value = settings.sharedFolderPath || '';
  // Auto-save on blur so leaving the tab persists the path even without a
  // separate Save click. The legacy syncToSharedFolder also persists on
  // sync, so this is belt-and-suspenders.
  pathInput.addEventListener('change', () => {
    const next = ctx.getDbSetting('collaboration') || {};
    next.sharedFolderPath = pathInput.value.trim();
    ctx.setDbSetting('collaboration', next);
    ctx.setStatus('Folder path saved.', 'ok');
  });
  pathRow.append(pathLbl, pathInput);
  body.appendChild(pathRow);

  // ─── Action buttons ───
  const actions = document.createElement('div');
  actions.className = 'settings-v2-actions';
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'settings-v2-action-btn';
  downloadBtn.textContent = 'Download for shared folder';
  downloadBtn.title = 'Persist the path, save the DB to disk, then drop it into your shared folder.';
  downloadBtn.addEventListener('click', () => {
    // Defer to the legacy helper, which reads the input by id and triggers
    // the standard download flow.
    if (typeof globalThis._syncToSharedFolder === 'function') {
      globalThis._syncToSharedFolder();
      // Refresh the displayed lastSync after it stamps
      setTimeout(() => updateLastSync(body, ctx), 100);
    } else if (typeof globalThis.syncToSharedFolder === 'function') {
      globalThis.syncToSharedFolder();
      setTimeout(() => updateLastSync(body, ctx), 100);
    } else {
      ctx.setStatus('Sync helper not loaded — try the legacy gear menu.', 'error');
    }
  });

  const mergeBtn = document.createElement('button');
  mergeBtn.type = 'button';
  mergeBtn.className = 'settings-v2-action-btn';
  mergeBtn.textContent = 'Merge from shared';
  mergeBtn.title = 'Pick a .db file from your shared folder and merge its papers into your library.';
  mergeBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // Hidden file input — `mergeSharedFile` reads `event.target.files[0]`.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'merge-shared-file'; // legacy id, kept for parity
  fileInput.accept = '.db';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', (e) => {
    if (typeof globalThis.mergeSharedFile === 'function') {
      globalThis.mergeSharedFile(e);
      setTimeout(() => updateLastSync(body, ctx), 100);
    } else {
      ctx.setStatus('Merge helper not loaded.', 'error');
    }
  });

  actions.append(downloadBtn, mergeBtn, fileInput);
  body.appendChild(actions);

  // ─── Last sync display ───
  const lastSync = document.createElement('div');
  lastSync.className = 'settings-v2-meta';
  lastSync.id = 'collab-last-sync';
  body.appendChild(lastSync);
  updateLastSync(body, ctx);
}

function updateLastSync(body, ctx) {
  const el = body.querySelector('#collab-last-sync');
  if (!el) return;
  const settings = ctx.getDbSetting('collaboration') || {};
  if (settings.lastSyncAt) {
    el.textContent = `Last sync: ${new Date(settings.lastSyncAt).toLocaleString()}`;
  } else {
    el.textContent = 'Never synced.';
  }
}

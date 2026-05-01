/**
 * Collaboration helpers (plan #8 strangler-fig migration).
 *
 * Two entry points reachable from the Settings modal "Collaboration"
 * section:
 *
 *   - syncToSharedFolder: persists the OneDrive path to the
 *     `collaboration` setting, stamps lastSyncAt, and triggers a DB
 *     download (the user drops it into the shared folder manually).
 *   - mergeSharedFile: ingests a foreign .db via SCQ.importDatabaseFile,
 *     refreshes PAPERS / sidebar, and stamps lastSyncAt. Refreshes the
 *     Settings modal in place so the timestamp updates without a reopen.
 */

function _scq() { return globalThis.SCQ; }
function _call(name, ...args) {
  const fn = globalThis[name];
  if (typeof fn === 'function') return fn(...args);
}

export function syncToSharedFolder() {
  const SCQ = _scq();
  const pathInput = document.getElementById('shared-folder-path');
  const folderPath = pathInput ? pathInput.value.trim() : '';

  if (!folderPath) {
    alert('Please enter a shared folder path first.');
    return;
  }

  const collabSettings = SCQ.getSetting('collaboration') || {};
  collabSettings.sharedFolderPath = folderPath;
  collabSettings.lastSyncAt = new Date().toISOString();
  SCQ.setSetting('collaboration', collabSettings);

  SCQ.saveToFile();
  alert(`Database download started. Save it to:\n${folderPath}`);
}

export function mergeSharedFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.db')) {
    alert('Please select a .db file to merge.');
    event.target.value = '';
    return;
  }

  const SCQ = _scq();
  try {
    SCQ.importDatabaseFile(file).then(stats => {
      _call('loadPapersFromDB');
      _call('render');
      _call('renderSidebar');

      const collabSettings = SCQ.getSetting('collaboration') || {};
      collabSettings.lastSyncAt = new Date().toISOString();
      SCQ.setSetting('collaboration', collabSettings);

      alert(
        `Merge complete!\n\n` +
        `• ${stats.added} new paper${stats.added !== 1 ? 's' : ''} added\n` +
        `• ${stats.updated} paper${stats.updated !== 1 ? 's' : ''} updated\n` +
        `• ${stats.skipped} paper${stats.skipped !== 1 ? 's' : ''} unchanged\n\n` +
        `Remember to click "Save database" to save the merged data.`
      );
      _call('_renderSettingsModal');
    }).catch(err => {
      alert('Merge failed: ' + err.message);
    });
  } catch (err) {
    alert('Merge failed: ' + err.message);
  }
  event.target.value = '';
}

/**
 * Settings modal (plan #8 strangler-fig migration).
 *
 * **DEPRECATED** — Settings v2 (`src/ui/settings/`) is the canonical
 * settings UI. This legacy modal still ships because plan item #11
 * ("retire the legacy settings-modal.js") hasn't landed yet. Until it
 * does, both UIs can write to the same `settings` table keys and
 * stomp each other. See B6 in the 2026-04-30 audit.
 *
 * **Stomp matrix (B6):**
 *   Both this modal and `src/ui/settings/tabs/overleaf-tab.js` write
 *   `SCQ.setSetting('overleafConfig', ...)`. Legacy modal saves on
 *   explicit "Save" click (full-form snapshot); v2 tab autosaves on
 *   every field change. If a user has both UIs open (two tabs, or v2
 *   then legacy without refresh), the legacy modal's stale snapshot
 *   can overwrite a v2 autosave on Save click. Same risk for
 *   `sources`, `presets`, `emailRecipients`, `collaboration`.
 *
 * **Until #11 ships:**
 *   - New features go into Settings v2 (`src/ui/settings/`), not here.
 *   - `_saveSettings()` console.warns when fired so we can tell from a
 *     user-reported "my settings got reverted" report whether they
 *     used the legacy modal.
 *   - Don't add new keys here.
 *
 * Renders four editable subsystems plus collaboration / overleaf
 * read-only-ish forms. Uses inline onclick / onchange attributes that
 * reference the module's state arrays *by name* — so we mirror those
 * arrays onto window in showSettingsModal so the legacy attributes
 * keep resolving.
 *
 * Modules that callers need on window (shimmed in main.js):
 *   - showSettingsModal, closeSettingsModal, _renderSettingsModal
 *   - _toggleSource, _delSource, _addSource
 *   - _delPreset, _addPreset
 *   - _toggleRecipient, _delRecipient, _addRecipient, _exportRecipients
 *   - _saveSettings, _applySettingsToConfig
 *
 * `_applySettingsToConfig` is also called from the legacy boot block
 * (SCQ.init().then()) — its window shim covers that.
 */

let _settingsSources = [];
let _settingsPresets = [];
let _settingsRecipients = [];

function _scq() { return globalThis.SCQ; }
function _cfg() { return globalThis.SCRAPER_CONFIG; }
function _render() {
  if (typeof globalThis.render === 'function') globalThis.render();
}

function _esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Slugify a user-supplied source label into a unique short key. Pre-fix
// behavior (`label.toLowerCase().replace(/[^a-z0-9]/g, '')`) returned ''
// for punctuation-only labels like "(PRL)", causing every such source to
// collide on key="" and silently overwrite earlier entries. Fall back to
// a timestamp-derived key, then de-dupe against any existing keys.
// Exported solely for testing the derivation logic; not part of the
// public modal API.
export function _deriveSourceKey(label, existingKeys = []) {
  let key = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) key = 'src' + Date.now().toString(36);
  while (existingKeys.includes(key)) {
    key = key + '_' + Math.random().toString(36).slice(2, 6);
  }
  return key;
}

// Mirror the three editable arrays onto window so the modal's inline
// `onchange="_settingsSources[${i}].color=this.value"` handlers (which
// resolve in global scope) can mutate the same array our module reads.
function _exposeState() {
  globalThis._settingsSources = _settingsSources;
  globalThis._settingsPresets = _settingsPresets;
  globalThis._settingsRecipients = _settingsRecipients;
}

export function showSettingsModal() {
  const SCQ = _scq();
  const cfg = _cfg();
  const saved = SCQ.getAllSettings();

  _settingsSources = saved.sources
    ? JSON.parse(JSON.stringify(saved.sources))
    : Object.entries(cfg.sources).map(([key, s]) => ({
        key, label: s.label, color: s.color, enabled: s.enabled,
        type: s.type, journalRef: s.journalRef || '', journalName: s.journalName || ''
      }));
  _settingsPresets = saved.presets
    ? JSON.parse(JSON.stringify(saved.presets))
    : cfg.presets.map(p => ({ label: p.label, query: p.query }));
  _settingsRecipients = saved.emailRecipients
    ? JSON.parse(JSON.stringify(saved.emailRecipients))
    : [];

  _exposeState();
  _renderSettingsModal();
  document.getElementById('settings-overlay').style.display = 'flex';
}

export function closeSettingsModal() {
  document.getElementById('settings-overlay').style.display = 'none';
}

export function _renderSettingsModal() {
  const SCQ = _scq();
  const overlay = document.getElementById('settings-overlay');

  const srcHtml = _settingsSources.map((s, i) => `
    <div class="settings-row">
      <input type="color" value="${s.color}" onchange="_settingsSources[${i}].color=this.value" title="Badge color">
      <span class="sr-label">${_esc(s.label)}</span>
      <span class="sr-detail">${s.type === 'arxiv' ? 'arXiv direct' : _esc(s.journalRef || '')}</span>
      <button class="sr-toggle ${s.enabled ? 'on' : 'off'}" onclick="_toggleSource(${i})" title="${s.enabled ? 'Enabled' : 'Disabled'}"></button>
      ${s.type !== 'arxiv' ? `<button class="settings-del-btn" onclick="_delSource(${i})" title="Remove">&times;</button>` : '<span style="width:26px"></span>'}
    </div>
  `).join('');

  const preHtml = _settingsPresets.map((p, i) => `
    <div class="settings-row">
      <input type="text" value="${_esc(p.label)}" style="width:120px;flex:none" onchange="_settingsPresets[${i}].label=this.value" placeholder="Label">
      <input type="text" value="${_esc(p.query)}" style="flex:1" onchange="_settingsPresets[${i}].query=this.value" placeholder="Search query">
      <button class="settings-del-btn" onclick="_delPreset(${i})" title="Remove">&times;</button>
    </div>
  `).join('');

  const recipHtml = _settingsRecipients.map((r, i) => `
    <div class="settings-row">
      <button class="sr-toggle ${r.enabled ? 'on' : 'off'}" onclick="_toggleRecipient(${i})" title="${r.enabled ? 'Enabled' : 'Disabled'}"></button>
      <input type="text" value="${_esc(r.name || '')}" style="width:80px;flex:none" onchange="_settingsRecipients[${i}].name=this.value" placeholder="Name">
      <input type="text" value="${_esc(r.email)}" style="flex:1" onchange="_settingsRecipients[${i}].email=this.value" placeholder="email@example.com">
      <select style="font-size:11px;padding:4px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:80px" onchange="_settingsRecipients[${i}].frequency=this.value">
        <option value="daily" ${r.frequency === 'daily' ? 'selected' : ''}>Daily</option>
        <option value="weekly" ${r.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="both" ${r.frequency === 'both' ? 'selected' : ''}>Both</option>
      </select>
      <button class="settings-del-btn" onclick="_delRecipient(${i})" title="Remove">&times;</button>
    </div>
  `).join('');

  const collabSettings = SCQ.getSetting('collaboration') || { sharedFolderPath: '', lastSyncAt: null };
  const lastSync = collabSettings.lastSyncAt ? new Date(collabSettings.lastSyncAt).toLocaleString() : 'Never';
  const overleafCfg = SCQ.getSetting('overleafConfig') || { git_url: '', bib_filename: 'references.bib', auto_sync: true };

  overlay.innerHTML = `<div class="settings-panel">
    <h2>Settings</h2>

    <h3>Paper Sources</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:8px">Toggle sources on/off, change colors, or add new journal feeds. Sources use the arXiv API filtered by journal reference.</p>
    ${srcHtml}
    <button class="settings-add-btn" onclick="_addSource()">+ Add journal source</button>

    <h3>Preset Searches</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:8px">Quick-search buttons shown in the scraper. Edit labels and queries, or add new ones.</p>
    ${preHtml}
    <button class="settings-add-btn" onclick="_addPreset()">+ Add preset</button>

    <h3>Digest Email Recipients</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:8px">Who receives the arXiv digest emails. Frequency: daily, weekly, or both.</p>
    ${recipHtml}
    <button class="settings-add-btn" onclick="_addRecipient()">+ Add recipient</button>
    <button class="settings-add-btn" style="margin-left:8px" onclick="_exportRecipients()">&#8681; Export email_recipients.json</button>

    <h3>Collaboration</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:8px">Share collections with collaborators via OneDrive or export packages for external sharing.</p>
    <div class="settings-row" style="flex-direction:column;gap:12px">
      <div>
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">OneDrive Shared Folder Path</label>
        <input type="text" id="shared-folder-path" value="${_esc(collabSettings.sharedFolderPath || '')}" placeholder="e.g., /Users/paige/OneDrive/Shared Folders/Lab Research" style="width:100%;padding:6px 10px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;font-size:11px">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="settings-add-btn" onclick="_syncToSharedFolder()">&#128190; Download for Shared Folder</button>
        <button class="settings-add-btn" onclick="document.getElementById('merge-shared-file').click()">&#128516; Merge from Shared</button>
      </div>
      <div style="font-size:10px;color:var(--text3)">Last sync: ${lastSync}</div>
    </div>
    <input type="file" id="merge-shared-file" accept=".db" style="display:none" onchange="mergeSharedFile(event)">

    <h3 style="color:var(--green)">Overleaf Integration</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:8px">Auto-sync references.bib to your Overleaf project via Git.</p>
    <div class="settings-row" style="flex-direction:column;gap:10px">
      <div>
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">Overleaf Git URL</label>
        <input type="text" id="overleaf-git-url" value="${_esc((overleafCfg && overleafCfg.git_url) || '')}" placeholder="https://git.overleaf.com/abc123def456" style="width:100%;padding:6px 10px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;font-size:11px">
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <div>
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">Bib filename in Overleaf</label>
          <input type="text" id="overleaf-bib-name" value="${_esc((overleafCfg && overleafCfg.bib_filename) || 'references.bib')}" style="width:160px;padding:6px 10px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;font-size:11px">
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);margin-top:16px">
          <input type="checkbox" id="overleaf-auto-sync" ${overleafCfg && overleafCfg.auto_sync ? 'checked' : ''}> Auto-sync on paper add
        </label>
      </div>
      <div style="font-size:10px;color:var(--text3)">
        Setup: <code style="background:var(--bg);padding:2px 6px;border-radius:3px;font-size:10px">python tools/overleaf_sync.py --setup &lt;git-url&gt;</code>
        &nbsp;|&nbsp; Sync: <code style="background:var(--bg);padding:2px 6px;border-radius:3px;font-size:10px">python tools/overleaf_sync.py</code>
      </div>
    </div>

    <div class="settings-footer">
      <button onclick="closeSettingsModal()">Cancel</button>
      <button class="primary" onclick="_saveSettings()">Save</button>
    </div>
  </div>`;
}

export function _toggleSource(i) {
  _settingsSources[i].enabled = !_settingsSources[i].enabled;
  _renderSettingsModal();
}

export function _delSource(i) {
  _settingsSources.splice(i, 1);
  _exposeState();
  _renderSettingsModal();
}

export function _addSource() {
  const label = prompt("Journal label (e.g., 'PRB'):");
  if (!label) return;
  const journalRef = prompt("arXiv journal_ref filter (e.g., 'Phys.+Rev.+B'):");
  if (!journalRef) return;
  const key = _deriveSourceKey(label, _settingsSources.map(s => s.key));
  _settingsSources.push({
    key, label, color: '#58a6ff', enabled: true,
    type: 'arxiv-jr', journalRef, journalName: journalRef.replace(/\+/g, ' '),
  });
  _exposeState();
  _renderSettingsModal();
}

export function _delPreset(i) {
  _settingsPresets.splice(i, 1);
  _exposeState();
  _renderSettingsModal();
}

export function _addPreset() {
  _settingsPresets.push({ label: '', query: '' });
  _exposeState();
  _renderSettingsModal();
  const rows = document.querySelectorAll('.settings-panel .settings-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('input').focus();
}

export function _toggleRecipient(i) {
  _settingsRecipients[i].enabled = !_settingsRecipients[i].enabled;
  _renderSettingsModal();
}

export function _delRecipient(i) {
  _settingsRecipients.splice(i, 1);
  _exposeState();
  _renderSettingsModal();
}

export function _addRecipient() {
  _settingsRecipients.push({ email: '', name: '', frequency: 'daily', enabled: true });
  _exposeState();
  _renderSettingsModal();
  const rows = document.querySelectorAll('.settings-panel .settings-row');
  const last = rows[rows.length - 1];
  if (last) {
    const inp = last.querySelectorAll('input');
    if (inp[1]) inp[1].focus();
  }
}

export function _exportRecipients() {
  const data = {
    recipients: _settingsRecipients.filter(r => r.email.trim()),
    defaults: { frequency: 'daily', enabled: true },
    _note: 'Managed by paper_database.html Settings tab or edit directly. Frequency: daily | weekly | both',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'email_recipients.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function _saveSettings() {
  // B6 (audit 2026-04-30): the legacy modal and Settings v2 both write
  // to the same `settings` table keys (overleafConfig, sources, presets,
  // emailRecipients, collaboration). Legacy = full-form snapshot on Save;
  // v2 = autosave on field change. If both UIs are open, this snapshot
  // can overwrite a v2 autosave. Warn so user reports of "settings got
  // reverted" are diagnosable. Remove this when plan #11 retires the
  // legacy modal.
  console.warn(
    '[settings-modal/legacy] _saveSettings() fired — this is the legacy ' +
    'modal. Settings v2 is canonical (src/ui/settings/). If you have v2 ' +
    'open in another tab, this Save will stomp its values for keys: ' +
    'overleafConfig, sources, presets, emailRecipients, collaboration. ' +
    'See plan item #11 + B6.'
  );
  const SCQ = _scq();
  const presets = _settingsPresets.filter(p => p.label.trim() && p.query.trim());
  const recipients = _settingsRecipients.filter(r => r.email.trim());
  SCQ.setSetting('sources', _settingsSources);
  SCQ.setSetting('presets', presets);
  SCQ.setSetting('emailRecipients', recipients);

  const pathInput = document.getElementById('shared-folder-path');
  if (pathInput) {
    const folderPath = pathInput.value.trim();
    const collabSettings = SCQ.getSetting('collaboration') || {};
    collabSettings.sharedFolderPath = folderPath;
    SCQ.setSetting('collaboration', collabSettings);
  }

  const olUrl = document.getElementById('overleaf-git-url');
  const olBib = document.getElementById('overleaf-bib-name');
  const olAuto = document.getElementById('overleaf-auto-sync');
  if (olUrl) {
    SCQ.setSetting('overleafConfig', {
      git_url: olUrl.value.trim(),
      bib_filename: (olBib && olBib.value.trim()) || 'references.bib',
      auto_sync: olAuto ? olAuto.checked : true,
    });
  }

  _applySettingsToConfig();
  closeSettingsModal();
  _render();
}

export function _applySettingsToConfig() {
  const SCQ = _scq();
  const cfg = _cfg();
  if (!cfg) return;
  const savedSources = SCQ.getSetting('sources');
  const savedPresets = SCQ.getSetting('presets');

  if (savedSources) {
    const newSources = {};
    savedSources.forEach(s => {
      newSources[s.key] = {
        label: s.label, color: s.color, enabled: s.enabled,
        type: s.type, journalRef: s.journalRef, journalName: s.journalName,
      };
    });
    cfg.sources = newSources;
  }
  if (savedPresets) {
    cfg.presets = savedPresets;
  }
}

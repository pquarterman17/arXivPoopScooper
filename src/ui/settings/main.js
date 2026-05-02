/**
 * Settings UI — schema-driven modal for editing every config domain.
 *
 * Plan #11. Each tab corresponds to one config domain (paths, digest,
 * email, …). The form is generated from the domain's JSON Schema by
 * `schema-form.js`, so adding a new config field is a one-file change
 * (the schema), not a UI rewrite.
 *
 * Lifecycle:
 *   1. `showSettings()` builds the modal once; reuses it across opens.
 *   2. Switching tabs lazily fetches the domain's current value + schema
 *      from the server.
 *   3. Edits accumulate in `pending` per tab. The Save button POSTs
 *      `/api/config/<domain>` and clears the dirty marker.
 *   4. Closing with unsaved changes prompts.
 *
 * No `window.*` exports needed — invoked from main.js's data-action
 * dispatcher and called directly by other modules.
 */

import { renderForm } from './schema-form.js';
import { renderCollaborationTab } from './tabs/collaboration-tab.js';
import { renderOverleafTab } from './tabs/overleaf-tab.js';
import { mountStorageExtras, mountDigestExtras, mountEmailExtras } from './tabs/test-buttons.js';

/**
 * Tab definitions. `kind` decides how the tab body is filled:
 *
 *   - "schema": load a JSON Schema + the current value, render via
 *     `renderForm`, and let `extras(body, ctx)` (optional) append
 *     custom UI (e.g. test buttons) below the form. The footer Save
 *     button posts the edited form to /api/config/<id>.
 *
 *   - "custom": call `renderFn(body, ctx)`. The tab handles its own
 *     state, save flow, and UI. The footer Save button is hidden on
 *     these tabs because save semantics are tab-specific (e.g.
 *     collaboration writes to the DB settings table, not a config file).
 *
 * `ctx` passed to renderFn / extras provides a stable mini-API:
 *   - setStatus(text, kind)   — write to the modal footer status line
 *   - getDbSetting(key)       — read SCQ.getSetting (browser DB)
 *   - setDbSetting(key, val)  — write SCQ.setSetting
 */
export const TABS = [
  { id: 'paths', label: 'Storage', kind: 'schema', extras: mountStorageExtras },
  { id: 'search-sources', label: 'Search', kind: 'schema' },
  { id: 'digest', label: 'Digest', kind: 'schema', extras: mountDigestExtras },
  { id: 'email', label: 'Email', kind: 'schema', extras: mountEmailExtras },
  { id: 'citations', label: 'Citations', kind: 'schema' },
  { id: 'ingest', label: 'Ingest', kind: 'schema' },
  { id: 'ui', label: 'UI', kind: 'schema' },
  { id: 'watchlist', label: 'Watchlist', kind: 'schema' },
  { id: 'privacy', label: 'Privacy', kind: 'schema' },
  { id: 'auto-tag-rules', label: 'Auto-Tag', kind: 'schema' },
  { id: 'collaboration', label: 'Collaboration', kind: 'custom', renderFn: renderCollaborationTab },
  { id: 'overleaf', label: 'Overleaf', kind: 'custom', renderFn: renderOverleafTab },
];

let _modal = null;       // cached top-level overlay element
let _activeTab = null;   // domain id of the tab currently rendered
let _pending = {};       // domain → pending edited value (dirty if present)
let _schemaCache = {};   // domain → parsed schema (fetched once per session)
let _statusTimer = null;

/** Open the settings modal. Idempotent. */
export async function showSettings() {
  if (!_modal) _modal = buildModal();
  _modal.style.display = 'flex';
  if (!_activeTab) await switchTab(TABS[0].id);
}

/** Close the modal. Prompts if there are unsaved changes. */
export function closeSettings() {
  if (Object.keys(_pending).length > 0) {
    const ok = confirm('You have unsaved changes. Discard them?');
    if (!ok) return;
    _pending = {};
  }
  if (_modal) _modal.style.display = 'none';
  // Reset active tab so next open re-fetches (in case underlying file changed).
  _activeTab = null;
}

// ─── modal construction ───

function buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'settings-v2-overlay';
  overlay.className = 'settings-v2-overlay';
  // Close on backdrop click (data-action handled by main.js's delegator)
  overlay.dataset.action = 'closeSettingsV2IfBackdrop';

  const dialog = document.createElement('div');
  dialog.className = 'settings-v2-dialog';
  overlay.appendChild(dialog);

  // Header
  const header = document.createElement('header');
  header.className = 'settings-v2-header';
  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'settings-v2-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close (Esc)';
  closeBtn.dataset.action = 'closeSettingsV2';
  header.append(title, closeBtn);
  dialog.appendChild(header);

  // Tabs nav
  const tabs = document.createElement('nav');
  tabs.className = 'settings-v2-tabs';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-v2-tab';
    btn.dataset.tabId = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => switchTab(tab.id));
    tabs.appendChild(btn);
  }
  dialog.appendChild(tabs);

  // Body
  const body = document.createElement('main');
  body.className = 'settings-v2-body';
  dialog.appendChild(body);

  // Status + footer
  const footer = document.createElement('footer');
  footer.className = 'settings-v2-footer';
  const status = document.createElement('span');
  status.className = 'settings-v2-status';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'settings-v2-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.dataset.action = 'closeSettingsV2';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'settings-v2-save primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => saveActiveTab());
  footer.append(status, cancelBtn, saveBtn);
  dialog.appendChild(footer);

  // Esc closes
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });

  document.body.appendChild(overlay);
  return overlay;
}

// ─── tab switching ───

async function switchTab(domainId) {
  if (_activeTab === domainId) return;
  _activeTab = domainId;
  highlightActiveTab(domainId);
  const body = _modal.querySelector('.settings-v2-body');
  body.innerHTML = '';
  body.appendChild(spinner());

  const tab = TABS.find((t) => t.id === domainId);
  // Footer Save button is only meaningful for schema tabs; hide on custom.
  const saveBtn = _modal.querySelector('.settings-v2-save');
  if (saveBtn) saveBtn.style.display = tab.kind === 'custom' ? 'none' : '';

  try {
    if (tab.kind === 'custom') {
      body.innerHTML = '';
      tab.renderFn(body, _ctx());
      return;
    }
    // schema kind
    const [schema, value] = await Promise.all([
      fetchSchema(domainId),
      fetchConfig(domainId),
    ]);
    body.innerHTML = '';
    if (schema.description) {
      const lead = document.createElement('p');
      lead.className = 'settings-v2-domain-desc';
      lead.textContent = schema.description;
      body.appendChild(lead);
    }
    // Pending takes precedence over the freshly-fetched value (so re-entering
    // a tab restores the user's in-flight edits).
    const initial = _pending[domainId] ?? value;
    const form = renderForm(schema, initial, (newValue) => {
      _pending[domainId] = newValue;
      markDirty(domainId, true);
    });
    body.appendChild(form);
    if (typeof tab.extras === 'function') tab.extras(body, _ctx());
  } catch (err) {
    body.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'settings-v2-error';
    msg.textContent = `Failed to load ${domainId}: ${err.message}`;
    body.appendChild(msg);
  }
}

/** Stable mini-API passed into custom tab renderFns and schema-tab extras. */
function _ctx() {
  return {
    setStatus,
    getDbSetting: (key) => globalThis.SCQ?.getSetting?.(key),
    setDbSetting: (key, val) => globalThis.SCQ?.setSetting?.(key, val),
  };
}

function highlightActiveTab(domainId) {
  for (const btn of _modal.querySelectorAll('.settings-v2-tab')) {
    btn.classList.toggle('active', btn.dataset.tabId === domainId);
  }
}

function markDirty(domainId, dirty) {
  const btn = _modal.querySelector(`.settings-v2-tab[data-tab-id="${domainId}"]`);
  if (!btn) return;
  btn.classList.toggle('dirty', dirty);
  // Append a • marker
  const baseLabel = TABS.find((t) => t.id === domainId)?.label ?? domainId;
  btn.textContent = dirty ? `${baseLabel} •` : baseLabel;
}

// ─── save ───

async function saveActiveTab() {
  if (!_activeTab) return;
  const value = _pending[_activeTab];
  if (value === undefined) {
    setStatus('No changes to save', 'info');
    return;
  }
  setStatus('Saving…', 'info');
  try {
    const r = await fetch(`/api/config/${_activeTab}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const msg = body.errors
        ? `Validation error: ${body.errors.join('; ')}`
        : `Save failed (HTTP ${r.status})`;
      setStatus(msg, 'error');
      return;
    }
    delete _pending[_activeTab];
    markDirty(_activeTab, false);
    setStatus('Saved.', 'ok');
  } catch (e) {
    setStatus(`Save failed: ${e.message}`, 'error');
  }
}

function setStatus(text, kind) {
  const status = _modal?.querySelector('.settings-v2-status');
  if (!status) return;
  status.textContent = text;
  status.dataset.kind = kind;
  if (_statusTimer) clearTimeout(_statusTimer);
  if (kind === 'ok' || kind === 'info') {
    _statusTimer = setTimeout(() => {
      status.textContent = '';
      delete status.dataset.kind;
    }, 2500);
  }
}

// ─── fetch helpers ───

async function fetchSchema(domainId) {
  if (_schemaCache[domainId]) return _schemaCache[domainId];
  const r = await fetch(`/src/config/schema/${domainId}.schema.json`);
  if (!r.ok) throw new Error(`schema ${domainId} not found`);
  const schema = await r.json();
  _schemaCache[domainId] = schema;
  return schema;
}

async function fetchConfig(domainId) {
  const r = await fetch(`/api/config/${domainId}`);
  if (!r.ok) throw new Error(`config ${domainId} not loadable (HTTP ${r.status})`);
  return r.json();
}

// ─── misc ───

function spinner() {
  const el = document.createElement('div');
  el.className = 'settings-v2-spinner';
  el.textContent = 'Loading…';
  return el;
}

/** Test/dev hook — drop the cached modal so the next showSettings rebuilds. */
export function _reset() {
  if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
  _modal = null;
  _activeTab = null;
  _pending = {};
  _schemaCache = {};
}

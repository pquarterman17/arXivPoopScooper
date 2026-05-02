/**
 * Overleaf tab — custom (non-schema) Settings v2 panel.
 *
 * Surfaces the Overleaf Git-sync configuration that previously lived in
 * the legacy settings modal: Git URL, bib filename in Overleaf, auto-sync-
 * on-paper-add toggle. Settings persist via `SCQ.setSetting('overleafConfig',
 * ...)` to the browser DB settings table.
 *
 * Note: the Python sync side (`tools/overleaf_sync.py`) currently reads
 * its own `.overleaf/config.json` rather than the browser DB setting —
 * that pre-existing drift is out of scope here. This tab matches the
 * legacy modal's behavior exactly so the JS-side state stays consistent
 * across both UIs during the migration.
 */

const DEFAULT_CFG = Object.freeze({
  git_url: '',
  bib_filename: 'references.bib',
  auto_sync: true,
});

export function renderOverleafTab(body, ctx) {
  const lead = document.createElement('p');
  lead.className = 'settings-v2-domain-desc';
  lead.textContent =
    'Auto-sync references.bib to your Overleaf project via Git. Set the URL once; subsequent paper additions can push automatically.';
  body.appendChild(lead);

  const cfg = { ...DEFAULT_CFG, ...(ctx.getDbSetting('overleafConfig') || {}) };

  // Helper: write the latest cfg whenever any field changes.
  const persist = () => {
    ctx.setDbSetting('overleafConfig', cfg);
    ctx.setStatus('Overleaf settings saved.', 'ok');
  };

  // ─── Git URL ───
  body.appendChild(makeStringRow({
    label: 'Overleaf Git URL',
    value: cfg.git_url,
    placeholder: 'https://git.overleaf.com/abc123def456',
    help: 'Find under Menu → Sync → Git in your Overleaf project.',
    onChange: (v) => { cfg.git_url = v; persist(); },
  }));

  // ─── Bib filename ───
  body.appendChild(makeStringRow({
    label: 'Bib filename in Overleaf',
    value: cfg.bib_filename,
    placeholder: 'references.bib',
    help: 'The path inside the Overleaf repo where references should land.',
    onChange: (v) => { cfg.bib_filename = v; persist(); },
  }));

  // ─── Auto-sync ───
  const autoRow = document.createElement('label');
  autoRow.className = 'schema-row schema-bool';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!cfg.auto_sync;
  cb.addEventListener('change', () => { cfg.auto_sync = cb.checked; persist(); });
  const cbLbl = document.createElement('span');
  cbLbl.textContent = 'Auto-sync on paper add';
  const cbHelp = document.createElement('small');
  cbHelp.className = 'schema-help';
  cbHelp.textContent = 'When enabled, every paper added via process_paper.py also pushes references.bib to Overleaf.';
  autoRow.append(cb, cbLbl, cbHelp);
  body.appendChild(autoRow);

  // ─── Setup hint ───
  const hint = document.createElement('div');
  hint.className = 'settings-v2-meta';
  hint.innerHTML =
    'Setup once: <code>python tools/overleaf_sync.py --setup &lt;git-url&gt;</code><br>' +
    'Manual sync anytime: <code>python tools/overleaf_sync.py</code>';
  body.appendChild(hint);
}

// ─── helper ───

function makeStringRow({ label, value, placeholder, help, onChange }) {
  const row = document.createElement('label');
  row.className = 'schema-row schema-string';
  const lbl = document.createElement('span');
  lbl.className = 'schema-label';
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('change', () => onChange(input.value.trim()));
  row.append(lbl, input);
  if (help) {
    const helpEl = document.createElement('small');
    helpEl.className = 'schema-help';
    helpEl.textContent = help;
    row.appendChild(helpEl);
  }
  return row;
}

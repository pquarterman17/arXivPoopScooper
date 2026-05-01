/**
 * Export / Import handlers (plan #8 strangler-fig migration).
 *
 * Six entry points, all reachable from inline onclick/onchange in
 * paper_database.html:
 *   - exportJSON         — More menu → "Export JSON"
 *   - importFile         — file inputs accept .db, .json (collection package),
 *                          and pending_papers.json from the arXiv digest
 *   - mergeFile          — merges a foreign .db via SCQ.importDatabaseFile
 *   - exportCollectionAsDB / Bib / Package — sidebar per-collection buttons
 *
 * Several legacy globals are still in the host page (loadPapersFromDB,
 * render, renderSidebar, getInboxPapers, setInboxPapers, switchMainTab).
 * Until those migrate we reach them through `globalThis.*`.
 */

function _scq() { return globalThis.SCQ; }
function _call(name, ...args) {
  const fn = globalThis[name];
  if (typeof fn === 'function') return fn(...args);
}

// Convert a Uint8Array to a binary string (each char = one byte) without
// blowing the call stack. `String.fromCharCode.apply(null, bigArray)` throws
// `RangeError: Maximum call stack size exceeded` past ~65k args, which a
// real SCQ database (typically 100s of KB) easily exceeds. Chunk in 8 KB
// slices instead. Exported solely for unit-testing the chunking; not part
// of the module's public API.
export function _bytesToBinaryString(bytes) {
  let binary = '';
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

export function exportJSON() {
  const state = _scq().exportJSON();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scq-database-state.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.name.endsWith('.db')) {
    _importDb(file);
  } else {
    _importJson(file);
  }
  event.target.value = '';
}

function _importDb(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const bytes = new Uint8Array(e.target.result);
    try {
      const binary = _bytesToBinaryString(bytes);
      localStorage.setItem('scq-db-base64', btoa(binary));
      alert('Database imported! Reloading...');
      location.reload();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function _importJson(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.format === 'scq-collection-package') {
        _importCollectionPackage(data);
      } else if (data.digestDate && Array.isArray(data.papers)) {
        _importPendingDigest(data);
      } else if (data.papers) {
        _importLegacyState(data);
      } else {
        alert('Unrecognized JSON format.');
      }
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function _importCollectionPackage(data) {
  const SCQ = _scq();
  let newCount = 0, updatedCount = 0, skippedCount = 0;
  const collName = data.collection;
  const existingColls = SCQ.getCollections().map(c => c.name);
  if (!existingColls.includes(collName)) {
    SCQ.run('INSERT INTO collections (name, paper_id) VALUES (?, ?)', [collName, 'dummy']);
    SCQ.run('DELETE FROM collections WHERE paper_id = ?', ['dummy']);
  }

  for (const paperData of data.papers) {
    const existing = SCQ.queryOne('SELECT id FROM papers WHERE id = ?', [paperData.id]);

    if (!existing) {
      SCQ.addPaper(paperData.id, {
        title: paperData.title,
        authors: paperData.authors,
        short_authors: paperData.short_authors,
        year: paperData.year,
        tags: paperData.tags || [],
        summary: paperData.summary || '',
        key_results: paperData.key_results || [],
        cite_bib: paperData.cite_bib || '',
        cite_txt: paperData.cite_txt || '',
        group_name: paperData.group_name || '',
        entry_type: paperData.entry_type || 'preprint',
        doi: paperData.doi
      });
      newCount++;
    } else {
      const current = SCQ.getPaper(paperData.id);
      const updates = {};
      let hasChanges = false;
      if (!current.summary && paperData.summary) { updates.summary = paperData.summary; hasChanges = true; }
      if (!current.group_name && paperData.group_name) { updates.group_name = paperData.group_name; hasChanges = true; }
      if (!current.cite_bib && paperData.cite_bib) { updates.cite_bib = paperData.cite_bib; hasChanges = true; }
      if (!current.cite_txt && paperData.cite_txt) { updates.cite_txt = paperData.cite_txt; hasChanges = true; }

      const currentTags = current.tags ? JSON.parse(current.tags) : [];
      const newTags = Array.from(new Set([...currentTags, ...(paperData.tags || [])])).sort();
      if (JSON.stringify(newTags) !== JSON.stringify(currentTags)) {
        updates.tags = JSON.stringify(newTags);
        hasChanges = true;
      }

      if (hasChanges) {
        for (const [key, val] of Object.entries(updates)) {
          SCQ.run(`UPDATE papers SET ${key} = ? WHERE id = ?`, [typeof val === 'string' ? val : JSON.stringify(val), paperData.id]);
        }
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    if (paperData.notes) SCQ.setNote(paperData.id, paperData.notes);
    if (paperData.is_read || paperData.priority) {
      SCQ.setReadStatus(paperData.id, paperData.is_read);
      if (paperData.priority) SCQ.setPriority(paperData.id, paperData.priority);
    }
    if (paperData.highlights && Array.isArray(paperData.highlights)) {
      for (const h of paperData.highlights) {
        SCQ.addHighlight(paperData.id, h.text, h.page, h.color);
      }
    }
    SCQ.addToCollection(collName, paperData.id);
  }

  _call('loadPapersFromDB');
  _call('render');
  const total = newCount + updatedCount + skippedCount;
  alert(
    `Package imported successfully!\n\n` +
    `• ${newCount} new paper${newCount !== 1 ? 's' : ''} added\n` +
    `• ${updatedCount} paper${updatedCount !== 1 ? 's' : ''} updated\n` +
    `• ${skippedCount} paper${skippedCount !== 1 ? 's' : ''} unchanged\n` +
    `• ${total} total in collection "${collName}"`
  );
}

function _importPendingDigest(data) {
  const SCQ = _scq();
  const papers = _call('getInboxPapers') || [];
  let added = 0;
  for (const p of data.papers) {
    const existing = SCQ.queryOne('SELECT id FROM papers WHERE id = ?', [p.id]);
    if (!existing && !papers.find(ip => ip.id === p.id)) {
      papers.push(p);
      added++;
    }
  }
  _call('setInboxPapers', papers);
  _call('switchMainTab', 'inbox');
  alert(`Added ${added} paper(s) to inbox for review.\n${data.papers.length - added} already in database.`);
}

function _importLegacyState(data) {
  const SCQ = _scq();
  for (const [id, ps] of Object.entries(data.papers)) {
    if (ps.notes) SCQ.setNote(id, ps.notes);
    if (ps.read !== undefined) SCQ.setReadStatus(id, ps.read);
    if (ps.priority) SCQ.setPriority(id, ps.priority);
    if (ps.manualLinks) ps.manualLinks.forEach(lid => SCQ.linkPapers(id, lid));
    if (ps.highlights) ps.highlights.forEach(h => SCQ.addHighlight(id, h.text, h.page, h.color));
    if (ps.collections) ps.collections.forEach(c => SCQ.addToCollection(c, id));
  }
  _call('loadPapersFromDB');
  _call('render');
  alert('State imported successfully!');
}

export async function mergeFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.db')) {
    alert('Please select a .db file to merge.');
    event.target.value = '';
    return;
  }
  try {
    const stats = await _scq().importDatabaseFile(file);
    _call('loadPapersFromDB');
    _call('render');
    _call('renderSidebar');
    alert(
      `Merge complete!\n\n` +
      `• ${stats.added} new paper${stats.added !== 1 ? 's' : ''} added\n` +
      `• ${stats.updated} paper${stats.updated !== 1 ? 's' : ''} updated\n` +
      `• ${stats.skipped} paper${stats.skipped !== 1 ? 's' : ''} unchanged\n\n` +
      `Remember to click "Save database" to download the merged .db file.`
    );
  } catch (err) {
    alert('Merge failed: ' + err.message);
  }
  event.target.value = '';
}

export function exportCollectionAsDB(collName) {
  const count = _scq().exportCollectionDB(collName);
  if (count === 0) alert('No papers in this collection.');
}

export function exportCollectionBib(collName) {
  const collPapers = _scq().getCollectionPapers(collName);
  const bibs = collPapers.map(p => p.cite_bib).filter(Boolean);
  if (bibs.length === 0) { alert('No papers in this collection.'); return; }
  const blob = new Blob([bibs.join('\n\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = collName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.bib';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportCollectionPackage(collName) {
  if (!collName) {
    alert('No collection selected. Please select a collection from the sidebar first.');
    return;
  }
  const SCQ = _scq();
  const collPapers = SCQ.getCollectionPapers(collName);
  if (collPapers.length === 0) { alert('No papers in this collection.'); return; }

  const papers = collPapers.map(p => {
    const notes = SCQ.getNote(p.id);
    const highlights = SCQ.getHighlights(p.id);
    const figures = SCQ.getFigures(p.id);
    const rs = SCQ.queryOne('SELECT is_read, priority FROM read_status WHERE paper_id = ?', [p.id]) || { is_read: 0, priority: 0 };
    return {
      id: p.id,
      title: p.title,
      authors: p.authors,
      short_authors: p.short_authors,
      year: p.year,
      tags: p.tags ? JSON.parse(p.tags) : [],
      summary: p.summary || '',
      key_results: p.key_results ? JSON.parse(p.key_results) : [],
      cite_bib: p.cite_bib || '',
      cite_txt: p.cite_txt || '',
      group_name: p.group_name || '',
      entry_type: p.entry_type || 'preprint',
      doi: p.doi || null,
      notes: notes ? notes.content : '',
      highlights: highlights.map(h => ({ page: h.page, text: h.text, color: h.color })),
      priority: rs.priority || 0,
      is_read: Boolean(rs.is_read),
      figures: figures.map(f => ({ figure_key: f.figure_key, label: f.label, caption: f.caption }))
    };
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const manifest = {
    format: 'scq-collection-package',
    version: 1,
    collection: collName,
    exportDate: dateStr,
    exportedBy: 'Claude',
    paperCount: papers.length,
    papers,
    references_bib: collPapers.map(p => p.cite_bib).filter(Boolean).join('\n\n'),
    references_txt: collPapers.map(p => p.cite_txt).filter(Boolean).join('\n\n')
  };

  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scq-package-' + collName.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + dateStr + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

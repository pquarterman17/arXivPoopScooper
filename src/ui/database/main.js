/**
 * Entry point for the new modular paper-database UI (plan item #8).
 *
 * **Strangler-fig migration in progress.** The legacy `paper_database.html`
 * is ~4700 lines of inline JS + CSS. Rather than a big-bang rewrite, we
 * progressively peel features into modules under `src/ui/database/`. This
 * file is the bridge: it imports each migrated feature and re-exposes its
 * public API on `window` so existing inline callers (and `onclick=`
 * attributes in the HTML) keep working.
 *
 * As more features migrate, the legacy boot block in paper_database.html
 * shrinks. Eventually that block is replaced entirely with a `boot()`
 * function exported from this file, and the `window.*` shims are dropped.
 *
 * **Loading order matters:** this script tag is `type="module"`, which
 * defers execution until after the document is parsed *and* after legacy
 * `<script>` tags run. So:
 *   1. CDN scripts (sql.js, d3) — synchronous during parse
 *   2. Legacy `db_utils.js`, `scraper_config.js` — synchronous
 *   3. The big inline `<script>` block — synchronous, sets up SCQ.init()
 *   4. THIS module — runs after parse; window shims installed
 *   5. SCQ.init().then() callback fires async after sql.js + DB load
 * The SCQ.init().then() callback is where legacy code calls our shimmed
 * functions. By the time it runs, our shims are in place.
 *
 * No new boot logic here yet — the legacy block still owns initialization.
 */

import './escape-html.js';  // side-effect: shims globalThis.escapeHtml
import './local-proxy.js';   // side-effect: shims globalThis.arxivFetch
import { updateSyncIndicator } from './sync-indicator.js';
import { getPdfPath } from './pdf-path.js';
import { closeMoreMenu, installMoreMenuOutsideClick } from './more-menu.js';
import { saveToDisk, installClickToSave } from './save-to-disk.js';
import { toggleSort, sortPapers, sortArrow, sortedClass } from './sort.js';
import { copyForWord, copyAllForWord } from './citation-copy.js';
import { openPdfViewer, closePdfViewer, openPdfExternal } from './pdf-viewer.js';
import { addHighlight, removeHighlightById, renderHighlights } from './highlights.js';
import { showAnalytics, closeAnalytics } from './analytics.js';
import {
  exportJSON,
  importFile,
  mergeFile,
  exportCollectionAsDB,
  exportCollectionBib,
  exportCollectionPackage,
} from './export-import.js';
import { showAddWebsiteModal, fetchWebsiteMeta, submitAddWebsite } from './add-website-modal.js';
import { installDragDropImport, findArxivId, findDOI } from './drag-drop-import.js';
import { getRelatedPapers } from './related-papers.js';
import {
  getCollectionNames,
  isPaperInCollection,
  togglePaperCollection,
  setActiveCollection,
  showNewCollectionModal,
  createCollection,
  deleteCollectionUI,
  closeModal,
  toggleCollectionDropdown,
  renderCollectionDropdown,
} from './collections-ui.js';
import { showLinkPaperModal, toggleManualLink } from './manual-link.js';
import {
  toggleReadStatus,
  setStarRating,
  renderStars,
  setReadFilter,
  setPriorityFilter,
  setTypeFilter,
} from './read-priority.js';
import {
  getAllTags,
  getFiltered,
  togglePdfSearch,
  copyText,
  openLightbox,
  closeLightbox,
} from './helpers.js';
import { showTagManagerModal, promptRenameTag, promptMergeTag, doDeleteTag } from './tag-manager.js';
import {
  installSourceStyles,
  loadSuggestions,
  renderSuggestions,
  toggleSuggestions,
  sugAdd,
  sugIgnore,
  dismissAllSuggestions,
  autoFetchOnLoad,
} from './suggestions-banner.js';
import { loadPapersFromDB } from './init.js';
import { togglePaper, toggleTag, clearTags, updateNotes } from './events.js';
import { syncToSharedFolder, mergeSharedFile } from './collaboration.js';
import { render, renderSidebar } from './library-table.js';
import {
  showSettingsModal,
  closeSettingsModal,
  _renderSettingsModal,
  _toggleSource,
  _delSource,
  _addSource,
  _delPreset,
  _addPreset,
  _toggleRecipient,
  _delRecipient,
  _addRecipient,
  _exportRecipients,
  _saveSettings,
  _applySettingsToConfig,
} from './settings-modal.js';
import { showSettings as showSettingsV2, closeSettings as closeSettingsV2 } from '../settings/main.js';

// ─── Legacy globals shim ───
// Exactly what was inlined before, just re-exposed from a module so callers
// can be migrated piecemeal. When a caller is ported to a module, it should
// import the named export directly instead of going through window.
window.updateSyncIndicator = updateSyncIndicator;
window.getPdfPath = getPdfPath;
window.closeMoreMenu = closeMoreMenu;
window.saveToDisk = saveToDisk;  // for the More menu button + bare callers
window.toggleSort = toggleSort;
window.sortPapers = sortPapers;
window.sortArrow = sortArrow;
window.sortedClass = sortedClass;
window.copyForWord = copyForWord;
window.copyAllForWord = copyAllForWord;
window.openPdfViewer = openPdfViewer;
window.closePdfViewer = closePdfViewer;
window.openPdfExternal = openPdfExternal;
window.addHighlight = addHighlight;
window.removeHighlightById = removeHighlightById;
window.renderHighlights = renderHighlights;
window.showAnalytics = showAnalytics;
window.closeAnalytics = closeAnalytics;
window.exportJSON = exportJSON;
window.importFile = importFile;
window.mergeFile = mergeFile;
window.exportCollectionAsDB = exportCollectionAsDB;
window.exportCollectionBib = exportCollectionBib;
window.exportCollectionPackage = exportCollectionPackage;
window.showAddWebsiteModal = showAddWebsiteModal;
window.fetchWebsiteMeta = fetchWebsiteMeta;
window.submitAddWebsite = submitAddWebsite;
window.findArxivId = findArxivId;
window.findDOI = findDOI;
window.getRelatedPapers = getRelatedPapers;
window.getCollectionNames = getCollectionNames;
window.isPaperInCollection = isPaperInCollection;
window.togglePaperCollection = togglePaperCollection;
window.setActiveCollection = setActiveCollection;
window.showNewCollectionModal = showNewCollectionModal;
window.createCollection = createCollection;
window.deleteCollectionUI = deleteCollectionUI;
window.closeModal = closeModal;
window.toggleCollectionDropdown = toggleCollectionDropdown;
window.renderCollectionDropdown = renderCollectionDropdown;
window.showLinkPaperModal = showLinkPaperModal;
window.toggleManualLink = toggleManualLink;
window.toggleReadStatus = toggleReadStatus;
window.setStarRating = setStarRating;
window.renderStars = renderStars;
window.setReadFilter = setReadFilter;
window.setPriorityFilter = setPriorityFilter;
window.setTypeFilter = setTypeFilter;
window.getAllTags = getAllTags;
window.getFiltered = getFiltered;
window.togglePdfSearch = togglePdfSearch;
window.copyText = copyText;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.showTagManagerModal = showTagManagerModal;
window.promptRenameTag = promptRenameTag;
window.promptMergeTag = promptMergeTag;
window.doDeleteTag = doDeleteTag;
// Suggestions banner — boot helpers used by legacy loadPapersFromDB,
// plus inline onclick callers in the banner markup.
window.loadSuggestions = loadSuggestions;
window.renderSuggestions = renderSuggestions;
window.autoFetchOnLoad = autoFetchOnLoad;
window.toggleSuggestions = toggleSuggestions;
window.sugAdd = sugAdd;
window.sugIgnore = sugIgnore;
window.dismissAllSuggestions = dismissAllSuggestions;
window.loadPapersFromDB = loadPapersFromDB;
window.togglePaper = togglePaper;
window.toggleTag = toggleTag;
window.clearTags = clearTags;
window.updateNotes = updateNotes;
// Settings modal "Collaboration" section uses these names verbatim in its
// inline onclick / onchange attributes; preserve them.
window._syncToSharedFolder = syncToSharedFolder;
window.mergeSharedFile = mergeSharedFile;
// Settings modal — modal HTML uses inline onclick referring to these names.
window.showSettingsModal = showSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window._renderSettingsModal = _renderSettingsModal;
window._toggleSource = _toggleSource;
window._delSource = _delSource;
window._addSource = _addSource;
window._delPreset = _delPreset;
window._addPreset = _addPreset;
window._toggleRecipient = _toggleRecipient;
window._delRecipient = _delRecipient;
window._addRecipient = _addRecipient;
window._exportRecipients = _exportRecipients;
window._saveSettings = _saveSettings;
window._applySettingsToConfig = _applySettingsToConfig;
// Library view rendering — every other module's mutators call window.render()
// to redraw, and the boot block's SCQ.init().then() also reaches it here.
window.render = render;
window.renderSidebar = renderSidebar;

// ─── Event delegation registries ───
// Static markup in `paper_database.html` uses `data-action="..."` on
// elements that need a click handler, and `data-change="..."` for change
// events. The two delegated listeners installed below dispatch into the
// registries, which in turn call the imported module function or — for
// handlers still living in the legacy boot block — `window.<name>(...)`.
//
// Why this exists: until #8 fully closes (boot block + dynamic template
// strings migrated), inline `onclick="foo()"` attributes in the static
// HTML were the *only* reason some functions had to be on `window`.
// Replacing them with data-action makes the static markup
// framework-agnostic and clarifies which window shims remain because of
// legacy *dynamic* HTML (rendered by template strings) versus static.
//
// Each handler receives `(el, event)` where `el` is the closest element
// carrying the `data-action` / `data-change` attribute (NOT necessarily
// `event.target`, which can be a child).
//
// Convention for arguments:
//   - Single-value actions read from a typed data-attribute named after
//     the parameter (e.g. `data-tab="library"` for switchMainTab).
//   - Some attributes (data-readfilter, data-pf) are reused because
//     CSS / JS already query them for styling.

const ACTIONS = {
  // ─ Top toolbar
  showAddWebsiteModal: () => showAddWebsiteModal(),
  showSettingsModal: () => showSettingsModal(),
  showSettingsV2: () => showSettingsV2(),
  closeSettingsV2: () => closeSettingsV2(),
  closeSettingsV2IfBackdrop: (el, e) => {
    if (e.target === el) closeSettingsV2();
  },
  toggleMoreMenu: (el) => el.nextElementSibling.classList.toggle('open'),
  // ─ "More" menu items (each closes the menu after running)
  menuSaveToDisk: () => {
    saveToDisk().catch((e) => alert('Save failed: ' + e.message));
    closeMoreMenu();
  },
  menuDownloadDb: () => { window.SCQ.saveToFile(); closeMoreMenu(); },
  menuExportJson: () => { exportJSON(); closeMoreMenu(); },
  menuImportDb: () => {
    document.getElementById('import-db-file').click();
    closeMoreMenu();
  },
  menuMergeDb: () => {
    document.getElementById('merge-db-file').click();
    closeMoreMenu();
  },
  menuShowAnalytics: () => { showAnalytics(); closeMoreMenu(); },
  menuExportCollectionPackage: () => {
    exportCollectionPackage(window.activeCollection || 'all');
    closeMoreMenu();
  },
  menuImportPackage: () => {
    document.getElementById('import-package-file').click();
    closeMoreMenu();
  },
  menuOpenBatchImport: () => { window.openBatchImport?.(); closeMoreMenu(); },
  menuShowSettingsV2: () => { showSettingsV2(); closeMoreMenu(); },
  closeMoreMenu: () => closeMoreMenu(),
  // ─ Suggestions banner
  toggleSuggestions: () => toggleSuggestions(),
  dismissAllSuggestions: (_el, e) => {
    e.stopPropagation();
    dismissAllSuggestions();
  },
  // ─ Tabs
  switchMainTab: (el) => window.switchMainTab?.(el.dataset.tab),
  // ─ Filters (active-state styling reads existing data-readfilter / data-pf)
  setReadFilter: (el) => setReadFilter(el.dataset.readfilter),
  setPriorityFilter: (el) => setPriorityFilter(el.dataset.pf),
  // ─ Cite tab
  citeSetFormat: (el) => window.citeSetFormat?.(el.dataset.fmt),
  citeClearSelection: () => window.citeClearSelection?.(),
  citeCopySelected: () => window.citeCopySelected?.(),
  // ─ Graph tab
  renderGraph: () => window.renderGraph?.(),
  // ─ Inbox tab
  inboxImportFile: () => window.inboxImportFile?.(),
  inboxImportAll: () => window.inboxImportAll?.(),
  inboxImportStarred: () => window.inboxImportStarred?.(),
  inboxClear: () => window.inboxClear?.(),
  // ─ Overlays — close only when the backdrop itself is clicked
  closeSettingsModalIfBackdrop: (el, e) => {
    if (e.target === el) closeSettingsModal();
  },
  closeAnalyticsIfBackdrop: (el, e) => {
    if (e.target === el) closeAnalytics();
  },
  closeAnalytics: () => closeAnalytics(),
  closeLightbox: () => closeLightbox(),
  closePdfViewer: () => closePdfViewer(),
  // ─ Batch import modal
  closeBatchImport: () => window.closeBatchImport?.(),
  pickBatchFiles: () => window.pickBatchFiles?.(),
  pickBatchFolder: () => window.pickBatchFolder?.(),

  // ─ Dynamic-template handlers (rendered from boot-block tabs).
  // These replace the inline `onclick="foo(${idx})"` patterns in render
  // functions; the boot-block functions stay in place, called via window.
  // Dataset numbers come back as strings; parse where the underlying
  // function expects an integer.
  stopPropagation: (_el, e) => e.stopPropagation(),
  readingMarkRead: (el) => window.readingMarkRead?.(el.dataset.id),
  readingViewFullEntry: (el) => {
    const id = el.dataset.id;
    window.switchMainTab?.('library');
    window.expandedId = id;
    window.render?.();
  },
  citeToggleSelect: (el) => window.citeToggleSelect?.(el.dataset.id),
  citeToggleSelectStop: (el, e) => {
    e.stopPropagation();
    window.citeToggleSelect?.(el.dataset.id);
  },
  citeQuickCopy: (el) => window.citeQuickCopy?.(el.dataset.id, el.dataset.fmt, el),
  toggleAbstract: (el) => window.toggleAbstract?.(Number(el.dataset.idx)),
  inboxRemoveTag: (el) => window.inboxRemoveTag?.(
    Number(el.dataset.idx), Number(el.dataset.tidx),
  ),
  inboxSetPriority: (el) => window.inboxSetPriority?.(
    Number(el.dataset.idx), Number(el.dataset.rating),
  ),
  inboxImportOne: (el) => window.inboxImportOne?.(Number(el.dataset.idx)),
  inboxSkipOne: (el) => window.inboxSkipOne?.(Number(el.dataset.idx)),
};

const CHANGES = {
  importFile: (_el, e) => importFile(e),
  mergeFile: (_el, e) => mergeFile(e),
  togglePdfSearch: (el) => togglePdfSearch(el.checked),
  inboxFileSelected: (_el, e) => window.inboxFileSelected?.(e),
  handleBatchFiles: (el) => window.handleBatchFiles?.(el.files),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(el, e);
});

// Keydown delegate for ``data-action="<thing>OnEnter"`` — strips the suffix
// and calls window.<thing>(event, ...dataset-args). Currently only the inbox
// tag input uses this for Enter-to-add.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target.closest('[data-action$="OnEnter"]');
  if (!el) return;
  const fnName = el.dataset.action.slice(0, -'OnEnter'.length);
  const fn = window[fnName];
  if (typeof fn !== 'function') return;
  // The boot-block inboxTagKeypress reads (event, idx); pass both.
  fn(e, Number(el.dataset.idx));
});

// ─── One-time DOM wiring ───
// Features that need a global listener at boot install it here, idempotently.
installMoreMenuOutsideClick();
installClickToSave();
installDragDropImport();
installSourceStyles();

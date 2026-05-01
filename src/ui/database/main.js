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

// ─── One-time DOM wiring ───
// Features that need a global listener at boot install it here, idempotently.
installMoreMenuOutsideClick();
installClickToSave();
installDragDropImport();
installSourceStyles();

/**
 * PDF path helper. Maps a paper id to its on-disk PDF path under the
 * served `pdfs/` directory.
 *
 * Sanitizes the id by replacing anything outside `[a-zA-Z0-9._-]` with
 * underscores — protects against accidental directory traversal if the
 * id ever comes from somewhere user-controlled.
 *
 * Migrated from paper_database.html (plan #8). Exposed via main.js as
 * window.getPdfPath for the inline render templates and onclick=
 * handlers that still call it.
 */

export function getPdfPath(paperId) {
  return 'pdfs/' + String(paperId).replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
}

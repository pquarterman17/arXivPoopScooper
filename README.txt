ScientificLitterScoop
=====================
Superconducting Circuits & Qubits Literature Collection

QUICK START — Adding a paper from arXiv:
  1. Give Claude the arXiv ID (e.g., 2603.17921)
  2. Claude runs fetch_arxiv.js on your machine (downloads PDF + metadata)
  3. Claude runs process_paper.py in sandbox (figures, citations, DB update)
  4. Done. Open paper_database.html to see it.

FOLDER STRUCTURE:
  papers/              PDFs (arXivId_Author_ShortTitle.pdf)
  figures/             Extracted figures organized by arXiv ID
  inbox/               Staging area for metadata JSON from fetch script
  tools/               Scripts (fetch_arxiv.js, process_paper.py, etc.)
  references.bib       BibTeX citations (for LaTeX / REVTeX)
  references.txt       Plain text citations (for Word docs)
  paper_database.html  Interactive database with figures, notes, citations
  cite_helper.html     Citation picker (half-screen alongside Word)
  to_read.html         Reading list sorted by priority
  CLAUDE.md            Full pipeline docs (read by Claude at session start)
  FEATURES.md          Complete feature documentation

FOR CLAUDE (any session, any machine):
  See CLAUDE.md for the full add-paper pipeline and DB access patterns.

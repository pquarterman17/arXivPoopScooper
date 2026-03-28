# SCQ Paper Database — Cowork Migration Guide

## Project Overview

This is a literature reference management system for **superconducting circuits and qubits (SCQ)** research. It tracks papers, extracts figures, maintains citation files, and provides an interactive HTML database for browsing.

**Target folder:** `C:\Users\patri\OneDrive\Work and School Research\NG\References`

---

## Folder Structure to Maintain

```
References/
├── papers/                          ← PDF files (legacy location)
├── pdfs/                            ← PDF files (new convention: pdfs/<arxivId>.pdf)
├── inbox/                           ← Drop PDFs here for batch processing
├── figures/                         ← extracted figure images by arXiv ID
│   ├── 2603.13183/
│   ├── 2603.13174/
│   └── 2510.20114/
├── tools/
│   ├── extract_figures.py           ← PyMuPDF figure+caption extractor
│   ├── import_mendeley.py           ← Mendeley/Zotero .bib importer
│   └── process_inbox.py             ← Batch inbox processor
├── references.bib                   ← BibTeX (for LaTeX/REVTeX)
├── notes.json                       ← Durable backup of notes, read status, etc.
├── paper_database.html              ← Interactive database (main UI)
├── to_read.html                     ← Reading list (unread papers)
├── cite_helper.html                 ← Citation picker for Word workflow
└── COWORK_MIGRATION_GUIDE.md        ← This file
```

---

## Current Papers in Database (3 total)

### [1] arXiv:2603.13183 — Hedrick et al. (2026)
- **Title:** Quantifying surface losses in superconducting aluminum microwave resonators
- **Group:** de Leon (Princeton)
- **Tags:** aluminum, surface loss, TLS, resonators, AlOx, XPS
- **Summary:** Measures microwave absorption from surface TLSs in superconducting Al resonators. Finds lifetimes primarily limited by TLSs in 2.7 nm native AlOx. HF treatment removes oxide but rapid regrowth limits improvements. Estimates Al interfaces contribute ~27% of relaxation rate in state-of-the-art Ta-on-Si qubits.
- **Key results:**
  - Surface loss tangent: (3.19 ± 0.22) × 10⁻³ (wet etch/liftoff)
  - HF treatment reduces loss by factor of 1.8
  - AlOx intrinsic loss tangent: (1.74 ± 0.7) × 10⁻²
  - Al oxide ~4× more lossy than TaOx
  - Al interfaces: ~27% of Ta qubit relaxation rate
- **Figures:** 4 (chip/pipeline, film characterization, microwave Q, XPS)
- **Citation (.bib):**
  ```
  @article{Hedrick2026,
    title     = {Quantifying surface losses in superconducting aluminum microwave resonators},
    author    = {Hedrick, Elizabeth and Bahrami, Faranak and Pakpour-Tabrizi, Alexander C. and Joshi, Atharv and Rahman, Q. Rumman and Yang, Ambrose and Chang, Ray D. and Bland, Matthew P. and Jindal, Apoorv and Cheng, Guangming and Yao, Nan and Cava, Robert J. and Houck, Andrew A. and de Leon, Nathalie P.},
    journal   = {arXiv preprint},
    year      = {2026},
    doi       = {10.48550/arXiv.2603.13183},
    note      = {arXiv:2603.13183 [quant-ph]}
  }
  ```
- **Citation (plain text):**
  E. Hedrick, F. Bahrami, A. C. Pakpour-Tabrizi, A. Joshi, Q. R. Rahman, A. Yang, R. D. Chang, M. P. Bland, A. Jindal, G. Cheng, N. Yao, R. J. Cava, A. A. Houck, and N. P. de Leon, Quantifying surface losses in superconducting aluminum microwave resonators, arXiv:2603.13183 [quant-ph] (2026).

### [2] arXiv:2603.13174 — Joshi et al. (2026)
- **Title:** Beta Tantalum Transmon Qubits with Quality Factors Approaching 10 Million
- **Group:** de Leon (Princeton)
- **Tags:** β-Ta, transmon, kinetic inductance, TLS, surface loss, qubit
- **Summary:** Demonstrates low-loss transmon qubits from β-Ta films on sapphire, challenging the belief that β-Ta is detrimental. Best qubit achieves time-averaged Q of (10.1 ± 1.3) × 10⁶. Surface TLS loss is ~2× that of α-Ta. β-Ta's large kinetic inductance enables compact device layouts. Deposited at room temperature.
- **Key results:**
  - Best qubit: T₁ = 958 ± 19 µs, Q = (10.1 ± 1.3) × 10⁶
  - Mean Q across 11 qubits: (5.6 ± 2.3) × 10⁶
  - Surface loss tangent: (1.6 ± 0.1) × 10⁻³ (~2× α-Ta)
  - Magnetic penetration depth λ = 1.78 ± 0.02 µm
  - β-Ta deposited at room temperature
- **Figures:** 4 (film/qubit characterization, kinetic inductance, losses, performance)
- **Citation (.bib):**
  ```
  @article{Joshi2026,
    title     = {Beta Tantalum Transmon Qubits with Quality Factors Approaching 10 Million},
    author    = {Joshi, Atharv and Jindal, Apoorv and Prestegaard, Paal H. and Bahrami, Faranak and Hedrick, Elizabeth and Bland, Matthew P. and Gerg, Tunmay and Cheng, Guangming and Yao, Nan and Cava, Robert J. and Houck, Andrew A. and de Leon, Nathalie P.},
    journal   = {arXiv preprint},
    year      = {2026},
    doi       = {10.48550/arXiv.2603.13174},
    note      = {arXiv:2603.13174 [quant-ph]}
  }
  ```
- **Citation (plain text):**
  A. Joshi, A. Jindal, P. H. Prestegaard, F. Bahrami, E. Hedrick, M. P. Bland, T. Gerg, G. Cheng, N. Yao, R. J. Cava, A. A. Houck, and N. P. de Leon, Beta Tantalum Transmon Qubits with Quality Factors Approaching 10 Million, arXiv:2603.13174 [quant-ph] (2026).

### [3] arXiv:2510.20114 — Potluri et al. (2026)
- **Title:** Fabrication and Structural Analysis of Trilayers for Tantalum Josephson Junctions with Ta₂O₅ Barriers
- **Group:** Eley (UW) / Pappas (Rigetti)
- **Tags:** tantalum, Josephson junction, Ta2O5, trilayer, plasma oxidation, TLS
- **Summary:** Investigates methods for forming Ta₂O₅ barriers for all-tantalum Josephson junctions. Compares tube furnace, RTA, and plasma oxidation. Plasma oxidation yields smoothest surfaces with temperature-controlled thickness. Nb seed layer required for crystalline α-Ta growth on oxide. Demonstrates feasibility of α-Ta/Nb/TaOx/α-Ta stacks.
- **Key results:**
  - Plasma oxidation: smoothest films (Ra ≈ 0.1 nm at 200°C)
  - Oxide thickness controlled by temperature: 7–15 nm (RT–400°C)
  - Native oxide: 1.93–2.38 nm (consistent with literature)
  - Nb seed layer required for α-Ta on Ta₂O₅
  - DFT: O diffusion barrier ~0.5–1 eV in TaOx
- **Figures:** 7 (XPS spectra, XRR/thickness, AFM, DFT mechanisms, XRD trilayers, STEM-EDX, STEM-BF/SAED)
- **Citation (.bib):**
  ```
  @article{Potluri2026,
    title     = {Fabrication and Structural Analysis of Trilayers for Tantalum {Josephson} Junctions with {Ta$_2$O$_5$} Barriers},
    author    = {Potluri, Raahul and Tangirala, Rohin and Liu, Jiangteng and Barrios, Alejandro and Kumar, Praveen and Bauers, Sage R. and Sushko, Peter V. and Pappas, David P. and Eley, Serena},
    journal   = {arXiv preprint},
    year      = {2026},
    doi       = {10.48550/arXiv.2510.20114},
    note      = {arXiv:2510.20114 [cond-mat.supr-con]}
  }
  ```
- **Citation (plain text):**
  R. Potluri, R. Tangirala, J. Liu, A. Barrios, P. Kumar, S. R. Bauers, P. V. Sushko, D. P. Pappas, and S. Eley, Fabrication and Structural Analysis of Trilayers for Tantalum Josephson Junctions with Ta₂O₅ Barriers, arXiv:2510.20114 [cond-mat.supr-con] (2026).

---

## Workflows to Replicate in Cowork

### 1. Adding a New Paper
When user uploads a PDF or provides an arXiv link:
1. Save PDF to `papers/` as `{arXivID}_{FirstAuthor}_{shortTitle}.pdf`
2. Extract figures from the PDF (rasterize pages with figures, crop individual figures)
3. Save figures to `figures/{arXivID}/` as `{author}_fig{N}.jpg`
4. Add entry to `references.bib` (REVTeX-compatible BibTeX format)
5. Append to `references.txt` with sequential numbering (Physical Review plain text style)
6. Rebuild `paper_database.html` with the new entry and embedded figures

### 2. Citation Format
- **.bib format:** Standard `@article{}` entries with title, author (full names), journal, year, doi, note (arXiv ID)
- **Plain text format:** `[N] Initials. LastName, ... , Title, Journal/arXiv info (Year).` — Physical Review style with abbreviated first names

### 3. Figure Extraction Process
- Rasterize PDF pages containing figures at 200 DPI using `pdftoppm`
- Crop individual figures from the rasterized pages
- Resize to 500px wide, JPEG quality 55-80 for the HTML database
- Keep higher-res versions (800px) in the figures folder for reference

### 4. HTML Database Features
- **Cards view:** Expandable entries with summary, key results, embedded figure thumbnails (click to lightbox), tags, copy-citation buttons, arXiv link
- **Table view:** Compact overview with arXiv ID, title, group, year, one key finding
- **Cite view:** Export all citations at once or individually, both .bib and plain text
- **Search:** Full-text across titles, authors, tags, summaries, and user notes
- **Tag filtering:** Click tags to filter, supports multiple tag selection
- **My Notes:** Per-paper editable text area that auto-saves and is searchable
- **Dark theme** with IBM Plex Sans typography

### 5. Database Entry Schema
Each paper entry includes:
- `id` — arXiv ID
- `title` — full title
- `authors` — full author list
- `shortAuthors` — "LastName et al."
- `year` — publication year
- `group` — research group and institution
- `tags` — array of topic keywords
- `summary` — 2-4 sentence summary of the paper
- `keyResults` — array of 4-6 key quantitative findings
- `figures` — array of {key, label, desc} for each figure
- `citeBib` — BibTeX entry string
- `citeTxt` — plain text citation string

---

## New Features (v2)

### Read/Unread Tracking
- **Checkbox in Cards view:** Each paper card has a read/unread toggle in the header (right side). Click to mark as read (green checkmark) or unread.
- **Checkbox in Table view:** First column is a Read checkbox.
- **Filter buttons:** "All / Unread / Read" filter buttons in the control bar let you filter the database by read status.
- **Persistence:** Read status is stored in browser localStorage (`scq-read-status` key) and in `notes.json` (for Claude to sync when rebuilding).

### To-Read Page (`to_read.html`)
- Standalone HTML page that shows only unread papers.
- Shares localStorage with `paper_database.html` — marking a paper as read in either page updates both.
- Includes paper summary, tags, arXiv link, and "Mark as read" button.
- Shows "all caught up" message when no unread papers remain.
- **Must be rebuilt by Claude** when new papers are added (the PAPERS array needs updating).

### Priority / Interest Rating
- **Star rating (1–3)** on each paper card header and in the table view.
- Click a star to set priority; click the same star again to clear it.
- Filter buttons: "Any ★" (all papers), "★ 1+" (any starred), "★★★" (high priority only).
- Persisted in localStorage (`scq-priority` key) and `notes.json`.

### Related Papers Linking
- When expanding a card, a "Related Papers" section appears if other papers share:
  - 2+ authors (detected by last name)
  - 2+ tags
  - Same research group
- Clicking a related paper chip navigates to that paper's expanded card.

### Collections (Mendeley-inspired)
- **Sidebar** on the left shows "All Papers" plus user-created collections.
- Click a collection to filter the main view to only papers in that collection.
- Papers can belong to multiple collections (like Mendeley folders).
- **Add to collection:** Each expanded card has a "Collections" button that opens a dropdown checklist.
- **Create/delete collections:** "New collection" button at the bottom of the sidebar; delete via right-click or long-press.
- Persisted in localStorage (`scq-collections` key) and `notes.json`.
- **Example collections:** "Ta materials", "Dissertation Ch.3", "Group meeting", "To discuss with advisor"

### notes.json
- Central persistence file for user notes, read status, priority, and collection assignments.
- Schema:
  ```json
  {
    "papers": {
      "arXivID": {
        "notes": "...",
        "read": true/false,
        "priority": 0-3,
        "dateAdded": "YYYY-MM-DD",
        "collections": ["collection name", ...]
      }
    },
    "collections": ["collection name", ...]
  }
  ```
- **When Claude rebuilds the HTML:** Read `notes.json` to set initial state. After processing, write updated `notes.json`.
- Browser localStorage is the real-time store; `notes.json` is the durable backup that survives HTML rebuilds.

### Drag-and-Drop Workflow (Guided Entry)
When user drops a PDF into the folder:
1. Claude auto-extracts: title, authors, arXiv ID, group, year, figures
2. Claude auto-suggests tags using the keyword dictionary (see below)
3. Claude shows the user a summary for review and prompts for:
   - Tag suggestions (user can edit)
   - Summary (user can edit Claude's draft)
   - Initial notes (optional)
4. After user confirmation, Claude:
   - Saves PDF to `papers/`
   - Extracts and saves figures to `figures/{arXivID}/`
   - Appends to `references.bib` and `references.txt`
   - Reads `notes.json`, adds new entry (read: false, priority: 0), writes back
   - Rebuilds both `paper_database.html` and `to_read.html`

### arXiv Link Input (Alternative to PDF)
When user provides an arXiv URL or ID instead of a PDF:
1. Claude fetches the abstract page via the arXiv API / web
2. Extracts: title, authors, abstract, categories, submission date
3. Downloads the PDF to `papers/`
4. Proceeds with the standard guided entry workflow above
5. Useful for triaging papers before committing to a full read

### Auto-Tagging Keyword Dictionary
Claude should scan the paper abstract/title for these domain keywords and suggest matching tags:

| Keyword pattern | Suggested tag |
|---|---|
| tantalum, α-Ta, β-Ta, Ta film | tantalum |
| aluminum, Al film, AlOx | aluminum |
| niobium, Nb, NbN, NbTiN | niobium |
| transmon, qubit, T₁, T₂, coherence | qubit |
| resonator, cavity, CPW | resonators |
| Josephson junction, JJ, trilayer | Josephson junction |
| surface loss, TLS, two-level system, dielectric loss | surface loss, TLS |
| oxide, AlOx, TaOx, Ta₂O₅, SiOx, native oxide | oxide |
| kinetic inductance, superfluid density | kinetic inductance |
| XPS, STEM, TEM, AFM, XRD, XRR | (the specific technique, e.g., "XPS") |
| plasma oxidation, RTA, furnace | plasma oxidation |
| fabrication, lithography, etching, deposition | fabrication |
| DFT, ab initio, first principles | DFT |
| noise, 1/f, charge noise, flux noise | noise |
| coupler, coupling, readout | readout |
| flip-chip, 3D integration, TSV | packaging |
| sapphire, silicon, substrate | substrate |

Claude should suggest 4–8 tags per paper, prioritizing specificity. The user reviews and edits before finalizing.

### Mendeley Library Import
Import an existing Mendeley library from a `.bib` export file. Supports Mendeley's .bib quirks (curly-brace title protection, LaTeX escapes, etc.).

**How to import:**
1. In Mendeley Desktop: File → Export → BibTeX (.bib)
2. Drop the `.bib` file into the References folder
3. Tell Claude: "Import my Mendeley library from [filename].bib"
4. Claude runs `tools/import_mendeley.py` which parses all entries
5. Claude shows a summary (count, first few entries) for review
6. After confirmation, Claude bulk-adds entries to the database

**What gets imported:**
- Title, authors (auto-abbreviated to initials), year, journal, DOI
- arXiv ID (extracted from eprint, note, or DOI fields)
- Both .bib and plain-text citations
- Tags are auto-suggested by Claude from titles using the keyword dictionary

**What to note:**
- The script handles `.bib` files from Mendeley, Zotero, Google Scholar, or any BibTeX source
- Existing papers (matched by arXiv ID or bib key) are skipped to avoid duplicates
- Claude will prompt for guided review of tags and summaries for each paper (or batch mode for large imports)

**Script:** `tools/import_mendeley.py`
- `python3 tools/import_mendeley.py library.bib --dry-run` — preview without importing
- `python3 tools/import_mendeley.py library.bib` — output full JSON for Claude to process

### Auto Figure + Caption Extraction
Automatically extract figure images and their full captions from any PDF. Runs on every paper added to the database.

**How it works:**
1. Scans PDF text for "Figure N" / "Fig. N" / "FIG. N" captions (handles physics paper conventions)
2. Identifies which pages contain figures via captions + embedded image detection
3. Rasterizes figure pages at 200 DPI
4. Attempts to crop individual figure regions using PyMuPDF image bounding boxes
5. Saves images as compressed JPEG (800px wide, quality 70) plus a `captions.json`

**Output for each paper:**
```
figures/{arXivID}/
  {author}_fig1.jpg
  {author}_fig2.jpg
  ...
  captions.json  ← {"fig1": {"file": "...", "page": 2, "caption": "FIG. 1. ..."}, ...}
```

**Script:** `tools/extract_figures.py`
- `python3 tools/extract_figures.py paper.pdf figures/2603.13183/ --prefix hedrick`

**Integration with database:**
- Claude reads `captions.json` to populate the `figures` array in the PAPERS data
- Captions are shown in the HTML database under each figure thumbnail
- Figure descriptions in the database entry come directly from the extracted caption text

---

## Folder Structure (Updated)

```
References/
├── papers/                          ← PDF files
├── figures/                         ← extracted figure images by arXiv ID
│   └── {arXivID}/
│       ├── {author}_fig1.jpg
│       └── captions.json            ← extracted caption text per figure
├── tools/                           ← helper scripts
│   ├── extract_figures.py           ← auto figure+caption extraction
│   └── import_mendeley.py           ← Mendeley .bib import
├── references.bib                   ← BibTeX (for LaTeX/REVTeX)
├── references.txt                   ← plain text citations (for Word)
├── paper_database.html              ← interactive browser-based database
├── to_read.html                     ← reading list (unread papers only)
├── cite_helper.html                 ← citation picker panel (for use alongside Word)
├── notes.json                       ← persistent notes + read status + priority
├── COWORK_MIGRATION_GUIDE.md        ← this file
└── README.txt
```

---

## New Features (2026-03-22 batch)

### Full-text search
- Search bar filters across title, authors, summary, key results, tags, group, arXiv ID, and notes
- Available in all three HTML files (database, to-read, cite helper)

### PDF linking
- Convention: place PDFs at `pdfs/<arXivId>.pdf`
- "PDF" button appears on every card and in the table view
- Links directly open the file in browser

### State export/import (notes durability)
- "Export state" / "Import state" buttons in database header
- Exports notes, read status, priorities, collections, and manual links as JSON
- On page load, tries to read notes.json as baseline (localStorage takes priority)
- Survives browser resets and works across machines

### Collection .bib export
- When viewing a collection, sidebar shows "Export as .bib" button
- Downloads a .bib file with only the papers in that collection

### Manual paper linking
- "Link" button on each paper card opens a picker modal
- Check/uncheck papers to create bidirectional links
- Manual links appear as orange chips in the Related Papers section
- Stored in localStorage and exportable via state export

### Batch inbox processor
- Drop PDFs into `inbox/` folder, run `python tools/process_inbox.py`
- Auto-extracts arXiv ID and DOI from first pages
- Runs figure extraction, moves PDF to `pdfs/`
- Outputs `inbox_manifest.json` for Claude to add entries to the database
- Supports `--dry-run` for preview

---

## Notes for Cowork Setup

- Python dependencies: `pip install PyMuPDF bibtexparser Pillow --break-system-packages`
- The HTML database currently embeds figures as base64 in the HTML. In Cowork, figures can be stored as separate files and referenced by relative path instead — this is more scalable.
- User notes are stored in browser localStorage with notes.json as durable backup. The "Export state" button creates a full backup JSON.
- The user's research field is superconducting quantum computing, focusing on materials (Ta, Al, Nb), surface losses (TLS, oxides), and Josephson junctions.
- Citation format must be compatible with Physical Review journals (REVTeX).

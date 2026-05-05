#!/usr/bin/env python3
"""
Batch inbox processor for SCQ Paper Database.

Drop PDFs into the inbox/ folder, then run this script.
It will:
  1. Try to extract arXiv ID or DOI from each PDF's first page
  2. Extract figures + captions using extract_figures.py
  3. Move the PDF to pdfs/<id>.pdf
  4. Output a JSON manifest of discovered papers for Claude to add to the database

Usage:
  python tools/process_inbox.py              # Process all PDFs in inbox/
  python tools/process_inbox.py --dry-run    # Preview without moving files
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

# This module lives at scq/ingest/inbox.py; PROJECT_DIR is two levels up.
# Resolve user-data dirs through scq.config.paths so user_config/paths.toml
# overrides take effect (matches the rest of the package; #12 wave 1 pattern).
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parents[1]
try:
    from scq.config.paths import paths as _scq_paths  # type: ignore[import-not-found]

    _P = _scq_paths()
    INBOX_DIR = Path(_P.inbox_dir)
    FIGURES_DIR = Path(_P.figures_dir)
except Exception:
    INBOX_DIR = PROJECT_DIR / "inbox"
    FIGURES_DIR = PROJECT_DIR / "figures"
# pdfs/ is a legacy directory used by this batch importer; not in paths().
PDFS_DIR = PROJECT_DIR / "pdfs"


def extract_text_first_pages(pdf_path, max_pages=2):
    """Extract text from first pages of a PDF using PyMuPDF."""
    try:
        import fitz

        doc = fitz.open(str(pdf_path))
        text = ""
        for i in range(min(max_pages, len(doc))):
            text += doc[i].get_text()
        doc.close()
        return text
    except ImportError:
        print("  [warn] PyMuPDF not installed. Trying pdftotext...")
        try:
            result = subprocess.run(
                ["pdftotext", "-l", str(max_pages), str(pdf_path), "-"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return result.stdout
        except Exception:
            return ""


def find_arxiv_id(text):
    """Try to extract arXiv ID from text."""
    patterns = [
        r"arXiv[:\s]*(\d{4}\.\d{4,5})",
        r"arxiv\.org/abs/(\d{4}\.\d{4,5})",
        r"(\d{4}\.\d{4,5})v\d",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def find_doi(text):
    """Try to extract DOI from text."""
    m = re.search(r"(10\.\d{4,}/[^\s,;]+)", text)
    if m:
        doi = m.group(1).rstrip(".")
        return doi
    return None


def find_title(text):
    """Heuristic: first long line is often the title."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    for line in lines[:10]:
        # Skip lines that look like headers/metadata
        if any(kw in line.lower() for kw in ["arxiv", "doi:", "journal", "volume", "published"]):
            continue
        if len(line) > 20 and not line.startswith("http"):
            return line
    return None


def process_pdf(pdf_path, dry_run=False):
    """Process a single PDF from the inbox."""
    fname = pdf_path.name
    print(f"\nProcessing: {fname}")

    text = extract_text_first_pages(pdf_path)
    if not text:
        print(f"  [skip] Could not extract text from {fname}")
        return None

    arxiv_id = find_arxiv_id(text)
    doi = find_doi(text)
    title = find_title(text)

    paper_id = arxiv_id or (doi.replace("/", "_") if doi else fname.replace(".pdf", ""))

    info = {
        "source_file": fname,
        "paper_id": paper_id,
        "arxiv_id": arxiv_id,
        "doi": doi,
        "title_guess": title,
        "figures_extracted": False,
    }

    print(f"  ID: {paper_id}")
    if arxiv_id:
        print(f"  arXiv: {arxiv_id}")
    if doi:
        print(f"  DOI: {doi}")
    if title:
        print(f"  Title (guess): {title[:80]}")

    if not dry_run:
        # Move PDF to pdfs/ folder
        safe_id = re.sub(r"[^a-zA-Z0-9._-]", "_", paper_id)
        dest = PDFS_DIR / f"{safe_id}.pdf"
        shutil.copy2(str(pdf_path), str(dest))
        print(f"  Copied to: {dest.relative_to(PROJECT_DIR)}")

        # Run figure extraction
        extract_script = SCRIPT_DIR / "extract_figures.py"
        if extract_script.exists():
            fig_out = FIGURES_DIR / safe_id
            try:
                result = subprocess.run(
                    [sys.executable, str(extract_script), str(dest), str(fig_out)],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode == 0 and fig_out.exists():
                    captions_file = fig_out / "captions.json"
                    if captions_file.exists():
                        info["figures_extracted"] = True
                        info["figures_dir"] = str(fig_out.relative_to(PROJECT_DIR))
                        print(f"  Figures extracted to: {fig_out.relative_to(PROJECT_DIR)}")
                else:
                    print(f"  [warn] Figure extraction failed: {result.stderr[:200]}")
            except Exception as e:
                print(f"  [warn] Figure extraction error: {e}")

        # Remove from inbox
        pdf_path.unlink()
        print("  Removed from inbox.")

    return info


def main():
    dry_run = "--dry-run" in sys.argv

    if not INBOX_DIR.exists():
        print(f"Inbox directory not found: {INBOX_DIR}")
        print("Create it and drop PDFs there.")
        return

    pdfs = sorted(INBOX_DIR.glob("*.pdf"))
    if not pdfs:
        print("No PDFs found in inbox/")
        print(f"Drop PDFs into: {INBOX_DIR}")
        return

    print(f"Found {len(pdfs)} PDF(s) in inbox/")
    if dry_run:
        print("(DRY RUN — no files will be moved)\n")

    PDFS_DIR.mkdir(exist_ok=True)
    FIGURES_DIR.mkdir(exist_ok=True)

    results = []
    for pdf in pdfs:
        info = process_pdf(pdf, dry_run=dry_run)
        if info:
            results.append(info)

    # Write manifest
    if results and not dry_run:
        manifest_path = PROJECT_DIR / "inbox_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nManifest written to: {manifest_path.name}")
        print("Share this file with Claude to add papers to the database.")
    elif results:
        print("\n--- DRY RUN SUMMARY ---")
        print(json.dumps(results, indent=2))

    print(f"\nDone! Processed {len(results)} paper(s).")


if __name__ == "__main__":
    main()

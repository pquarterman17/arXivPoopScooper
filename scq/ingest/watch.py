#!/usr/bin/env python3
"""
Watch a folder for new .bib/.ris/.json files and auto-import into the SCQ database.

Usage:
  python tools/watch_imports.py                          # watch default inbox/ folder
  python tools/watch_imports.py /path/to/zotero/exports  # watch a custom folder
  python tools/watch_imports.py --once                    # process existing files once, don't watch
  python tools/watch_imports.py /path --once              # process folder once

Supported formats:
  .bib    — BibTeX (from Zotero, Mendeley, Google Scholar)
  .json   — Bookmarklet captures or arXiv digest exports
  .ris    — RIS format (from many reference managers)
"""

import json
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────

# This module lives at scq/ingest/watch.py; PROJECT_DIR is two levels up.
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parents[1]
try:
    from scq.config.paths import paths as _scq_paths  # type: ignore[import-not-found]
    DEFAULT_WATCH_DIR = Path(_scq_paths().inbox_dir)
except Exception:
    DEFAULT_WATCH_DIR = PROJECT_DIR / "inbox"
PROCESSED_DIR = DEFAULT_WATCH_DIR / "processed"
SUPPORTED_EXTENSIONS = {".bib", ".ris", ".json"}

# ─── Simple BibTeX parser (no external dependencies) ─────────────

class SimpleBibTeXParser:
    """Minimal BibTeX parser that extracts key fields without bibtexparser."""

    @staticmethod
    def parse_file(filepath):
        """Parse .bib file and return list of entry dicts."""
        with open(filepath, encoding='utf-8', errors='replace') as f:
            content = f.read()

        entries = []
        # Find all @<type>{<key>, ... } blocks
        pattern = r'@(\w+)\s*\{\s*([^,]+?),\s*(.*?)\n\s*\}'
        for match in re.finditer(pattern, content, re.DOTALL | re.IGNORECASE):
            entry_type = match.group(1).lower()
            entry_key = match.group(2).strip()
            fields_text = match.group(3)

            # Parse fields: key = {value} or key = "value" or key = value
            fields = {}
            field_pattern = r'(\w+)\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|([^,}]*))'
            for field_match in re.finditer(field_pattern, fields_text):
                field_name = field_match.group(1).lower()
                field_value = (field_match.group(2) or
                               field_match.group(3) or
                               field_match.group(4)).strip()
                fields[field_name] = field_value

            entries.append({
                'type': entry_type,
                'key': entry_key,
                'fields': fields
            })

        return entries

    @staticmethod
    def clean_text(text):
        """Remove LaTeX markup from text."""
        if not text:
            return ""
        # Remove braces
        text = re.sub(r'[{}]', '', text)
        # Common LaTeX commands
        text = re.sub(r'\\textendash\b', '–', text)
        text = re.sub(r'\\textemdash\b', '—', text)
        text = re.sub(r'\\&', '&', text)
        text = re.sub(r'~', ' ', text)
        # Strip remaining commands
        text = re.sub(r'\\[a-zA-Z]+\s*', '', text)
        return text.strip()


# ─── RIS parser ───────────────────────────────────────────────────

class RISParser:
    """Simple RIS format parser."""

    @staticmethod
    def parse_file(filepath):
        """Parse .ris file and return list of entry dicts."""
        entries = []
        with open(filepath, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()

        current_entry = {}
        for line in lines:
            line = line.rstrip('\n\r')
            if not line or not line.startswith('TY'):
                continue

            if line.startswith('TY') and current_entry:
                entries.append(current_entry)
                current_entry = {}

            if line.startswith('TY  '):
                current_entry['type'] = line[6:]
            elif line.startswith('TI  '):
                current_entry['title'] = line[6:]
            elif line.startswith('AU  '):
                if 'authors' not in current_entry:
                    current_entry['authors'] = []
                current_entry['authors'].append(line[6:])
            elif line.startswith('PY  '):
                current_entry['year'] = line[6:]
            elif line.startswith('DO  '):
                current_entry['doi'] = line[6:]
            elif line.startswith('UR  '):
                current_entry['url'] = line[6:]
            elif line.startswith('AB  '):
                current_entry['abstract'] = line[6:]

        if current_entry:
            entries.append(current_entry)

        return entries


# ─── Import handlers ──────────────────────────────────────────────

def extract_arxiv_id(text):
    """Extract arXiv ID from text (e.g., from url, note, or eprint field)."""
    if not text:
        return None
    match = re.search(r'(\d{4}\.\d{4,5})', text)
    return match.group(1) if match else None


def process_bib_file(filepath):
    """Process a .bib file and return import records."""
    records = []
    try:
        parser = SimpleBibTeXParser()
        entries = parser.parse_file(filepath)

        for entry in entries:
            fields = entry['fields']
            arxiv_id = None
            doi = fields.get('doi', '')

            # Try to find arXiv ID
            for field_name in ['eprint', 'arxivid', 'note', 'url']:
                if field_name in fields:
                    arxiv_id = extract_arxiv_id(fields[field_name])
                    if arxiv_id:
                        break

            # Build record
            record = {
                'type': entry['type'],
                'bibkey': entry['key'],
                'title': parser.clean_text(fields.get('title', 'Untitled')),
                'authors': parser.clean_text(fields.get('author', '')).split(' and '),
                'year': fields.get('year', ''),
                'doi': doi,
                'arxivId': arxiv_id,
                'journal': parser.clean_text(fields.get('journal', '')),
                'source': 'bibtex',
                'raw': entry
            }
            records.append(record)

        print(f"  Parsed {len(records)} entries from {filepath.name}")
        return records

    except Exception as e:
        print(f"  ERROR parsing {filepath.name}: {e}")
        return []


def process_json_file(filepath):
    """Process a .json file (bookmarklet capture or other JSON metadata)."""
    records = []
    try:
        with open(filepath, encoding='utf-8') as f:
            data = json.load(f)

        # Handle single object or array of objects
        entries = [data] if isinstance(data, dict) else data
        if not isinstance(entries, list):
            entries = [entries]

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            record = {
                'type': 'json',
                'title': entry.get('title', 'Untitled'),
                'authors': entry.get('authors', []),
                'abstract': entry.get('abstract', ''),
                'url': entry.get('url', ''),
                'doi': entry.get('doi'),
                'arxivId': entry.get('arxivId'),
                'source': entry.get('source', 'unknown'),
                'raw': entry
            }
            records.append(record)

        print(f"  Parsed {len(records)} entries from {filepath.name}")
        return records

    except Exception as e:
        print(f"  ERROR parsing {filepath.name}: {e}")
        return []


def process_ris_file(filepath):
    """Process a .ris file."""
    records = []
    try:
        parser = RISParser()
        entries = parser.parse_file(filepath)

        for entry in entries:
            authors = entry.get('authors', [])
            arxiv_id = extract_arxiv_id(entry.get('url', '') or
                                       entry.get('doi', ''))

            record = {
                'type': 'ris',
                'title': entry.get('title', 'Untitled'),
                'authors': authors,
                'year': entry.get('year', ''),
                'doi': entry.get('doi'),
                'arxivId': arxiv_id,
                'abstract': entry.get('abstract', ''),
                'url': entry.get('url'),
                'source': 'ris',
                'raw': entry
            }
            records.append(record)

        print(f"  Parsed {len(records)} entries from {filepath.name}")
        return records

    except Exception as e:
        print(f"  ERROR parsing {filepath.name}: {e}")
        return []


def process_file(filepath):
    """Process a single file and return import records."""
    ext = filepath.suffix.lower()

    if ext == '.bib':
        return process_bib_file(filepath)
    elif ext == '.json':
        return process_json_file(filepath)
    elif ext == '.ris':
        return process_ris_file(filepath)
    else:
        return []


def move_to_processed(filepath):
    """Move processed file to processed/ subdirectory."""
    try:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_name = f"{filepath.stem}_{timestamp}{filepath.suffix}"
        dest_path = PROCESSED_DIR / dest_name
        shutil.move(str(filepath), str(dest_path))
        return True
    except Exception as e:
        print(f"  WARNING: Could not move {filepath.name}: {e}")
        return False


def summarize_record(record):
    """Return a one-line summary of a record for logging."""
    title = record.get('title', 'Untitled')[:50]
    arxiv = f"arXiv:{record.get('arxivId')}" if record.get('arxivId') else ""
    doi = f"DOI:{record.get('doi')}" if record.get('doi') else ""
    return f"{title} {arxiv} {doi}".strip()


def process_directory(watch_dir, once=False):
    """Process all eligible files in a directory."""
    watch_dir = Path(watch_dir)
    if not watch_dir.exists():
        print(f"Directory does not exist: {watch_dir}")
        return

    processed_files = set()

    while True:
        # Find new files
        new_files = []
        for ext in SUPPORTED_EXTENSIONS:
            for filepath in watch_dir.glob(f'*{ext}'):
                if filepath.is_file() and filepath.name not in processed_files:
                    new_files.append(filepath)

        if new_files:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Found {len(new_files)} new file(s)")
            for filepath in new_files:
                print(f"\nProcessing: {filepath.name}")
                records = process_file(filepath)

                if records:
                    # Print summary
                    for record in records:
                        print(f"    ✓ {summarize_record(record)}")

                    # Move to processed
                    if move_to_processed(filepath):
                        print("  → Moved to processed/")

                    # TODO: Here's where the actual database import would happen.
                    # For now, we just queue the data.
                    # In a full implementation, you'd:
                    #   1. For arXiv: call process_paper.py with the ID
                    #   2. For DOI: look up via CrossRef API
                    #   3. For JSON: directly insert into database

                processed_files.add(filepath.name)

        if once:
            break

        # Poll every 5 seconds
        try:
            time.sleep(5)
        except KeyboardInterrupt:
            print("\nStopped.")
            break


def main():
    watch_dir = DEFAULT_WATCH_DIR
    once = False

    # Parse arguments
    for arg in sys.argv[1:]:
        if arg == '--once':
            once = True
        elif not arg.startswith('-'):
            watch_dir = arg

    watch_dir = Path(watch_dir)

    print("SCQ Paper Database — Folder Watcher")
    print(f"Watching: {watch_dir}")
    if once:
        print("Mode: Process once, then exit")
    else:
        print("Mode: Watch and auto-process (Ctrl+C to stop)")
    print()

    process_directory(watch_dir, once=once)


if __name__ == "__main__":
    main()

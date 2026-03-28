#!/usr/bin/env python3
"""
Import a Mendeley .bib export into the SCQ paper database.

Usage (called by Claude during import workflow):
    python3 import_mendeley.py library.bib [--dry-run]

Parses the .bib file, extracts all entries, and outputs JSON
that Claude uses to rebuild the database HTML files.
Handles Mendeley's .bib quirks: curly-brace title protection,
month abbreviations, mendeley-specific fields, etc.
"""

import sys, json, re, os

try:
    import bibtexparser
    from bibtexparser.bparser import BibTexParser
    from bibtexparser.customization import convert_to_unicode
except ImportError:
    print("ERROR: bibtexparser not installed. Run: pip install bibtexparser --break-system-packages")
    sys.exit(1)


def clean_latex(text):
    """Strip LaTeX markup that Mendeley leaves in .bib exports."""
    if not text:
        return ""
    text = re.sub(r'[{}]', '', text)              # remove braces
    text = re.sub(r'\\textendash\b', '\u2013', text)
    text = re.sub(r'\\textemdash\b', '\u2014', text)
    text = re.sub(r'\\&', '&', text)
    text = re.sub(r'~', ' ', text)
    text = re.sub(r'\\[a-zA-Z]+\s*', '', text)    # strip remaining commands
    return text.strip()


def abbreviate_name(full_name):
    """Convert 'LastName, FirstName M.' -> 'F. M. LastName'."""
    full_name = clean_latex(full_name.strip())
    if ',' in full_name:
        parts = full_name.split(',', 1)
        last = parts[0].strip()
        firsts = parts[1].strip().split()
        initials = ' '.join(f[0] + '.' for f in firsts if f)
        return f"{initials} {last}"
    return full_name


def parse_authors(author_str):
    """Parse BibTeX author string into list of abbreviated names."""
    author_str = clean_latex(author_str)
    authors = re.split(r'\s+and\s+', author_str)
    return [abbreviate_name(a) for a in authors if a.strip()]


def extract_arxiv_id(entry):
    """Try to find an arXiv ID from various Mendeley .bib fields."""
    for field in ['eprint', 'arxivid', 'note', 'doi', 'url']:
        val = entry.get(field, '')
        m = re.search(r'(\d{4}\.\d{4,5})', val)
        if m:
            return m.group(1)
    return None


def entry_to_record(entry):
    """Convert a bibtexparser entry dict to our database record format."""
    authors_abbr = parse_authors(entry.get('author', ''))
    authors_full = ', '.join(authors_abbr)
    first_last = authors_abbr[0].split()[-1] if authors_abbr else 'Unknown'
    short = f"{first_last} et al." if len(authors_abbr) > 1 else first_last

    arxiv_id = extract_arxiv_id(entry)
    year_str = entry.get('year', '')
    year = int(year_str) if year_str.isdigit() else 0

    title = clean_latex(entry.get('title', 'Untitled'))
    journal = clean_latex(entry.get('journal', entry.get('booktitle', '')))
    doi = entry.get('doi', '')

    # Build plain-text citation (Physical Review style)
    cite_txt = f"{authors_full}, {title}"
    if journal:
        cite_txt += f", {journal}"
    if arxiv_id:
        cite_txt += f", arXiv:{arxiv_id}"
    cite_txt += f" ({year})." if year else "."

    # Keep original .bib entry
    cite_bib = entry.get('raw', '')  # we'll reconstruct below if needed

    return {
        'bibkey': entry.get('ID', ''),
        'id': arxiv_id or entry.get('ID', ''),
        'title': title,
        'authors': authors_full,
        'shortAuthors': short,
        'year': year,
        'journal': journal,
        'doi': doi,
        'tags': [],  # Claude will auto-tag from title/abstract
        'summary': '',  # Claude will generate
        'citeTxt': cite_txt,
        'citeBib': '',  # filled below
    }


def reconstruct_bib(entry):
    """Rebuild a clean @article{} entry from parsed fields."""
    etype = entry.get('ENTRYTYPE', 'article')
    key = entry.get('ID', 'unknown')
    fields = []
    for k in ['title', 'author', 'journal', 'year', 'volume', 'number',
              'pages', 'doi', 'eprint', 'note', 'publisher']:
        if k in entry and entry[k].strip():
            val = clean_latex(entry[k]) if k != 'author' else entry[k]
            fields.append(f"  {k} = {{{val}}}")
    return f"@{etype}{{{key},\n" + ",\n".join(fields) + "\n}"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_mendeley.py <file.bib> [--dry-run]")
        sys.exit(1)

    bib_path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    if not os.path.exists(bib_path):
        print(f"ERROR: File not found: {bib_path}")
        sys.exit(1)

    # Parse with Mendeley-friendly settings
    parser = BibTexParser(common_strings=True)
    parser.customization = convert_to_unicode

    with open(bib_path, 'r', encoding='utf-8', errors='replace') as f:
        bib_db = bibtexparser.load(f, parser=parser)

    records = []
    for entry in bib_db.entries:
        rec = entry_to_record(entry)
        rec['citeBib'] = reconstruct_bib(entry)
        records.append(rec)

    # Sort by year descending
    records.sort(key=lambda r: r['year'], reverse=True)

    output = {
        'count': len(records),
        'papers': records,
        'source': os.path.basename(bib_path),
    }

    if dry_run:
        print(f"Found {len(records)} entries in {bib_path}")
        print(f"\nFirst 5 entries:")
        for r in records[:5]:
            print(f"  [{r['year']}] {r['shortAuthors']} — {r['title'][:70]}...")
        print(f"\nRun without --dry-run to output full JSON.")
    else:
        print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()

---
name: db-maintenance
description: "Perform maintenance operations on the SCQ paper database — delete papers, update tags, edit notes, fix citations, re-tag, merge duplicates, export subsets, or inspect database contents. Use this skill whenever the user asks to 'delete a paper', 'remove', 'change tags', 'edit tags', 'retag', 'add a note', 'edit note', 'fix citation', 'how many papers', 'list papers', 'show me what is in the database', 'export', 'clean up', 'merge', or any other direct database manipulation that is not adding a new paper or enriching an existing one."
---

# SCQ Database Maintenance

This skill covers all direct database operations not handled by add-paper (ingestion) or enrich-paper (summary/results). The database is a SQLite file encoded as base64 in `scq_data.js`.

## Connecting to the Database

Every operation follows: decode → modify → re-encode. Use this helper pattern:

```python
import sqlite3, re, base64, json, os, glob
from datetime import datetime

# Find project root dynamically (works across sessions)
matches = glob.glob("/sessions/*/mnt/*/scq_data.js")
DB_JS = matches[0] if matches else None
PROJECT_ROOT = os.path.dirname(DB_JS)
TMP_DB = "/tmp/.scq_tmp.db"

def open_db():
    with open(DB_JS) as f:
        content = f.read()
    match = re.search(r'const SCQ_DB_BASE64 = "([^"]+)"', content)
    db_bytes = base64.b64decode(match.group(1))
    with open(TMP_DB, 'wb') as f:
        f.write(db_bytes)
    conn = sqlite3.connect(TMP_DB)
    conn.row_factory = sqlite3.Row
    return conn

def save_db(conn):
    conn.commit()
    conn.close()
    with open(TMP_DB, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    with open(DB_JS, 'w') as f:
        f.write('// Auto-generated database bootstrap\n')
        f.write(f'const SCQ_DB_BASE64 = "{b64}";\n')
```

## Common Operations

### List / Search Papers
```sql
-- All papers
SELECT id, title, short_authors, year, tags, group_name FROM papers ORDER BY date_added DESC;

-- Full-text search
SELECT p.id, p.title, p.short_authors FROM papers p
JOIN papers_fts fts ON p.id = fts.rowid
WHERE papers_fts MATCH 'transmon coherence';

-- Papers by tag
SELECT id, title FROM papers WHERE tags LIKE '%"coherence"%';

-- Papers missing enrichment
SELECT id, title FROM papers WHERE key_results IS NULL OR key_results = '[]';
```

### Delete a Paper
Deletion touches multiple tables. Always confirm with the user first.

```python
paper_id = "2401.12345"
conn.execute("DELETE FROM papers WHERE id = ?", (paper_id,))
conn.execute("DELETE FROM figures WHERE paper_id = ?", (paper_id,))
conn.execute("DELETE FROM notes WHERE paper_id = ?", (paper_id,))
conn.execute("DELETE FROM read_status WHERE paper_id = ?", (paper_id,))
conn.execute("DELETE FROM collections WHERE paper_id = ?", (paper_id,))
```

Also consider removing the citation from `references.bib` and `references.txt`, and optionally the PDF from `papers/` and figures from `figures/<arxiv_id>/`.

### Update Tags
Tags are a JSON array in the `tags` column.

```python
row = conn.execute("SELECT tags FROM papers WHERE id = ?", (paper_id,)).fetchone()
tags = json.loads(row["tags"]) if row["tags"] else []
tags.append("materials")  # add
tags = [t for t in tags if t != "old-tag"]  # remove
conn.execute("UPDATE papers SET tags = ? WHERE id = ?", (json.dumps(tags), paper_id))
```

### Add / Edit Notes
```python
note_content = "Interesting approach to TLS mitigation. Follow up with group."
now = datetime.now().isoformat()
conn.execute("""
    INSERT INTO notes (paper_id, content, last_edited) VALUES (?, ?, ?)
    ON CONFLICT(paper_id) DO UPDATE SET content = ?, last_edited = ?
""", (paper_id, note_content, now, note_content, now))
```

### Update Read Status / Priority
```python
conn.execute("""
    INSERT INTO read_status (paper_id, is_read, priority) VALUES (?, 1, 3)
    ON CONFLICT(paper_id) DO UPDATE SET is_read = 1, priority = 3
""", (paper_id,))
```

### Manage Collections
```python
# Add to collection
conn.execute("INSERT OR IGNORE INTO collections (name, paper_id) VALUES (?, ?)",
             ("T1-coherence-survey", paper_id))

# List papers in a collection
rows = conn.execute("""
    SELECT p.id, p.title FROM papers p
    JOIN collections c ON p.id = c.paper_id WHERE c.name = ?
""", ("T1-coherence-survey",)).fetchall()

# Remove from collection
conn.execute("DELETE FROM collections WHERE name = ? AND paper_id = ?",
             ("T1-coherence-survey", paper_id))
```

### Fix / Regenerate Citations
After updating citations in the DB, also update `references.bib` and `references.txt` at the project root to stay in sync.

### Database Statistics
```python
paper_count = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
tagged = conn.execute("SELECT COUNT(*) FROM papers WHERE tags != '[]'").fetchone()[0]
enriched = conn.execute("SELECT COUNT(*) FROM papers WHERE key_results IS NOT NULL AND key_results != '[]'").fetchone()[0]
with_notes = conn.execute("SELECT COUNT(DISTINCT paper_id) FROM notes").fetchone()[0]
print(f"Papers: {paper_count}, Tagged: {tagged}, Enriched: {enriched}, With notes: {with_notes}")
```

## Important Reminders

- Always call `save_db(conn)` after changes — this re-encodes and writes `scq_data.js`
- `scq_data.js` is the canonical data source. If it doesn't get updated, changes are lost.
- Confirm destructive operations (delete, bulk retag) with the user before executing

#!/usr/bin/env python3
"""Compatibility shim — extract_figures lives at ``scq.ingest.extract`` now (plan #12).

Existing callers (`python tools/extract_figures.py ...`) keep working
unchanged; new code should use ``python -m scq.ingest.extract`` or the
``scq process`` CLI.
"""
import os
import sys

# Make the repo root importable so the scq package resolves when this file
# is invoked directly (e.g. `python tools/extract_figures.py`).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.ingest.extract import main  # noqa: E402

if __name__ == "__main__":
    main()

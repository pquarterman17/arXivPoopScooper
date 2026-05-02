#!/usr/bin/env python3
"""Compatibility shim — process_paper lives at ``scq.ingest.process`` now (plan #12).

Existing callers (``python tools/process_paper.py <id>``) keep working
unchanged; new code should use ``python -m scq.ingest.process`` or the
``scq process`` CLI.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.ingest.process import main  # noqa: E402

if __name__ == "__main__":
    main()

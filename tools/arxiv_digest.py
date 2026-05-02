#!/usr/bin/env python3
"""Compatibility shim — arxiv_digest lives at ``scq.arxiv.digest`` now (plan #13).

Existing callers (``python tools/arxiv_digest.py [--days N] [...]``,
including the GitHub Actions workflow) keep working unchanged; new code
should use ``python -m scq.arxiv.digest`` or the ``scq digest`` CLI.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.arxiv.digest import main  # noqa: E402

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Compatibility shim — moved to scq.search.index (plan #12 wave 2).

Existing callers (`python tools/build_search_index.py [...]`) keep working unchanged;
new code should use `python -m scq.search.index` or the `scq` CLI.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.search.index import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())

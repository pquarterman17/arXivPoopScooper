#!/usr/bin/env python3
"""Compatibility shim — merge_database lives at ``scq.db.merge`` now (plan #12).

Existing callers (``python tools/merge_database.py merge src.db dst.db``) keep
working unchanged; new code should use ``python -m scq.db.merge`` or the
``scq merge`` CLI.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.db.merge import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())

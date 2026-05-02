#!/usr/bin/env python3
"""Compatibility shim — init_database lives at ``scq.db.init`` now (plan #12).

Existing callers (``python tools/init_database.py``) keep working unchanged;
new code should use ``python -m scq.db.init`` or the ``scq init-db`` CLI.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scq.db.init import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())

"""Entry point for ``python -m scq``.

The launchers (START.bat, start.bat, START.command) invoke
``python -m scq serve`` since that path works regardless of where scq is
installed (editable, pip install, frozen).
"""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())

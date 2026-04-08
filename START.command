#!/bin/bash
# Double-click this file in Finder to launch the SCQ paper database.
# macOS equivalent of START.bat.
cd "$(dirname "$0")"
exec python3 serve.py

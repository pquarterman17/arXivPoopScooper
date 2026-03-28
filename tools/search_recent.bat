@echo off
REM search_recent.bat — Wrapper to run search_recent.js via Node.js
REM Usage: search_recent.bat [--days N] [--max N]
REM Example: search_recent.bat --days 3 --max 50
"C:\Program Files\nodejs\node.exe" "%~dp0search_recent.js" %* 2>&1

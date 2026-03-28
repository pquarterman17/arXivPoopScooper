@echo off
REM fetch.bat — Wrapper to run fetch_arxiv.js via Node.js
REM Usage: fetch.bat <arxiv_id>
REM Example: fetch.bat 2603.17921
"C:\Program Files\nodejs\node.exe" "%~dp0fetch_arxiv.js" %* 2>&1

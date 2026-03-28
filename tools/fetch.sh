#!/bin/bash
# fetch.sh — Wrapper to run fetch_arxiv.js via Node.js (macOS/Linux)
# Usage: ./tools/fetch.sh <arxiv_id>
# Example: ./tools/fetch.sh 2603.17921
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/fetch_arxiv.js" "$@"

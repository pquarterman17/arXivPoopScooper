#!/usr/bin/env python3
"""
SCQ Paper Database — Local Server Launcher

Double-click this file or run from a terminal to:
  1. Start an HTTP server on localhost
  2. Open all app pages as browser tabs

Usage:
  python serve.py              Open everything (database + scraper)
  python serve.py database     Open just the database
  python serve.py scraper      Open just the scraper

Works on Windows, macOS, and Linux. No extra dependencies.
Press Ctrl+C (or close the terminal window) to stop.
"""

import http.server
import webbrowser
import os
import sys
import threading
import socket
import time
import urllib.request
import urllib.parse
import urllib.error
import json
from datetime import datetime

PORT = 8080

PAGES = {
    "database": "paper_database.html",
    "scraper":  "paper_scraper.html",
}

# ── Ensure we're running in a visible terminal ──────────────────────
# On Windows, double-clicking a .py file runs it without a console if
# Python was installed from the Microsoft Store, or if .py is associated
# with pythonw. Re-launch in a real console so the user can see output
# and hit Ctrl+C.

def _ensure_console():
    """On Windows, re-launch in a cmd.exe window if there's no console."""
    if sys.platform != "win32":
        return
    try:
        # If we already have a console, this succeeds silently
        import ctypes
        if ctypes.windll.kernel32.GetConsoleWindow() != 0:
            return
    except Exception:
        return

    # No console — relaunch in one
    import subprocess
    script = os.path.abspath(__file__)
    args = " ".join(f'"{a}"' for a in sys.argv[1:])
    cmd = f'start "SCQ Paper Database" /WAIT python "{script}" {args}'.strip()
    subprocess.Popen(cmd, shell=True)
    sys.exit(0)

_ensure_console()

# ── Server logic ────────────────────────────────────────────────────

# Serve from the directory this script lives in
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# File extensions that should never be cached (forces browser to always
# fetch fresh copies — no more Ctrl+Shift+R needed after edits).
NO_CACHE_EXTENSIONS = {".html", ".js", ".css", ".json"}


def find_open_port(start=8080, end=8099):
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def open_tabs(port, which):
    """Open requested pages as browser tabs with a small stagger."""
    time.sleep(0.5)  # let server bind first
    for i, key in enumerate(which):
        url = f"http://localhost:{port}/{PAGES[key]}"
        if i == 0:
            webbrowser.open(url)
        else:
            time.sleep(0.3)  # small gap so browser registers separate tabs
            webbrowser.open_new_tab(url)


# Determine which pages to open
arg = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
if arg in PAGES:
    to_open = [arg]
elif arg == "all":
    to_open = list(PAGES.keys())
else:
    print(f"Unknown page '{arg}'. Options: {', '.join(PAGES.keys())}, all")
    input("Press Enter to exit.")
    sys.exit(1)

port = find_open_port(PORT)

# ── arXiv Proxy Handler ────────────────────────────────────────────
# Proxies /api/arxiv?<query_string> → https://arxiv.org/api/query?<query_string>
# This avoids CORS issues and lets us set a proper User-Agent header.

ARXIV_API_BASE = "https://arxiv.org/api/query"
ARXIV_USER_AGENT = "SCQDatabase/1.0 (https://github.com; mailto:paige.e.quarterman@gmail.com)"

class SCQHandler(http.server.SimpleHTTPRequestHandler):
    """Serves static files + proxies arXiv API requests."""

    def log_message(self, format, *args):
        # Only log proxy requests, suppress static file noise
        if args and isinstance(args[0], str) and "/api/arxiv" in args[0]:
            print(f"  [proxy] {args[0]}")

    def end_headers(self):
        """Inject no-cache headers for HTML/JS/CSS/JSON files so the
        browser always fetches fresh copies after edits."""
        path = urllib.parse.urlparse(self.path).path
        ext = os.path.splitext(path)[1].lower()
        if ext in NO_CACHE_EXTENSIONS:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/arxiv"):
            self._proxy_arxiv()
        elif self.path.startswith("/api/crossref/search"):
            self._proxy_crossref_search()
        elif self.path.startswith("/api/crossref/"):
            self._proxy_crossref()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/bookmarklet":
            self._handle_bookmarklet()
        elif self.path == "/api/upload-pdf":
            self._handle_pdf_upload()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _proxy_arxiv(self):
        """Forward request to arXiv API with proper headers."""
        # Extract query string: /api/arxiv?search_query=... → search_query=...
        parts = urllib.parse.urlparse(self.path)
        qs = parts.query
        if not qs:
            self.send_error(400, "Missing query parameters")
            return

        target = f"{ARXIV_API_BASE}?{qs}"
        req = urllib.request.Request(target, headers={
            "User-Agent": ARXIV_USER_AGENT,
            "Accept": "application/xml, text/xml, */*",
        })

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                # Forward content type; add CORS for good measure
                ct = resp.headers.get("Content-Type", "application/xml")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self.send_response(e.code)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            msg = f"arXiv API returned {e.code}: {e.reason}"
            if e.code == 429:
                msg += "\nRate limited — wait a moment and try again."
            self.wfile.write(msg.encode())
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def _proxy_crossref(self):
        """Forward request to CrossRef API with proper headers.
        Path format: /api/crossref/10.1103/PhysRevLett.130.267001
        """
        # Extract DOI from path: /api/crossref/<doi>
        parts = urllib.parse.urlparse(self.path)
        # Remove /api/crossref/ prefix to get the DOI
        doi = parts.path.replace("/api/crossref/", "", 1)

        if not doi:
            self.send_error(400, "Missing DOI")
            return

        target = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        req = urllib.request.Request(target, headers={
            "User-Agent": "SCQDatabase/1.0 (https://github.com; mailto:paige.e.quarterman@gmail.com)",
            "Accept": "application/json",
        })

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                ct = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error_msg = f'{{"error": "CrossRef API returned {e.code}: {e.reason}"}}'
            self.wfile.write(error_msg.encode())
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error_msg = f'{{"error": "Proxy error: {e}"}}'
            self.wfile.write(error_msg.encode())

    def _proxy_crossref_search(self):
        """Forward keyword search to CrossRef API.
        Path format: /api/crossref/search?query=...&filter=...&rows=...&sort=...&order=...
        Maps to: https://api.crossref.org/works?query=...&filter=...&rows=...&sort=...&order=...
        """
        parts = urllib.parse.urlparse(self.path)
        qs = parts.query
        if not qs:
            self.send_error(400, "Missing query parameters")
            return

        target = f"https://api.crossref.org/works?{qs}"
        req = urllib.request.Request(target, headers={
            "User-Agent": "SCQDatabase/1.0 (https://github.com; mailto:paige.e.quarterman@gmail.com)",
            "Accept": "application/json",
        })

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                ct = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error_msg = f'{{"error": "CrossRef search returned {e.code}: {e.reason}"}}'
            self.wfile.write(error_msg.encode())
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error_msg = f'{{"error": "Proxy error: {e}"}}'
            self.wfile.write(error_msg.encode())

    def _handle_bookmarklet(self):
        """Handle bookmarklet POST requests.

        Receives JSON payload with paper metadata:
          {url, title, arxivId, doi, authors, abstract, source}

        Saves to inbox/bookmarklet_<timestamp>.json for later import.
        """
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 1048576:  # 1 MB limit
                self.send_response(413)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "Payload too large"}')
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode('utf-8'))

            # Create inbox directory if needed
            inbox_dir = os.path.join(os.path.dirname(__file__), "inbox")
            os.makedirs(inbox_dir, exist_ok=True)

            # Save to timestamped JSON file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"bookmarklet_{timestamp}.json"
            filepath = os.path.join(inbox_dir, filename)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)

            # Success response
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = {
                "status": "ok",
                "message": "Paper queued for import",
                "file": filename
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid JSON"}')
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error = {"error": f"Server error: {str(e)}"}
            self.wfile.write(json.dumps(error).encode('utf-8'))

    def _handle_pdf_upload(self):
        """Handle PDF file uploads via drag-and-drop or file picker.

        Expects multipart/form-data with a single file field named 'pdf'.
        Saves the PDF to papers/ directory and returns metadata.
        """
        import re
        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))

            # Sanity check: reject oversized files (>100 MB)
            if content_length > 104857600:
                self.send_response(413)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "File too large (max 100 MB)"}')
                return

            # Parse multipart/form-data
            if "multipart/form-data" not in content_type:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "Expected multipart/form-data"}')
                return

            # Extract boundary from Content-Type header
            boundary_match = re.search(r'boundary=([^;\s]+)', content_type)
            if not boundary_match:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "Missing boundary in Content-Type"}')
                return

            boundary = boundary_match.group(1).strip('"')
            body = self.rfile.read(content_length)

            # Parse the multipart body
            parts = body.split(f'--{boundary}'.encode())
            pdf_data = None
            original_filename = "document"

            for part in parts:
                if b'Content-Disposition' not in part:
                    continue

                # Extract filename if present
                filename_match = re.search(rb'filename="([^"]+)"', part)
                if filename_match:
                    original_filename = filename_match.group(1).decode('utf-8', errors='replace')
                    # Extract just the filename without path
                    original_filename = os.path.basename(original_filename)

                # Content after the headers (separated by blank line)
                if b'\r\n\r\n' in part:
                    content_start = part.index(b'\r\n\r\n') + 4
                    content_end = part.rfind(b'\r\n')
                    pdf_data = part[content_start:content_end] if content_end > content_start else part[content_start:]
                elif b'\n\n' in part:
                    content_start = part.index(b'\n\n') + 2
                    content_end = part.rfind(b'\n')
                    pdf_data = part[content_start:content_end] if content_end > content_start else part[content_start:]

                if pdf_data:
                    break

            if not pdf_data:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "No file data found"}')
                return

            # Sanitize filename
            safe_name = re.sub(r'[^a-zA-Z0-9._\- ]', '_', original_filename)
            if not safe_name.lower().endswith('.pdf'):
                safe_name += '.pdf'

            # Ensure papers directory exists
            papers_dir = os.path.join(os.path.dirname(__file__), "papers")
            os.makedirs(papers_dir, exist_ok=True)

            # Check for duplicate filename
            filepath = os.path.join(papers_dir, safe_name)
            counter = 1
            base_name, ext = os.path.splitext(safe_name)
            while os.path.exists(filepath):
                safe_name = f"{base_name}_{counter}{ext}"
                filepath = os.path.join(papers_dir, safe_name)
                counter += 1

            # Save the PDF
            with open(filepath, 'wb') as f:
                f.write(pdf_data)

            # Create metadata entry in inbox
            inbox_dir = os.path.join(os.path.dirname(__file__), "inbox")
            os.makedirs(inbox_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S%f")[:-3]
            meta_filename = f"upload_{timestamp}.json"
            meta_filepath = os.path.join(inbox_dir, meta_filename)

            metadata = {
                "original_filename": original_filename,
                "saved_filename": safe_name,
                "pdf_path": os.path.join("papers", safe_name),
                "upload_time": datetime.now().isoformat(),
                "file_size": len(pdf_data),
                "status": "awaiting_processing"
            }

            with open(meta_filepath, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            # Success response
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = {
                "status": "ok",
                "filename": safe_name,
                "path": os.path.join("papers", safe_name),
                "size": len(pdf_data),
                "metadata_file": meta_filename
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error = {"error": f"Upload failed: {str(e)}"}
            self.wfile.write(json.dumps(error).encode('utf-8'))

server = http.server.HTTPServer(("127.0.0.1", port), SCQHandler)

base = f"http://localhost:{port}"
print(f"SCQ Paper Database — serving at {base}")
print()
for key in PAGES:
    marker = " *" if key in to_open else ""
    print(f"  {PAGES[key]:30s} {base}/{PAGES[key]}{marker}")
print()
print("  * = opening in browser")
print("  Close this window or Ctrl+C to stop.\n")

threading.Thread(target=open_tabs, args=(port, to_open), daemon=True).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.shutdown()
    print("Stopped.")

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

    def do_GET(self):
        if self.path.startswith("/api/arxiv"):
            self._proxy_arxiv()
        else:
            super().do_GET()

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

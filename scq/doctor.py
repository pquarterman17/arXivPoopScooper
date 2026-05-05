"""Health-check for the digest pipeline.

Checks every prerequisite the digest needs — secrets, configs, paths,
network, and GitHub Actions secrets — and prints a human-readable
pass/fail table, then exits 0 (all pass) or 1 (any fail).

Usage::

    scq doctor
"""

from __future__ import annotations

import socket
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass

# ─── result types ───

_PASS = "pass"
_FAIL = "fail"
_SKIP = "skip"

def _supports_unicode() -> bool:
    """Return True if stdout can encode the Unicode check/cross marks."""
    enc = getattr(sys.stdout, "encoding", None) or ""
    try:
        "✓✗".encode(enc)
        return True
    except (UnicodeEncodeError, LookupError):
        return False


_STATUS_SYMBOLS = {
    _PASS: "✓" if _supports_unicode() else "[OK]",
    _FAIL: "✗" if _supports_unicode() else "[!!]",
    _SKIP: "?",
}

# Try importing colorama for coloured output; degrade gracefully if absent.
try:
    import colorama  # type: ignore[import-untyped]
    colorama.init(autoreset=True)
    _GREEN = colorama.Fore.GREEN
    _RED = colorama.Fore.RED
    _YELLOW = colorama.Fore.YELLOW
    _RESET = colorama.Style.RESET_ALL
except ImportError:
    _GREEN = _RED = _YELLOW = _RESET = ""

_STATUS_COLORS = {
    _PASS: _GREEN,
    _FAIL: _RED,
    _SKIP: _YELLOW,
}


@dataclass
class CheckResult:
    name: str
    status: str   # _PASS | _FAIL | _SKIP
    detail: str   # shown after the dots


# ─── masking ───

def _mask(value: str | None, *, show: int = 8) -> str:
    """Return first *show* chars + *** for non-empty values, or '<empty>'."""
    if not value:
        return "<empty>"
    if len(value) <= show:
        return value[:3] + "***"
    return value[:show] + "***"


# ─── individual checks ───

def _check_python_version() -> CheckResult:
    vi = sys.version_info
    ver = f"{vi.major}.{vi.minor}.{vi.micro}"
    if vi >= (3, 10):
        return CheckResult("Python version", _PASS, ver)
    return CheckResult("Python version", _FAIL, f"{ver} (need >= 3.10)")


def _check_secret(name: str, display_name: str) -> CheckResult:
    from .config import secrets as _secrets
    try:
        value = _secrets.get(name)
    except Exception as exc:  # noqa: BLE001
        return CheckResult(display_name, _FAIL, f"error reading secret: {exc}")

    if value:
        # For email addresses, show a redacted form; for passwords, just ****
        if "@" in value:
            detail = _mask(value, show=8)
        else:
            detail = "****"
        return CheckResult(display_name, _PASS, detail)
    return CheckResult(display_name, _FAIL, "not set (keyring or env var)")


def _check_keyring_secret(name: str, display_name: str) -> CheckResult:
    """Check a secret, skipping if keyring is unavailable and env var unset."""
    import os

    from .config import secrets as _secrets

    env_val = os.environ.get(_secrets.env_var_name(name))
    if env_val:
        # Env var path — keyring not needed
        return _check_secret(name, display_name)

    if not _secrets.keyring_available():
        return CheckResult(display_name, _SKIP, "skipped (keyring not installed and env var not set)")

    return _check_secret(name, display_name)


def _check_digest_config() -> CheckResult:
    name = "config: digest.json"
    try:
        from .config import user as user_cfg
        result = user_cfg.load_config("digest")
    except FileNotFoundError as exc:
        return CheckResult(name, _FAIL, f"missing: {exc}")
    except ValueError as exc:
        return CheckResult(name, _FAIL, f"invalid JSON: {exc}")
    except Exception as exc:  # noqa: BLE001
        return CheckResult(name, _FAIL, str(exc))

    if result.errors:
        return CheckResult(name, _FAIL, f"{len(result.errors)} validation error(s): {result.errors[0]}")
    return CheckResult(name, _PASS, f"ok ({result.source})")


def _check_recipients() -> CheckResult:
    name = "config: recipients"
    try:
        from .arxiv.email import load_email_recipients
        recipients = load_email_recipients()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(name, _FAIL, f"error loading recipients: {exc}")

    if not recipients:
        return CheckResult(name, _FAIL, "no recipients configured")
    emails = ", ".join(r["email"] for r in recipients[:3])
    if len(recipients) > 3:
        emails += f", +{len(recipients) - 3} more"
    return CheckResult(name, _PASS, f"{len(recipients)} recipient(s): {emails}")


def _check_database_path() -> CheckResult:
    name = "paths: database"
    try:
        from .config.paths import paths as get_paths
        db = get_paths().db_path
    except Exception as exc:  # noqa: BLE001
        return CheckResult(name, _FAIL, f"path resolution error: {exc}")

    if db.is_file():
        size_kb = db.stat().st_size // 1024
        return CheckResult(name, _PASS, f"{db} ({size_kb} KB)")
    return CheckResult(name, _FAIL, f"not found: {db}")


def _check_digests_dir() -> CheckResult:
    name = "paths: digests dir"
    try:
        from .config.paths import paths as get_paths
        d = get_paths().digests_dir
    except Exception as exc:  # noqa: BLE001
        return CheckResult(name, _FAIL, f"path resolution error: {exc}")

    if d.is_dir():
        return CheckResult(name, _PASS, str(d))
    # Try to create it
    try:
        d.mkdir(parents=True, exist_ok=True)
        return CheckResult(name, _PASS, f"{d} (created)")
    except OSError as exc:
        return CheckResult(name, _FAIL, f"cannot create: {d} — {exc}")


# Required GitHub Actions secrets for the digest CI workflow
_GH_REQUIRED_SECRETS = ["SCQ_EMAIL_FROM", "SCQ_EMAIL_APP_PASSWORD", "SCQ_EMAIL_TO"]


def _check_github_secrets() -> CheckResult:
    name = "GitHub secrets"
    try:
        result = subprocess.run(
            ["gh", "secret", "list"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except FileNotFoundError:
        return CheckResult(name, _SKIP, "skipped (gh CLI not found)")
    except subprocess.TimeoutExpired:
        return CheckResult(name, _FAIL, "timed out running 'gh secret list'")
    except Exception as exc:  # noqa: BLE001
        return CheckResult(name, _FAIL, f"error: {exc}")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        return CheckResult(name, _SKIP, f"skipped (gh not authenticated: {stderr[:80]})")

    listed = result.stdout.upper()
    missing = [s for s in _GH_REQUIRED_SECRETS if s not in listed]
    if missing:
        return CheckResult(name, _FAIL, f"missing: {', '.join(missing)}")
    return CheckResult(name, _PASS, f"all {len(_GH_REQUIRED_SECRETS)} present")


def _check_smtp_connectivity() -> CheckResult:
    name = "SMTP connectivity"
    host, port = "smtp.gmail.com", 465
    try:
        with socket.create_connection((host, port), timeout=5):
            pass
        return CheckResult(name, _PASS, f"{host}:{port} reachable")
    except TimeoutError:
        return CheckResult(name, _FAIL, f"{host}:{port} timed out")
    except OSError as exc:
        return CheckResult(name, _FAIL, f"{host}:{port} unreachable — {exc}")


# ─── runner ───

_CHECKS: list[Callable[[], CheckResult]] = [
    _check_python_version,
    lambda: _check_keyring_secret("email_from", "keyring: email_from"),
    lambda: _check_keyring_secret("email_app_password", "keyring: email_app_password"),
    _check_digest_config,
    _check_recipients,
    _check_database_path,
    _check_digests_dir,
    _check_github_secrets,
    _check_smtp_connectivity,
]

_LINE_WIDTH = 50   # total width of the name + dots portion


def _format_line(result: CheckResult) -> str:
    symbol = _STATUS_SYMBOLS[result.status]
    color = _STATUS_COLORS[result.status]
    # Pad name + dots to a fixed column so details align
    label = f"{symbol} {result.name} "
    dots = "." * max(0, _LINE_WIDTH - len(label))
    return f"{color}{label}{dots}{_RESET} {result.detail}"


def run_doctor() -> int:
    """Run all health checks and print a summary table.

    Returns 0 if every check passed or was skipped, 1 if any failed.
    """
    dash = "—" if _supports_unicode() else "--"
    print(f"scq doctor {dash} digest pipeline health check\n")

    results: list[CheckResult] = []
    for check_fn in _CHECKS:
        r = check_fn()
        results.append(r)
        print(_format_line(r))

    passed = sum(1 for r in results if r.status == _PASS)
    failed = sum(1 for r in results if r.status == _FAIL)
    skipped = sum(1 for r in results if r.status == _SKIP)
    total = len(results)

    print()
    if failed == 0:
        status_color = _GREEN
        summary = f"{passed}/{total} checks passed"
        if skipped:
            summary += f" ({skipped} skipped)"
        summary += f" {dash} digest pipeline is healthy"
    else:
        status_color = _RED
        fail_sym = _STATUS_SYMBOLS[_FAIL]
        summary = f"{passed}/{total} checks passed {dash} {failed} issue(s) found (see {fail_sym} above)"
        if skipped:
            summary += f", {skipped} skipped"

    print(f"{status_color}{summary}{_RESET}")
    return 0 if failed == 0 else 1

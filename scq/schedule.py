"""Schedule management — rewrites the cron line in
``.github/workflows/arxiv_digest.yml`` from a high-level description.

Plan #13's optional helper. Cron edits are a once-a-year operation; this
just makes them less error-prone (especially the weekday-number ↔ name
mapping).

Public API::

    scq schedule show
    scq schedule update --cadence daily  --time 07:00
    scq schedule update --cadence weekly --day mon --time 07:00

Cadence values: ``daily`` and ``weekly``. ``manual`` (no automatic run)
is intentionally not supported — keep the cron line and disable the
workflow via the GH Actions UI if you really want manual-only.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from .config.paths import paths

# GH Actions cron uses standard 5-field cron with day-of-week 0=Sun..6=Sat.
_DOW_MAP = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
_DOW_NAMES = list(_DOW_MAP.keys())

# The cron line we rewrite. Matches `    - cron: '45 10 * * *'` (leading
# whitespace + `- cron:` + quoted expression). Group 1 is the cron string.
_CRON_LINE_RE = re.compile(
    r"""(?m)^(?P<indent>\s+)-\s+cron:\s*(['"])(?P<expr>[^'"]+)\2(?P<rest>.*)$"""
)


class ScheduleError(ValueError):
    """Raised on bad input (unknown cadence, bad time, etc.)."""


def compute_cron_line(cadence: str, time_utc: str, day: str | None = None) -> str:
    """Build a 5-field cron expression for the given cadence/day/time.

    ``time_utc`` is ``HH:MM`` 24-hour UTC. ``day`` is required when cadence
    is ``weekly``; ignored for ``daily``.
    """
    cadence = (cadence or "").lower().strip()
    if cadence not in ("daily", "weekly"):
        raise ScheduleError(f"cadence must be 'daily' or 'weekly', got {cadence!r}")
    m = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", time_utc or "")
    if not m:
        raise ScheduleError(f"time must be HH:MM 24-hour UTC, got {time_utc!r}")
    hour, minute = int(m.group(1)), int(m.group(2))
    if cadence == "daily":
        return f"{minute} {hour} * * *"
    if not day:
        raise ScheduleError("--day is required when cadence is 'weekly'")
    dow_key = day.lower().strip()
    if dow_key not in _DOW_MAP:
        raise ScheduleError(f"day must be one of {_DOW_NAMES}, got {day!r}")
    return f"{minute} {hour} * * {_DOW_MAP[dow_key]}"


def parse_cron_line(expr: str) -> dict:
    """Reverse of compute_cron_line for ``scq schedule show``.

    Best-effort: recognises the shapes this module produces (``MM HH * * *``
    and ``MM HH * * D``). Anything else is reported as ``cadence: 'custom'``
    so the user knows hand-editing happened.
    """
    parts = expr.strip().split()
    if len(parts) != 5:
        return {"cadence": "custom", "expr": expr.strip()}
    minute, hour, dom, mon, dow = parts
    if dom != "*" or mon != "*":
        return {"cadence": "custom", "expr": expr.strip()}
    if not (minute.isdigit() and hour.isdigit()):
        return {"cadence": "custom", "expr": expr.strip()}
    time_utc = f"{int(hour):02d}:{int(minute):02d}"
    if dow == "*":
        return {"cadence": "daily", "time_utc": time_utc, "expr": expr.strip()}
    if dow.isdigit() and 0 <= int(dow) <= 6:
        names = {v: k for k, v in _DOW_MAP.items()}
        return {"cadence": "weekly", "day": names[int(dow)], "time_utc": time_utc, "expr": expr.strip()}
    return {"cadence": "custom", "expr": expr.strip()}


def workflow_path() -> Path:
    """Resolve the digest workflow path relative to the repo root."""
    return paths().repo_root / ".github" / "workflows" / "arxiv_digest.yml"


def read_current(path: Path | None = None) -> dict:
    """Return ``{cadence, time_utc?, day?, expr}`` for the workflow's cron line.

    Adds ``multiple: true`` plus the full match list when the workflow has
    more than one cron line, so the caller can warn rather than reporting
    only the first match.
    """
    p = path or workflow_path()
    if not p.is_file():
        raise ScheduleError(f"workflow file not found: {p}")
    text = p.read_text(encoding="utf-8")
    matches = list(_CRON_LINE_RE.finditer(text))
    if not matches:
        raise ScheduleError(f"no cron: line found in {p}")
    info = parse_cron_line(matches[0].group("expr"))
    if len(matches) > 1:
        info = {**info, "multiple": True,
                "all_exprs": [m.group("expr") for m in matches]}
    return info


def write_cron(new_expr: str, path: Path | None = None) -> Path:
    """Rewrite the workflow's cron line. Preserves indent + trailing comment.

    Refuses to act when the workflow has more than one ``- cron:`` entry —
    silently rewriting the first match would corrupt a second schedule
    without warning. The caller can hand-edit instead.
    """
    p = path or workflow_path()
    text = p.read_text(encoding="utf-8")
    matches = _CRON_LINE_RE.findall(text)
    if not matches:
        raise ScheduleError(f"no cron: line found in {p}")
    if len(matches) > 1:
        raise ScheduleError(
            f"{p} has {len(matches)} cron lines; refusing to guess which to "
            "update. Hand-edit the file or remove the extra cron entries first."
        )

    def _replace(m: re.Match) -> str:
        indent = m.group("indent")
        quote = m.group(2)
        rest = m.group("rest")
        return f"{indent}- cron: {quote}{new_expr}{quote}{rest}"

    new_text = _CRON_LINE_RE.sub(_replace, text, count=1)
    if new_text == text:
        # No-op: the cron line already matches; still touch nothing.
        return p
    p.write_text(new_text, encoding="utf-8")
    return p


# ─── CLI ───


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="scq schedule",
                                     description="Inspect or update the digest cron schedule.")
    sub = parser.add_subparsers(dest="action", required=True)

    sub.add_parser("show", help="Print the current cron expression in human form")

    upd = sub.add_parser("update", help="Rewrite the workflow cron line from --cadence/--day/--time")
    upd.add_argument("--cadence", required=True, choices=["daily", "weekly"])
    upd.add_argument("--day", choices=_DOW_NAMES, help="Required for --cadence weekly")
    upd.add_argument("--time", required=True, help="HH:MM in 24-hour UTC (e.g. 07:00)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.action == "show":
        info = read_current()
        if info["cadence"] == "custom":
            print(f"cron: {info['expr']}  (custom - not produced by `scq schedule update`)")
        elif info["cadence"] == "daily":
            print(f"daily at {info['time_utc']} UTC  (cron: {info['expr']})")
        else:
            print(f"weekly on {info['day']} at {info['time_utc']} UTC  (cron: {info['expr']})")
        if info.get("multiple"):
            print(f"warning: workflow has {len(info['all_exprs'])} cron lines:")
            for expr in info["all_exprs"]:
                print(f"  - {expr}")
            print("`scq schedule update` will refuse to operate on this file.")
        return 0
    if args.action == "update":
        try:
            new_expr = compute_cron_line(args.cadence, args.time, args.day)
        except ScheduleError as e:
            print(f"error: {e}")
            return 2
        target = write_cron(new_expr)
        print(f"updated {target} → cron: '{new_expr}'")
        return 0
    return 1

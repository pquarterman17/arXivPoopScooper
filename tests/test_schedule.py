"""Tests for scq.schedule (plan #13).

Covers the two pure functions (compute_cron_line / parse_cron_line) and
the file-rewriting path against an isolated workflow file. The CLI
dispatch is a thin wrapper around main(); a single end-to-end CLI test
covers the integration.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq import schedule  # noqa: E402


# ─── compute_cron_line ───


def test_compute_daily_basic():
    assert schedule.compute_cron_line("daily", "07:00") == "0 7 * * *"


def test_compute_daily_with_minutes():
    assert schedule.compute_cron_line("daily", "06:45") == "45 6 * * *"


def test_compute_daily_midnight_edge():
    assert schedule.compute_cron_line("daily", "00:00") == "0 0 * * *"


def test_compute_daily_late_edge():
    assert schedule.compute_cron_line("daily", "23:59") == "59 23 * * *"


def test_compute_weekly_monday():
    assert schedule.compute_cron_line("weekly", "07:00", "mon") == "0 7 * * 1"


def test_compute_weekly_all_days():
    expected = {"sun": "0 7 * * 0", "mon": "0 7 * * 1", "tue": "0 7 * * 2",
                "wed": "0 7 * * 3", "thu": "0 7 * * 4", "fri": "0 7 * * 5",
                "sat": "0 7 * * 6"}
    for day, want in expected.items():
        assert schedule.compute_cron_line("weekly", "07:00", day) == want


def test_compute_weekly_requires_day():
    with pytest.raises(schedule.ScheduleError, match="--day is required"):
        schedule.compute_cron_line("weekly", "07:00")


def test_compute_unknown_cadence():
    with pytest.raises(schedule.ScheduleError, match="cadence"):
        schedule.compute_cron_line("hourly", "07:00")


def test_compute_bad_time_format():
    for bad in ("7:00", "25:00", "07:60", "abc", "", "07:0"):
        with pytest.raises(schedule.ScheduleError, match="time"):
            schedule.compute_cron_line("daily", bad)


def test_compute_unknown_day():
    with pytest.raises(schedule.ScheduleError, match="day must"):
        schedule.compute_cron_line("weekly", "07:00", "monday")


# ─── parse_cron_line ───


def test_parse_daily_round_trip():
    info = schedule.parse_cron_line("45 10 * * *")
    assert info == {"cadence": "daily", "time_utc": "10:45", "expr": "45 10 * * *"}


def test_parse_weekly_round_trip():
    info = schedule.parse_cron_line("0 7 * * 1")
    assert info["cadence"] == "weekly"
    assert info["day"] == "mon"
    assert info["time_utc"] == "07:00"


def test_parse_custom_marks_unknown_shapes():
    # day-of-month set
    assert schedule.parse_cron_line("0 7 1 * *")["cadence"] == "custom"
    # month set
    assert schedule.parse_cron_line("0 7 * 6 *")["cadence"] == "custom"
    # range expression
    assert schedule.parse_cron_line("0 7 * * 1-5")["cadence"] == "custom"
    # wrong field count
    assert schedule.parse_cron_line("0 7 * *")["cadence"] == "custom"


# ─── file rewriting ───


WORKFLOW_FIXTURE = """\
name: SCQ arXiv Daily Digest

on:
  schedule:
    # Target: ready in inbox by ~7 AM US Eastern.
    - cron: '45 10 * * *'
  workflow_dispatch:
    inputs:
      days_back:
        description: 'Days to look back'
        required: false
        default: '1'
"""


@pytest.fixture
def isolated_workflow(monkeypatch, tmp_path):
    """Create a fake workflow file inside a tmp repo and point paths() at it."""
    workflow = tmp_path / ".github" / "workflows" / "arxiv_digest.yml"
    workflow.parent.mkdir(parents=True)
    workflow.write_text(WORKFLOW_FIXTURE, encoding="utf-8")
    # paths().repo_root resolution honors SCQ_REPO_ROOT
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    yield workflow
    _paths_refresh()


def test_read_current_daily(isolated_workflow):
    info = schedule.read_current()
    assert info["cadence"] == "daily"
    assert info["time_utc"] == "10:45"


def test_write_cron_replaces_only_the_cron_line(isolated_workflow):
    schedule.write_cron("0 7 * * 1")
    text = isolated_workflow.read_text(encoding="utf-8")
    assert "- cron: '0 7 * * 1'" in text
    # Surrounding structure preserved
    assert "name: SCQ arXiv Daily Digest" in text
    assert "workflow_dispatch:" in text
    assert "Target: ready in inbox by ~7 AM US Eastern." in text
    # Only one cron line — no leftover from the old one
    assert text.count("- cron:") == 1
    assert "45 10" not in text


def test_write_cron_preserves_indent_and_quote_style(isolated_workflow):
    schedule.write_cron("30 6 * * 3")
    text = isolated_workflow.read_text(encoding="utf-8")
    # Original indent was 4 spaces + "- cron: '..." with single quotes
    assert "    - cron: '30 6 * * 3'" in text


def test_write_cron_round_trips_via_read_current(isolated_workflow):
    schedule.write_cron(schedule.compute_cron_line("weekly", "07:00", "fri"))
    info = schedule.read_current()
    assert info == {"cadence": "weekly", "day": "fri", "time_utc": "07:00",
                    "expr": "0 7 * * 5"}


def test_read_current_raises_when_workflow_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(schedule.ScheduleError, match="workflow file not found"):
            schedule.read_current()
    finally:
        _paths_refresh()


def test_write_cron_raises_when_no_cron_line(monkeypatch, tmp_path):
    workflow = tmp_path / ".github" / "workflows" / "arxiv_digest.yml"
    workflow.parent.mkdir(parents=True)
    workflow.write_text("name: noschedule\non:\n  workflow_dispatch:\n", encoding="utf-8")
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(schedule.ScheduleError, match="no cron"):
            schedule.write_cron("0 7 * * *")
    finally:
        _paths_refresh()


# ─── CLI integration ───


def test_cli_show_daily(isolated_workflow, capsys):
    schedule.main(["show"])
    out = capsys.readouterr().out
    assert "daily at 10:45 UTC" in out


def test_cli_show_weekly_after_update(isolated_workflow, capsys):
    schedule.main(["update", "--cadence", "weekly", "--day", "mon", "--time", "07:00"])
    capsys.readouterr()  # discard update output
    schedule.main(["show"])
    out = capsys.readouterr().out
    assert "weekly on mon at 07:00 UTC" in out


def test_cli_update_writes_file(isolated_workflow):
    schedule.main(["update", "--cadence", "daily", "--time", "12:30"])
    text = isolated_workflow.read_text(encoding="utf-8")
    assert "- cron: '30 12 * * *'" in text


def test_cli_update_returns_2_on_bad_input(isolated_workflow, capsys):
    rc = schedule.main(["update", "--cadence", "daily", "--time", "25:99"])
    assert rc == 2
    assert "error:" in capsys.readouterr().out


def test_cli_show_marks_custom(monkeypatch, tmp_path, capsys):
    workflow = tmp_path / ".github" / "workflows" / "arxiv_digest.yml"
    workflow.parent.mkdir(parents=True)
    workflow.write_text("on:\n  schedule:\n    - cron: '0 7 * * 1-5'\n", encoding="utf-8")
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        schedule.main(["show"])
        out = capsys.readouterr().out
        assert "custom" in out
    finally:
        _paths_refresh()


def test_cli_dispatched_via_scq(isolated_workflow, capsys):
    """End-to-end: `scq schedule show` should reach scq.schedule.main."""
    from scq.cli import main as cli_main
    rc = cli_main(["schedule", "show"])
    assert rc == 0
    assert "daily" in capsys.readouterr().out

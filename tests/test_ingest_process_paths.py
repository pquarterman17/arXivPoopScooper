"""MT-3 — Path-resolver lazy-evaluation regression test for B4.

Pre-fix, ``scq.ingest.process`` captured ``DB_PATH`` / ``BIB_PATH`` / etc. at
module-import time, so ``paths.refresh()`` after env-var or paths.toml
changes did NOT propagate. This test verifies the post-fix behaviour: the
private ``_db_path`` / ``_bib_path`` / ``_inbox_dir`` / ``_papers_dir`` /
``_figures_dir`` / ``_txt_path`` resolvers re-read the cache on every call.
"""

from __future__ import annotations

# scq.config.__init__ re-exports `paths` (the function), which shadows the
# `scq.config.paths` submodule when accessed via attribute. Import the
# resolver + cache-buster directly to dodge the shadow.
from scq.config.paths import paths as resolve_paths, refresh as refresh_paths
from scq.ingest import process as proc


def test_paths_refresh_propagates_through_process_module(tmp_path, monkeypatch):
    """SCQ_REPO_ROOT change + paths.refresh() must update process.py's view.

    Pre-fix, ``proc.DB_PATH`` was bound at import; post-fix, ``proc._db_path()``
    resolves through ``scq.config.paths.paths()`` on every call.
    """
    # Capture the resolver's view *before* the override
    before = proc._db_path()

    # Override repo root to a sandboxed location, then explicitly refresh
    new_root = tmp_path / "fake_repo"
    new_root.mkdir()
    monkeypatch.setenv("SCQ_REPO_ROOT", str(new_root))
    refresh_paths()

    # Each lazy resolver should now reflect the override. We compare against
    # ``paths().db_path`` rather than a hard-coded expected to stay decoupled
    # from the resolver's default-vs-toml policy.
    expected = resolve_paths().db_path
    assert proc._db_path() == expected
    assert proc._db_path() != before, (
        "process._db_path() did not refresh after SCQ_REPO_ROOT change "
        "+ paths.refresh() — B4 has regressed"
    )


def test_all_six_lazy_resolvers_track_a_single_refresh(tmp_path, monkeypatch):
    """Every resolver in process.py reads the same Paths instance."""
    new_root = tmp_path / "alt_root"
    new_root.mkdir()
    monkeypatch.setenv("SCQ_REPO_ROOT", str(new_root))
    refresh_paths()

    p = resolve_paths()
    # All six resolvers should point under the new root (or wherever the
    # override sends them per data/user_config/paths.toml). The contract is
    # parity with paths(), not a hard-coded location.
    assert proc._db_path()      == p.db_path
    assert proc._bib_path()     == p.references_bib_path
    assert proc._txt_path()     == p.references_txt_path
    assert proc._inbox_dir()    == p.inbox_dir
    assert proc._papers_dir()   == p.papers_dir
    assert proc._figures_dir()  == p.figures_dir


def test_paths_module_globals_were_removed():
    """Belt-and-suspenders: the old eager globals must not be re-introduced.

    If a future refactor accidentally re-creates ``DB_PATH = Path(...)`` at
    module load, the lazy contract breaks again. Fail loudly.
    """
    forbidden = ("INBOX_DIR", "PAPERS_DIR", "FIGURES_DIR",
                 "DB_PATH", "BIB_PATH", "TXT_PATH")
    leaked = [name for name in forbidden if hasattr(proc, name)]
    assert not leaked, (
        f"process.py re-introduced eager path globals: {leaked}. "
        "Use the _xxx_path() / _xxx_dir() helpers instead."
    )

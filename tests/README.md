# `tests/` — pytest suite for the `scq` Python package

Unit + integration tests for the Python side of the toolkit. Frontend tests
live in `src/tests/` (vitest).

## Running

```bash
pytest               # all tests
pytest -k "config"   # filter
pytest --cov=scq     # with coverage
```

## Layout

Tests mirror the package structure:
- `test_config_*.py` → `scq/config/`
- `test_db_*.py` → `scq/db/`
- `test_arxiv_*.py` → `scq/arxiv/`
- `test_ingest_*.py` → `scq/ingest/`

Use `conftest.py` for shared fixtures (in-memory DB, fake meta JSON, etc.).

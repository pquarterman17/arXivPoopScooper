# `src/config/` — shipped defaults and schemas

The "factory settings" for every domain config (search, digest, citations, UI).
User overrides live in `data/user_config/` and are merged on top at runtime.

- `defaults/` — JSON files with shipped defaults (read-only)
- `schema/` — JSON Schema files for validation and editor autocomplete
- `loader.js` — merges `defaults/` + `data/user_config/` and validates

The same JSON Schemas are consumed by Python (`scq/config/schema.py`) so the
backend digest scripts and the browser UI never disagree about config shape.

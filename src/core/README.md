# `src/core/` — framework-agnostic plumbing

Low-level building blocks every other frontend module imports.

- `db.js` — sql.js initialization + low-level `query` / `exec` / `save` helpers
- `store.js` — observable state container, Pinia-shaped API for swap-readiness
- `config.js` — read-only runtime API for shipped defaults + user overrides
- `events.js` — tiny `on`/`off`/`emit` pub/sub for cross-module messages

**No DOM access permitted.** See `src/README.md` for the rule.

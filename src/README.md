# `src/` — frontend source

All browser-side code lives here. No build step: served as plain ES modules by `scq/server.py`.

## Layout

- `pages/` — thin HTML shells (markup only, ~200 lines each)
- `styles/` — extracted CSS, one file per page plus shared `base.css`
- `core/` — framework-agnostic plumbing (db, store, events, config). **No DOM.**
- `services/` — pure business logic (arxiv, papers, citations, search). **No DOM.**
- `ui/` — DOM-coupled rendering. **The only layer allowed to touch the DOM.**
- `config/` — shipped defaults (`defaults/`) and JSON Schemas (`schema/`)
- `tests/` — vitest unit tests for `core/` and `services/`

## The one architectural rule

**`core/` and `services/` MUST NOT touch the DOM.** No `document.*`, `window.*`,
`getElementById`, `innerHTML`, etc. They take state as input and return data.

This is what makes a future Vue 3 migration a localized rewrite (replace `ui/`
with components) instead of a full do-over. It's also what makes `core/` and
`services/` unit-testable in node without jsdom.

Enforced by grep in CI:
```bash
! grep -rn "document\.\|window\.\|innerHTML\|getElementById" src/core/ src/services/
```

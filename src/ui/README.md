# `src/ui/` — DOM-coupled rendering

Per-page UI modules. The only layer in `src/` allowed to touch the DOM.

- `database/` — modules backing `paper_database.html`
- `scraper/` — modules backing `paper_scraper.html`
- `digest/` — modules backing `weekly_digest.html`
- `settings/` — Settings tab UI (schema-driven forms, shared by all pages)

Each subdirectory has a `main.js` entry point that the corresponding HTML page
loads via `<script type="module">`. `main.js` imports services and core, wires
event handlers, and dispatches initial render.

**This is the layer that gets rewritten in a future Vue 3 port.** Components
would replace each `*.js` file; the `services/` and `core/` imports stay.

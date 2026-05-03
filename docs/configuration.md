# The Configuration Model

There are *four* kinds of "config" in this app, each with its own home and editing path. Conflating them is the #1 source of "why isn't my setting taking effect?" bugs.

## The four layers

| Layer | What it holds | Lives in | Editable how |
|---|---|---|---|
| **Bootstrap** | Where the DB lives, paths to papers/figures/inbox/exports/digests dirs. Must be readable BEFORE the DB opens. | `data/user_config/paths.toml` (or env vars) | Hand-edit; `scq config paths` shows resolved values |
| **Domain** | Search criteria, auto-tag rules, digest cadence, citation style, recipient list. The user's "research setup." | `data/user_config/<domain>.json` (overrides ship-defaults in `src/config/defaults/`) | Hand-edit; Settings v2 UI; `POST /api/config/<domain>`; `scq config show/get` |
| **Session/UI prefs** | Theme, last open tab, table sort, column widths, PDF pane size. Bound to a specific DB. | `settings` table inside `scientific_litter_scoop.db` | Settings UI only (rarely hand-edited) |
| **Secrets** | SMTP password, API tokens. Never on disk in plaintext. | OS keyring via Python `keyring` (or env vars in CI) | `scq config set-secret`; `POST /api/secret` |

Why split this way: bootstrap config can't depend on the DB (chicken-and-egg). Domain config benefits from being a plain file the user can version-control, share between machines, or back up. Session prefs are too noisy to commit and naturally belong with the DB they refer to. Secrets need OS-level protection.

## The 9 domains

Domain configs live at `src/config/defaults/<domain>.json` (shipped) and optionally `data/user_config/<domain>.json` (user override). The loader merges defaults + override; missing user files just mean "use defaults."

```
src/config/defaults/         src/config/schema/<domain>.schema.json
├── digest.json              # cadence, lookback, recipients, caps
├── citations.json           # default style, included fields
├── ui.json                  # theme, layout, density
├── ingest.json              # auto-tag-on-import, fetch-figures, ...
├── email.json               # SMTP host/port/from/tls (NOT password)
├── watchlist.json           # authors / groups / keywords to highlight
├── privacy.json             # include-notes-in-exports etc.
├── search-sources.json      # arxivCategories, sources, presets, autoFetch
└── auto-tag-rules.json      # tag → keyword list mappings
```

Plus a separate `paths.schema.json` validates the bootstrap TOML.

## Two parallel loaders, one source of truth

```
JS side:
  src/config/loader.js            ← loadConfig, loadAll, deepMerge, schema validate
  src/core/config.js              ← initConfig + getConfig + reload + subscribe
  Both consumed via `getConfig('<domain>')`

Python side:
  scq/config/paths.py             ← TOML parsing + env-var override + repo-root walk-up
  scq/config/user.py              ← jsonschema validation, x-mergeKey-aware merge
  scq/config/secrets.py           ← env → keyring fallback chain
  Consumed via `from scq.config import user; user.load_config('<domain>')`
```

The same JSON Schema files validate both sides. Shared test vectors at `tests/vectors/config-merge/` and `tests/vectors/schema-validation/` lock that JS and Python produce identical errors / merged results — see `src/tests/_vectors.js` and `tests/conftest.py:vectors_for()`.

## Schema-aware merge (`x-mergeKey`)

For arrays of objects (sources, presets, recipients, auto-tag rules), the loader supports `x-mergeKey` in the schema so user overrides target individual entries by id rather than replacing the whole array:

```json
{
  "type": "array",
  "x-mergeKey": "id",
  "items": { "type": "object", ... }
}
```

A user_config file with `{"sources": [{"id": "prl", "enabled": true}]}` merges onto the defaults: only the PRL entry's `enabled` flips, every other source stays at its default. Without `x-mergeKey`, the array would be replaced wholesale.

## Hot reload + subscribe

`reload('<domain>')` re-fetches a single domain and notifies subscribers via `bus.emit('config:<domain>:changed', {current, previous})`. The Settings v2 UI calls this after a successful `POST /api/config/<domain>` so other live UI updates without a page reload.

## scq.config.paths submodule shadow

The `paths` name appears in two places: `scq.config.paths` (the submodule) and `scq.config.paths()` (the resolver function exported from that submodule). `scq/config/__init__.py` does `from .paths import paths`, which makes `scq.config.paths` resolve to the *function*, shadowing the submodule.

This means:

- ✅ Tests must import the function directly: `from scq.config.paths import paths`
- ❌ `from scq.config import paths` gets the function (which is fine if that's what you want)
- ❌ `import scq.config.paths` gives you the submodule, but `scq.config.paths` after the parent import gives you the function

When in doubt, use the explicit submodule path.

## Env-var override pattern

Every bootstrap path can be overridden via a `SCQ_<NAME>` env var, e.g. `SCQ_DB_PATH=/tmp/foo.db`. Used by tests (`isolated_repo_root` fixture sets `SCQ_REPO_ROOT`) and CI runners.

Secrets follow the same pattern: `secrets.get('email_app_password')` checks `SCQ_EMAIL_APP_PASSWORD` first, then the keyring. CI never has a keyring; production has both.

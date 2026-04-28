# `data/user_config/` — user overrides (gitignored)

Per-user config files. **Real files are gitignored**; `*.example.*` templates
are committed so a `git clone` user has a starting point.

## Files

| File | Purpose | Committed? |
|---|---|---|
| `paths.toml` | DB path, papers/figures/inbox dir locations. Read at bootstrap. | ❌ gitignored |
| `paths.toml.example` | Starter template with sensible defaults | ✅ committed |
| `search.json` | Sources, presets, auto-tag rules — the "your research focus" config | ❌ gitignored |
| `search.json.example` | Starter with a few sample sources/presets | ✅ committed |
| `digest.json` | Max-papers, source filters, watchlist (recipients live in GH Secret) | ❌ gitignored |
| `digest.json.example` | Starter | ✅ committed |
| `ui.json` | Theme, default sort, table density (overrides; the settings table in DB is canonical) | ❌ gitignored |
| `ui.json.example` | Starter | ✅ committed |

## First-run

`scq init` copies each `*.example.*` to its non-example name if the target
doesn't already exist. Hand-edit afterwards, or use the Settings UI tab in
`paper_database.html`.

## Secrets

**Do not put SMTP passwords or API tokens here.** They go in OS keyring (via
`scq config set-secret`) or env vars (set in your shell, or as GH Secrets for
the digest workflow). See `scq/config/secrets.py`.

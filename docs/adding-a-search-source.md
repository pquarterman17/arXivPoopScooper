# Adding a Search Source

You want a new journal in the scraper — say, *Nature Physics*. Two paths:

1. **Permanent (ships in defaults):** edit `src/config/defaults/search-sources.json` so every user gets the new source.
2. **Personal (your override):** edit `data/user_config/search-sources.json` so the source appears for you without changing the shipped defaults.

The second path is what you want for a journal you're personally interested in but that isn't generic enough to ship. The first is for entries that belong in every install.

## What a source entry looks like

The schema is `src/config/schema/search-sources.schema.json`. A source is an object with these required fields:

```json
{
  "id":      "natphys",
  "label":   "Nature Physics",
  "type":    "crossref",
  "color":   "#e06c75",
  "enabled": false
}
```

For arXiv-direct journals, also `journalRef` + `journalName`:

```json
{
  "id": "prb", "label": "PRB", "type": "arxiv-jr",
  "journalRef": "Phys.+Rev.+B", "journalName": "Phys. Rev. B",
  "color": "#d19a66", "enabled": false
}
```

For Crossref journals (search by ISSN), also `issn` + `journalName`:

```json
{
  "id": "natphys", "label": "Nature Physics", "type": "crossref",
  "issn": "1745-2481", "journalName": "Nature Physics",
  "color": "#e06c75", "enabled": false
}
```

## Path 1: ship in defaults

Edit `src/config/defaults/search-sources.json`. Append a new entry to the `sources` array. Pick a unique `id` — the `x-mergeKey: "id"` in the schema means a user override can target this exact entry later.

That's it. The schema enforces shape; the loader picks it up next time `initConfig()` runs.

## Path 2: personal override

Edit `data/user_config/search-sources.json` (gitignored — won't get committed). The override file uses the same shape; the loader does an id-keyed merge.

To **add** a new source without touching defaults:

```json
{
  "$schema": "../../src/config/schema/search-sources.schema.json",
  "sources": [
    {
      "id": "natphys", "label": "Nature Physics", "type": "crossref",
      "issn": "1745-2481", "journalName": "Nature Physics",
      "color": "#e06c75", "enabled": true
    }
  ]
}
```

Because `id="natphys"` doesn't match any default, the loader appends it.

To **modify** an existing source (e.g. enable PRL by default for you), set the same `id` with the fields you want changed:

```json
{
  "sources": [
    { "id": "prl", "enabled": true }
  ]
}
```

Schema-aware merge means *only* the `enabled` field overrides — everything else stays at the default's value.

## Apply the change

Reload the page. The bridge in `src/core/search-config-bridge.js` calls `initConfig()` on module load and writes the merged result onto `globalThis.SCRAPER_CONFIG`, so the new source toggle appears in the scraper's source-toggle bar at next page load.

In Python (the digest), `scq/arxiv/digest.py` reads `arxivCategories` from the same merged config. If your new source affects digest filtering, run a `scq digest --test --no-email --max-papers 1` to verify.

## Verify

```sh
# Check the loader merged correctly
scq config show search-sources

# Check the schema accepts your override
scq config validate
```

If validation passes but the source doesn't appear, check that you reloaded the page (the bridge runs on module load, not continuously).

## Don't

- **Don't edit `scraper_config.js`.** That file ships defaults plus legacy fields the JS apps still read directly (`entryTypes`, `tags`). New sources go through the schema-driven loader, not the legacy JS object.
- **Don't put your override in `src/config/defaults/`.** That's the shipped baseline; it's tracked in git. Personal overrides go in `data/user_config/` (gitignored).
- **Don't forget the `id`.** Without a unique id, schema-aware merge can't target your entry; it'll get treated as an array-replacement.

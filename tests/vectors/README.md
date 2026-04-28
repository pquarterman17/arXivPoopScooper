# `tests/vectors/` — language-neutral test fixtures

Each subdirectory holds JSON files in a fixed shape. Both vitest (JS) and
pytest (Python) iterate the directory and run one test per file, so adding a
vector adds tests on **both** sides automatically.

## Categories

### `config-merge/`

Tests that JS and Python produce identical output from `schema_aware_merge`.

```json
{
  "name": "human-readable description",
  "defaults": { ... },
  "override": { ... },
  "schema":   { ... },
  "expected": { ... }
}
```

### `schema-validation/`

Tests that JS and Python both flag the same set of validation errors against
a payload. Error message text differs between validators, so vectors specify
*paths* and *kinds*, not verbatim messages.

```json
{
  "name": "human-readable description",
  "schema":  { ... },
  "payload": { ... },
  "expectedErrors": [
    { "path": "$.foo",      "kind": "required" },
    { "path": "$.bar.baz",  "kind": "type" }
  ]
}
```

`kind` is one of: `required`, `type`, `enum`, `const`, `minLength`,
`maxLength`, `minimum`, `maximum`, `pattern`, `format`, `uniqueItems`,
`additionalProperties`, `anyOf`. (These match jsonschema's `validator`
attribute; the JS minimal validator is normalized to the same vocabulary.)

`expectedErrors` is order-independent — both sides sort and compare as
sets of `(path, kind)` tuples.

### `citations/`

Locks BibTeX + plain-text citation output byte-for-byte. Critical before
`paper_scraper.html` decomposition (plan item #9) rewires the formatters.

```json
{
  "name": "human-readable description",
  "paper": { "id": "...", "title": "...", ... },
  "config": { "defaultStyle": "prl", ... },     // optional
  "expectedBib": "@article{...}",
  "expectedTxt": "..."
}
```

Python coverage lands when `scq/citations/` is built (plan item #12).
Until then, only vitest exercises citation vectors.

## Adding a vector

1. Drop a new `.json` file in the right category directory.
2. Run `npm test` and `pytest tests/` — both suites should pick it up.
3. If you're adding it to lock down a regression, name it
   `<bugfix-description>.json` so the file itself documents what's
   being prevented.

## Conventions

- File names use kebab-case: `id-merge-overrides-existing.json`.
- The `name` field is the human-readable description that shows up in
  test output.
- JSON only (no JSONC, no YAML — both languages parse JSON natively).
- No comments — put context in `name` or in this README.

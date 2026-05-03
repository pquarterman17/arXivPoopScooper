# Adding a New Config Key

You want a new user-editable knob — say, "minimum citation count to highlight." This walks through where to add fields to existing domains, and how to add a brand new domain.

## Adding a field to an existing domain

Suppose you want a `minCitations` integer on the `digest` domain.

### 1. Schema

Edit `src/config/schema/digest.schema.json`. Add the field to `properties`, set `type` and validation:

```json
"minCitations": {
  "type": "integer",
  "minimum": 0,
  "maximum": 1000,
  "description": "Drop digest entries with fewer than this many citations."
}
```

If the field is required, add it to the schema's `"required"` array. Default to **not required** if you can — most users won't set it, and a default value in the defaults file will fill in.

### 2. Defaults

Edit `src/config/defaults/digest.json`. Add a sensible default:

```json
"minCitations": 0
```

The loader's `deepMerge` ensures that user overrides patch onto this base, so users who don't set the field get `0` automatically.

### 3. JS reader

If a service or UI module reads this, do it through `getConfig`:

```js
import { getConfig } from '../core/config.js';
const min = getConfig('digest').minCitations;
```

No special wiring — `getConfig('digest')` already returns the merged config.

### 4. Python reader

For the digest pipeline (or any other Python consumer):

```python
from scq.config import user as _user_cfg
data = _user_cfg.load_config('digest').data
min_citations = data.get('minCitations', 0)
```

Use `.get(field, default)` rather than `data['field']` — the validator allows fields to be absent if not in `required`, so a hard lookup will KeyError on minimal user_configs.

### 5. Settings UI

Settings v2 is fully schema-driven: it renders the new field automatically next time you open the page. No code changes needed unless you want a custom widget (in which case extend `src/ui/settings/schema-form.js`).

### 6. Test vector (optional but recommended)

If the field changes externally-visible behavior, add a vector to `tests/vectors/<category>/` so both vitest and pytest lock the expected behavior.

## Adding a new domain

Suppose you want a brand-new `notifications` domain — desktop-notification settings.

### 1. Schema

Create `src/config/schema/notifications.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "scq://schema/notifications",
  "title": "Notification settings",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "enabled": { "type": "boolean" },
    "showOnNewPaper": { "type": "boolean" }
  },
  "required": []
}
```

Always set `additionalProperties: false`. It's the only thing that catches typos in user_config files; without it, a user typing `"enabld": true` produces a silent no-op.

### 2. Defaults

Create `src/config/defaults/notifications.json` with the `$schema` reference for IDE autocomplete:

```json
{
  "$schema": "../schema/notifications.schema.json",
  "enabled": false,
  "showOnNewPaper": true
}
```

### 3. Manifest registrations

Two places to register the new domain:

- **JS:** `src/config/loader.js` — append `'notifications'` to the `MANIFEST` array.
- **Python:** `scq/config/user.py` — same `MANIFEST` list.

Without these registrations, `loadAll()` skips the domain.

### 4. Settings UI tab (optional)

Settings v2 reads the schema automatically once the manifest is updated. To opt out (some domains aren't user-facing), edit `src/ui/settings/main.js` and remove the entry from the `TABS` array.

### 5. Starter override file (optional)

Create `data/user_config/notifications.json.example` so users know the override format. Comment-free JSON (TOML supports inline comments; JSON doesn't) — the explanation lives in `data/user_config/README.md`.

### 6. Tests

For a new domain, add a test that:

```python
def test_notifications_loads_with_defaults():
    from scq.config import user
    result = user.load_config('notifications')
    assert result.errors == []
    assert result.data['enabled'] is False
```

The schema validator will catch a malformed defaults file at import time; the test catches a missing manifest entry.

## Pitfalls

- **Don't store secrets here.** SMTP passwords / API tokens go through `scq.config.secrets` (OS keyring + env-var fallback), not in user_config files.
- **Don't add `additionalProperties: true`.** It silences typo detection. The only known exception is the legacy `paths.toml` shape, which the bootstrap path predates the schema discipline.
- **Don't forget to update both manifests.** Adding to one but not the other means the JS frontend disagrees with the Python backend about what config exists. The shared test vectors catch some of this, but a fresh domain won't have vectors yet.

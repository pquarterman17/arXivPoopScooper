# Architecture Documentation

Short, opinionated docs that explain **why** subsystems are shaped the way they are. The repo's `CLAUDE.md` is the high-level orientation; these are the deep dives.

| Doc | When to read |
|---|---|
| [`architecture.md`](architecture.md) | First time touching this codebase. Explains the layered structure (`core/`, `services/`, `ui/`, `scq/`) and the rules that keep a future Vue 3 port viable. |
| [`configuration.md`](configuration.md) | Adding a new user-editable knob, debugging "why isn't my config taking effect?", or porting features that need the same setting on both JS and Python sides. |
| [`adding-a-search-source.md`](adding-a-search-source.md) | You want a new journal in the scraper. Step-by-step: schema entry, defaults file, optional user override. |
| [`adding-a-config-key.md`](adding-a-config-key.md) | You want a new field in one of the 9 config domains (or a brand new domain). Walks through schema → defaults → loader manifest → JS service → Python loader → Settings UI. |

If a doc here gets stale, fix it in the same commit as the code change — there's no separate "update docs" step in this repo.

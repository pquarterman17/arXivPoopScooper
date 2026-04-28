# `src/services/` — pure business logic

DOM-free modules that act on the store and the database. Each service owns one
domain (papers, collections, arXiv, citations, …) and exposes a small typed API.

**No DOM access permitted.** Services take state and return data; they emit
store mutations and pub/sub events but never mutate `document`.

This is the layer that survives a future Vue 3 migration unchanged.

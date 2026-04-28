"""Configuration utilities for the SCQ toolkit.

See plan item #5 in plans/architecture-refactor.md.

  paths   — bootstrap: where the DB and paper files live (TOML, no DB needed)
  user    — domain config: digest, search, citations, etc. (JSON, schema-validated)
  secrets — OS keyring + env-var fallback for SMTP password etc.
"""

from .paths import Paths, paths, repo_root, refresh  # noqa: F401
from . import user  # noqa: F401

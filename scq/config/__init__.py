"""Configuration utilities for the SCQ toolkit.

See plan item #5 in plans/architecture-refactor.md.

  paths   — bootstrap: where the DB and paper files live (TOML, no DB needed)
  user    — domain config: digest, search, citations, etc. (JSON, schema-validated)
  secrets — OS keyring + env-var fallback for SMTP password etc.
"""

from . import (
    secrets,  # noqa: F401
    user,  # noqa: F401
)
from .paths import Paths, paths, refresh, repo_root  # noqa: F401

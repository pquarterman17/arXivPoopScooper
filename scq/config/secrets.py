"""Secret resolution for the SCQ toolkit.

Resolution order for a secret named ``foo_bar``:

  1. Environment variable ``SCQ_FOO_BAR``  (always wins)
  2. OS keyring under service name ``scq``, username ``foo_bar`` (if keyring
     is installed — it's an optional dep declared in ``pyproject.toml``)
  3. ``None``

Why a fallback chain: CI runs without a keyring (Linux runner has no DBus)
but with secrets injected as env vars. Local dev wants the keyring so the
SMTP password isn't sitting in plaintext on disk. Tests want neither and
just monkeypatch the env.

Public API::

    from scq.config import secrets
    pw = secrets.get('email_app_password')          # str | None
    secrets.set('email_app_password', 'app-pw-123')  # raises if no keyring
    secrets.delete('email_app_password')             # bool
    secrets.has('email_app_password')                # bool, doesn't return value
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    pass

KEYRING_SERVICE = "scq"


class KeyringUnavailable(RuntimeError):
    """Raised when an operation requires keyring but it isn't installed.

    Tells the user how to install: ``pip install scq[keyring]`` adds the
    optional dep declared in pyproject.toml.
    """

    def __init__(self) -> None:
        super().__init__(
            "OS keyring not available. Install the optional dep:\n"
            "    pip install scq[keyring]\n"
            "(On Linux you may also need a keyring backend like\n"
            " `secretstorage` or `dbus-python`; see the keyring docs.)"
        )


def env_var_name(name: str) -> str:
    """``email_app_password`` → ``SCQ_EMAIL_APP_PASSWORD``."""
    return "SCQ_" + name.upper().replace("-", "_").replace(".", "_")


def get(name: str) -> str | None:
    """Look up a secret. Env var wins; keyring is the fallback."""
    if not name or not isinstance(name, str):
        raise ValueError("secret name must be a non-empty string")
    env = os.environ.get(env_var_name(name))
    if env:
        return env
    try:
        import keyring  # type: ignore[import-untyped]
    except ImportError:
        return None
    try:
        return keyring.get_password(KEYRING_SERVICE, name)
    except Exception:
        # keyring backends can fail mid-call (locked DBus, missing collection,
        # etc.). Treat as "not found" rather than crashing.
        return None


def has(name: str) -> bool:
    """Check whether the secret resolves, without returning the value.

    Useful for the CLI's `get-secret` subcommand (don't print secrets to a
    terminal that scrolls into screenshots).
    """
    return get(name) is not None


def set(name: str, value: str) -> None:  # noqa: A001 — module API; not shadowing builtin in typical use
    """Write a secret to the keyring. Raises :class:`KeyringUnavailable` if
    keyring isn't installed.

    Setting via env var doesn't make sense here — env vars come from the
    surrounding process, not us. To configure a secret in CI, set the
    corresponding ``SCQ_<NAME>`` GitHub Action secret.
    """
    if not name or not isinstance(name, str):
        raise ValueError("secret name must be a non-empty string")
    if not isinstance(value, str):
        raise ValueError("secret value must be a string")
    try:
        import keyring  # type: ignore[import-untyped]
    except ImportError as e:
        raise KeyringUnavailable() from e
    keyring.set_password(KEYRING_SERVICE, name, value)


def delete(name: str) -> bool:
    """Remove a secret from the keyring. Returns True if it existed."""
    if not name or not isinstance(name, str):
        raise ValueError("secret name must be a non-empty string")
    try:
        import keyring  # type: ignore[import-untyped]
        from keyring.errors import PasswordDeleteError  # type: ignore[import-untyped]
    except ImportError:
        return False
    try:
        keyring.delete_password(KEYRING_SERVICE, name)
        return True
    except PasswordDeleteError:
        return False
    except Exception:
        return False


def keyring_available() -> bool:
    """Cheap check, used by the CLI to print a helpful message before
    operations that require keyring. Doesn't probe the backend; just imports.
    """
    try:
        import keyring  # noqa: F401
        return True
    except ImportError:
        return False


__all__ = [
    "KEYRING_SERVICE",
    "KeyringUnavailable",
    "env_var_name",
    "get",
    "has",
    "set",
    "delete",
    "keyring_available",
]

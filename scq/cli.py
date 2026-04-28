"""Command-line interface for the SCQ toolkit.

Currently exposes ``scq config <subcommand>`` for inspecting paths, viewing
resolved config, and managing OS-keyring secrets. More subcommands (``serve``,
``fetch``, ``ingest``, ``digest``) will land with plan item #12 when the
``tools/`` scripts move into ``scq/``.

Usage::

    scq config show                        # all domains, JSON
    scq config show digest                 # one domain
    scq config get digest maxPapers        # one nested key
    scq config validate                    # exit 1 if any domain has errors
    scq config paths                       # resolved filesystem locations
    scq config has-secret email_app_password
    scq config set-secret email_app_password   # prompt for value
    scq config delete-secret email_app_password
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from typing import Any

from .config.paths import paths as get_paths
from .config import secrets as secrets_mod
from .config import user as user_cfg


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


# ─── parser construction ───


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="scq",
        description="Scientific Literature Scoop CLI",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")

    config = sub.add_parser("config", help="inspect and manage configuration")
    config_sub = config.add_subparsers(dest="config_command", metavar="<config-command>")

    # config show
    p_show = config_sub.add_parser("show", help="print resolved config")
    p_show.add_argument("domain", nargs="?", help="one of MANIFEST; default = all")
    p_show.add_argument("--no-pretty", action="store_true", help="emit compact JSON")
    p_show.set_defaults(func=_cmd_show)

    # config get
    p_get = config_sub.add_parser("get", help="get one nested key")
    p_get.add_argument("domain")
    p_get.add_argument("key", help="dot-separated path, e.g. autoFetch.cooldownHours")
    p_get.set_defaults(func=_cmd_get)

    # config validate
    p_validate = config_sub.add_parser("validate", help="validate config, exit 1 on errors")
    p_validate.add_argument("domain", nargs="?", help="default = all")
    p_validate.set_defaults(func=_cmd_validate)

    # config paths
    p_paths = config_sub.add_parser("paths", help="show resolved filesystem paths")
    p_paths.set_defaults(func=_cmd_paths)

    # secrets
    p_has = config_sub.add_parser(
        "has-secret",
        help="exit 0 if a secret resolves, 1 otherwise (does not print the value)",
    )
    p_has.add_argument("name")
    p_has.set_defaults(func=_cmd_has_secret)

    p_set = config_sub.add_parser(
        "set-secret",
        help="prompt for and store a secret in the OS keyring",
    )
    p_set.add_argument("name")
    p_set.set_defaults(func=_cmd_set_secret)

    p_del = config_sub.add_parser("delete-secret", help="remove a secret from the OS keyring")
    p_del.add_argument("name")
    p_del.set_defaults(func=_cmd_delete_secret)

    return parser


# ─── command handlers ───


def _cmd_show(args: argparse.Namespace) -> int:
    if args.domain:
        result = user_cfg.load_config(args.domain)
        _emit_json(result.data, pretty=not args.no_pretty)
        if result.errors:
            print(f"\nNote: {len(result.errors)} validation error(s):", file=sys.stderr)
            for e in result.errors:
                print(f"  {e}", file=sys.stderr)
        return 0
    every = user_cfg.load_all()
    payload = {d: r.data for d, r in every.items()}
    _emit_json(payload, pretty=not args.no_pretty)
    return 0


def _cmd_get(args: argparse.Namespace) -> int:
    result = user_cfg.load_config(args.domain)
    cur: Any = result.data
    for part in args.key.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            print(f"key '{args.key}' not found in {args.domain}", file=sys.stderr)
            return 1
    _emit_json(cur, pretty=True)
    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    domains = [args.domain] if args.domain else list(user_cfg.MANIFEST)
    bad = 0
    for d in domains:
        result = user_cfg.load_config(d)
        if result.errors:
            bad += 1
            print(f"{d}: {len(result.errors)} error(s)")
            for e in result.errors:
                print(f"  {e}")
        else:
            print(f"{d}: ok")
    return 1 if bad else 0


def _cmd_paths(args: argparse.Namespace) -> int:
    p = get_paths()
    out = {
        "repo_root": str(p.repo_root),
        "db_path": str(p.db_path),
        "papers_dir": str(p.papers_dir),
        "figures_dir": str(p.figures_dir),
        "inbox_dir": str(p.inbox_dir),
        "exports_dir": str(p.exports_dir),
        "references_bib_path": str(p.references_bib_path),
        "references_txt_path": str(p.references_txt_path),
    }
    _emit_json(out, pretty=True)
    return 0


def _cmd_has_secret(args: argparse.Namespace) -> int:
    return 0 if secrets_mod.has(args.name) else 1


def _cmd_set_secret(args: argparse.Namespace) -> int:
    if not secrets_mod.keyring_available():
        print(
            "keyring is not installed. Install with:\n"
            "    pip install scq[keyring]",
            file=sys.stderr,
        )
        return 2
    value = getpass.getpass(f"Enter value for {args.name} (input hidden): ")
    if not value:
        print("aborted: empty value", file=sys.stderr)
        return 1
    try:
        secrets_mod.set(args.name, value)
    except Exception as e:  # noqa: BLE001
        print(f"failed to set secret: {e}", file=sys.stderr)
        return 1
    print(f"secret '{args.name}' stored in OS keyring")
    return 0


def _cmd_delete_secret(args: argparse.Namespace) -> int:
    removed = secrets_mod.delete(args.name)
    if removed:
        print(f"removed '{args.name}' from OS keyring")
        return 0
    print(f"no secret '{args.name}' found in keyring (env-var-only secrets cannot be deleted here)")
    return 1


# ─── helpers ───


def _emit_json(payload: Any, *, pretty: bool) -> None:
    if pretty:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

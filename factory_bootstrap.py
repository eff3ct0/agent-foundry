#!/usr/bin/env python3
"""Idempotently provision organization repositories.

Verify and create missing base repositories in a GitHub organization:
`<org>/.github` (community health defaults) and `<org>/<factory-repo>` (the
factory template). Uses the `gh` CLI and is SEPARATE from init.py, which is
deterministic and offline. init.py only declares/enforces FACTORY_REQUIRED;
this tool ensures that repositories actually exist.

Usage:
  python3 factory_bootstrap.py --org <ORG>          # verify/create missing repos (asks first)
  python3 factory_bootstrap.py --org <ORG> --yes    # non-interactive create
  python3 factory_bootstrap.py --org <ORG> --no-create  # report only, never create
  python3 factory_bootstrap.py --plan --org <ORG>   # OFFLINE plan, no gh calls
  Options: --factory-repo <name> (default: factory), --visibility public|internal|private (default: private).

Requires authenticated `gh` (except --plan). Idempotent: existing repositories
are no-ops. NEVER deletes.
"""
import argparse
import sys

# Creating organization repositories is an approved outward action, so this tool
# requires --yes or an interactive prompt; init.py never invokes it.

LOOKUP_EXISTS = "exists"
LOOKUP_MISSING = "missing"
LOOKUP_INDETERMINATE = "indeterminate"

_INDETERMINATE_MARKERS = (
    "authentication", "not authenticated", "unauthorized", "bad credentials", "401",
    "permission", "forbidden", "access denied", "403",
    "rate limit", "secondary rate", "429",
    "network", "timed out", "timeout", "connection", "could not resolve host",
    "temporary failure", "tls", "proxy",
)
_NOT_FOUND_MARKERS = (
    "could not resolve to a repository", "not found", "404", "does not exist",
)


def targets(org, factory_repo):
    if not org:
        raise ValueError("organization is required")
    return ["%s/.github" % org, "%s/%s" % (org, factory_repo)]


def plan(org, factory_repo):
    """Print targets and intent offline without importing or calling subprocess."""
    if not org:
        raise ValueError("organization is required")
    print("Offline plan for org %s:" % org)
    for target in targets(org, factory_repo):
        print("  verify/ensure %s (idempotent; requires authenticated gh)" % target)
    return 0


def _preflight():
    import shutil
    import subprocess
    if not shutil.which("gh"):
        sys.exit("gh is not in PATH: install GitHub CLI (https://cli.github.com) and run `gh auth login`.")
    if subprocess.run(["gh", "auth", "status"], capture_output=True).returncode != 0:
        sys.exit("gh is not authenticated: run `gh auth login` before provisioning organization repositories.")


def _gh(*args):
    import subprocess
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def _lookup(target):
    """Return lookup status and diagnostic text without treating errors as absence."""
    result = _gh("repo", "view", target)
    if result.returncode == 0:
        return LOOKUP_EXISTS, ""

    detail = " ".join(
        value for value in (getattr(result, "stdout", ""), getattr(result, "stderr", ""))
        if value
    ).strip()
    lowered = detail.lower()
    if any(marker in lowered for marker in _INDETERMINATE_MARKERS):
        return LOOKUP_INDETERMINATE, detail
    if any(marker in lowered for marker in _NOT_FOUND_MARKERS):
        return LOOKUP_MISSING, detail
    return LOOKUP_INDETERMINATE, detail


def _consent(target):
    try:
        return input("Create %s? [y/N] " % target).strip().lower() in ("y", "yes")
    except EOFError:
        return False  # non-interactive without --yes: fail closed toward external actions


def ensure(org, factory_repo, visibility, no_create, yes):
    _preflight()
    existing, created, skipped, missing = [], [], [], []

    for target in targets(org, factory_repo):
        status, detail = _lookup(target)
        if status == LOOKUP_EXISTS:
            print("ok: %s already exists" % target)
            existing.append(target)
            continue
        if status == LOOKUP_MISSING:
            missing.append(target)
            continue

        print("indeterminate lookup: %s (nothing created; %s)" % (target, detail or "unknown error"))
        print("No repositories will be created until every lookup is conclusive.")
        return 1

    if no_create:
        for target in missing:
            print("missing: %s (not created)" % target)
        print("Summary: existing=%d created=%d skipped=%d missing=%d" % (
            len(existing), len(created), len(skipped), len(missing)))
        return 0 if not missing else 1

    for target in list(missing):
        if not (yes or _consent(target)):
            print("skipped: %s" % target)
            skipped.append(target)
            continue
        result = _gh("repo", "create", target, "--%s" % visibility)
        if result.returncode == 0:
            print("created: %s" % target)
            created.append(target)
            missing.remove(target)
        elif "already exists" in (result.stderr or "").lower():
            print("ok: %s already exists" % target)
            existing.append(target)
            missing.remove(target)
        else:
            print("error: %s (creation failed: %s)" % (target, (result.stderr or "").strip()))
    print("Summary: existing=%d created=%d skipped=%d missing=%d" % (
        len(existing), len(created), len(skipped), len(missing)))
    return 0 if not (skipped or missing) else 1


def main():
    parser = argparse.ArgumentParser(
        description="Idempotently ensure organization repositories <org>/.github and <org>/<factory-repo> via gh.")
    parser.add_argument("--org", help="organization name (required for every action, including --plan)")
    parser.add_argument("--factory-repo", default="factory", help="factory repository name (default: factory)")
    parser.add_argument("--no-create", action="store_true", help="report only, never create")
    parser.add_argument("--yes", action="store_true", help="non-interactive; create without asking")
    parser.add_argument("--visibility", default="private", choices=["public", "private", "internal"],
                        help="creation visibility (default: private)")
    parser.add_argument("--plan", action="store_true", help="print offline plan without calling gh or the network")
    args = parser.parse_args()

    if not args.org:
        parser.error("--org is required")

    if args.plan:
        sys.exit(plan(args.org, args.factory_repo))
    sys.exit(ensure(args.org, args.factory_repo, args.visibility, args.no_create, args.yes))


if __name__ == "__main__":
    main()

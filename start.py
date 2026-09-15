#!/usr/bin/env python3
"""start.py - repository startup entrypoint. Detects state and ROUTES.

It is the FIRST command an agent runs when opening a repository: it detects the
mode (SELF / SETUP / WORK) and prints the next action. It does not execute
actions itself (not init.py, git, or any outward action); it only detects and
prints. Deterministic and offline (reads the filesystem and local git remote;
no network).

Unlike init.py, start.py is PERMANENT: it remains in every project and is not
auto-cleaned (it is not listed in init.py cleanup()).

Usage:
  python3 start.py              # detect mode and print what to do
  python3 start.py --self-check # internal routing test (assert-based, offline)

Modes:
  SELF  - the repository IS the template (archetype development).
  SETUP - uninitialized instance (placeholders.json remains).
  WORK  - initialized project (placeholders.json is absent).
"""
import argparse
import os
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_SLUG = "factory-template"
SELF, SETUP, WORK = "SELF", "SETUP", "WORK"

MESSAGES = {
    SELF: (
        "SELF mode - archetype development (this repo IS the template).\n"
        "  - DO NOT run init.py on this repo: it would consume itself.\n"
        "  - Follow MAINTAINERS.md + templates/agent-runbook.md.\n"
        "  - Next: choose the next actionable issue from the backlog\n"
        "    (gh issue list -R eff3ct0/factory-template --label type:product / Project #1)\n"
        "    and announce 'Working #<n>'."
    ),
    SETUP: (
        "SETUP mode - uninitialized instance (placeholders.json exists).\n"
        "  - Follow docs/agent-init.md; detect the stack.\n"
        "  - Run init.py with --no-clean (to verify with --check).\n"
        "  - Compose bindings + CI; ask about anything you cannot infer.\n"
        "  - No outward action without explicit approval."
    ),
    WORK: (
        "WORK mode - initialized project (placeholders.json is absent).\n"
        "  - Follow AGENT.md + templates/agent-runbook.md.\n"
        "  - Next: choose the next actionable ticket from the bound tracker\n"
        "    (docs/bindings.md) and announce 'Working <ID>'."
    ),
}


def _origin_url(root):
    """Return local `origin` URL or None when git/remote is unavailable."""
    try:
        result = subprocess.run(
            ["git", "-C", root, "remote", "get-url", "origin"],
            capture_output=True, text=True,
        )
    except OSError:
        return None  # git is not installed
    return result.stdout.strip() if result.returncode == 0 else None


def _is_template(root, origin_url):
    """Return whether the repository is the template.

    The origin basename is primary. Without an origin, MAINTAINERS.md is the
    offline sentinel that exists until init.py initializes a project.
    """
    if origin_url:
        base = origin_url.rstrip("/").rsplit("/", 1)[-1]
        if base.endswith(".git"):
            base = base[:-4]
        return base == TEMPLATE_SLUG
    return os.path.exists(os.path.join(root, "MAINTAINERS.md"))


def detect_mode(root, origin_url):
    """Route deterministically through SELF, SETUP, and WORK."""
    if _is_template(root, origin_url):
        return SELF
    if os.path.exists(os.path.join(root, "placeholders.json")):
        return SETUP
    return WORK


def self_check():
    """Test routing with simulated states (assert-based, offline)."""
    import shutil
    import tempfile

    directory = tempfile.mkdtemp()
    try:
        placeholders = os.path.join(directory, "placeholders.json")
        open(placeholders, "w").close()
        # (a) placeholders.json + factory-template origin -> SELF (SSH and HTTPS).
        assert detect_mode(directory, "git@github.com:eff3ct0/factory-template.git") == SELF
        assert detect_mode(directory, "https://github.com/eff3ct0/factory-template") == SELF
        # (b) placeholders.json + different origin -> SETUP.
        assert detect_mode(directory, "git@github.com:eff3ct0/my-service.git") == SETUP
        # Offline sentinel: no origin + placeholders.json, without MAINTAINERS -> SETUP.
        assert detect_mode(directory, None) == SETUP
        # Offline sentinel: no origin + MAINTAINERS.md -> SELF.
        maintainers = os.path.join(directory, "MAINTAINERS.md")
        open(maintainers, "w").close()
        assert detect_mode(directory, None) == SELF
        os.remove(maintainers)
        os.remove(placeholders)
        # (c) no placeholders.json -> WORK (project origin and offline).
        assert detect_mode(directory, "git@github.com:acme/app.git") == WORK
        assert detect_mode(directory, None) == WORK
        print("self-check OK")
    finally:
        shutil.rmtree(directory)


def main():
    parser = argparse.ArgumentParser(
        description="Detect repository state (SELF/SETUP/WORK) and print the next action.")
    parser.add_argument("--self-check", action="store_true",
                        help="internal routing test (assert-based, offline)")
    args = parser.parse_args()

    if args.self_check:
        self_check()
        return
    print(MESSAGES[detect_mode(ROOT, _origin_url(ROOT))])


if __name__ == "__main__":
    main()

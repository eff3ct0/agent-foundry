#!/usr/bin/env python3
"""Create or update the repository's canonical GitHub labels."""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / ".github" / "labels.json"


def load_labels(path=CATALOG):
    with path.open(encoding="utf-8") as f:
        labels = json.load(f)["labels"]
    names = [label.get("name", "") for label in labels]
    if not labels or any(not name for name in names) or len(names) != len(set(names)):
        raise ValueError("labels.json must contain unique non-empty label names")
    for label in labels:
        if not label.get("color") or not label.get("description"):
            raise ValueError("each label needs color and description")
    return labels


def sync(labels, repo=None, dry_run=False):
    if not dry_run and not shutil.which("gh"):
        raise RuntimeError("gh is not in PATH; install GitHub CLI and authenticate it")
    for label in labels:
        command = [
            "gh",
            "label",
            "create",
            label["name"],
            "--color",
            label["color"],
            "--description",
            label["description"],
            "--force",
        ]
        if repo:
            command.extend(["--repo", repo])
        if dry_run:
            print("Would run: %s" % " ".join(command))
        else:
            subprocess.run(command, check=True, cwd=ROOT)


def self_check():
    labels = load_labels()
    assert len(labels) == 10, labels
    assert len({label["name"] for label in labels}) == len(labels)
    sync(labels[:1], repo="acme/example", dry_run=True)
    print("self-check OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo", help="OWNER/REPO; otherwise gh uses the current repository"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    try:
        sync(load_labels(), repo=args.repo, dry_run=args.dry_run)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()

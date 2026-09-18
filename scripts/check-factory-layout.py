#!/usr/bin/env python3
"""Offline structural regression check for the initialized factory layout."""

import shutil
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "docs" / "factory-layout.md"

ROOT_FILES = {
    ".gitignore",
    "AGENT.md",
    "CLAUDE.md",
    "README.md",
    "start.py",
    "docs/bindings.md",
}
ROOT_DIRS = {".factory", ".github", ".opencode", ".claude", ".pi", "docs"}
APPLICATION_DIRS = {"app", "cmd", "config", "lib", "migrations", "public", "src", "test", "tests"}
TOOLCHAIN_FILES = {
    "Cargo.lock",
    "Cargo.toml",
    "Gemfile",
    "composer.json",
    "go.mod",
    "go.sum",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "pom.xml",
    "pyproject.toml",
    "requirements.txt",
    "tsconfig.json",
    "yarn.lock",
}
FACTORY_DIRS = {"checks", "docs", "hooks", "scripts", "templates"}
LEGACY_SUPPORT_DIRS = {"checks", "hooks", "scripts", "templates"}
LEGACY_SUPPORT_FILES = {
    "docs/agent-init.md",
    "docs/bootstrap.md",
    "docs/determinism.md",
    "docs/engineering-handbook.md",
    "docs/github-governance.md",
    "docs/org-factory.md",
    "docs/workflow.md",
}
GENERATED_FILES = {
    ".github/workflows/ci.yml",
    ".opencode/plugins/factory-start.ts",
    "docs/bindings.md",
}


def _relative_entries(root):
    return {path.relative_to(root).as_posix() for path in root.rglob("*")}


def check(root):
    """Return structural errors for a fresh initialized-layout fixture."""
    root = Path(root)
    entries = _relative_entries(root)
    errors = []

    for path in sorted(ROOT_FILES):
        if not (root / path).is_file():
            errors.append("required root file missing: %s" % path)
    for path in sorted(GENERATED_FILES):
        if not (root / path).is_file():
            errors.append("generated output missing: %s" % path)

    root_entries = {path.split("/", 1)[0] for path in entries}
    allowed_root_entries = ROOT_FILES | ROOT_DIRS | APPLICATION_DIRS | TOOLCHAIN_FILES
    for entry in sorted(root_entries - allowed_root_entries):
        errors.append("root path is outside the canonical allowlist: %s" % entry)
    for entry in sorted(LEGACY_SUPPORT_DIRS & root_entries):
        errors.append("factory support directory remains at root: %s" % entry)
    for path in sorted(LEGACY_SUPPORT_FILES & entries):
        errors.append("factory support file remains at root: %s" % path)

    factory = root / ".factory"
    if not factory.is_dir():
        errors.append("missing factory boundary: .factory")
    else:
        children = {path.name for path in factory.iterdir()}
        for child in sorted(FACTORY_DIRS - children):
            errors.append("missing .factory directory: .factory/%s" % child)
        for child in sorted(children - FACTORY_DIRS):
            errors.append("unexpected .factory entry: .factory/%s" % child)
        if (factory / "layout.json").exists():
            errors.append(".factory must not contain a second layout manifest")

    text = CONTRACT.read_text(encoding="utf-8")
    for path in sorted(ROOT_FILES | GENERATED_FILES):
        if "`%s`" % path not in text:
            errors.append("contract omits path: %s" % path)
    for path in sorted(".factory/" + child + "/" for child in FACTORY_DIRS):
        if path not in text:
            errors.append("contract omits directory: %s" % path)
    return errors


def _write_fixture(root):
    for path in ROOT_FILES | GENERATED_FILES:
        path = root / path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture\n", encoding="utf-8")
    for directory in ROOT_DIRS | APPLICATION_DIRS:
        (root / directory).mkdir(parents=True, exist_ok=True)
    for directory in FACTORY_DIRS:
        path = root / ".factory" / directory
        path.mkdir(parents=True, exist_ok=True)
        (path / "fixture.txt").write_text("fixture\n", encoding="utf-8")
    (root / "src" / "main.py").write_text("# application fixture\n", encoding="utf-8")


def self_check():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        assert check(root) == []

        (root / "scripts").mkdir()
        errors = check(root)
        assert any("remains at root: scripts" in error for error in errors), errors
        shutil.rmtree(root / "scripts")

        (root / "docs" / "workflow.md").write_text("fixture\n", encoding="utf-8")
        errors = check(root)
        assert any("support file remains at root: docs/workflow.md" in error for error in errors), errors
        (root / "docs" / "workflow.md").unlink()

        shutil.rmtree(root / ".factory" / "templates")
        errors = check(root)
        assert any("missing .factory directory: .factory/templates" in error for error in errors), errors
        (root / ".factory" / "templates").mkdir()

        (root / ".factory" / "layout.json").write_text("{}\n", encoding="utf-8")
        errors = check(root)
        assert any("second layout manifest" in error for error in errors), errors
    print("factory layout structural self-check OK")


if __name__ == "__main__":
    self_check()

#!/usr/bin/env python3
"""Archetype initializer: fills <PLACEHOLDER> values from the manifest
(placeholders.json). Python 3, stdlib only.

Usage:
  python3 init.py                       # interactive (asks for each placeholder)
  python3 init.py --defaults            # use manifest defaults, do not ask
  python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='pytest -q'
  python3 init.py --answers answers.json
  python3 init.py --check               # check for remaining manifest placeholders (CI; nonzero if any)
  python3 init.py --dry-run             # show changes without writing
  python3 init.py --self-check          # internal replacement test
Options: --no-clean (do not remove init.py/placeholders.json/factory_bootstrap.py/MAINTAINERS.md/docs/smoke-test.md/ci/providers/ at the end),
         --no-ci (do not compose the CI workflow).

Value precedence: --set  >  --answers  >  interactive prompt  >  manifest default.
Only manifest keys are replaced. Local template tokens (<TICKET_ID>, <CRITERION_1>,
<DATE>, <NNN>, ...) remain for filling when each template is used. A key without
a value is NOT touched (it remains <KEY> and --check reports it), not deleted.

FACTORY_REQUIRED policy: when FACTORY_REQUIRED=true, init.py fails closed (deterministic,
offline) if FACTORY_SPEC is empty. init.py does NOT verify or create org repositories:
actual provisioning is handled separately by `factory_bootstrap.py` (idempotent, uses `gh`).

CI composition: when CI_SYSTEM is GitHub Actions and CI_STACKS contains ecosystems
(comma-separated: rust, typescript, python, go), compose .github/workflows/ci.yml
by mapping each stack to its ci/recipes.json recipe (one job per language).

Binding composition: TASK_TRACKER and SECRETS_PROVIDER (enums) select catalog
fragments from providers/ (task/ and secrets/) and compose docs/bindings.md, the
project's binding contract. CODE_INTELLIGENCE is optional and defaults to none;
when selected, its provider fragment is composed too. The abstract shapes are in
the relevant providers/*/_contract.md files; _contract.md is never selected.
Composition happens BEFORE apply_values so tokens (<TRACKER_KEY>,
<SECRETS_PATH>, ...) are filled inside the newly written bindings.md.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(ROOT, "placeholders.json")
SELF = os.path.basename(__file__)
SKIP_DIRS = {".git"}
SKIP_ROOT_FILES = {SELF, "placeholders.json"}

TRACKER_DISPLAY = {
    "jira": "Jira",
    "github-issues": "GitHub Issues",
    "github-projects": "GitHub Projects",
    "linear": "Linear",
     "custom": "(custom)",
}
BINDINGS_HEADER = (
    "# Bindings - mandatory project providers\n\n"
    "These bindings are mandatory for every agent, regardless of harness.\n"
    "The shape of each instance is defined by providers/task/_contract.md, "
    "providers/secrets/_contract.md, and providers/code-intel/_contract.md when selected; "
    "the harness provides access and the binding provides the rules.\n"
)


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)["placeholders"]


def token(key):
    return "<%s>" % key


def iter_text_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if dirpath == root and name in SKIP_ROOT_FILES:
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8") as f:
                    yield path, f.read()
            except (UnicodeDecodeError, OSError, IsADirectoryError):
                continue


def apply_values(root, values, dry_run=False):
    """Replace <KEY> with its value in every text file. `values` contains only
    non-empty values. Return {path: number of tokens replaced}."""
    changes = {}
    for path, text in iter_text_files(root):
        n = sum(text.count(token(k)) for k in values)
        if not n:
            continue
        new = text
        for key, val in values.items():
            new = new.replace(token(key), val)
        changes[path] = n
        if not dry_run:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
    return changes


def remaining(root, keys):
    found = {}
    for _, text in iter_text_files(root):
        for key in keys:
            c = text.count(token(key))
            if c:
                found[key] = found.get(key, 0) + c
    return found


def gather(ph, args):
    cli = {}
    for pair in args.set or []:
        if "=" not in pair:
            sys.exit("--set expects KEY=VALUE, received: %r" % pair)
        k, v = pair.split("=", 1)
        cli[k.strip()] = v
    answers = {}
    if args.answers:
        with open(args.answers, encoding="utf-8") as f:
            answers = json.load(f)
    values = {}
    for p in ph:
        key = p["key"]
        default = p.get("default", "")
        if key in cli:
            val = cli[key]
        elif key in answers:
            val = str(answers[key])
        elif args.defaults:
            val = default
        else:
            kind = p.get("kind", "")
            shown = default if default else "(empty)"
            prompt = "%s%s\n  %s\n  [%s] > " % (
                key, (" [%s]" % kind if kind else ""), p.get("prompt", ""), shown)
            try:
                raw = input(prompt).strip()
            except EOFError:
                raw = ""
            val = raw if raw else default
        enum = p.get("enum")
        if enum and val and val not in enum:
            sys.exit("Invalid value for %s: %s. Options: %s" % (key, val, ", ".join(enum)))
        values[key] = val
    missing = [p["key"] for p in ph if p.get("required") and not values.get(p["key"])]
    if missing:
        sys.exit("Missing required placeholders: %s" % ", ".join(missing))
    return values


def parse_stacks(value):
    """Convert comma-separated CI_STACKS into a lowercased list without blanks."""
    return [s.strip().lower() for s in (value or "").split(",") if s.strip()]


def compose_ci(root, stacks, ci_system, dry_run):
    """Compose .github/workflows/ci.yml by mapping each stack to its recipe in
    ci/recipes.json (next to the script). Return (stacks_ok, unknown)."""
    if "github" not in (ci_system or "").lower():
        print("CI composition is supported only for GitHub Actions; "
              "CI_SYSTEM=%s - skipped" % ci_system)
        return
    with open(os.path.join(root, "ci", "recipes.json"), encoding="utf-8") as f:
        recipes = json.load(f)
    ok, unknown, blocks = [], [], []
    for s in stacks:
        if s in recipes:
            ok.append(s)
            blocks.append(recipes[s])
        else:
            unknown.append(s)
    if unknown:
        print("No CI recipe for: %s" % ", ".join(unknown))
    if not blocks:
        print("No stack has a CI recipe; skipping composition.")
        return ok, unknown
    content = "name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n" + "\n".join(blocks) + "\n"
    ok_str = ", ".join(ok)
    if dry_run:
        print("Would compose .github/workflows/ci.yml with jobs: %s" % ok_str)
        return ok, unknown
    wf_dir = os.path.join(root, ".github", "workflows")
    os.makedirs(wf_dir, exist_ok=True)
    with open(os.path.join(wf_dir, "ci.yml"), "w", encoding="utf-8") as f:
        f.write(content)
    print("CI composed: .github/workflows/ci.yml (jobs: %s)" % ok_str)
    return ok, unknown


def _binding_fragment(root, capability, name):
    """Return providers/<capability>/<name>.md; if missing, warn and fall back
    to that capability's custom.md. `_contract.md` is never selectable."""
    frag = os.path.join(root, "providers", capability, "%s.md" % name)
    if name != "_contract" and os.path.exists(frag):
        return frag
    fallback = os.path.join(root, "providers", capability, "custom.md")
    if os.path.exists(fallback):
        print("No fragment providers/%s/%s.md; using custom.md as fallback." % (capability, name))
        return fallback
    return None


def compose_bindings(root, task_tracker, secrets_provider, dry_run=False, code_intelligence=None):
    """Compose docs/bindings.md from selected provider fragments.

    Code intelligence is optional; ``none`` leaves no provider fragment in the
    generated contract so projects do not acquire an implicit dependency.
    """
    secrets_provider = secrets_provider or "none"
    code_intelligence = code_intelligence or "none"
    if dry_run:
        message = "Would compose docs/bindings.md (tasks: %s, secrets: %s)" % (
            task_tracker, secrets_provider)
        if code_intelligence != "none":
            message = message[:-1] + ", code-intelligence: %s)" % code_intelligence
        print(message)
        return []
    used, parts = [], [BINDINGS_HEADER]
    for capability, name in (("task", task_tracker), ("secrets", secrets_provider)):
        frag = _binding_fragment(root, capability, name)
        if not frag:
            sys.exit("No providers/%s/%s.md fragment or custom.md fallback exists." % (capability, name))
        used.append(frag)
        with open(frag, encoding="utf-8") as f:
            parts.append(f.read().rstrip() + "\n")
    if code_intelligence != "none":
        frag = _binding_fragment(root, "code-intel", code_intelligence)
        if not frag:
            sys.exit("No providers/code-intel/%s.md fragment or custom.md fallback exists." % code_intelligence)
        used.append(frag)
        with open(frag, encoding="utf-8") as f:
            parts.append(f.read().rstrip() + "\n")
    docs_dir = os.path.join(root, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, "bindings.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    print("Bindings composed: docs/bindings.md (tasks: %s, secrets: %s, code-intelligence: %s)" % (
        task_tracker, secrets_provider, code_intelligence))
    return used


def cleanup(root):
    removed = []
    for f in (SELF, "placeholders.json", "factory_bootstrap.py", "MAINTAINERS.md"):
        p = os.path.join(root, f)
        if os.path.exists(p):
            os.remove(p)
            removed.append(f)
    # Nested self-governance file for THIS repo; it does not travel downstream.
    smoke = os.path.join(root, "docs", "smoke-test.md")
    if os.path.exists(smoke):
        os.remove(smoke)
        removed.append("docs/smoke-test.md")
    for d in ("ci", "providers"):
        dp = os.path.join(root, d)
        if os.path.isdir(dp):
            shutil.rmtree(dp)
            removed.append(d + "/")
    return removed


def self_check():
    d = tempfile.mkdtemp()
    try:
        fp = os.path.join(d, "x.md")
        with open(fp, "w", encoding="utf-8") as f:
            f.write("Project <PROJECT_NAME>, test <TEST_CMD>, intact <OTHER>.")
        changes = apply_values(d, {"PROJECT_NAME": "Foo/Bar & Co", "TEST_CMD": "pytest -q"})
        out = open(fp, encoding="utf-8").read()
        assert "Foo/Bar & Co" in out and "pytest -q" in out, out
        assert "<PROJECT_NAME>" not in out and "<TEST_CMD>" not in out, out
        assert "<OTHER>" in out, "keys outside the set must remain untouched"
        assert changes.get(fp) == 2, changes
        assert remaining(d, ["PROJECT_NAME", "OTHER"]) == {"OTHER": 1}, "per-key check"

        dry_fp = os.path.join(d, "README.md")
        with open(dry_fp, "w", encoding="utf-8") as f:
            f.write("# <PROJECT_NAME>\n")
        dry_changes = apply_values(d, {"PROJECT_NAME": "Example"}, dry_run=True)
        assert dry_changes.get(dry_fp) == 1, dry_changes
        assert open(dry_fp, encoding="utf-8").read() == "# <PROJECT_NAME>\n"

        d2 = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(d2, "ci"))
            with open(os.path.join(d2, "ci", "recipes.json"), "w", encoding="utf-8") as f:
                json.dump({"aa": "  aa:\n    runs-on: x", "bb": "  bb:\n    runs-on: y"}, f)
            ok, unknown = compose_ci(d2, ["aa", "cc", "bb"], "GitHub Actions", dry_run=False)
            wf = open(os.path.join(d2, ".github", "workflows", "ci.yml"), encoding="utf-8").read()
            assert "name: CI" in wf, wf
            assert "jobs:" in wf, wf
            assert "  aa:" in wf and "  bb:" in wf, wf
            assert ok == ["aa", "bb"], ok
            assert unknown == ["cc"], unknown
        finally:
            shutil.rmtree(d2)

        d3 = tempfile.mkdtemp()
        try:
            for cap, name, body in (
                ("task", "foo", "## Foo\nTasks in Foo."),
                ("secrets", "none", "## No manager\nNo real secrets."),
                ("code-intel", "codegraph", "## CodeGraph\nStructural index."),
            ):
                os.makedirs(os.path.join(d3, "providers", cap), exist_ok=True)
                with open(os.path.join(d3, "providers", cap, "%s.md" % name), "w", encoding="utf-8") as f:
                    f.write(body)
            used = compose_bindings(d3, "foo", "none", dry_run=False)
            bind = open(os.path.join(d3, "docs", "bindings.md"), encoding="utf-8").read()
            assert "# Bindings - mandatory project providers" in bind, bind
            assert "providers/task/_contract.md" in bind, bind
            assert "providers/secrets/_contract.md" in bind, bind
            assert "Tasks in Foo." in bind and "No real secrets." in bind, bind
            assert len(used) == 2, used

            used = compose_bindings(d3, "foo", "none", dry_run=False, code_intelligence="codegraph")
            bind = open(os.path.join(d3, "docs", "bindings.md"), encoding="utf-8").read()
            assert "Structural index." in bind, bind
            assert len(used) == 3, used

            with open(os.path.join(d3, "providers", "task", "_contract.md"), "w", encoding="utf-8") as f:
                f.write("MUST NOT BE COMPOSED")
            with open(os.path.join(d3, "providers", "task", "custom.md"), "w", encoding="utf-8") as f:
                f.write("CUSTOM FALLBACK")
            assert _binding_fragment(d3, "task", "_contract").endswith("custom.md")
        finally:
            shutil.rmtree(d3)

        print("self-check OK")
    finally:
        shutil.rmtree(d)


def main():
    ap = argparse.ArgumentParser(description="Initialize the archetype by filling placeholders.")
    ap.add_argument("--set", action="append", metavar="KEY=VALUE")
    ap.add_argument("--answers", metavar="FILE.json")
    ap.add_argument("--defaults", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-clean", action="store_true")
    ap.add_argument("--no-ci", action="store_true")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        self_check()
        return

    ph = load_manifest()
    keys = [p["key"] for p in ph]

    if args.check:
        rem = remaining(ROOT, keys)
        if rem:
            print("Unresolved manifest placeholders:")
            for k, c in sorted(rem.items(), key=lambda kv: -kv[1]):
                print("  %s x%d" % (k, c))
            sys.exit(1)
        print("OK: 0 pending manifest placeholders.")
        return

    values = gather(ph, args)
    # Deterministic offline prerequisite: a required factory must have FACTORY_SPEC.
    if str(values.get("FACTORY_REQUIRED", "")).strip().lower() == "true" and not values.get("FACTORY_SPEC", "").strip():
        sys.exit("FACTORY_REQUIRED=true but FACTORY_SPEC is empty: declare the organization baseline (e.g. org/factory@v1) before initialization.")
    task_tracker = values.get("TASK_TRACKER", "")
    if not values.get("TRACKER") and task_tracker:
        values["TRACKER"] = TRACKER_DISPLAY.get(task_tracker, task_tracker)
    # Compose BEFORE apply_values so tokens in the newly written bindings.md are filled.
    if task_tracker:
        compose_bindings(
            ROOT,
            task_tracker,
            values.get("SECRETS_PROVIDER", ""),
            dry_run=args.dry_run,
            code_intelligence=values.get("CODE_INTELLIGENCE", "none"),
        )
    stacks = parse_stacks(values.get("CI_STACKS", ""))
    if not args.no_ci and stacks:
        compose_ci(ROOT, stacks, values.get("CI_SYSTEM", ""), args.dry_run)
    nonempty = {k: v for k, v in values.items() if v}
    changes = apply_values(ROOT, nonempty, dry_run=args.dry_run)
    total = sum(changes.values())
    print("%d placeholders %s in %d file(s)." % (
        total, "would change" if args.dry_run else "replaced", len(changes)))
    for p in sorted(changes):
        print("  %s" % os.path.relpath(p, ROOT))
    rem = remaining(ROOT, keys)
    if rem:
        print("Still unresolved (empty or omitted): %s" % ", ".join(sorted(rem)))
    if args.dry_run:
        print("(dry-run: nothing was written)")
        return
    if not args.no_clean:
        removed = cleanup(ROOT)
        if removed:
            print("Cleanup: removed %s." % ", ".join(removed))
        print("To start with a separate history: rm -rf .git && git init")
    print("Ready. Review the files and make the project's first commit.")


if __name__ == "__main__":
    main()

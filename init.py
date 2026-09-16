#!/usr/bin/env python3
"""Archetype initializer: fills <PLACEHOLDER> values from the manifest
(placeholders.json). Python 3, stdlib only.

Usage:
  python3 init.py                       # interactive (asks for each placeholder)
  python3 init.py --defaults            # use manifest defaults, do not ask
  python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='pytest -q'
  python3 init.py --answers answers.json
  python3 init.py --check               # check required manifest placeholders (CI; nonzero if any)
  python3 init.py --dry-run             # show changes without writing
  python3 init.py --self-check          # internal replacement test
Options: --no-clean (do not remove archetype-only paths at the end),
         --no-ci (do not compose the CI workflow).

Value precedence: --set  >  --answers  >  interactive prompt  >  manifest default.
Only manifest keys are replaced. Local template tokens (<TICKET_ID>, <CRITERION_1>,
<DATE>, <NNN>, ...) remain for filling when each template is used. A key without
a value is NOT touched (it remains <KEY> and required keys are reported by
--check), not deleted. Optional keys may remain intentionally empty.

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
import re
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(ROOT, "placeholders.json")
SELF = os.path.basename(__file__)
SKIP_DIRS = {".git"}
SKIP_ROOT_FILES = {SELF, "placeholders.json"}
PROTECTED_VALIDATION_PREFIX = "scripts/check-"

ARCHETYPE_ONLY_PATHS = (
    SELF,
    "placeholders.json",
    "factory_bootstrap.py",
    "MAINTAINERS.md",
    "docs/smoke-test.md",
    "ci",
    "providers",
    # Release E2E and triage paths are added by the archetype repository and
    # are intentionally absent from older template revisions.
    ".github/workflows/bootstrap-e2e.yml",
    "scripts/bootstrap-e2e.py",
    "scripts/check-bootstrap-workflow.py",
    "scripts/release_ref.py",
    "scripts/report-bootstrap-failure.py",
    "scripts/triage-bootstrap-failure.py",
    "scripts/test-bootstrap-triage.py",
)

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
    "The shape of each instance is defined by:\n"
    "- [`providers/task/_contract.md`](../providers/task/_contract.md)\n"
    "- [`providers/secrets/_contract.md`](../providers/secrets/_contract.md)\n"
    "- [`providers/code-intel/_contract.md`](../providers/code-intel/_contract.md) when selected\n"
    "- [`ci/_contract.md`](../ci/_contract.md)\n"
    "The harness provides access and the binding provides the rules.\n\n"
    "## Protected `status:approved` gate\n"
    "The bound task provider may support delegated approval only through its "
    "fail-closed protocol: a current direct human instruction must name the exact "
    "issue and add status:approved; target-host evidence must bind that principal "
    "to maintainer/authorized-approver authority; the authenticated actor must "
    "have MAINTAIN or ADMIN; and exactly one scoped add attempt must be followed "
    "by target-host readback. Any mismatch, stale/ambiguous/missing instruction, "
    "insufficient permission, failed/unknown mutation, or readback mismatch stops "
    "the operation. Without that evidence, the human applies the label directly. "
    "This contract change does not approve existing work.\n"
)


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)["placeholders"]


def token(key):
    return "<%s>" % key


def _is_protected_validation_source(path, root):
    relative = os.path.relpath(path, root).replace(os.sep, "/")
    return relative.startswith(PROTECTED_VALIDATION_PREFIX)


def iter_text_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if dirpath == root and name in SKIP_ROOT_FILES:
                continue
            path = os.path.join(dirpath, name)
            if _is_protected_validation_source(path, root):
                continue
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
        if not dry_run and new != text:
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


def _rebase_links(text, source, destination):
    """Rebase relative fragment links for the generated bindings document."""
    source_dir = os.path.dirname(source)
    destination_dir = os.path.dirname(destination)

    def replace(match):
        target = match.group(2)
        if target.startswith(("#", "/")) or "://" in target:
            return match.group(0)
        path, separator, anchor = target.partition("#")
        if not path:
            return match.group(0)
        rebased = os.path.relpath(
            os.path.normpath(os.path.join(source_dir, path)), destination_dir
        ).replace(os.sep, "/")
        if separator:
            rebased += "#" + anchor
        return match.group(1) + rebased

    return re.sub(r"(\]\()([^\s)]+)", replace, text)


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
    """Parse CI_STACKS and reject malformed or duplicate selections."""
    if not (value or "").strip():
        return []
    return _validate_stack_list(value.split(","))


def _validate_stack_list(stacks):
    normalized = []
    seen = set()
    for position, raw in enumerate(stacks, 1):
        stack = raw.strip().lower()
        if not stack:
            raise ValueError(
                "Invalid CI_STACKS: empty selection at position %d; "
                "use comma-separated stack names." % position
            )
        if stack in seen:
            raise ValueError("Invalid CI_STACKS: duplicate stack '%s'." % stack)
        seen.add(stack)
        normalized.append(stack)
    return normalized


def _workflow_path(root):
    return os.path.join(root, ".github", "workflows", "ci.yml")


def _remove_generated_workflow(root, dry_run):
    path = _workflow_path(root)
    if not os.path.exists(path):
        return False
    if dry_run:
        print("Would remove stale generated CI workflow: .github/workflows/ci.yml")
    else:
        os.remove(path)
        print("Removed stale generated CI workflow: .github/workflows/ci.yml")
    return True


def compose_ci(root, stacks, ci_system, dry_run):
    """Compose one GitHub Actions job per validated stack.

    Invalid selections fail before writing the workflow. Empty selections and
    non-GitHub CI systems remove any stale generated workflow.
    """
    if "github" not in (ci_system or "").lower():
        _remove_generated_workflow(root, dry_run)
        print("CI composition is supported only for GitHub Actions; "
              "CI_SYSTEM=%s - skipped" % ci_system)
        return [], []
    with open(os.path.join(root, "ci", "recipes.json"), encoding="utf-8") as f:
        recipes = json.load(f)
    try:
        ok = _validate_stack_list(stacks)
        unknown = [s for s in ok if s not in recipes]
        if unknown:
            supported = ", ".join(sorted(recipes))
            raise ValueError(
                "Invalid CI_STACKS: unknown stack(s): %s. Supported stacks: %s."
                % (", ".join(unknown), supported)
            )
    except ValueError:
        _remove_generated_workflow(root, dry_run)
        raise
    if not ok:
        _remove_generated_workflow(root, dry_run)
        print("No CI stacks selected; no GitHub Actions workflow generated.")
        return [], []
    blocks = [recipes[s] for s in ok]
    content = "name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n" + "\n".join(blocks) + "\n"
    ok_str = ", ".join(ok)
    if dry_run:
        print("Would compose .github/workflows/ci.yml with jobs: %s" % ok_str)
        return ok, unknown
    wf_dir = os.path.join(root, ".github", "workflows")
    os.makedirs(wf_dir, exist_ok=True)
    workflow = _workflow_path(root)
    changed = not os.path.exists(workflow)
    if not changed:
        with open(workflow, encoding="utf-8") as f:
            changed = f.read() != content
    if changed:
        with open(workflow, "w", encoding="utf-8") as f:
            f.write(content)
    print("CI %s: .github/workflows/ci.yml (jobs: %s)" % (
        "composed" if changed else "already current", ok_str))
    return ok, []


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
            parts.append(_rebase_links(
                f.read().rstrip(), frag, os.path.join(root, "docs", "bindings.md")
            ) + "\n")
    if code_intelligence != "none":
        frag = _binding_fragment(root, "code-intel", code_intelligence)
        if not frag:
            sys.exit("No providers/code-intel/%s.md fragment or custom.md fallback exists." % code_intelligence)
        used.append(frag)
        with open(frag, encoding="utf-8") as f:
            parts.append(_rebase_links(
                f.read().rstrip(), frag, os.path.join(root, "docs", "bindings.md")
            ) + "\n")
    docs_dir = os.path.join(root, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    bindings = os.path.join(docs_dir, "bindings.md")
    content = "\n".join(parts)
    changed = not os.path.exists(bindings)
    if not changed:
        with open(bindings, encoding="utf-8") as f:
            changed = f.read() != content
    if changed:
        with open(bindings, "w", encoding="utf-8") as f:
            f.write(content)
    print("Bindings %s: docs/bindings.md (tasks: %s, secrets: %s, code-intelligence: %s)" % (
        "composed" if changed else "already current",
        task_tracker, secrets_provider, code_intelligence))
    return used


def cleanup(root):
    removed = []
    for relative in ARCHETYPE_ONLY_PATHS:
        path = os.path.join(root, relative)
        if os.path.isdir(path):
            shutil.rmtree(path)
            removed.append(relative + "/")
        elif os.path.isfile(path):
            os.remove(path)
            removed.append(relative)
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
            ok, unknown = compose_ci(d2, ["aa", "bb"], "GitHub Actions", dry_run=False)
            workflow = os.path.join(d2, ".github", "workflows", "ci.yml")
            wf = open(workflow, encoding="utf-8").read()
            assert "name: CI" in wf, wf
            assert "jobs:" in wf, wf
            assert "  aa:" in wf and "  bb:" in wf, wf
            assert ok == ["aa", "bb"], ok
            assert unknown == [], unknown
            assert wf.count("  aa:\n") == 1 and wf.count("  bb:\n") == 1, wf

            first = wf
            compose_ci(d2, ["aa", "bb"], "GitHub Actions", dry_run=False)
            assert open(workflow, encoding="utf-8").read() == first

            with open(workflow, "w", encoding="utf-8") as f:
                f.write("stale\n")
            try:
                compose_ci(d2, ["aa", "cc"], "GitHub Actions", dry_run=False)
            except ValueError as exc:
                assert "unknown stack(s): cc" in str(exc), exc
            else:
                raise AssertionError("unknown stacks must fail")
            assert not os.path.exists(workflow), "unknown stack preserved stale workflow"

            with open(workflow, "w", encoding="utf-8") as f:
                f.write("stale\n")
            try:
                compose_ci(d2, ["aa", "aa"], "GitHub Actions", dry_run=False)
            except ValueError as exc:
                assert "duplicate stack 'aa'" in str(exc), exc
            else:
                raise AssertionError("duplicate stacks must fail")
            assert not os.path.exists(workflow), "duplicate stack preserved stale workflow"

            with open(workflow, "w", encoding="utf-8") as f:
                f.write("stale\n")
            assert compose_ci(d2, [], "GitHub Actions", dry_run=False) == ([], [])
            assert not os.path.exists(workflow), "empty selection preserved stale workflow"

            try:
                parse_stacks("aa,,bb")
            except ValueError as exc:
                assert "empty selection" in str(exc), exc
            else:
                raise AssertionError("empty stack entries must fail")

            with open(workflow, "w", encoding="utf-8") as f:
                f.write("stale\n")
            assert compose_ci(d2, ["aa"], "GitLab CI", dry_run=False) == ([], [])
            assert not os.path.exists(workflow), "unsupported CI preserved stale workflow"
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

        d4 = tempfile.mkdtemp()
        try:
            directories = {"ci", "providers"}
            for relative in ARCHETYPE_ONLY_PATHS:
                path = os.path.join(d4, relative)
                if relative in directories:
                    os.makedirs(path, exist_ok=True)
                    path = os.path.join(path, "fixture.txt")
                else:
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write("archetype-only fixture")

            inherited = {
                "AGENT.md": "# Agent\n",
                "README.md": "# Example project\n",
                ".github/workflows/ci.yml": "name: CI\n",
                "docs/bindings.md": "# Bindings\n",
                "scripts/check-determinism.py": "print('retained')\n",
            }
            for relative, content in inherited.items():
                path = os.path.join(d4, relative)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)

            removed = cleanup(d4)
            expected = {
                relative + "/" if relative in directories else relative
                for relative in ARCHETYPE_ONLY_PATHS
            }
            assert set(removed) == expected, removed
            assert all(not os.path.exists(os.path.join(d4, relative))
                       for relative in ARCHETYPE_ONLY_PATHS)
            assert all(os.path.exists(os.path.join(d4, relative))
                       for relative in inherited)
        finally:
            shutil.rmtree(d4)

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
    required_keys = [p["key"] for p in ph if p.get("required")]

    if args.check:
        rem = remaining(ROOT, required_keys)
        if rem:
            print("Unresolved required manifest placeholders:")
            for k, c in sorted(rem.items(), key=lambda kv: -kv[1]):
                print("  %s x%d" % (k, c))
            sys.exit(1)
        print("OK: 0 pending required manifest placeholders.")
        return

    values = gather(ph, args)
    # Deterministic offline prerequisite: a required factory must have FACTORY_SPEC.
    if str(values.get("FACTORY_REQUIRED", "")).strip().lower() == "true" and not values.get("FACTORY_SPEC", "").strip():
        sys.exit("FACTORY_REQUIRED=true but FACTORY_SPEC is empty: declare the organization baseline (e.g. org/factory@v1) before initialization.")
    task_tracker = values.get("TASK_TRACKER", "")
    if not values.get("TRACKER") and task_tracker:
        values["TRACKER"] = TRACKER_DISPLAY.get(task_tracker, task_tracker)
    if not args.no_ci:
        try:
            stacks = parse_stacks(values.get("CI_STACKS", ""))
            compose_ci(ROOT, stacks, values.get("CI_SYSTEM", ""), args.dry_run)
        except ValueError as exc:
            _remove_generated_workflow(ROOT, args.dry_run)
            sys.exit(str(exc))
    # Compose BEFORE apply_values so tokens in the newly written bindings.md are filled.
    if task_tracker:
        compose_bindings(
            ROOT,
            task_tracker,
            values.get("SECRETS_PROVIDER", ""),
            dry_run=args.dry_run,
            code_intelligence=values.get("CODE_INTELLIGENCE", "none"),
        )
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

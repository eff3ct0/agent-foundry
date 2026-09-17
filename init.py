#!/usr/bin/env python3
"""Archetype initializer: fills <PLACEHOLDER> values from the manifest
(placeholders.json). Python 3, stdlib only.

Usage:
  python3 init.py                       # interactive (asks for each placeholder)
  python3 init.py --defaults --confirm  # use manifest proposals after confirmation
  python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='pytest -q' --confirm
  python3 init.py --answers answers.json # answers.json must contain "confirm": true
  python3 init.py --check               # check required manifest placeholders (CI; nonzero if any)
  python3 init.py --dry-run             # show changes without writing
  python3 init.py --self-check          # internal replacement test
Options: --no-clean (do not remove the ownership manifest's removed paths at the end),
         --no-ci (do not compose the CI workflow).

Value precedence: --set  >  --answers  >  interactive prompt  >  manifest default.
Every normal run presents the resulting proposals before writing. Interactive runs
require a final yes/no confirmation; non-interactive runs require --confirm or a
JSON boolean "confirm": true in the answers file. Manifest defaults and existing
AGENT.md values are proposals, never consent.
Only manifest keys are replaced. Local template tokens (<TICKET_ID>, <CRITERION_1>,
<DATE>, <NNN>, ...) remain for filling when each template is used. A key without
a value is NOT touched (it remains <KEY> and required keys are reported by
--check), not deleted. Optional keys may remain intentionally empty.

The optional OpenCode startup plugin is generated only when the confirmed
OPENCODE_PLUGIN value is true. The manual `python3 start.py` fallback remains
available when it is false.

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
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(ROOT, "placeholders.json")
OWNERSHIP_MANIFEST_NAME = "archetype-ownership.json"
OWNERSHIP_MANIFEST = os.path.join(ROOT, OWNERSHIP_MANIFEST_NAME)
SELF = os.path.basename(__file__)
SKIP_DIRS = {".git"}
SKIP_ROOT_FILES = {SELF, "placeholders.json", OWNERSHIP_MANIFEST_NAME}
PROTECTED_VALIDATION_PREFIX = "scripts/check-"
OPENCODE_PLUGIN_SOURCE = os.path.join("hooks", "opencode", "factory-start.ts")
OPENCODE_PLUGIN_DESTINATION = os.path.join(".opencode", "plugins", "factory-start.ts")

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


def load_ownership(path=OWNERSHIP_MANIFEST):
    with open(path, encoding="utf-8") as f:
        ownership = json.load(f)
    if ownership.get("schema_version") != 1:
        raise ValueError("unsupported archetype ownership manifest version")
    categories = ownership.get("categories")
    if not isinstance(categories, dict) or not categories:
        raise ValueError("ownership manifest must define categories")
    seen = set()
    for category, definition in categories.items():
        if definition.get("disposition") not in {"removed", "inherited", "generated"}:
            raise ValueError("invalid ownership disposition for %s" % category)
        paths = definition.get("paths")
        if not isinstance(paths, list) or not paths:
            raise ValueError("ownership category %s must define paths" % category)
        for entry in paths:
            relative = entry.get("path")
            if (not isinstance(relative, str) or not relative or os.path.isabs(relative)
                    or ".." in relative.split(os.sep)):
                raise ValueError("invalid ownership path: %r" % relative)
            if entry.get("kind") not in {"file", "directory"}:
                raise ValueError("invalid ownership kind for %s" % relative)
            if relative in seen:
                raise ValueError("ownership path appears more than once: %s" % relative)
            seen.add(relative)
    return ownership


def ownership_entries(ownership=None):
    ownership = ownership or load_ownership()
    return [
        (category, definition["disposition"], entry)
        for category, definition in ownership["categories"].items()
        for entry in definition["paths"]
    ]


def archetype_only_paths(path=OWNERSHIP_MANIFEST):
    ownership = load_ownership(path)
    return tuple(
        entry["path"]
        for _, disposition, entry in ownership_entries(ownership)
        if disposition == "removed"
    )


# Compatibility name for callers that need the source checkout's contract.
ARCHETYPE_ONLY_PATHS = archetype_only_paths()


def token(key):
    return "<%s>" % key


def _origin_url(root):
    """Return the local origin URL, or None when Git metadata is unavailable."""
    try:
        result = subprocess.run(
            ["git", "-C", root, "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def _repository_identity(value):
    value = (value or "").strip(" `").rstrip("/")
    if not value or value.startswith("<"):
        return None
    if value.startswith("git@") and ":" in value:
        host, path = value[4:].split(":", 1)
    else:
        parsed = urlsplit(value if "://" in value else "https://github.com/" + value)
        host, path = parsed.hostname or parsed.netloc, parsed.path
    path = path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not host or not path:
        return None
    return "%s/%s" % (host.lower(), path.lower())


def _repository_matches(value, origin):
    origin_identity = _repository_identity(origin)
    if not origin_identity:
        return True
    identities = [
        _repository_identity(candidate)
        for candidate in re.split(r"[\s,]+", value or "")
        if _repository_identity(candidate)
    ]
    return not identities or origin_identity in identities


def _declared_repository_url(root):
    path = os.path.join(root, "AGENT.md")
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return ""
    match = re.search(r"Repositories:\s*([^\n]+)", text, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _replace_declared_repository_url(root, value, dry_run):
    path = os.path.join(root, "AGENT.md")
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return
    updated, count = re.subn(
        r"(Repositories:\s*)[^\n]+",
        lambda match: match.group(1) + value,
        text,
        count=1,
        flags=re.IGNORECASE,
    )
    if not count or updated == text:
        return
    if dry_run:
        print("Would update stale repository metadata in AGENT.md.")
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
        print("Updated repository metadata in AGENT.md.")


def reconcile_repository_metadata(root, values, dry_run=False, confirm=None, apply=True):
    """Require confirmation before replacing repository metadata that disagrees with origin."""
    origin = _origin_url(root)
    declared = _declared_repository_url(root)
    selected = (values.get("REPO_URLS") or "").strip()
    stale = (selected and not _repository_matches(selected, origin)) or (
        not selected and declared and not _repository_matches(declared, origin)
    )
    declared_stale = declared and not _repository_matches(declared, origin)
    if not origin or not stale:
        if origin and declared_stale and selected:
            values["REPO_URLS"] = origin
            if apply:
                _replace_declared_repository_url(root, origin, dry_run)
        return
    if dry_run:
        values["REPO_URLS"] = origin
        _replace_declared_repository_url(root, origin, dry_run)
        return
    if confirm is None:
        confirm = _confirm_repository
    if not confirm(
        "Repository metadata conflicts with Git origin (%s vs %s). "
        "Replace it with the actual origin? [y/N] " % (declared or selected, origin)
    ):
        sys.exit("Repository metadata conflict requires explicit confirmation.")
    values["REPO_URLS"] = origin
    if apply:
        _replace_declared_repository_url(root, origin, dry_run)


def _confirm_repository(prompt):
    try:
        return input(prompt).strip().lower() in ("y", "yes")
    except EOFError:
        return False


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
    unknown = set(cli) - {p["key"] for p in ph}
    if unknown:
        sys.exit("Unknown --set keys: %s" % ", ".join(sorted(unknown)))
    answers = {}
    if args.answers:
        with open(args.answers, encoding="utf-8") as f:
            answers = json.load(f)
        if not isinstance(answers, dict):
            sys.exit("Answers file must contain a JSON object.")
        unknown = set(answers) - {p["key"] for p in ph} - {"confirm"}
        if unknown:
            sys.exit("Unknown answers: %s" % ", ".join(sorted(unknown)))
    args.answers_confirmed = answers.get("confirm") is True
    values = {}
    interactive = not (args.defaults or args.answers or args.set) and sys.stdin.isatty()
    for p in ph:
        key = p["key"]
        default = p.get("default", "")
        if key in cli:
            val = cli[key]
        elif key in answers:
            val = str(answers[key])
        elif args.defaults or not interactive:
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


def repository_conflict(root, configured):
    """Return a conflict message when metadata disagrees with the local origin."""
    origin = _origin_url(root)
    origin_identity = _repository_identity(origin)
    if not origin_identity:
        return ""
    proposed = configured.strip() or _declared_repository_url(root)
    if proposed and not _repository_matches(proposed, origin):
        return (
            "Repository metadata conflicts with git origin: origin=%s; proposed=%s. "
            "Set REPO_URLS to the intended repository and confirm it explicitly."
            % (origin, proposed)
        )
    return ""


def show_configuration(ph, values):
    print("Configuration proposals (not consent; no files changed yet):")
    for placeholder in ph:
        key = placeholder["key"]
        print("  %-28s %s" % (key, values.get(key) or "(empty)"))
    ci_system = values.get("CI_SYSTEM", "")
    stacks = values.get("CI_STACKS", "")
    workflow = ".github/workflows/ci.yml" if "github" in ci_system.lower() and stacks.strip() else "not generated"
    print("  %-28s %s" % ("GENERATED_WORKFLOW", workflow))
    print("Existing AGENT.md values and manifest defaults are proposals only.")


def confirm_configuration(ph, values, args, display=True):
    if display:
        show_configuration(ph, values)
    if args.dry_run:
        print("(dry-run: confirmation is not required; nothing will be written)")
        return
    if getattr(args, "confirm", False) or getattr(args, "answers_confirmed", False):
        return
    if not sys.stdin.isatty() or args.answers or args.defaults or args.set:
        sys.exit(
            "Non-interactive initialization requires --confirm or JSON boolean "
            '\"confirm\": true in --answers; no files were changed.'
        )
    try:
        accepted = input("Apply this configuration? [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        accepted = False
    if not accepted:
        sys.exit("Initialization cancelled; no files were changed.")


def apply_repository_metadata(root, repository, dry_run=False):
    """Replace a rendered AGENT repository proposal after confirmation."""
    if not repository:
        return False
    path = os.path.join(root, "AGENT.md")
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return False
    pattern = re.compile(r"(Repositories:\s*`)([^`]+)(`)")
    match = pattern.search(text)
    if not match or match.group(2) == repository:
        return False
    updated = pattern.sub(r"\g<1>" + repository + r"\g<3>", text, count=1)
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
    return True


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
    manifest = os.path.join(root, OWNERSHIP_MANIFEST_NAME)
    for relative in archetype_only_paths(manifest):
        path = os.path.join(root, relative)
        if os.path.isdir(path):
            shutil.rmtree(path)
            removed.append(relative + "/")
        elif os.path.isfile(path):
            os.remove(path)
            removed.append(relative)
    return removed


def configure_opencode_plugin(root, enabled, dry_run=False):
    """Generate the OpenCode adapter only after an explicit opt-in."""
    if str(enabled).strip().lower() != "true":
        return False
    source = os.path.join(root, OPENCODE_PLUGIN_SOURCE)
    destination = os.path.join(root, OPENCODE_PLUGIN_DESTINATION)
    if not os.path.isfile(source):
        sys.exit("OpenCode plugin source is missing: %s" % OPENCODE_PLUGIN_SOURCE)
    if dry_run:
        print("Would generate %s" % OPENCODE_PLUGIN_DESTINATION)
        return False
    with open(source, encoding="utf-8") as source_file:
        content = source_file.read()
    changed = not os.path.isfile(destination)
    if not changed:
        with open(destination, encoding="utf-8") as destination_file:
            changed = destination_file.read() != content
    if changed:
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        with open(destination, "w", encoding="utf-8") as destination_file:
            destination_file.write(content)
    print("OpenCode plugin %s: %s" % (
        "generated" if changed else "already current", OPENCODE_PLUGIN_DESTINATION))
    return changed


def self_check():
    global _origin_url
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

        d5 = tempfile.mkdtemp()
        try:
            source = os.path.join(d5, OPENCODE_PLUGIN_SOURCE)
            destination = os.path.join(d5, OPENCODE_PLUGIN_DESTINATION)
            os.makedirs(os.path.dirname(source), exist_ok=True)
            with open(source, "w", encoding="utf-8") as f:
                f.write("plugin\n")
            assert not configure_opencode_plugin(d5, "false")
            assert not os.path.exists(destination), "default setup installed OpenCode plugin"
            assert configure_opencode_plugin(d5, "true")
            assert open(destination, encoding="utf-8").read() == "plugin\n"
            plugin_mtime = os.stat(destination).st_mtime_ns
            assert not configure_opencode_plugin(d5, "true")
            assert os.stat(destination).st_mtime_ns == plugin_mtime
        finally:
            shutil.rmtree(d5)

        d4 = tempfile.mkdtemp()
        try:
            with open(OWNERSHIP_MANIFEST, encoding="utf-8") as source:
                with open(os.path.join(d4, OWNERSHIP_MANIFEST_NAME), "w", encoding="utf-8") as target:
                    target.write(source.read())
            for relative in ARCHETYPE_ONLY_PATHS:
                if relative == OWNERSHIP_MANIFEST_NAME:
                    continue
                path = os.path.join(d4, relative)
                if relative in {entry["path"] for _, _, entry in ownership_entries()
                                if entry["kind"] == "directory"}:
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
            directories = {
                entry["path"] for _, _, entry in ownership_entries()
                if entry["kind"] == "directory"
            }
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

        d5 = tempfile.mkdtemp()
        try:
            with open(os.path.join(d5, "AGENT.md"), "w", encoding="utf-8") as f:
                f.write("- Name: Example - Repositories: `acme/stale`\n")
            original_origin = _origin_url
            _origin_url = lambda root: "git@github.com:acme/current.git"
            try:
                conflict = repository_conflict(d5, "")
                assert "acme/current.git" in conflict and "acme/stale" in conflict, conflict
                assert repository_conflict(d5, "https://github.com/acme/current") == ""
            finally:
                _origin_url = original_origin

            os.makedirs(os.path.join(d5, ".github"))
            no_provider = type("Args", (), {
                "set": [], "answers": None, "defaults": False,
            })()
            try:
                gather(load_manifest(), no_provider)
            except SystemExit as exc:
                assert "TASK_TRACKER" in str(exc), exc
            else:
                raise AssertionError("local .github must not select a task provider")

            noninteractive = type("Args", (), {
                "set": ["PROJECT_NAME=Example", "TASK_TRACKER=custom"],
                "answers": None, "defaults": True, "confirm": False,
                "dry_run": False,
            })()
            values = gather(load_manifest(), noninteractive)
            try:
                confirm_configuration(load_manifest(), values, noninteractive, display=False)
            except SystemExit as exc:
                assert "--confirm" in str(exc), exc
            else:
                raise AssertionError("non-interactive initialization must require confirmation")
            noninteractive.confirm = True
            confirm_configuration(load_manifest(), values, noninteractive, display=False)
        finally:
            shutil.rmtree(d5)

        print("self-check OK")
    finally:
        shutil.rmtree(d)


def main():
    ap = argparse.ArgumentParser(description="Initialize the archetype by filling placeholders.")
    ap.add_argument("--set", action="append", metavar="KEY=VALUE")
    ap.add_argument("--answers", metavar="FILE.json")
    ap.add_argument("--defaults", action="store_true")
    ap.add_argument("--confirm", action="store_true",
                    help="confirm the displayed configuration (required non-interactively)")
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
    show_configuration(ph, values)
    reconcile_repository_metadata(
        ROOT,
        values,
        dry_run=args.dry_run,
        confirm=(lambda _prompt: True if args.confirm or args.answers_confirmed
                 else _confirm_repository(_prompt)),
        apply=False,
    )
    confirm_configuration(ph, values, args, display=False)
    reconcile_repository_metadata(ROOT, values, confirm=lambda _prompt: True)
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
    configure_opencode_plugin(ROOT, values.get("OPENCODE_PLUGIN", "false"), dry_run=args.dry_run)
    nonempty = {k: v for k, v in values.items() if v}
    changes = apply_values(ROOT, nonempty, dry_run=args.dry_run)
    if apply_repository_metadata(ROOT, values.get("REPO_URLS", ""), dry_run=args.dry_run):
        changes[os.path.join(ROOT, "AGENT.md")] = changes.get(os.path.join(ROOT, "AGENT.md"), 0) + 1
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

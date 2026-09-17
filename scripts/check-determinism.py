#!/usr/bin/env python3
"""Check repeatability and idempotency of local archetype operations."""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_LIFECYCLE = "CHECK_DETERMINISM_SKIP_LIFECYCLE"


def load_module(name, filename):
    path = os.path.join(ROOT, filename)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def capture(function):
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        result = function()
    return result, output.getvalue()


def assert_same_output(function):
    first, first_output = capture(function)
    second, second_output = capture(function)
    assert first == second, (first, second)
    assert first_output == second_output, (first_output, second_output)
    return first


def assert_repeatable_command(command):
    first = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    second = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    assert first.returncode == second.returncode == 0, (command, first.returncode, second.returncode)
    assert first.stdout == second.stdout, (command, "stdout differs")
    assert first.stderr == second.stderr, (command, "stderr differs")


def check_initializer_lifecycle(init):
    cleanup_paths = tuple(init.ARCHETYPE_ONLY_PATHS)
    for no_clean in (False, True):
        root = tempfile.mkdtemp()
        try:
            shutil.copytree(
                ROOT,
                root,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(".git", ".atl", "__pycache__"),
            )
            with open(os.path.join(root, "placeholders.json"), encoding="utf-8") as manifest_file:
                manifest = json.load(manifest_file)["placeholders"]
            answers = {
                placeholder["key"]: (
                    placeholder.get("default") or "Example"
                    if placeholder.get("required") else ""
                )
                for placeholder in manifest
            }
            answers.update(PROJECT_NAME="Example", TASK_TRACKER="github-issues", CI_STACKS="python")
            with open(os.path.join(root, "answers.json"), "w", encoding="utf-8") as answers_file:
                json.dump(answers, answers_file)
            missing_required = subprocess.run(
                [sys.executable, "init.py", "--check"],
                cwd=root,
                capture_output=True,
                text=True,
            )
            assert missing_required.returncode != 0
            assert "PROJECT_NAME" in missing_required.stdout, missing_required.stdout
            checker = subprocess.run(
                [sys.executable, "scripts/check-determinism.py"],
                cwd=root,
                capture_output=True,
                text=True,
                env={**os.environ, SKIP_LIFECYCLE: "1"},
            )
            assert checker.returncode == 0, (checker.stdout, checker.stderr)
            command = [
                sys.executable,
                "init.py",
                "--answers",
                "answers.json",
            ]
            if no_clean:
                command.insert(2, "--no-clean")
            result = subprocess.run(command, cwd=root, capture_output=True, text=True)
            assert result.returncode == 0, (command, result.stdout, result.stderr)

            if no_clean:
                expected = [
                    path for path in cleanup_paths
                    if os.path.exists(os.path.join(root, path))
                ]
                assert all(os.path.exists(os.path.join(root, path)) for path in expected), expected
                check = subprocess.run(
                    [sys.executable, "init.py", "--check"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                )
                assert check.returncode == 0, (check.stdout, check.stderr)
                contract = subprocess.run(
                    [sys.executable, "scripts/check-delivery-contract.py"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                )
                assert contract.returncode == 0, (contract.stdout, contract.stderr)
            else:
                assert all(not os.path.exists(os.path.join(root, path)) for path in cleanup_paths), cleanup_paths
        finally:
            shutil.rmtree(root)


def check_initializer(init):
    root = tempfile.mkdtemp()
    try:
        os.makedirs(os.path.join(root, "ci"))
        os.makedirs(os.path.join(root, "providers", "task"))
        os.makedirs(os.path.join(root, "providers", "secrets"))
        with open(os.path.join(root, "ci", "recipes.json"), "w", encoding="utf-8") as f:
            json.dump({"python": "  python:\n    runs-on: ubuntu-latest"}, f)
        for capability, name, body in (
            ("task", "github-issues", "## GitHub Issues\n"),
            ("secrets", "none", "## No secrets\n"),
        ):
            with open(os.path.join(root, "providers", capability, name + ".md"), "w", encoding="utf-8") as f:
                f.write(body)

        dry_file = os.path.join(root, "README.md")
        with open(dry_file, "w", encoding="utf-8") as f:
            f.write("Project <PROJECT_NAME>\n")
        scripts = os.path.join(root, "scripts")
        os.makedirs(scripts)
        protected_fixture = os.path.join(scripts, "check-determinism.py")
        with open(protected_fixture, "w", encoding="utf-8") as f:
            f.write("Project <PROJECT_NAME>\n")
        protected_validation = os.path.join(scripts, "check-delivery-contract.py")
        with open(protected_validation, "w", encoding="utf-8") as f:
            f.write("Validation <PROJECT_NAME>\n")
        executable = os.path.join(root, "app.py")
        with open(executable, "w", encoding="utf-8") as f:
            f.write("Project <PROJECT_NAME>\n")
        before = open(dry_file, encoding="utf-8").read()
        assert_same_output(lambda: init.apply_values(
            root, {"PROJECT_NAME": "Example"}, dry_run=True))
        assert open(dry_file, encoding="utf-8").read() == before

        changes = init.apply_values(root, {"PROJECT_NAME": "Example"})
        assert open(protected_fixture, encoding="utf-8").read() == "Project <PROJECT_NAME>\n"
        assert open(protected_validation, encoding="utf-8").read() == "Validation <PROJECT_NAME>\n"
        assert open(executable, encoding="utf-8").read() == "Project Example\n"
        assert protected_fixture not in changes and protected_validation not in changes, changes

        assert_same_output(lambda: init.compose_ci(
            root, ["python"], "GitHub Actions", dry_run=True))
        assert_same_output(lambda: init.compose_bindings(
            root, "github-issues", "none", dry_run=True))
        assert not os.path.exists(os.path.join(root, ".github")), "CI dry-run created a directory"
        assert not os.path.exists(os.path.join(root, "docs")), "binding dry-run created a directory"

        init.compose_ci(root, ["python"], "GitHub Actions", dry_run=False)
        workflow = os.path.join(root, ".github", "workflows", "ci.yml")
        workflow_content = open(workflow, encoding="utf-8").read()
        workflow_mtime = os.stat(workflow).st_mtime_ns
        init.compose_ci(root, ["python"], "GitHub Actions", dry_run=False)
        assert open(workflow, encoding="utf-8").read() == workflow_content
        assert os.stat(workflow).st_mtime_ns == workflow_mtime

        init.compose_bindings(root, "github-issues", "none", dry_run=False)
        bindings = os.path.join(root, "docs", "bindings.md")
        bindings_content = open(bindings, encoding="utf-8").read()
        assert "(../providers/task/_contract.md)" in bindings_content, bindings_content
        assert "(../providers/secrets/_contract.md)" in bindings_content, bindings_content
        assert "(../ci/_contract.md)" in bindings_content, bindings_content
        bindings_mtime = os.stat(bindings).st_mtime_ns
        init.compose_bindings(root, "github-issues", "none", dry_run=False)
        assert open(bindings, encoding="utf-8").read() == bindings_content
        assert os.stat(bindings).st_mtime_ns == bindings_mtime
    finally:
        shutil.rmtree(root)


def check_ownership_boundary(init):
    """Prove normal cleanup removes registered archetype-only paths only."""
    ownership = init.load_ownership()
    entries = init.ownership_entries(ownership)
    covered = {entry["path"] for _, _, entry in entries}
    directories = {entry["path"] for _, _, entry in entries if entry["kind"] == "directory"}
    tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines()
    tracked.append(init.OWNERSHIP_MANIFEST_NAME)
    missing = [
        path for path in tracked
        if path not in covered and not any(path.startswith(directory + "/") for directory in directories)
    ]
    assert not missing, "unclassified tracked paths: %s" % ", ".join(missing)
    root = tempfile.mkdtemp()
    try:
        for _, _, entry in entries:
            path = os.path.join(root, entry["path"])
            if entry["path"] == init.OWNERSHIP_MANIFEST_NAME:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(ownership, f, indent=2)
                    f.write("\n")
            elif entry["kind"] == "directory":
                os.makedirs(path, exist_ok=True)
                with open(os.path.join(path, "fixture.txt"), "w", encoding="utf-8") as f:
                    f.write("fixture")
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write("fixture")

        init.cleanup(root)
        for _, disposition, entry in entries:
            path = os.path.join(root, entry["path"])
            if disposition == "removed":
                assert not os.path.exists(path), entry["path"]
            else:
                assert os.path.exists(path), entry["path"]
        print("ownership coverage and boundary self-check OK")
    finally:
        shutil.rmtree(root)


def check_factory_bootstrap(factory):
    assert_same_output(lambda: factory.plan("acme", "factory"))

    class Result:
        returncode = 1
        stderr = "404 Not Found"

    calls = []
    original_preflight = factory._preflight
    original_gh = factory._gh
    factory._preflight = lambda: None

    def fake_gh(*args):
        calls.append(args)
        return Result()

    factory._gh = fake_gh
    try:
        assert_same_output(lambda: factory.ensure(
            "acme", "factory", "private", no_create=True, yes=False))
    finally:
        factory._preflight = original_preflight
        factory._gh = original_gh
    assert calls == [
        ("repo", "view", "acme/.github"),
        ("repo", "view", "acme/factory"),
        ("repo", "view", "acme/.github"),
        ("repo", "view", "acme/factory"),
    ], calls


def check_scripts(start, labels, governance, delivery, release_scripts=()):
    catalog = labels.load_labels()
    assert_same_output(start.self_check)
    assert_same_output(lambda: labels.sync(
        catalog, repo="acme/example", dry_run=True))
    assert_same_output(governance.self_check)
    assert_same_output(delivery.self_check)
    if release_scripts:
        bootstrap, reporter, triage, workflow = release_scripts
        assert_same_output(bootstrap.self_check)
        assert_same_output(reporter.self_check)
        assert_same_output(triage.self_check)
        assert_same_output(workflow.check)


def check_cli_commands():
    assert_repeatable_command([
        sys.executable, "init.py", "--dry-run", "--no-clean", "--defaults",
        "--set", "PROJECT_NAME=Example", "--set", "TASK_TRACKER=github-issues",
    ])
    assert_repeatable_command([
        sys.executable, "factory_bootstrap.py", "--plan", "--org", "acme",
    ])
    assert_repeatable_command([
        sys.executable, "scripts/sync-github-labels.py", "--dry-run", "--repo", "acme/example",
    ])


def self_check():
    init = load_module("archetype_init", "init.py")
    factory = load_module("factory_bootstrap", "factory_bootstrap.py")
    start = load_module("start", "start.py")
    labels = load_module("sync_github_labels", "scripts/sync-github-labels.py")
    governance = load_module("check_pr_governance", "scripts/check-pr-governance.py")
    delivery = load_module("check_delivery_contract", "scripts/check-delivery-contract.py")
    release_paths = (
        "scripts/bootstrap-e2e.py",
        "scripts/report-bootstrap-failure.py",
        "scripts/triage-bootstrap-failure.py",
        "scripts/check-bootstrap-workflow.py",
    )
    release_scripts = ()
    if all(os.path.isfile(os.path.join(ROOT, path)) for path in release_paths):
        release_scripts = (
            load_module("bootstrap_e2e", "scripts/bootstrap-e2e.py"),
            load_module("report_bootstrap_failure", "scripts/report-bootstrap-failure.py"),
            load_module("triage_bootstrap_failure", "scripts/triage-bootstrap-failure.py"),
            load_module("check_bootstrap_workflow", "scripts/check-bootstrap-workflow.py"),
        )
    check_initializer(init)
    if not os.environ.get(SKIP_LIFECYCLE):
        check_ownership_boundary(init)
    if not os.environ.get(SKIP_LIFECYCLE):
        check_initializer_lifecycle(init)
    check_factory_bootstrap(factory)
    check_scripts(start, labels, governance, delivery, release_scripts)
    check_cli_commands()
    print("determinism self-check OK")


if __name__ == "__main__":
    self_check()

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


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = (os.path.dirname(os.path.dirname(SCRIPT_DIR))
        if os.path.basename(os.path.dirname(SCRIPT_DIR)) == ".factory"
        else os.path.dirname(SCRIPT_DIR))
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
            answers["confirm"] = True
            answers.pop("OPENCODE_PLUGIN", None)
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
            plugin = os.path.join(root, ".opencode", "plugins", "factory-start.ts")
            assert not os.path.exists(plugin), "default setup installed OpenCode plugin"

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
                answers["OPENCODE_PLUGIN"] = "true"
                with open(os.path.join(root, "answers.json"), "w", encoding="utf-8") as answers_file:
                    json.dump(answers, answers_file)
                opt_in = subprocess.run(
                    [sys.executable, "init.py", "--no-clean", "--answers", "answers.json"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                )
                assert opt_in.returncode == 0, (opt_in.stdout, opt_in.stderr)
                assert os.path.isfile(plugin), "explicit OpenCode opt-in did not install plugin"
                plugin_content = open(plugin, encoding="utf-8").read()
                assert plugin_content == open(
                    init.factory_asset_path(root, "hooks/opencode/factory-start.ts"),
                    encoding="utf-8",
                ).read()
                plugin_mtime = os.stat(plugin).st_mtime_ns
                repeat_opt_in = subprocess.run(
                    [sys.executable, "init.py", "--no-clean", "--answers", "answers.json"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                )
                assert repeat_opt_in.returncode == 0, (repeat_opt_in.stdout, repeat_opt_in.stderr)
                assert os.stat(plugin).st_mtime_ns == plugin_mtime
                contract_script = (
                    ".factory/scripts/check-delivery-contract.py"
                    if os.path.isfile(os.path.join(root, ".factory", "scripts", "check-delivery-contract.py"))
                    else "scripts/check-delivery-contract.py"
                )
                contract = subprocess.run(
                    [sys.executable, contract_script],
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


def check_initializer_metadata(init):
    root = tempfile.mkdtemp()
    try:
        shutil.copytree(
            ROOT,
            root,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(".git", ".atl", ".codegraph", "__pycache__"),
        )
        subprocess.run(["git", "init", "-q", root], check=True)
        subprocess.run(
            ["git", "remote", "add", "origin", "git@github.com:acme/project.git"],
            cwd=root,
            check=True,
        )
        agent = os.path.join(root, "AGENT.md")
        with open(agent, encoding="utf-8") as source:
            text = source.read().replace("<REPO_URLS>", "https://github.com/stale/project")
        with open(agent, "w", encoding="utf-8") as target:
            target.write(text)
        answers = {
            placeholder["key"]: (placeholder.get("default") or "Example")
            for placeholder in init.load_manifest()
            if placeholder.get("required")
        }
        answers.update(PROJECT_NAME="Example", TASK_TRACKER="github-issues")
        answers_path = os.path.join(root, "answers.json")
        with open(answers_path, "w", encoding="utf-8") as f:
            json.dump(answers, f)
        rejected = subprocess.run(
            [sys.executable, "init.py", "--no-clean", "--defaults", "--answers", "answers.json"],
            cwd=root,
            input="n\n",
            capture_output=True,
            text=True,
        )
        assert rejected.returncode != 0
        assert "explicit confirmation" in rejected.stderr, rejected.stderr

        answers["confirm"] = True
        with open(answers_path, "w", encoding="utf-8") as f:
            json.dump(answers, f)
        accepted = subprocess.run(
            [sys.executable, "init.py", "--no-clean", "--defaults", "--answers", "answers.json"],
            cwd=root,
            capture_output=True,
            text=True,
        )
        assert accepted.returncode == 0, (accepted.stdout, accepted.stderr)
        assert "git@github.com:acme/project.git" in open(agent, encoding="utf-8").read()

        provider_root = tempfile.mkdtemp()
        try:
            shutil.copytree(
                ROOT,
                provider_root,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(".git", ".atl", ".codegraph", "__pycache__"),
            )
            os.makedirs(os.path.join(provider_root, ".github", "ISSUE_TEMPLATE"), exist_ok=True)
            agent = os.path.join(provider_root, "AGENT.md")
            with open(agent, encoding="utf-8") as source:
                text = source.read().replace("<TRACKER>", "GitHub Projects").replace(
                    "<TASK_TRACKER>", "GitHub Projects"
                )
            with open(agent, "w", encoding="utf-8") as target:
                target.write(text)
            provider_answers = {
                placeholder["key"]: (placeholder.get("default") or "Example")
                for placeholder in init.load_manifest()
                if placeholder.get("key") != "TASK_TRACKER"
            }
            with open(os.path.join(provider_root, "answers.json"), "w", encoding="utf-8") as f:
                json.dump(provider_answers, f)
            no_provider = subprocess.run(
                [sys.executable, "init.py", "--no-clean", "--defaults", "--answers", "answers.json"],
                cwd=provider_root,
                capture_output=True,
                text=True,
            )
            assert no_provider.returncode != 0
            assert "TASK_TRACKER" in no_provider.stderr, no_provider.stderr
        finally:
            shutil.rmtree(provider_root)
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


def check_scripts(factory_layout, release_scripts=(), real_agent=()):
    labels_script = (
        ".factory/scripts/sync-github-labels.mjs"
        if os.path.isfile(os.path.join(ROOT, ".factory", "scripts", "sync-github-labels.mjs"))
        else "scripts/sync-github-labels.mjs"
    )
    assert_repeatable_command(["node", "start.mjs", "--self-check"])
    assert_repeatable_command(["node", labels_script, "--self-check"])
    governance_script = (
        ".factory/scripts/check-pr-governance.mjs"
        if os.path.isfile(os.path.join(ROOT, ".factory", "scripts", "check-pr-governance.mjs"))
        else "scripts/check-pr-governance.mjs"
    )
    assert_repeatable_command(["node", governance_script, "--self-check"])
    delivery_script = (
        ".factory/scripts/check-delivery-contract.mjs"
        if os.path.isfile(os.path.join(ROOT, ".factory", "scripts", "check-delivery-contract.mjs"))
        else "scripts/check-delivery-contract.mjs"
    )
    approval_script = (
        ".factory/scripts/check-delivery-contract.py"
        if os.path.isfile(os.path.join(ROOT, ".factory", "scripts", "check-delivery-contract.py"))
        else "scripts/check-delivery-contract.py"
    )
    assert_repeatable_command(["node", delivery_script, "--self-check"])
    assert_repeatable_command([sys.executable, approval_script, "--approval-self-check"])
    assert_same_output(factory_layout.self_check)
    if release_scripts:
        bootstrap, reporter, triage, workflow = release_scripts
        assert_same_output(bootstrap.self_check)
        assert_same_output(reporter.self_check)
        assert_same_output(triage.self_check)
        assert_same_output(workflow.check)
    if real_agent:
        checker, focused = real_agent
        assert_same_output(checker.check)
        assert_repeatable_command([sys.executable, focused])


def check_cli_commands(source_mode):
    if source_mode:
        assert_repeatable_command([
            sys.executable, "init.py", "--dry-run", "--no-clean", "--defaults",
            "--set", "PROJECT_NAME=Example", "--set", "TASK_TRACKER=github-issues",
        ])
        assert_repeatable_command([
            sys.executable, "factory_bootstrap.py", "--plan", "--org", "acme",
        ])
    labels_script = (
        ".factory/scripts/sync-github-labels.mjs"
        if os.path.isfile(os.path.join(ROOT, ".factory", "scripts", "sync-github-labels.mjs"))
        else "scripts/sync-github-labels.mjs"
    )
    assert_repeatable_command([
        "node", labels_script, "--dry-run", "--repo", "acme/example",
    ])


def self_check():
    source_mode = os.path.isfile(os.path.join(ROOT, "init.py"))
    init = load_module("archetype_init", "init.py") if source_mode else None
    factory = load_module("factory_bootstrap", "factory_bootstrap.py") if source_mode else None
    script_dir = ".factory/scripts" if not source_mode else "scripts"
    factory_layout = load_module("check_factory_layout", script_dir + "/check-factory-layout.py")
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
    real_agent = ()
    real_agent_paths = ("scripts/check-real-agent-workflow.py", "scripts/test-real-agent-e2e.py")
    if all(os.path.isfile(os.path.join(ROOT, path)) for path in real_agent_paths):
        real_agent = (
            load_module("check_real_agent_workflow", real_agent_paths[0]),
            real_agent_paths[1],
        )
    if init:
        check_initializer(init)
        check_initializer_metadata(init)
    if init and not os.environ.get(SKIP_LIFECYCLE):
        check_ownership_boundary(init)
    if init and not os.environ.get(SKIP_LIFECYCLE):
        check_initializer_lifecycle(init)
    if factory:
        check_factory_bootstrap(factory)
    check_scripts(factory_layout, release_scripts, real_agent)
    check_cli_commands(source_mode)
    print("determinism self-check OK")


if __name__ == "__main__":
    self_check()

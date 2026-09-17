#!/usr/bin/env python3
"""Offline tests for the release bootstrap E2E baseline."""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bootstrap = load("bootstrap", "bootstrap-e2e.py")
reporter = load("reporter", "report-bootstrap-failure.py")
workflow = load("workflow", "check-bootstrap-workflow.py")


def evidence(directory):
    data = {
        "schema_version": reporter.ENVELOPE_VERSION,
        "source_repository": "eff3ct0/factory-template",
        "release_tag": "v1.0.0",
        "release_sha": "a" * 40,
        "matrix_case": "python",
        "check_identifier": "bootstrap-e2e/python",
        "result": "failed",
        "failure_code": "initializer_failed",
        "openai_model": "gpt-5.6-luna",
        "exit_code": 1,
        "logs": ["token=secret /home/alice/private"],
        "cleanup": "passed",
        "cleanup_status": "passed",
    }
    Path(directory, "python.json").write_text(json.dumps(data), encoding="utf-8")
    return data


def test_release_identity_and_environment_boundary():
    assert bootstrap.recipe_keys() == ["rust", "typescript", "python", "go"]
    assert bootstrap.validate_sha("A" * 40) == "a" * 40
    assert bootstrap.disposable_name("bootstrap-e2e-123-", "python") == "bootstrap-e2e-123-python"
    old = os.environ.get("BOOTSTRAP_E2E_TOKEN")
    os.environ["BOOTSTRAP_E2E_TOKEN"] = "secret"
    try:
        assert "BOOTSTRAP_E2E_TOKEN" not in bootstrap.released_environment()
    finally:
        if old is None:
            os.environ.pop("BOOTSTRAP_E2E_TOKEN", None)
        else:
            os.environ["BOOTSTRAP_E2E_TOKEN"] = old


def test_reporter_is_idempotent_for_existing_issue():
    with tempfile.TemporaryDirectory() as directory:
        data = evidence(directory)
        marker = reporter.marker("eff3ct0/factory-template", data["release_sha"], ["python"])
        issue = {
            "number": 7,
            "repository_url": "https://api.github.com/repos/eff3ct0/factory-template",
            "body": marker,
            "labels": [{"name": "type:bug"}],
        }
        calls = []

        def fake(method, path, token, payload=None, expected=(200, 201), include_headers=False):
            calls.append((method, path, payload))
            if path == "repos/eff3ct0/factory-template":
                result = {"full_name": "eff3ct0/factory-template"}
            elif "/artifacts?" in path:
                result = {"total_count": 0, "artifacts": []}
            elif path.startswith("search/issues?"):
                result = {"total_count": 1, "items": [issue]} if "state%3Aopen" in path else {"total_count": 0, "items": []}
            elif path.endswith("/comments?per_page=100"):
                result = [{"body": marker, "issue_url": "https://api.github.com/repos/eff3ct0/factory-template/issues/7"}]
            else:
                raise AssertionError(path)
            return (result, {}) if include_headers else result

        args = SimpleNamespace(repository="eff3ct0/factory-template", tag="v1.0.0", sha=data["release_sha"],
                               workflow_url="https://github.com/eff3ct0/factory-template/actions/runs/123",
                               artifact_url="https://github.com/eff3ct0/factory-template/actions/runs/123",
                               evidence_dir=directory, failed_case=[], prepare_status="success",
                               bootstrap_status="success", cleanup_status="success", run_id="123",
                               token_env="TEST_TOKEN", tag_env="TEST_TAG", sha_env="TEST_SHA", template_e2e=True)
        old_request = reporter.request
        reporter.request = fake
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                reporter.report(args)
        finally:
            reporter.request = old_request
        assert not any(method == "POST" for method, _, _ in calls)


def test_workflow_contract():
    workflow.check()
    text = workflow.WORKFLOW.read_text(encoding="utf-8")
    assert "release:\n    types: [published]" in text
    assert "workflow_dispatch" in text and "tag_name" in text
    bootstrap_job = text.split("\n  bootstrap:\n", 1)[1].split("\n  cleanup:\n", 1)[0]
    cleanup_job = text.split("\n  cleanup:\n", 1)[1].split("\n  triage:\n", 1)[0]
    report_job = text.split("\n  report:\n", 1)[1]
    triage_job = text.split("\n  triage:\n", 1)[1].split("\n  report:\n", 1)[0]
    assert "OPENAI_API_KEY" not in bootstrap_job + cleanup_job + report_job
    assert "OPENAI_API_KEY" in triage_job and "OPENAI_MODEL" in triage_job
    assert "env -i" in triage_job
    assert "cancel-in-progress: false" in text
    assert "fetch-depth: 0" in bootstrap_job
    assert "/repos?type=all" not in cleanup_job
    assert 'path = "repos/%s/%s"' in cleanup_job


def test_cleanup_probes_only_run_scoped_repositories():
    calls = []
    original_request = bootstrap.api_request

    def fake_request(method, path, token, payload=None, expected=(200, 201, 204)):
        calls.append((method, path, expected))
        if method == "DELETE":
            return {}
        if path == "users/acme":
            return {"login": "acme", "type": "Organization"}
        if path == "repos/acme/bootstrap-e2e-123-python":
            return {"full_name": "acme/bootstrap-e2e-123-python"}
        if path.startswith("repos/acme/bootstrap-e2e-123-"):
            assert expected == (200, 404)
            return None
        raise AssertionError(path)

    bootstrap.api_request = fake_request
    try:
        assert bootstrap.cleanup_prefix("acme", "bootstrap-e2e-123-", "token") == [
            "bootstrap-e2e-123-python"
        ]
    finally:
        bootstrap.api_request = original_request
    assert not any("/repos?" in path for _, path, _ in calls)
    assert ("DELETE", "repos/acme/bootstrap-e2e-123-python", (204,)) in calls


def test_template_bootstrap_contract():
    arguments = bootstrap.initializer_arguments(
        "acme/bootstrap", "python", "github-issues", "none", "codegraph"
    )
    assert "--no-clean" in arguments
    assert "--set" in arguments
    assert "CODE_INTELLIGENCE=codegraph" in arguments
    assert "TASK_TRACKER=github-issues" in arguments
    assert "SECRETS_PROVIDER=none" in arguments

    calls = []
    original_request = bootstrap.api_request

    def fake_request(method, path, token, payload=None, expected=(200, 201, 204)):
        calls.append((method, path, payload, expected))
        if method == "GET":
            return None
        return {"full_name": "acme/bootstrap-e2e-1-python"}

    bootstrap.api_request = fake_request
    try:
        assert bootstrap.template_repository(
            "eff3ct0/factory-template", "acme", "bootstrap-e2e-1-python", "token"
        ) == "acme/bootstrap-e2e-1-python"
    finally:
        bootstrap.api_request = original_request
    assert calls[0][1] == "repos/acme/bootstrap-e2e-1-python"
    assert calls[1][1] == "repos/eff3ct0/factory-template/generate"
    assert calls[1][2]["private"] is True

    text = (ROOT / ".github" / "workflows" / "template-bootstrap-e2e.yml").read_text(encoding="utf-8")
    for marker in (
        "workflow_dispatch:", "scripts/bootstrap-e2e.py template",
        "template-bootstrap-e2e-", "if: always()", "issues: write",
    ):
        assert marker in text, marker

    with tempfile.TemporaryDirectory() as directory:
        bindings = Path(directory) / "docs"
        workflow = Path(directory) / ".github" / "workflows"
        bindings.mkdir(parents=True)
        workflow.mkdir(parents=True)
        (bindings / "bindings.md").write_text(
            "> **Provider:** `github-issues`\n> **Provider:** `none`\n> **Provider:** `codegraph`\n",
            encoding="utf-8",
        )
        (workflow / "ci.yml").write_text(
            "jobs:\n  python:\n    runs-on: ubuntu-latest\n", encoding="utf-8"
        )
        checks = bootstrap.readback_result(
            Path(directory), ["python"], "github-issues", "none", "codegraph"
        )
        assert all(check["status"] == "passed" for check in checks), checks


if __name__ == "__main__":
    test_release_identity_and_environment_boundary()
    test_reporter_is_idempotent_for_existing_issue()
    test_workflow_contract()
    test_cleanup_probes_only_run_scoped_repositories()
    test_template_bootstrap_contract()
    print("bootstrap E2E offline tests OK")

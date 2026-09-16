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
                               token_env="TEST_TOKEN", tag_env="TEST_TAG", sha_env="TEST_SHA")
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


if __name__ == "__main__":
    test_release_identity_and_environment_boundary()
    test_reporter_is_idempotent_for_existing_issue()
    test_workflow_contract()
    print("bootstrap E2E offline tests OK")

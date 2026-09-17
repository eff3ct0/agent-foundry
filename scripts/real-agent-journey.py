#!/usr/bin/env python3
"""Validate and aggregate the provider-neutral real-agent journey contract."""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENVELOPE_VERSION = "real-agent-journey/v1"
MAX_JSON_BYTES = 64 * 1024
MAX_STRING_CHARS = 256
STAGES = ("provision", "agent", "assert", "cleanup")
STAGE_IDENTIFIERS = {
    "provision": ("source_template", "default_branch", "revision"),
    "agent": ("issue", "branch", "commit", "tests"),
    "assert": ("checkout_head",),
    "cleanup": ("owner", "target"),
}
DECISIONS = (
    "project",
    "stack",
    "task_tracker",
    "secrets_provider",
    "code_intelligence",
    "ci",
    "persistence_language",
    "branching",
    "testing",
    "approval_gates",
)
COMPONENTS = {
    "provision": "scripts/real-agent-journey-provision.py",
    "agent": "scripts/real-agent-journey-agent.py",
    "assert": "scripts/real-agent-journey-assert.py",
    "cleanup": "scripts/real-agent-journey-cleanup.py",
}
SAFE_STAGE = re.compile(r"[a-z][a-z0-9_-]{0,31}")
SAFE_IDENTIFIER = re.compile(r"[A-Za-z0-9._:/-]{1,200}")
PRIVATE_MARKER = re.compile(r"(?i)(?:token|secret|password|credential|api[_-]?key)")


class JourneyError(ValueError):
    """A bounded contract failure that is safe to expose in evidence."""

    def __init__(self, message, failure_code="contract_invalid"):
        super().__init__(message)
        self.failure_code = failure_code


def _bootstrap_module():
    spec = importlib.util.spec_from_file_location("bootstrap_e2e", ROOT / "scripts" / "bootstrap-e2e.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_bootstrap = _bootstrap_module()


def validate_run_id(run_id):
    value = str(run_id or "").strip()
    if not re.fullmatch(r"[0-9]{1,20}", value):
        raise JourneyError("run_id must be numeric", "configuration_missing")
    return value


def validate_repository(repository):
    try:
        return _bootstrap.validate_repository(repository)
    except _bootstrap.HarnessError as error:
        raise JourneyError(str(error), "repository_invalid") from error


def validate_owner(owner):
    try:
        return _bootstrap.validate_owner(owner)
    except _bootstrap.HarnessError as error:
        raise JourneyError(str(error), "owner_invalid") from error


def journey_repository(owner, run_id):
    owner = validate_owner(owner)
    run_id = validate_run_id(run_id)
    return "%s/real-agent-journey-%s" % (owner, run_id)


def validate_runtime(runtime):
    value = str(runtime or "").strip()
    if not value or len(value) > 128 or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise JourneyError("real-agent runtime is absent or malformed", "configuration_missing")
    return value


def validate_decisions(decisions):
    if not isinstance(decisions, dict):
        raise JourneyError("explicit decisions must be an object", "decisions_invalid")
    missing = [key for key in DECISIONS if not isinstance(decisions.get(key), str) or not decisions[key].strip()]
    if missing:
        raise JourneyError("missing explicit decisions: %s" % ",".join(missing), "decisions_incomplete")
    for key in DECISIONS:
        value = decisions[key].strip()
        if len(value) > MAX_STRING_CHARS or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise JourneyError("decision is malformed: %s" % key, "decisions_invalid")
    return {key: decisions[key].strip() for key in DECISIONS}


def component_path(stage):
    if stage not in COMPONENTS:
        raise JourneyError("unknown journey stage: %s" % stage, "stage_invalid")
    return COMPONENTS[stage]


def stage_environment(base, stage, context):
    """Return the minimum environment for one child adapter.

    Lifecycle and read/write credentials are intentionally stage-specific. The
    agent adapter receives no lifecycle credential and no raw runner environment.
    """
    if stage not in STAGES:
        raise JourneyError("unknown journey stage: %s" % stage, "stage_invalid")
    environment = {name: base[name] for name in ("PATH", "HOME", "LANG", "LC_ALL") if name in base}
    environment.update({
        "JOURNEY_RUN_ID": validate_run_id(context.get("run_id")),
        "JOURNEY_REPOSITORY": validate_repository(context.get("repository")),
        "JOURNEY_STAGE": stage,
        "JOURNEY_CONTRACT_VERSION": ENVELOPE_VERSION,
    })
    if context.get("runtime"):
        environment["JOURNEY_AGENT_RUNTIME"] = validate_runtime(context["runtime"])
    credential = {
        "provision": "lifecycle_token",
        "agent": "agent_token",
        "assert": "read_token",
        "cleanup": "lifecycle_token",
    }[stage]
    if context.get(credential):
        environment["JOURNEY_TOKEN"] = context[credential]
    return environment


def read_json(path):
    path = Path(path)
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise JourneyError("stage evidence is unavailable", "stage_missing") from error
    if len(raw) > MAX_JSON_BYTES:
        raise JourneyError("stage evidence is too large", "stage_oversized")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise JourneyError("stage evidence is invalid JSON", "stage_malformed") from error
    if not isinstance(value, dict):
        raise JourneyError("stage evidence must be an object", "stage_malformed")
    return value


def validate_stage(stage, payload, run_id, repository):
    if not isinstance(payload, dict) or payload.get("schema_version") != ENVELOPE_VERSION:
        raise JourneyError("stage evidence has an unsupported schema", "stage_malformed")
    if payload.get("stage") != stage or payload.get("run_id") != run_id or payload.get("repository") != repository:
        raise JourneyError("stage evidence identity mismatch", "stage_identity_mismatch")
    status = payload.get("status")
    if status not in ("passed", "failed", "blocked", "inconclusive"):
        raise JourneyError("stage evidence has an invalid status", "stage_malformed")
    if status != "passed" and not SAFE_STAGE.fullmatch(str(payload.get("failure_code", ""))):
        raise JourneyError("failed stage evidence has no safe failure code", "stage_malformed")
    identifiers = payload.get("identifiers")
    if not isinstance(identifiers, dict):
        if status != "passed":
            return {"stage": stage, "status": status, "identifiers": {}}
        raise JourneyError("stage evidence has no bounded identifiers", "stage_metadata_missing")
    for key in STAGE_IDENTIFIERS[stage]:
        value = identifiers.get(key)
        if (not isinstance(value, str) or not SAFE_IDENTIFIER.fullmatch(value) or
                PRIVATE_MARKER.search(value)):
            raise JourneyError("stage evidence is missing identifier: %s" % key, "stage_metadata_missing")
        if key in ("source_template", "target"):
            validate_repository(value)
        elif key == "owner":
            validate_owner(value)
        elif key in ("revision", "commit", "checkout_head"):
            try:
                _bootstrap.validate_sha(value)
            except _bootstrap.HarnessError as error:
                raise JourneyError("stage evidence has an invalid revision", "stage_metadata_invalid") from error
    return {"stage": stage, "status": status, "identifiers": {
        key: identifiers[key] for key in STAGE_IDENTIFIERS[stage]
    }}


def aggregate(stage_dir, run_id, repository, runtime=None, workflow_url=None):
    try:
        run_id = validate_run_id(run_id)
    except JourneyError as error:
        return {
            "schema_version": ENVELOPE_VERSION, "run_id": None, "repository": None,
            "runtime": None, "stages": {}, "result": "failed", "failure_code": error.failure_code,
            "cleanup_status": "not-attempted", "workflow_url": workflow_url or None,
        }
    try:
        repository = validate_repository(repository)
    except JourneyError as error:
        return {
            "schema_version": ENVELOPE_VERSION, "run_id": run_id, "repository": None,
            "runtime": None, "stages": {}, "result": "failed", "failure_code": error.failure_code,
            "cleanup_status": "not-attempted", "workflow_url": workflow_url or None,
        }
    if runtime is not None:
        try:
            runtime = validate_runtime(runtime)
        except JourneyError as error:
            return {
                "schema_version": ENVELOPE_VERSION, "run_id": run_id, "repository": repository,
                "runtime": None, "stages": {}, "result": "failed", "failure_code": error.failure_code,
                "cleanup_status": "not-attempted", "workflow_url": workflow_url or None,
            }
    stages = {}
    identifiers = {}
    failure_code = ""
    cleanup_status = "not-attempted"
    for stage in STAGES:
        try:
            payload = read_json(Path(stage_dir) / (stage + ".json"))
            result = validate_stage(stage, payload, run_id, repository)
        except JourneyError as error:
            if not failure_code:
                failure_code = error.failure_code
            if stage == "cleanup":
                cleanup_status = "failed"
            continue
        stages[stage] = result["status"]
        identifiers[stage] = result["identifiers"]
        if stage == "cleanup":
            cleanup_status = result["status"]
        if result["status"] != "passed" and not failure_code:
            failure_code = "%s_%s" % (stage, result["status"])
    passed = len(stages) == len(STAGES) and not failure_code and cleanup_status == "passed"
    return {
        "schema_version": ENVELOPE_VERSION,
        "run_id": run_id,
        "repository": repository,
        "source_template": identifiers.get("provision", {}).get("source_template"),
        "tested_revision": identifiers.get("provision", {}).get("revision"),
        "runtime": runtime,
        "stages": stages,
        "identifiers": identifiers,
        "result": "passed" if passed else "failed",
        "failure_code": "" if passed else (failure_code or "journey_incomplete"),
        "cleanup_status": cleanup_status,
        "workflow_url": workflow_url or None,
    }


def write_json(path, value):
    serialized = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if len(serialized) > MAX_JSON_BYTES:
        raise JourneyError("journey evidence is too large", "evidence_oversized")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(serialized)


def contract_plan(run_id, template, owner="", runtime=""):
    run_id = validate_run_id(run_id)
    template = validate_repository(template)
    return {
        "schema_version": ENVELOPE_VERSION,
        "run_id": run_id,
        "source_template": template,
        "generated_repository": journey_repository(owner, run_id) if owner else None,
        "runtime": validate_runtime(runtime) if runtime else None,
        "stages": list(STAGES),
        "explicit_decisions": list(DECISIONS),
        "components": dict(COMPONENTS),
        "approval_boundary": "agent and scripted user cannot add status:approved, merge, publish, or delete unrelated repositories",
    }


def self_check():
    assert validate_run_id("123") == "123"
    assert journey_repository("acme", "123") == "acme/real-agent-journey-123"
    assert component_path("agent").endswith("real-agent-journey-agent.py")
    decisions = {key: key for key in DECISIONS}
    assert validate_decisions(decisions) == decisions
    try:
        validate_decisions({key: key for key in DECISIONS[:-1]})
    except JourneyError as error:
        assert error.failure_code == "decisions_incomplete"
    else:
        raise AssertionError("incomplete decisions accepted")
    environment = stage_environment(
        {"PATH": "/bin", "SECRET": "must-not-pass"}, "agent",
        {"run_id": "123", "repository": "acme/real-agent-journey-123", "runtime": "configured",
         "lifecycle_token": "lifecycle", "agent_token": "agent"},
    )
    assert environment["JOURNEY_TOKEN"] == "agent"
    assert "SECRET" not in environment and environment["JOURNEY_TOKEN"] != "lifecycle"
    with __import__("tempfile").TemporaryDirectory() as directory:
        for stage in STAGES:
            write_json(Path(directory) / (stage + ".json"), {
                "schema_version": ENVELOPE_VERSION, "stage": stage, "run_id": "123",
                "repository": "acme/real-agent-journey-123", "status": "passed",
                "identifiers": {
                    "provision": {"source_template": "eff3ct0/factory-template", "default_branch": "main", "revision": "a" * 40},
                    "agent": {"issue": "12", "branch": "feature/12-example", "commit": "b" * 40, "tests": "passed"},
                    "assert": {"checkout_head": "b" * 40},
                    "cleanup": {"owner": "acme", "target": "acme/real-agent-journey-123"},
                }[stage],
            })
        result = aggregate(directory, "123", "acme/real-agent-journey-123", "configured")
        assert result["result"] == "passed" and result["cleanup_status"] == "passed", result
        Path(directory, "cleanup.json").write_text("{}", encoding="utf-8")
        result = aggregate(directory, "123", "acme/real-agent-journey-123")
        assert result["result"] == "failed" and result["failure_code"] == "stage_malformed", result
    print("real-agent journey self-check OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    subparsers = parser.add_subparsers(dest="command")
    plan = subparsers.add_parser("plan")
    plan.add_argument("--run-id", required=True)
    plan.add_argument("--template", required=True)
    plan.add_argument("--owner")
    plan.add_argument("--runtime")
    plan.add_argument("--output", required=True)
    collect = subparsers.add_parser("collect")
    collect.add_argument("--run-id", required=True)
    collect.add_argument("--repository", required=True)
    collect.add_argument("--runtime")
    collect.add_argument("--stage-dir", required=True)
    collect.add_argument("--output", required=True)
    collect.add_argument("--workflow-url")
    args = parser.parse_args()
    try:
        if args.self_check:
            self_check()
        elif args.command == "plan":
            write_json(args.output, contract_plan(args.run_id, args.template, args.owner or "", args.runtime or ""))
        elif args.command == "collect":
            write_json(args.output, aggregate(args.stage_dir, args.run_id, args.repository, args.runtime, args.workflow_url))
            if read_json(args.output)["result"] != "passed":
                raise JourneyError("real-agent journey failed", "journey_failed")
        else:
            parser.error("a command or --self-check is required")
    except (JourneyError, OSError) as error:
        sys.exit(_bootstrap.redacted(error))


if __name__ == "__main__":
    main()

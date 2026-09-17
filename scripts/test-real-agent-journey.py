#!/usr/bin/env python3
"""Focused offline checks for the real-agent journey contract."""
import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("real_agent_journey", ROOT / "scripts" / "real-agent-journey.py")
journey = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(journey)


def test_contract_plan_is_provider_neutral():
    plan = journey.contract_plan("123", "eff3ct0/factory-template")
    assert plan["runtime"] is None
    assert plan["stages"] == ["provision", "agent", "assert", "cleanup"]
    assert plan["explicit_decisions"] == list(journey.DECISIONS)
    assert "status:approved" in plan["approval_boundary"]


def test_identity_and_decisions_fail_closed():
    try:
        journey.journey_repository("acme", "not-a-run")
    except journey.JourneyError as error:
        assert error.failure_code == "configuration_missing"
    else:
        raise AssertionError("invalid run identity accepted")
    try:
        journey.validate_decisions({"project": "Example"})
    except journey.JourneyError as error:
        assert error.failure_code == "decisions_incomplete"
    else:
        raise AssertionError("incomplete decision set accepted")


def test_aggregate_rejects_mismatch_and_cleanup_failure():
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        for stage in journey.STAGES:
            (directory / (stage + ".json")).write_text(json.dumps({
                "schema_version": journey.ENVELOPE_VERSION,
                "stage": stage,
                "run_id": "123",
                "repository": "acme/real-agent-journey-123",
                "status": "passed",
                "identifiers": {
                    "provision": {"source_template": "eff3ct0/factory-template", "default_branch": "main", "revision": "a" * 40},
                    "agent": {"issue": "12", "branch": "feature/12-example", "commit": "b" * 40, "tests": "passed"},
                    "assert": {"checkout_head": "b" * 40},
                    "cleanup": {"owner": "acme", "target": "acme/real-agent-journey-123"},
                }[stage],
            }), encoding="utf-8")
        (directory / "cleanup.json").write_text(json.dumps({
            "schema_version": journey.ENVELOPE_VERSION,
            "stage": "cleanup",
            "run_id": "123",
            "repository": "acme/other-repository",
            "status": "passed",
        }), encoding="utf-8")
        result = journey.aggregate(directory, "123", "acme/real-agent-journey-123")
        assert result["result"] == "failed"
        assert result["failure_code"] == "stage_identity_mismatch"
        assert result["cleanup_status"] == "failed"


if __name__ == "__main__":
    test_contract_plan_is_provider_neutral()
    test_identity_and_decisions_fail_closed()
    test_aggregate_rejects_mismatch_and_cleanup_failure()
    print("real-agent journey offline tests OK")

#!/usr/bin/env python3
"""Check that the delegated-delivery contract and approval gates stay aligned."""
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_FILES = (
    ROOT / "AGENT.md",
    ROOT / "templates" / "agent-runbook.md",
    ROOT / "providers" / "task" / "github-issues.md",
    ROOT / "providers" / "task" / "github-projects.md",
)
ROUTINE_TERMS = ("commit", "push", "pull request")
GATE_TERMS = ("merge", "production", "destructive", "release", "status:approved")
APPROVAL_ACTION = "add status:approved"
ALLOWED_PRINCIPAL_ROLES = ("MAINTAINER", "AUTHORIZED_APPROVER")
ALLOWED_ACTOR_CAPABILITIES = ("MAINTAIN", "ADMIN")


def check(paths=CONTRACT_FILES):
    errors = []
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8").lower()
        missing_routine = [term for term in ROUTINE_TERMS if term not in text]
        missing_gates = [term for term in GATE_TERMS if term not in text]
        if missing_routine:
            errors.append("%s missing routine terms: %s" % (path, ", ".join(missing_routine)))
        if missing_gates:
            errors.append("%s missing approval gates: %s" % (path, ", ".join(missing_gates)))
    return errors


def delegated_approval_errors(evidence, target_issue):
    """Return failures for one structured, target-bound approval attempt."""
    instruction = evidence.get("instruction", {})
    principal = evidence.get("principal", {})
    actor = evidence.get("actor", {})
    operation = evidence.get("operation", {})
    readback = evidence.get("readback", {})
    errors = []

    if instruction.get("source") != "direct-human":
        errors.append("instruction must be direct human input")
    if instruction.get("current") is not True:
        errors.append("instruction must be current")
    if instruction.get("issue") != target_issue:
        errors.append("instruction must name the exact target issue")
    if instruction.get("action") != APPROVAL_ACTION:
        errors.append("instruction must name the exact approval action")
    if principal.get("evidence_source") != "target-host":
        errors.append("principal authority must come from the target host")
    if principal.get("role") not in ALLOWED_PRINCIPAL_ROLES:
        errors.append("principal lacks target-host maintainer authority")
    if actor.get("subject") != principal.get("subject"):
        errors.append("authenticated actor is not the authorized principal")
    if actor.get("capability") not in ALLOWED_ACTOR_CAPABILITIES:
        errors.append("actor lacks MAINTAIN or ADMIN capability")
    if operation.get("issue") != target_issue or operation.get("label") != "status:approved":
        errors.append("operation is not scoped to the exact issue and label")
    if operation.get("attempts") != 1:
        errors.append("operation must have exactly one add attempt")
    if operation.get("sequence") != ["add", "readback"]:
        errors.append("readback must immediately follow the one add attempt")
    if operation.get("result") != "added":
        errors.append("mutation must succeed with a known added result")
    if readback.get("issue") != target_issue or "status:approved" not in readback.get("labels", []):
        errors.append("target-host readback does not confirm the approval")
    return errors


def delegated_approval_allowed(evidence, target_issue):
    """Return True only when every delegated-approval condition is proven."""
    return not delegated_approval_errors(evidence, target_issue)


def approval_self_check():
    valid = {
        "instruction": {"source": "direct-human", "current": True, "issue": 32,
                         "action": APPROVAL_ACTION},
        "principal": {"evidence_source": "target-host", "subject": "human-1",
                       "role": "MAINTAINER"},
        "actor": {"subject": "human-1", "capability": "ADMIN"},
        "operation": {"issue": 32, "label": "status:approved", "attempts": 1,
                       "result": "added", "sequence": ["add", "readback"]},
        "readback": {"issue": 32, "labels": ["status:approved"]},
    }
    assert delegated_approval_allowed(valid, 32)

    for field, value in (
        (("instruction", "issue"), 31),
        (("instruction", "current"), False),
        (("instruction",), {}),
        (("principal", "role"), "CONTRIBUTOR"),
        (("actor", "capability"), "TRIAGE"),
        (("operation", "result"), "unknown"),
        (("readback", "labels"), []),
    ):
        rejected = deepcopy(valid)
        if len(field) == 2:
            rejected[field[0]][field[1]] = value
        else:
            rejected[field[0]] = value
        assert not delegated_approval_allowed(rejected, 32), field

    print("approval self-check OK")


def self_check():
    errors = check()
    assert not errors, "\n".join(errors)
    approval_self_check()
    print("self-check OK")


if __name__ == "__main__":
    import sys

    if "--approval-self-check" in sys.argv:
        approval_self_check()
    else:
        self_check()

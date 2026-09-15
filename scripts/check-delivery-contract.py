#!/usr/bin/env python3
"""Check that the delegated-delivery contract and approval gates stay aligned."""
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


def self_check():
    errors = check()
    assert not errors, "\n".join(errors)
    print("self-check OK")


if __name__ == "__main__":
    self_check()

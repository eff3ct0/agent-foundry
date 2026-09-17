#!/usr/bin/env python3
"""Check the real-agent workflow's runtime and security contract."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "real-agent-e2e.yml"
HELPER = ROOT / "scripts" / "real-agent-e2e.py"
PINS = {
    "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
}


def check():
    text = WORKFLOW.read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    contract = text + "\n" + helper
    assert "workflow_call:" in text and "workflow_dispatch:" in text
    assert "permissions: {}" in text
    assert "repository:" in text and "expected_sha:" in text
    assert "persist-credentials: false" in text
    assert "@11bd71901bbe5b1630ceea73d27597364c9af683" in text
    assert "@ea165f8d65b6e75b540449e92b4886f43607fa02" in text
    assert "@0.148.0" in text and "@v" not in text.split("@0.148.0", 1)[0]
    for required in (
        "\"codex\", \"exec\"", "--json", "--ephemeral", "--ignore-user-config",
        "--sandbox", "--ask-for-approval", "OPENAI_API_KEY", "AGENT_GITHUB_TOKEN",
        "network_proxy", "if: always()", "retention-days: 7",
    ):
        assert required in contract, required
    assert "--dangerously-bypass-approvals-and-sandbox" not in text
    assert "BOOTSTRAP_E2E_TOKEN" not in text
    assert "status:approved" not in text
    uses = re.findall(r"^\s*uses:\s*([^\s#]+)", text, re.MULTILINE)
    for reference in uses:
        action, separator, sha = reference.partition("@")
        assert separator and re.fullmatch(r"[0-9a-f]{40}", sha), reference
        if action in PINS:
            assert PINS[action] == sha, reference
    print("real-agent workflow static check OK")


if __name__ == "__main__":
    check()

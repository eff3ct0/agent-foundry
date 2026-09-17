#!/usr/bin/env python3
"""Check immutable action pins and lifecycle permission boundaries."""
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "bootstrap-e2e.yml"
PINNED_ACTIONS = {
    "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",  # v4.2.2
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",  # v4.6.2
    "actions/create-github-app-token": "fee1f7d63c2ff003460e3d139729b119787bc349",  # v2.2.2
}
USE = re.compile(r"^\s*uses:\s*([^\s#]+)", re.MULTILINE)


def check():
    text = WORKFLOW.read_text(encoding="utf-8")
    uses = USE.findall(text)
    if not uses:
        raise AssertionError("workflow has no actions")
    for reference in uses:
        action, separator, sha = reference.partition("@")
        if not separator or not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise AssertionError("action is not pinned to a full commit SHA: %s" % reference)
        if action in PINNED_ACTIONS and PINNED_ACTIONS[action] != sha:
            raise AssertionError("action SHA is not the verified documented pin: %s" % reference)
    for action, sha in PINNED_ACTIONS.items():
        if "%s@%s" % (action, sha) not in uses:
            raise AssertionError("required action pin is missing: %s" % action)
    if "permissions: {}" not in text:
        raise AssertionError("workflow must default to no permissions")
    if "permission-administration: write" not in text or "permission-contents: write" not in text:
        raise AssertionError("lifecycle App token must be restricted to administration and contents write")
    if text.count("actions/create-github-app-token@") != 2:
        raise AssertionError("bootstrap and cleanup must mint separate lifecycle tokens")
    if "group: bootstrap-e2e-report-${{ github.repository }}-${{ needs.prepare.outputs.sha ||" not in text:
        raise AssertionError("report must serialize by resolved SHA")
    if "- name: Delete this run's disposable repositories\n        if: always()" not in text:
        raise AssertionError("cleanup deletion must run always")
    cleanup = text.split("\n  cleanup:\n", 1)[1].split("\n  report:\n", 1)[0]
    if "actions/checkout@" in cleanup:
        raise AssertionError("cleanup must not depend on repository checkout")
    bootstrap = text.split("\n  bootstrap:\n", 1)[1].split("\n  cleanup:\n", 1)[0]
    if "OPENAI_API_KEY" in text or "OPENAI_MODEL" in text:
        raise AssertionError("baseline workflow must not require OpenAI triage")
    if "BOOTSTRAP_E2E_TOKEN: ${{ secrets." in bootstrap or "BOOTSTRAP_E2E_TOKEN: ${{ secrets." in cleanup:
        raise AssertionError("lifecycle token must be short-lived App output")
    print("bootstrap workflow static check OK")


if __name__ == "__main__":
    check()

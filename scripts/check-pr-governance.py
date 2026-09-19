#!/usr/bin/env python3
"""Validate the pull-request contract for the bound task provider."""

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


CLOSE_REFERENCE = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+"
    r"(?:(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+))?#(?P<number>[0-9]+)\b",
    re.IGNORECASE,
)
REQUIRED_CHECK = "validate"
DEFAULT_TASK_PROVIDER = "github-issues"
GITHUB_TASK_PROVIDERS = {"github-issues", "github-projects"}
TASK_REFERENCE = {
    "jira": re.compile(r"\bJira\s*:\s*[A-Za-z][A-Za-z0-9_]*-[0-9]+\b", re.IGNORECASE),
    "linear": re.compile(r"\bLinear\s*:\s*[A-Za-z][A-Za-z0-9_]*-[0-9]+\b", re.IGNORECASE),
    "custom": re.compile(r"\bTask\s*:\s*[A-Za-z0-9][A-Za-z0-9_.:/-]*\b", re.IGNORECASE),
}


def bound_task_provider(root=None):
    """Read the selected task provider from generated bindings."""
    root = Path(root or Path(__file__).resolve().parents[1])
    try:
        text = (root / "docs" / "bindings.md").read_text(encoding="utf-8")
    except OSError:
        return DEFAULT_TASK_PROVIDER
    match = re.search(
        r"^> \*\*Capability:\*\* `task`\s*$\n^> \*\*Provider:\*\* `([^`]+)`$",
        text,
        re.MULTILINE,
    )
    return match.group(1) if match else DEFAULT_TASK_PROVIDER


def issue_numbers(body, repository):
    repository = repository.lower()
    numbers = []
    for match in CLOSE_REFERENCE.finditer(body or ""):
        qualified = match.group("owner") and "%s/%s" % (
            match.group("owner"),
            match.group("repo"),
        )
        if qualified and qualified.lower() != repository:
            continue
        number = int(match.group("number"))
        if number not in numbers:
            numbers.append(number)
    return numbers


def validate_pr(pull_request, issue_labels, repository=None, provider=None):
    errors = []
    labels = [label["name"] for label in pull_request.get("labels", [])]
    type_labels = [label for label in labels if label.startswith("type:")]
    if len(type_labels) != 1:
        errors.append("PR must have exactly one type:* label")
    provider = provider or bound_task_provider()
    if provider not in GITHUB_TASK_PROVIDERS and provider not in TASK_REFERENCE:
        errors.append("unsupported bound task provider: %s" % provider)
        return errors
    if provider in TASK_REFERENCE:
        if not TASK_REFERENCE[provider].search(pull_request.get("body", "")):
            label = provider.title() if provider != "custom" else "Task"
            errors.append(
                "PR body must contain a native %s reference such as '%s: PROJ-123'"
                % (provider, label)
            )
        return errors
    repository = (repository or os.environ.get("GITHUB_REPOSITORY", "")).lower()
    references = issue_numbers(pull_request.get("body", ""), repository)
    if not references:
        errors.append("PR body must contain a closing reference such as 'Closes #123'")
    for number in references:
        labels_for_issue = issue_labels.get(number, [])
        if "status:approved" not in labels_for_issue:
            errors.append(
                "linked issue #%d must have the human status:approved label" % number
            )
    return errors


def github_issue_labels(repository, token, number):
    request = Request(
        "https://api.github.com/repos/%s/issues/%d" % (repository, number),
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer %s" % token,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urlopen(request) as response:
        return [label["name"] for label in json.load(response).get("labels", [])]


def validate_event(event, repository, token):
    pull_request = event.get("pull_request", {})
    provider = bound_task_provider()
    issue_labels = {}
    if provider in GITHUB_TASK_PROVIDERS:
        for number in issue_numbers(pull_request.get("body", ""), repository):
            issue_labels[number] = github_issue_labels(repository, token, number)
    return validate_pr(pull_request, issue_labels, repository, provider)


def self_check():
    global bound_task_provider, github_issue_labels
    root = Path(__file__).resolve().parents[1]
    provider = bound_task_provider(root)
    workflow = (root / ".github" / "workflows" / "governance.yml").read_text(
        encoding="utf-8"
    )
    assert re.search(r"^  %s:$" % re.escape(REQUIRED_CHECK), workflow, re.MULTILINE)
    assert re.search(
        r"^    name: %s$" % re.escape(REQUIRED_CHECK), workflow, re.MULTILINE
    )
    assert "pull_request_target:" in workflow
    assert "ref: ${{ github.event.pull_request.merge_commit_sha }}" in workflow
    assert "ref: ${{ github.event.repository.default_branch }}" not in workflow
    assert "persist-credentials: false" in workflow
    assert "contents: write" not in workflow
    assert "issues: write" not in workflow
    assert "pull-requests: write" not in workflow
    for template in (
        root / ".github" / "pull_request_template.md",
        root / "templates" / "pull-request.md",
    ):
        text = template.read_text(encoding="utf-8")
        assert "provider-governance:start" in text and "provider-governance:end" in text
        if provider in GITHUB_TASK_PROVIDERS:
            assert "Closes #<TICKET_ID>" in text
            assert "Closes `<TICKET_ID>`" not in text
        else:
            reference = {
                "jira": "Jira: <TICKET_ID>",
                "linear": "Linear: <TICKET_ID>",
                "custom": "Task: <TICKET_ID>",
            }.get(provider)
            assert reference and reference in text, (provider, text)
            assert "Closes #<TICKET_ID>" not in text

    valid = {
        "body": "Summary\n\nCloses #42.",
        "labels": [{"name": "type:product"}],
    }
    assert validate_pr(valid, {42: ["status:approved"]}, "acme/example", "github-issues") == []
    assert validate_pr(valid, {42: []}, "acme/example", "github-issues")
    assert validate_pr(
        {"body": "Closes #42", "labels": []}, {42: []}, "acme/example", "github-issues"
    )
    assert issue_numbers(
        "Fixes acme/example#7 and closes other/repo#8", "acme/example"
    ) == [7]
    jira = {"body": "Summary\n\nJira: FEX-1", "labels": [{"name": "type:product"}]}
    assert validate_pr(jira, {}, provider="jira") == []
    assert validate_pr(
        {"body": "Closes #42", "labels": [{"name": "type:product"}]},
        {},
        provider="jira",
    )
    assert validate_pr(
        {"body": "Jira: FEX-1", "labels": [{"name": "type:product"}]},
        {1: ["status:approved"]},
        provider="jira",
    ) == []
    with tempfile.TemporaryDirectory() as directory:
        bindings = Path(directory) / "docs"
        bindings.mkdir()
        (bindings / "bindings.md").write_text(
            "> **Capability:** `task`\n> **Provider:** `jira`\n",
            encoding="utf-8",
        )
        assert bound_task_provider(directory) == "jira"
        assert validate_pr(jira, {}, provider=bound_task_provider(directory)) == []
    original_provider = bound_task_provider
    original_labels = github_issue_labels
    try:
        bound_task_provider = lambda root=None: "jira"

        def fail_if_called(*_args):
            raise AssertionError("Jira validation queried GitHub issue labels")

        github_issue_labels = fail_if_called
        assert validate_event({"pull_request": jira}, "acme/example", "token") == []
    finally:
        bound_task_provider = original_provider
        github_issue_labels = original_labels
    print("self-check OK")


def main():
    if "--self-check" in sys.argv:
        self_check()
        return
    event_path_value = os.environ.get("GITHUB_EVENT_PATH", "")
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not event_path_value or not repository or not token:
        sys.exit("GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required")
    event_path = Path(event_path_value)
    try:
        with event_path.open(encoding="utf-8") as f:
            errors = validate_event(json.load(f), repository, token)
    except (OSError, HTTPError, URLError, KeyError, ValueError) as error:
        sys.exit("Unable to validate PR governance: %s" % error)
    if errors:
        for error in errors:
            print("::error::%s" % error)
        sys.exit(1)
    print("PR governance OK")


if __name__ == "__main__":
    main()

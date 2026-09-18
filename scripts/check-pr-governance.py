#!/usr/bin/env python3
"""Validate the mechanical GitHub pull-request governance contract."""

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


CLOSE_REFERENCE = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+"
    r"(?:(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+))?#(?P<number>[0-9]+)\b",
    re.IGNORECASE,
)
REQUIRED_CHECK = "validate"


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


def validate_pr(pull_request, issue_labels, repository=None):
    errors = []
    labels = [label["name"] for label in pull_request.get("labels", [])]
    type_labels = [label for label in labels if label.startswith("type:")]
    if len(type_labels) != 1:
        errors.append("PR must have exactly one type:* label")
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
    issue_labels = {}
    for number in issue_numbers(pull_request.get("body", ""), repository):
        issue_labels[number] = github_issue_labels(repository, token, number)
    return validate_pr(pull_request, issue_labels, repository)


def self_check():
    root = Path(__file__).resolve().parents[1]
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
        assert "Closes #<TICKET_ID>" in text
        assert "Closes `<TICKET_ID>`" not in text

    valid = {
        "body": "Summary\n\nCloses #42.",
        "labels": [{"name": "type:product"}],
    }
    assert validate_pr(valid, {42: ["status:approved"]}, "acme/example") == []
    assert validate_pr(valid, {42: []}, "acme/example")
    assert validate_pr({"body": "Closes #42", "labels": []}, {42: []}, "acme/example")
    assert issue_numbers(
        "Fixes acme/example#7 and closes other/repo#8", "acme/example"
    ) == [7]
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

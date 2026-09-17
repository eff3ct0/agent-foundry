#!/usr/bin/env python3
"""Run the bounded, real-agent portion of the template journey.

Provisioning and cleanup are deliberately external to this helper.  The caller
must provide a fresh checkout and a repository-scoped agent token.
"""

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path


MAX_OUTPUT = 128 * 1024
MAX_EVIDENCE = 64 * 1024
MAX_EVENTS = 100
MAX_TEXT = 2000
MODEL_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,128}$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPOSITORY_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$")
BRANCH_RE = re.compile(r"^feature/[0-9]+-[a-z0-9][a-z0-9-]{0,48}$")
ISSUE_URL_RE = re.compile(r"https://github\.com/([^/]+/[^/]+)/issues/([0-9]+)")

DECISION_KEYS = (
    "PROJECT_NAME",
    "REPO_LANGUAGE",
    "INTEGRATION_BRANCH",
    "LANGUAGES_AND_FRAMEWORKS",
    "PACKAGE_MANAGER",
    "TASK_TRACKER",
    "TRACKER_KEY",
    "SECRETS_PROVIDER",
    "CODE_INTELLIGENCE",
    "SECRETS_PATH",
    "BRANCHING_MODEL",
    "BRANCH_NAMING",
    "TEST_CMD",
    "TDD_POLICY",
    "APPROVAL_GATED_ACTIONS",
    "CI_SYSTEM",
    "CI_STACKS",
)
BLOCKED_COMMANDS = re.compile(
    r"(?i)(?:status:approved|gh\s+(?:pr\s+merge|release\s+(?:create|publish)|repo\s+delete)|"
    r"git\s+push\s+(?:[^\n]*\s)?(?:main|master)(?:\s|$)|git\s+push\s+--delete|"
    r"gh\s+issue\s+edit)"
)
REFUSAL = re.compile(r"(?i)\b(?:refused|cannot|can't|unable to|declined)\b")


class JourneyError(RuntimeError):
    def __init__(self, message, code="journey_failed"):
        super().__init__(message)
        self.code = code


def redacted(value, secrets=(), workspace=None):
    text = str(value or "")
    for secret in secrets:
        if secret:
            text = text.replace(secret, "<redacted>")
    text = re.sub(r"(?i)\b(authorization|bearer|token|password|secret|api[_-]?key|credential)\s*[:=]\s*[^\s,]+", r"\1=<redacted>", text)
    text = re.sub(r"(?i)\b(?:gh[pousr]_[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)\b", "<redacted>", text)
    text = re.sub(r"https://x-access-token:[^@]+@", "https://<redacted>@", text)
    text = re.sub(r"(?:/tmp|/var/tmp|/home/[^\s:]+|/Users/[^\s:]+|[A-Za-z]:\\[^\s:]+)[^\s:]*", "<private-path>", text)
    if workspace:
        text = text.replace(str(workspace), "<workspace>")
    return text.replace("\x00", "")[:MAX_TEXT]


def validate_model(model):
    model = (model or "").strip()
    if not MODEL_RE.fullmatch(model):
        raise JourneyError("OPENAI_MODEL is absent or malformed", "configuration_missing")
    return model


def validate_repository(repository):
    if not REPOSITORY_RE.fullmatch((repository or "").strip()):
        raise JourneyError("repository must be an owner/name identifier", "configuration_invalid")
    return repository.strip()


def validate_sha(value, label="revision"):
    value = (value or "").strip().lower()
    if not SHA_RE.fullmatch(value):
        raise JourneyError("%s must be a full immutable commit" % label, "configuration_invalid")
    return value


def validate_decisions(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise JourneyError("scripted decisions are unreadable", "configuration_invalid") from error
    if not isinstance(data, dict) or data.get("confirm") is not True or not isinstance(data.get("decisions"), dict):
        raise JourneyError("scripted decisions require explicit confirmation", "decision_missing")
    decisions = data["decisions"]
    missing = [key for key in DECISION_KEYS if not isinstance(decisions.get(key), str) or not decisions[key].strip()]
    if missing:
        raise JourneyError("missing explicit decisions: %s" % ", ".join(missing), "decision_missing")
    if any("status:approved" in value.lower() for value in decisions.values()):
        raise JourneyError("scripted user cannot supply approval", "approval_boundary_violation")
    feature = data.get("feature")
    if not isinstance(feature, dict):
        raise JourneyError("scripted feature is missing", "feature_missing")
    slug = feature.get("slug", "")
    title = feature.get("title", "")
    criteria = feature.get("acceptance", [])
    paths = feature.get("implementation_files", [])
    if (not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,48}", slug) or
            not isinstance(title, str) or not 1 <= len(title.strip()) <= 160 or
            not isinstance(criteria, list) or not 1 <= len(criteria) <= 5 or
            not all(isinstance(item, str) and item.strip() for item in criteria) or
            not isinstance(paths, list) or not paths or
            not all(re.fullmatch(r"[A-Za-z0-9_.-]+", item or "") for item in paths)):
        raise JourneyError("scripted feature is malformed", "feature_invalid")
    return data


def collect_strings(value, output=None):
    output = output if output is not None else []
    if isinstance(value, str):
        output.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            collect_strings(item, output)
    elif isinstance(value, list):
        for item in value:
            collect_strings(item, output)
    return output


def collect_commands(value, output=None):
    output = output if output is not None else []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ("command", "cmd", "command_line") and isinstance(item, str):
                output.append(item)
            else:
                collect_commands(item, output)
    elif isinstance(value, list):
        for item in value:
            collect_commands(item, output)
    return output


def event_kind(strings):
    text = "\n".join(strings)
    lowered = text.lower()
    if BLOCKED_COMMANDS.search(text):
        return "gate", "blocked-action"
    if "start.py" in lowered or "agent.md" in lowered or "claude.md" in lowered or "docs/agent-init.md" in lowered:
        return "startup", "required-contract"
    if "gh issue create" in lowered or "issue_url" in lowered:
        return "issue", "feature-issue"
    if "git checkout -b" in lowered or "git switch -c" in lowered or "git commit" in lowered:
        return "implementation", "branch-or-commit"
    if "pytest" in lowered or "unittest" in lowered or "test" in lowered and "exit_code" in lowered:
        return "test", "verification"
    if REFUSAL.search(text):
        return "provider", "refusal"
    return "agent", "activity"


def parse_events(stdout, workspace, secrets):
    if len(stdout.encode("utf-8", "replace")) > MAX_OUTPUT:
        raise JourneyError("agent output is too large", "malformed_output")
    events = []
    commands = []
    successful_commands = []
    malformed = False
    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError:
            malformed = True
            continue
        strings = collect_strings(event)
        command_values = collect_commands(event)
        commands.extend(command_values)
        event_text = json.dumps(event, separators=(",", ":"))
        if command_values and re.search(r"(?i)(?:exit[_ -]?code)\D*0|(?:status)\D*(?:passed|success|completed)", event_text):
            successful_commands.append(event_text)
        kind, detail = event_kind(strings)
        events.append({"kind": kind, "status": "observed", "detail": detail})
    if malformed:
        raise JourneyError("agent emitted malformed JSONL output", "malformed_output")
    if len(events) > MAX_EVENTS:
        events = events[:MAX_EVENTS]
    return events, commands, successful_commands


def write_askpass(directory):
    path = Path(directory) / "git-askpass"
    path.write_text(
        '#!/bin/sh\ncase "$1" in\n  *Username*) printf "x-access-token\\n" ;;\n  *) printf "%s\\n" "$AGENT_GITHUB_TOKEN" ;;\nesac\n',
        encoding="utf-8",
    )
    path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    return path


def write_guards(directory, blocked_marker):
    real_gh = shutil.which("gh")
    real_git = shutil.which("git")
    if not real_gh or not real_git:
        raise JourneyError("required GitHub or Git executable is unavailable", "runtime_missing")
    marker = str(blocked_marker)
    gh = Path(directory) / "gh"
    gh.write_text(
        '#!/bin/sh\ncase "$*" in\n  *status:approved*|*"pr merge"*|*"release create"*|*"release publish"*|*"repo delete"*|*"issue edit"*)\n'
        '    : > "$REAL_AGENT_BLOCKED"; printf "blocked approval or destructive GitHub action\\n" >&2; exit 126 ;;\n'
        '  *) exec "$REAL_GH" "$@" ;;\nesac\n', encoding="utf-8")
    git = Path(directory) / "git"
    git.write_text(
        '#!/bin/sh\ncase "$1 $*" in\n  *"push"*" main"*|*"push"*" master"*|*"push --delete"*)\n'
        '    : > "$REAL_AGENT_BLOCKED"; printf "blocked protected or destructive Git action\\n" >&2; exit 126 ;;\n'
        '  *) exec "$REAL_GIT" "$@" ;;\nesac\n', encoding="utf-8")
    for path in (gh, git):
        path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    return real_gh, real_git, marker


def run_phase(workspace, prompt, model, api_key, github_token, phase, timeout=900):
    with tempfile.TemporaryDirectory(prefix="real-agent-%s-" % phase) as temporary:
        home = Path(temporary) / "codex-home"
        home.mkdir()
        final = Path(temporary) / "final.json"
        schema = Path(temporary) / "schema.json"
        schema.write_text(json.dumps({"type": "object"}), encoding="utf-8")
        blocked = Path(temporary) / "blocked"
        askpass = write_askpass(temporary) if github_token else None
        guard_dir = Path(temporary) / "guards"
        guard_dir.mkdir()
        real_gh, real_git, _ = write_guards(guard_dir, blocked)
        environment = {
            "PATH": str(guard_dir) + os.pathsep + os.environ.get("PATH", ""),
            "HOME": str(home),
            "CODEX_HOME": str(home),
            "OPENAI_API_KEY": api_key,
            "OPENAI_MODEL": model,
            "GIT_TERMINAL_PROMPT": "0",
            "REAL_AGENT_BLOCKED": str(blocked),
            "REAL_GH": real_gh,
            "REAL_GIT": real_git,
        }
        if github_token:
            environment.update({
                "GH_TOKEN": github_token,
                "AGENT_GITHUB_TOKEN": github_token,
                "GIT_ASKPASS": str(askpass),
            })
        command = [
            "codex", "exec", "--json", "--ephemeral", "--ignore-user-config",
            "--sandbox", "read-only" if phase == "request" else "workspace-write",
            "--ask-for-approval", "never", "--model", model,
            "-c", "sandbox_workspace_write.network_access=true",
            "-c", "features.network_proxy.enabled=true",
            "-c", 'features.network_proxy.domains={"api.github.com"="allow","github.com"="allow"}',
            "--output-last-message", str(final), "--output-schema", str(schema),
            "--cd", str(workspace), "-",
        ]
        try:
            result = subprocess.run(
                command, input=prompt, cwd=workspace, env=environment,
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired as error:
            raise JourneyError("codex CLI timed out during %s phase" % phase, "timeout") from error
        except OSError as error:
            raise JourneyError("codex CLI invocation failed", "provider_failure") from error
        events, strings, successful_commands = parse_events(result.stdout, workspace, [api_key, github_token])
        if blocked.exists() or any(BLOCKED_COMMANDS.search(item) for item in strings):
            raise JourneyError("approval or destructive action was attempted", "approval_boundary_violation")
        if result.returncode:
            if REFUSAL.search(result.stdout + result.stderr):
                code = "agent_refused"
            else:
                code = "provider_failure"
            raise JourneyError("codex CLI failed during %s phase" % phase, code)
        try:
            response = json.loads(final.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise JourneyError("agent final response is missing or malformed", "malformed_output") from error
        return response, events, strings, successful_commands


def git_output(workspace, *args):
    result = subprocess.run(["git", *args], cwd=workspace, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise JourneyError("git %s failed" % args[0], "checkout_mismatch")
    return result.stdout.strip()


def assert_outcome(workspace, repository, expected_sha, data, request, decision_data, commands, successful_commands):
    feature = decision_data["feature"]
    url = data.get("issue_url", "")
    match = ISSUE_URL_RE.fullmatch(url.strip()) if isinstance(url, str) else None
    if not match or match.group(1).lower() != repository.lower():
        raise JourneyError("agent did not return a feature issue in the target repository", "issue_invalid")
    issue_number = match.group(2)
    branch = git_output(workspace, "branch", "--show-current")
    expected_branch = "feature/%s-%s" % (issue_number, feature["slug"])
    if branch != expected_branch or not BRANCH_RE.fullmatch(branch):
        raise JourneyError("agent branch does not match the bounded feature contract", "branch_invalid")
    commit = git_output(workspace, "rev-parse", "HEAD")
    if not SHA_RE.fullmatch(commit) or data.get("commit") != commit:
        raise JourneyError("agent final response does not identify HEAD", "commit_invalid")
    message = git_output(workspace, "log", "-1", "--format=%B")
    if "#%s" % issue_number not in message:
        raise JourneyError("feature commit does not reference its issue", "commit_invalid")
    changed = git_output(workspace, "diff-tree", "--no-commit-id", "--name-only", "-r", commit).splitlines()
    if not any(path in changed for path in feature["implementation_files"]):
        raise JourneyError("feature implementation files are absent from the commit", "implementation_missing")
    test_command = decision_data["decisions"]["TEST_CMD"]
    if (not any(test_command in item for item in commands) or
            not any(test_command in item for item in successful_commands) or
            data.get("tests") not in ("passed", True)):
        raise JourneyError("required test command was not proven successful", "test_failed")
    if data.get("status") != "passed":
        raise JourneyError("agent did not report a passed bounded journey", "agent_incomplete")
    if data.get("approval_gate") not in ("not-approved", "blocked"):
        raise JourneyError("agent response contains an approval claim", "approval_boundary_violation")
    required = {"AGENT.md", "CLAUDE.md", "docs/agent-init.md"}
    requested = set(request.get("required_documents", [])) if isinstance(request, dict) else set()
    if requested and not required <= requested:
        raise JourneyError("cold agent did not request all required contracts", "startup_incomplete")
    return issue_number, branch, commit, changed


def run(args):
    workspace = Path(args.workspace).resolve()
    api_key = os.environ.get(args.api_key_env, "")
    token = os.environ.get(args.token_env, "")
    repository = (args.repository or "").strip()
    expected_sha = (args.expected_sha or "").strip().lower()
    evidence = {
        "schema_version": "real-agent-e2e/v1", "runtime": "codex-cli",
        "runtime_version": "0.148.0", "provider": "openai",
        "repository": repository, "expected_sha": expected_sha,
        "result": "failed", "failure_code": "not-run", "events": [
            {"kind": "decision", "status": "supplied", "detail": "explicit scripted-user configuration"},
            {"kind": "gate", "status": "passed", "detail": "no approval synthesized"},
        ],
        "decisions": {"status": "supplied", "keys": list(DECISION_KEYS)},
        "issue": None, "branch": None, "commit": None, "tests": "not-proven",
        "approval_gate": "not-approved",
    }
    try:
        if not workspace.is_dir() or not (workspace / ".git").exists():
            raise JourneyError("workspace must be an existing Git checkout", "checkout_invalid")
        repository = validate_repository(repository)
        expected_sha = validate_sha(expected_sha, "expected revision")
        model = validate_model(os.environ.get(args.model_env, ""))
        if not api_key or not token:
            raise JourneyError("agent API and repository credentials are required", "configuration_missing")
        decision_data = validate_decisions(args.decisions)
        if git_output(workspace, "rev-parse", "HEAD") != expected_sha:
            raise JourneyError("fresh checkout does not match the expected revision", "checkout_mismatch")
        request_prompt = (
            "You are a COLD agent in a fresh generated repository. This is a read-only discovery turn. "
            "Run `python3 start.py` first, then read AGENT.md, CLAUDE.md, and docs/agent-init.md. "
            "Do not modify files, call GitHub, create issues, or infer consent from defaults or existing text. "
            "End with JSON describing the configuration decisions you need from the user and the documents read."
        )
        request, events, _, _ = run_phase(workspace, request_prompt, model, api_key, "", "request")
        evidence["events"].extend(events)
        expected_documents = {"AGENT.md", "CLAUDE.md", "docs/agent-init.md"}
        requested = set(request.get("required_documents", [])) if isinstance(request, dict) else set()
        if not expected_documents <= requested:
            raise JourneyError("cold discovery omitted a required contract", "startup_incomplete")
        decisions = "\n".join("- %s: %s" % (key, decision_data["decisions"][key]) for key in DECISION_KEYS)
        feature = decision_data["feature"]
        criteria = "\n".join("- [ ] %s" % item for item in feature["acceptance"])
        implementation = ", ".join(feature["implementation_files"])
        execution_prompt = f"""You are a NEW COLD agent in this generated repository. The scripted user has now answered your configuration request.

First run `python3 start.py`; then read AGENT.md, CLAUDE.md, and docs/agent-init.md in the documented order. Existing text and defaults are proposals, not consent. Use only the explicit decisions below. Create an answers JSON and run `python3 init.py --no-clean --answers <file>` with explicit confirmation. Do not run init.py in the source repository; you are inside the generated repository.

Explicit scripted-user decisions:
{decisions}

Then define exactly one feature: {feature['title']} (slug: {feature['slug']}). Create a valid issue using the generated repository's task form shape (`.github/ISSUE_TEMPLATE/task.yml`) with these sections: Context / problem, Acceptance criteria, Scope, and Verification. Create it with `gh issue create --body-file`; do not use a blank issue. Record the returned issue URL.

Implement only the feature in these files: {implementation}. Create a branch named `feature/<issue-number>-{feature['slug']}` before the implementation. Run exactly the configured test command and ensure it passes. Commit the completed change with a conventional English message that includes `#{'{'}issue-number{'}'}`. Do not create a pull request, merge, release, delete anything, edit protected labels, or add `status:approved`; a scripted user cannot impersonate human approval. If an approval-gated action is requested, stop and report `BLOCKED: requires approval`.

Feature acceptance criteria:
{criteria}

Finish with JSON containing: `status`=`passed`, the issue URL as `issue_url`, the final branch as `branch`, the final commit SHA as `commit`, `tests`=`passed`, and `approval_gate`=`not-approved`. Do not include credentials, raw prompts, or tool transcripts in the final response."""
        outcome, events, commands, successful_commands = run_phase(
            workspace, execution_prompt, model, api_key, token, "execution"
        )
        evidence["events"].extend(events)
        issue_number, branch, commit, changed = assert_outcome(
            workspace, repository, expected_sha, outcome, request, decision_data, commands, successful_commands
        )
        evidence.update({
            "result": "passed", "failure_code": "", "issue": issue_number,
            "branch": branch, "commit": commit, "tests": "passed",
            "changed_files": changed[:20],
        })
    except JourneyError as error:
        evidence["failure_code"] = error.code
        evidence["failure"] = redacted(error, [api_key, token], workspace)
        raise
    except Exception as error:
        evidence["failure_code"] = "journey_failed"
        evidence["failure"] = redacted("real-agent journey failed", [api_key, token], workspace)
        raise JourneyError("real-agent journey failed", "journey_failed") from error
    finally:
        evidence["events"] = evidence["events"][:MAX_EVENTS]
        output = (json.dumps(evidence, indent=2, sort_keys=True) + "\n").encode("utf-8")
        if len(output) > MAX_EVIDENCE:
            raise JourneyError("redacted evidence is too large", "evidence_invalid")
        destination = Path(args.evidence)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(output)


def self_check():
    assert validate_repository("acme/example") == "acme/example"
    assert validate_sha("a" * 40) == "a" * 40
    assert redacted("token=supersecret /home/alice/private", ["supersecret"]) == "token=<redacted> <private-path>"
    assert event_kind(["gh issue create --title hello"])[0] == "issue"
    assert event_kind(["gh pr merge main"])[0] == "gate"
    assert event_kind(["python3 -m unittest test_hello.py", "exit_code", "0"])[0] == "test"
    assert BRANCH_RE.fullmatch("feature/123-hello-command")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "decisions.json"
        path.write_text(json.dumps({"confirm": False, "decisions": {}}), encoding="utf-8")
        try:
            validate_decisions(path)
        except JourneyError as error:
            assert error.code == "decision_missing"
        else:
            raise AssertionError("unconfirmed decisions accepted")
    print("real-agent E2E self-check OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    run_parser = parser.add_subparsers(dest="command").add_parser("run")
    run_parser.add_argument("--repository", required=True)
    run_parser.add_argument("--workspace", required=True)
    run_parser.add_argument("--expected-sha", required=True)
    run_parser.add_argument("--decisions", required=True)
    run_parser.add_argument("--evidence", required=True)
    run_parser.add_argument("--model-env", default="OPENAI_MODEL")
    run_parser.add_argument("--api-key-env", default="OPENAI_API_KEY")
    run_parser.add_argument("--token-env", default="AGENT_GITHUB_TOKEN")
    run_parser.set_defaults(handler=run)
    args = parser.parse_args()
    try:
        if args.self_check:
            self_check()
        elif getattr(args, "handler", None):
            args.handler(args)
        else:
            parser.error("a command or --self-check is required")
    except JourneyError as error:
        print(redacted(error), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

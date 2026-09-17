#!/usr/bin/env python3
"""Deduplicate and report failed bootstrap E2E runs."""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from release_ref import validate_tag as validate_git_tag
except ImportError:  # pragma: no cover - supports direct module loading
    from scripts.release_ref import validate_tag as validate_git_tag


ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / ".github" / "ISSUE_TEMPLATE" / "bug.yml"
FORM_CONTROLS = (
    ("textarea", "reproduction", "Steps to reproduce"),
    ("textarea", "expected", "Expected behavior"),
    ("textarea", "actual", "Actual behavior"),
    ("input", "environment", "Environment"),
    ("dropdown", "severity", "Severity"),
)
FORM_OPTIONS = ("Critical", "High", "Medium", "Low")
ALLOWED_CASES = frozenset(("cleanup", "matrix", "prepare"))
ENVELOPE_VERSION = "bootstrap-e2e-failure/v1"
TRIAGE_VERSION = "bootstrap-e2e-triage/v1"
ALLOWED_CLASSIFICATIONS = frozenset(("cleanup", "environment", "initializer", "release", "workflow", "unknown"))
SAFE_FAILURE_CODE = re.compile(r"[a-z0-9][a-z0-9_-]{0,48}")
MAX_API_RESPONSE_BYTES = 64 * 1024
MAX_API_REQUEST_BYTES = 16 * 1024
MAX_PAGINATED_ITEMS = 1000
MAX_EVIDENCE_FILES = 32
MAX_EVIDENCE_FILE_BYTES = 64 * 1024
MAX_EVIDENCE_TOTAL_BYTES = 512 * 1024
MAX_TRIAGE_BYTES = 16 * 1024
MAX_BODY_CHARS = 12000
MAX_LOG_ITEMS = 3
MAX_ISSUE_RESULTS = 100
MAX_COMMENT_RESULTS = 100
MAX_ARTIFACT_RESULTS = 100
MAX_REPORT_CASES = 32


class ReporterError(RuntimeError):
    """A safe reporter failure."""


def validate_model(model):
    if not isinstance(model, str):
        raise ReporterError("OPENAI_MODEL is absent or malformed")
    model = model.strip()
    if (not model or len(model) > 128 or any(ord(char) < 32 or ord(char) == 127 for char in model)):
        raise ReporterError("OPENAI_MODEL is absent or malformed")
    return model


def request(method, path, token, payload=None, expected=(200, 201), include_headers=False):
    if not token:
        raise ReporterError("GITHUB_TOKEN is missing")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    if body is not None and len(body) > MAX_API_REQUEST_BYTES:
        raise ReporterError("GitHub API request is too large")
    req = urllib.request.Request(
        "https://api.github.com/" + path.lstrip("/"), data=body, method=method,
        headers={"Accept": "application/vnd.github+json", "Authorization": "Bearer " + token,
                 "X-GitHub-Api-Version": "2022-11-28",
                 **({"Content-Type": "application/json"} if body is not None else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw, headers = response.status, response.read(MAX_API_RESPONSE_BYTES + 1), response.headers
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        getattr(error, "read", lambda *_: b"")(MAX_API_RESPONSE_BYTES + 1)
        raise ReporterError("GitHub API request failed") from error
    if len(raw) > MAX_API_RESPONSE_BYTES:
        raise ReporterError("GitHub API response is too large")
    if status not in expected:
        raise ReporterError("GitHub API returned HTTP %s" % status)
    try:
        result = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError as error:
        raise ReporterError("GitHub API returned invalid JSON") from error
    return (result, headers) if include_headers else result


def next_page(headers):
    link = headers.get("Link", "")
    match = re.search(r"<([^>]+)>;\s*rel=\"next\"", link)
    if not match:
        return None
    parsed = urllib.parse.urlparse(match.group(1))
    if parsed.scheme != "https" or parsed.netloc != "api.github.com":
        raise ReporterError("GitHub returned an unsafe pagination link")
    return parsed.path.lstrip("/") + ("?" + parsed.query if parsed.query else "")


def paginate(path, token, collection_key=None):
    items = []
    reported_total = None
    for _ in range(100):
        result, headers = request("GET", path, token, include_headers=True)
        if collection_key is None:
            page = result
        else:
            if not isinstance(result, dict) or result.get("incomplete_results"):
                raise ReporterError("GitHub returned incomplete paginated results")
            page = result.get(collection_key)
            if isinstance(result.get("total_count"), int):
                reported_total = result["total_count"]
        if not isinstance(page, list):
            raise ReporterError("GitHub returned an invalid paginated result")
        items.extend(item for item in page if isinstance(item, dict))
        if len(items) > MAX_PAGINATED_ITEMS or (reported_total is not None and reported_total > MAX_PAGINATED_ITEMS):
            raise ReporterError("GitHub returned too many paginated results")
        path = next_page(headers)
        if not path:
            if reported_total is not None and len(items) < reported_total:
                raise ReporterError("GitHub returned incomplete paginated results")
            return items
    raise ReporterError("GitHub pagination did not complete")


def validate_repository(repository):
    repository = (repository or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})", repository):
        raise ReporterError("repository must be an owner/name identifier")
    return repository


def validate_run_id(run_id):
    run_id = (run_id or "").strip()
    if not re.fullmatch(r"[0-9]{1,20}", run_id):
        raise ReporterError("run id must be numeric")
    return run_id


def validate_sha(sha):
    if not isinstance(sha, str):
        raise ReporterError("release SHA must be a full immutable commit")
    sha = (sha or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ReporterError("release SHA must be a full immutable commit")
    return sha


def validate_tag(tag):
    try:
        return validate_git_tag(tag)
    except ValueError as error:
        raise ReporterError(str(error)) from error


def validate_case(case):
    case = str(case or "").strip().lower()
    recipes = json.loads((ROOT / "ci" / "recipes.json").read_text(encoding="utf-8"))
    if (not isinstance(recipes, dict) or case not in ALLOWED_CASES and
            (case not in recipes or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", case))):
        raise ReporterError("invalid failure case")
    return case


def marker(repository, sha, cases, tag="", run_id=""):
    repository = validate_repository(repository)
    normalized_cases = [validate_case(case) for case in cases]
    if not normalized_cases:
        raise ReporterError("at least one failed case is required")
    if sha:
        identity = validate_sha(sha)
    elif tag:
        identity = "prepare:" + validate_tag(tag)
        if run_id:
            identity += ":run-" + validate_run_id(run_id)
    else:
        identity = "prepare-run:" + validate_run_id(run_id)
    return "Bootstrap-E2E-Failure: %s@%s" % (repository, identity)


def failure_fingerprint(release_sha, matrix_case, failure_code, check_identifier):
    sha = validate_sha(release_sha) if release_sha else "unavailable"
    case = validate_case(matrix_case)
    code = str(failure_code or "unknown").strip().lower()
    if not SAFE_FAILURE_CODE.fullmatch(code):
        raise ReporterError("failure code is not normalized")
    check = str(check_identifier or "").strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9/_-]{0,79}", check):
        raise ReporterError("check identifier is invalid")
    return hashlib.sha256("\0".join((sha, case, code, check)).encode("utf-8")).hexdigest()[:32]


def marker_with_fingerprints(repository, sha, cases, fingerprints, tag="", run_id=""):
    base = marker(repository, sha, cases, tag, run_id)
    if not fingerprints:
        return base
    return base + "\nBootstrap-E2E-Fingerprint: " + ",".join(sorted(set(fingerprints)))


def load_bounded_json(path, limit, message):
    try:
        with Path(path).open("rb") as handle:
            raw = handle.read(limit + 1)
    except OSError as error:
        raise ReporterError(message) from error
    if len(raw) > limit:
        raise ReporterError(message)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ReporterError(message) from error


def load_failure_records(directory):
    records = []
    evidence_models = set()
    paths = sorted(Path(directory).glob("*.json"))
    if len(paths) > MAX_EVIDENCE_FILES:
        raise ReporterError("too many evidence files")
    total_bytes = 0
    for path in paths:
        try:
            total_bytes += path.stat().st_size
        except OSError as error:
            raise ReporterError("invalid evidence file") from error
        if total_bytes > MAX_EVIDENCE_TOTAL_BYTES:
            raise ReporterError("evidence exceeds the size limit")
        data = load_bounded_json(path, MAX_EVIDENCE_FILE_BYTES, "invalid evidence file")
        if not isinstance(data, dict) or data.get("schema_version") != ENVELOPE_VERSION:
            raise ReporterError("unsupported evidence envelope")
        evidence_models.add(validate_model(data.get("openai_model")))
        if data.get("release_tag"):
            validate_tag(data["release_tag"])
        logs = data.get("logs", [])
        cleanup_logs = data.get("cleanup_logs", [])
        if (not isinstance(logs, list) or not isinstance(cleanup_logs, list) or
                len(logs) > MAX_LOG_ITEMS or len(cleanup_logs) > MAX_LOG_ITEMS):
            raise ReporterError("evidence logs are too large")
        case = validate_case(data.get("matrix_case", ""))
        result = data.get("result")
        cleanup_status = data.get("cleanup_status", data.get("cleanup"))
        if result != "passed":
            records.append({"matrix_case": case, "release_sha": data.get("release_sha", ""),
                            "release_tag": data.get("release_tag", ""),
                            "failure_code": data.get("failure_code", "unknown"),
                            "check_identifier": data.get("check_identifier", "bootstrap-e2e/%s" % case),
                            "exit_code": data.get("exit_code"), "logs": data.get("logs", [])})
        if cleanup_status == "failed":
            records.append({"matrix_case": "cleanup", "release_sha": data.get("release_sha", ""),
                            "release_tag": data.get("release_tag", ""), "failure_code": "cleanup_failed",
                            "check_identifier": "bootstrap-e2e/cleanup", "exit_code": None,
                             "logs": data.get("cleanup_logs", [])})
        if len(records) > MAX_PAGINATED_ITEMS:
            raise ReporterError("too many evidence records")
    if len(evidence_models) > 1:
        raise ReporterError("evidence OPENAI_MODEL values do not match")
    for record in records:
        if record["release_sha"]:
            record["release_sha"] = validate_sha(record["release_sha"])
        record["failure_code"] = str(record["failure_code"] or "unknown").strip().lower()
        if not SAFE_FAILURE_CODE.fullmatch(record["failure_code"]):
            raise ReporterError("evidence failure code is not normalized")
        record["check_identifier"] = str(record["check_identifier"] or "").strip()
        if not re.fullmatch(r"[a-z0-9][a-z0-9/_-]{0,79}", record["check_identifier"]):
            raise ReporterError("evidence check identifier is invalid")
        if record["exit_code"] is not None and (not isinstance(record["exit_code"], int) or not -255 <= record["exit_code"] <= 255):
            raise ReporterError("evidence exit code is invalid")
    return records


def load_evidence(directory):
    return sorted(set(record["matrix_case"] for record in load_failure_records(directory)))


def validate_url(value):
    parsed = urllib.parse.urlparse(value or "")
    if (parsed.scheme != "https" or parsed.hostname != "github.com" or parsed.username or
            parsed.password or parsed.query or parsed.fragment):
        raise ReporterError("workflow and artifact URLs must be public GitHub HTTPS URLs")
    return value


def validate_run_url(value, repository, run_id):
    value = validate_url(value)
    prefix = "/%s/actions/runs/%s" % (repository, run_id)
    path = urllib.parse.urlparse(value).path.rstrip("/")
    if not (path.lower() == prefix.lower() or path.lower().startswith(prefix.lower() + "/")):
        raise ReporterError("workflow or artifact URL does not identify this run")
    return value


def validate_form():
    lines = FORM.read_text(encoding="utf-8").splitlines()
    try:
        body_start = lines.index("body:")
    except ValueError as error:
        raise ReporterError("approved bug form has no body") from error
    labels = []
    in_labels = False
    for line in lines:
        if line == "labels:":
            in_labels = True
        elif in_labels and line.startswith("  - "):
            labels.append(line[4:])
        elif in_labels and line == "body:":
            in_labels = False
    blocks = []
    body_control_lines = [index for index in range(body_start + 1, len(lines)) if lines[index].startswith("  - type: ")]
    starts = [index for index in body_control_lines if re.fullmatch(r"  - type: [a-z]+", lines[index])]
    if len(starts) != len(body_control_lines):
        raise ReporterError("approved bug form contains an invalid body control")
    for offset, start in enumerate(starts):
        end = starts[offset + 1] if offset + 1 < len(starts) else len(lines)
        block = lines[start:end]
        kind = block[0].split(": ", 1)[1]
        identifier = next((line.split(": ", 1)[1] for line in block if line.startswith("    id: ")), "")
        label = next((line.split(": ", 1)[1] for line in block if line.startswith("      label: ")), "")
        required = next((line.split(": ", 1)[1] for line in block if line.startswith("      required: ")), "")
        options_start = next((index for index, line in enumerate(block) if line == "      options:"), None)
        options = [] if options_start is None else [line[10:] for line in block[options_start + 1:] if line.startswith("        - ")]
        blocks.append((kind, identifier, label, required, tuple(options)))
    expected = [(kind, identifier, label, "true", FORM_OPTIONS if kind == "dropdown" else ())
                for kind, identifier, label in FORM_CONTROLS]
    if labels != ["type:bug"] or blocks != expected:
        raise ReporterError("approved bug form controls do not match the required contract")
    return expected


def validate_body(body):
    headings = [match.group(1) for match in re.finditer(r"^### ([^\n]+)$", body, re.MULTILINE)]
    expected = [control[2] for control in FORM_CONTROLS]
    if headings != expected:
        raise ReporterError("generated issue body does not match the bug form order")
    sections = re.split(r"^### [^\n]+$", body, flags=re.MULTILINE)[1:]
    if any(not section.strip() for section in sections[:-1]) or sections[-1].strip() != "High":
        raise ReporterError("generated issue body has missing required fields")


def load_triage(path):
    if not path:
        return {"status": "fallback", "selected_model": None}
    data = load_bounded_json(path, MAX_TRIAGE_BYTES, "invalid triage result")
    if not isinstance(data, dict) or data.get("schema_version") != TRIAGE_VERSION:
        raise ReporterError("unsupported triage result")
    if data.get("status") != "success":
        return {"status": "fallback", "selected_model": None}
    if set(data) != {"schema_version", "status", "selected_model", "classification", "summary", "reproduction"}:
        raise ReporterError("triage result has unexpected fields")
    selected_model = validate_model(data.get("selected_model"))
    if data.get("classification") not in ALLOWED_CLASSIFICATIONS:
        raise ReporterError("triage result classification is invalid")
    safe = {"status": "success", "selected_model": selected_model, "classification": data["classification"]}
    for name, limit in (("summary", 600), ("reproduction", 1200)):
        value = data.get(name)
        if not isinstance(value, str) or not value.strip() or len(value) > limit or re.search(
                r"(?i)(ignore previous|github_token|openai_api_key|authorization|bearer|token=|secret=|password=|/home/|/tmp/|https?://|```|###|<|>|\b[A-Z][A-Z0-9_]{1,}=|\b(?:10|127|192\.168|169\.254|172\.(?:1[6-9]|2[0-9]|3[0-1]))\.\d{1,3}\.\d{1,3}\b)", value):
            raise ReporterError("triage %s is unsafe" % name)
        safe[name] = re.sub(r"\s+", " ", value).strip()
    return safe


def verify_repository(repository, token):
    result = request("GET", "repos/%s" % repository, token)
    if not isinstance(result, dict) or (result.get("full_name") or "").lower() != repository.lower():
        raise ReporterError("GitHub returned an unexpected target repository")


def issue_matches_repository(issue, repository):
    if not isinstance(issue, dict):
        return False
    number = issue.get("number")
    repository_url = issue.get("repository_url", "")
    return (isinstance(number, int) and number > 0 and isinstance(repository_url, str) and repository_url.lower() ==
            ("https://api.github.com/repos/" + repository).lower())


def is_bug_issue(issue):
    labels = issue.get("labels", [])
    return isinstance(labels, list) and "type:bug" in {label.get("name") for label in labels if isinstance(label, dict)}


def artifact_urls(repository, run_id, token, fallback):
    if not run_id:
        return fallback, None
    run_id = validate_run_id(run_id)
    artifacts = paginate("repos/%s/actions/runs/%s/artifacts?per_page=100" % (repository, run_id), token, "artifacts")
    if len(artifacts) > MAX_ARTIFACT_RESULTS:
        raise ReporterError("too many artifacts")
    prefixes = ("bootstrap-e2e-%s-" % run_id, "template-bootstrap-e2e-%s-" % run_id)
    matrix = next((item for item in artifacts if any(item.get("name", "").startswith(prefix) for prefix in prefixes)), None)
    triage = next((item for item in artifacts if item.get("name") == "bootstrap-e2e-triage-%s" % run_id), None)

    def link(item, fallback_url):
        if not isinstance(item, dict) or not isinstance(item.get("id"), int):
            return fallback_url
        return "https://github.com/%s/actions/runs/%s/artifacts/%s" % (repository, run_id, item["id"])

    return link(matrix, fallback), link(triage, None)


def build_body(repository, tag, sha, cases, workflow_url, artifact_url, marker_text, triage=None,
               triage_artifact_url=None):
    tag_text = "`%s`" % tag if tag else "unavailable (release preparation failed)"
    sha_text = "`%s`" % sha if sha else "unavailable (no release commit was resolved)"
    lines = [
        "### Steps to reproduce",
        "1. Publish release %s for `%s`." % (tag_text, repository),
        "2. Observe the release bootstrap E2E workflow at %s." % workflow_url,
        "3. Review the redacted evidence artifact at %s." % artifact_url,
        "", "### Expected behavior",
        "Every configured CI recipe bootstraps successfully from the exact released revision.",
        "", "### Actual behavior",
        "The release bootstrap E2E failed for: %s." % ", ".join("`%s`" % case for case in cases),
        "Release tag: %s" % tag_text, "Release SHA: %s" % sha_text,
        "Workflow: %s" % workflow_url, "Evidence artifact: %s" % artifact_url,
        marker_text, "", "### Environment",
        "GitHub Actions release bootstrap E2E for `%s`; the release commit was %s." % (repository, sha_text),
    ]
    if triage_artifact_url:
        lines.append("Triage artifact: %s" % triage_artifact_url)
    if triage and triage.get("status") == "success":
        lines.extend([
            "Advisory classification: `%s` (untrusted, non-authoritative)." % triage["classification"],
            "Advisory summary: %s" % triage["summary"],
            "Suggested reproduction: %s" % triage["reproduction"],
        ])
    else:
        lines.append("Advisory triage: unavailable; deterministic evidence is authoritative.")
    lines.extend(["", "### Severity", "High"])
    body = "\n".join(lines)
    if len(body) > MAX_BODY_CHARS:
        raise ReporterError("generated issue body is too large")
    validate_body(body)
    return body


def build_template_body(repository, tag, sha, cases, workflow_url, artifact_url, marker_text):
    tag_text = "`%s`" % tag if tag else "the published default branch"
    sha_text = "`%s`" % sha if sha else "unavailable (template revision was not resolved)"
    body = "\n".join([
        "### Steps to reproduce",
        "1. Run the template bootstrap E2E for %s in `%s`." % (tag_text, repository),
        "2. Observe the workflow at %s." % workflow_url,
        "3. Review the redacted evidence artifact at %s." % artifact_url,
        "", "### Expected behavior",
        "A disposable repository generated from the published template initializes successfully and passes the validation matrix.",
        "", "### Actual behavior",
        "The template bootstrap E2E failed for: %s." % ", ".join("`%s`" % case for case in cases),
        "Template revision: %s" % sha_text,
        "Workflow: %s" % workflow_url,
        "Evidence artifact: %s" % artifact_url,
        marker_text,
        "", "### Environment",
        "GitHub Actions template bootstrap E2E for `%s`; generated from %s." % (repository, sha_text),
        "", "### Severity", "High",
    ])
    if len(body) > MAX_BODY_CHARS:
        raise ReporterError("generated issue body is too large")
    validate_body(body)
    return body


def marker_line(marker_text):
    return marker_text.split("\n", 1)[0]


def search_issues(repository, marker_text, token, fingerprints=()):
    matches = []
    needles = tuple(dict.fromkeys(tuple(fingerprints) + (marker_line(marker_text),)))
    for state in ("open", "closed"):
        for needle in needles:
            query = urllib.parse.urlencode({"q": 'repo:%s is:issue state:%s "%s"' % (repository, state, needle), "per_page": 100})
            for item in paginate("search/issues?%s" % query, token, "items"):
                if issue_matches_repository(item, repository) and is_bug_issue(item) and needle in (item.get("body") or ""):
                    matches.append(item)
                    if len(matches) > MAX_ISSUE_RESULTS:
                        raise ReporterError("too many matching issues")
    unique = {item["number"]: item for item in matches}
    return [unique[number] for number in sorted(unique)]


def already_commented(repository, issue_number, marker_text, token, fingerprints=()):
    comments = paginate("repos/%s/issues/%s/comments?per_page=100" % (repository, issue_number), token)
    if len(comments) > MAX_COMMENT_RESULTS:
        raise ReporterError("too many issue comments")
    needles = tuple(dict.fromkeys(tuple(fingerprints) + (marker_line(marker_text),)))
    return any(any(needle in (comment.get("body") or "") for needle in needles) and
               isinstance(comment.get("issue_url"), str) and comment["issue_url"].lower() ==
               ("https://api.github.com/repos/%s/issues/%s" % (repository, issue_number)).lower()
               for comment in comments)


def confirm_issue(repository, issue_number, title, body, token):
    issue = request("GET", "repos/%s/issues/%s" % (repository, issue_number), token)
    if (not issue_matches_repository(issue, repository) or issue.get("number") != issue_number or
            issue.get("title") != title):
        raise ReporterError("created issue identity read-back failed")
    if "type:bug" not in {label.get("name") for label in issue.get("labels", []) if isinstance(label, dict)}:
        raise ReporterError("created issue label read-back failed")
    if (issue.get("body") or "").replace("\r\n", "\n").rstrip("\n") != body.replace("\r\n", "\n").rstrip("\n"):
        raise ReporterError("created issue body read-back failed")


def confirm_comment(repository, issue_number, comment_id, marker_text, token):
    comment = request("GET", "repos/%s/issues/comments/%s" % (repository, comment_id), token)
    expected_url = "https://api.github.com/repos/%s/issues/%s" % (repository, issue_number)
    if (not isinstance(comment, dict) or comment.get("issue_url", "").lower() != expected_url.lower() or
            marker_text not in (comment.get("body") or "")):
        raise ReporterError("created comment identity read-back failed")


def report(args):
    repository = validate_repository(args.repository)
    run_id = validate_run_id(args.run_id)
    records = load_failure_records(args.evidence_dir) if args.evidence_dir else [
        {"matrix_case": case, "release_sha": "", "release_tag": "", "failure_code": "unknown",
         "check_identifier": "bootstrap-e2e/%s" % case, "exit_code": None, "logs": []}
        for case in args.failed_case
    ]
    status_cases = (("prepare", args.prepare_status), ("matrix", args.bootstrap_status), ("cleanup", args.cleanup_status))
    for case, status in status_cases:
        if status != "success" and not any(record["matrix_case"] == case for record in records):
            records.append({"matrix_case": case, "release_sha": "", "release_tag": "", "failure_code": case + "_failed",
                            "check_identifier": "bootstrap-e2e/%s" % case, "exit_code": None, "logs": []})
    cases = sorted(set(validate_case(record["matrix_case"]) for record in records))
    if len(cases) > MAX_REPORT_CASES:
        raise ReporterError("too many report cases")
    if not cases:
        print("no bootstrap failures")
        return
    raw_tag = args.tag or os.environ.get(args.tag_env, "")
    raw_sha = args.sha or os.environ.get(args.sha_env, "")
    if raw_tag:
        try:
            tag = validate_tag(raw_tag)
        except ReporterError:
            if args.prepare_status == "success":
                raise
            tag = ""
    else:
        tag = ""
    record_shas = {record["release_sha"] for record in records if record["release_sha"]}
    if raw_sha:
        sha = validate_sha(raw_sha)
    elif len(record_shas) == 1:
        sha = next(iter(record_shas))
    else:
        sha = ""
    if sha and any(record_sha != sha for record_sha in record_shas):
        raise ReporterError("evidence release SHA does not match report SHA")
    fingerprints = [] if not sha else [
        failure_fingerprint(sha, record["matrix_case"], record["failure_code"], record["check_identifier"])
        for record in records
    ]
    marker_text = marker_with_fingerprints(repository, sha, cases, fingerprints, tag, run_id)
    token = os.environ.get(args.token_env, "")
    validate_form()
    workflow_url = validate_run_url(args.workflow_url, repository, run_id)
    fallback_artifact = validate_run_url(args.artifact_url, repository, run_id)
    verify_repository(repository, token)
    artifact, triage_artifact = artifact_urls(repository, run_id, token, fallback_artifact)
    try:
        triage = load_triage(getattr(args, "triage_file", None))
    except ReporterError:
        triage = {"status": "fallback", "selected_model": None}
    if getattr(args, "template_e2e", False):
        body = build_template_body(repository, tag, sha, cases, workflow_url, artifact, marker_text)
        title = "[Bug] Template bootstrap E2E failed: %s" % (tag or "published template")
    else:
        body = build_body(repository, tag, sha, cases, workflow_url, artifact, marker_text, triage, triage_artifact)
        title = "[Bug] Release bootstrap E2E failed: %s" % (tag or "release preparation")
    matches = search_issues(repository, marker_text, token, fingerprints)
    if matches:
        issue = matches[0]
        issue_number = issue["number"]
        if already_commented(repository, issue_number, marker_text, token, fingerprints):
            print("already reported #%s" % issue_number)
            return
        comment = request("POST", "repos/%s/issues/%s/comments" % (repository, issue_number), token,
                          {"body": body}, expected=(201,))
        comment_id = comment.get("id") if isinstance(comment, dict) else None
        if not isinstance(comment_id, int):
            raise ReporterError("comment mutation returned no stable identity")
        confirm_comment(repository, issue_number, comment_id, marker_text, token)
        print("commented canonical issue #%s" % issue_number)
        return
    created = request("POST", "repos/%s/issues" % repository, token,
                      {"title": title, "body": body, "labels": ["type:bug"]}, expected=(201,))
    issue_number = created.get("number") if isinstance(created, dict) else None
    if not isinstance(issue_number, int):
        raise ReporterError("issue mutation returned no stable identity")
    confirm_issue(repository, issue_number, title, body, token)
    print("created canonical bootstrap failure issue #%s" % issue_number)


def self_check():
    validate_form()
    commit = "a" * 40
    failure_marker = marker("eff3ct0/factory-template", commit, ["python", "cleanup", "python"])
    assert failure_marker == "Bootstrap-E2E-Failure: eff3ct0/factory-template@%s" % commit
    fingerprint = failure_fingerprint(commit, "python", "initializer_failed", "bootstrap-e2e/python")
    assert len(fingerprint) == 32
    assert fingerprint == failure_fingerprint(commit, "python", "initializer_failed", "bootstrap-e2e/python")
    marked = marker_with_fingerprints("eff3ct0/factory-template", commit, ["python"], [fingerprint])
    assert fingerprint in marked
    prepare_marker = marker("eff3ct0/factory-template", "", ["prepare"], "v0.1.0", "123")
    assert prepare_marker.endswith("@prepare:v0.1.0:run-123")
    assert marker("eff3ct0/factory-template", "", ["prepare"], "release+build/1", "123").endswith("@prepare:release+build/1:run-123")
    run_marker = marker("eff3ct0/factory-template", "", ["prepare"], "", "123")
    assert run_marker.endswith("@prepare-run:123")
    body = build_body("eff3ct0/factory-template", "v0.1.0", commit, ["python"],
                      "https://github.com/eff3ct0/factory-template/actions/runs/123",
                      "https://github.com/eff3ct0/factory-template/actions/runs/123", failure_marker)
    assert "token=" not in body.lower()
    assert "### Severity\nHigh" in body
    template_body = build_template_body("eff3ct0/factory-template", "main", commit, ["python"],
                                         "https://github.com/eff3ct0/factory-template/actions/runs/123",
                                         "https://github.com/eff3ct0/factory-template/actions/runs/123", failure_marker)
    assert "generated from" in template_body
    advisory = {"status": "success", "selected_model": "gpt-4o-mini", "classification": "initializer",
                "summary": "The initializer failed.", "reproduction": "Run the released initializer for the matrix case."}
    advisory_body = build_body("eff3ct0/factory-template", "v0.1.0", commit, ["python"],
                               "https://github.com/eff3ct0/factory-template/actions/runs/123",
                               "https://github.com/eff3ct0/factory-template/actions/runs/123", marked, advisory)
    assert "Advisory classification" in advisory_body
    assert load_triage("")["status"] == "fallback"
    assert "not resolved" not in body
    print("bootstrap failure reporter self-check OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    subparsers = parser.add_subparsers(dest="command")
    report_parser = subparsers.add_parser("report")
    report_parser.add_argument("--repository", required=True)
    report_parser.add_argument("--tag")
    report_parser.add_argument("--sha")
    report_parser.add_argument("--triage-file")
    report_parser.add_argument("--template-e2e", action="store_true")
    report_parser.add_argument("--workflow-url", required=True)
    report_parser.add_argument("--artifact-url", required=True)
    report_parser.add_argument("--evidence-dir")
    report_parser.add_argument("--failed-case", action="append", default=[])
    report_parser.add_argument("--prepare-status", default="success")
    report_parser.add_argument("--cleanup-status", default="success")
    report_parser.add_argument("--bootstrap-status", default="success")
    report_parser.add_argument("--run-id", required=True)
    report_parser.add_argument("--token-env", default="GITHUB_TOKEN")
    report_parser.add_argument("--tag-env", default="RELEASE_TAG")
    report_parser.add_argument("--sha-env", default="RELEASE_SHA")
    args = parser.parse_args()
    try:
        if args.self_check:
            self_check()
        elif args.command == "report":
            report(args)
        else:
            parser.error("report or --self-check is required")
    except (ReporterError, OSError, ValueError) as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()

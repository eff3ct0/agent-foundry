import { createHash } from "node:crypto";

export const ENVELOPE_VERSION = "bootstrap-e2e-failure/v1";
export const TRIAGE_VERSION = "bootstrap-e2e-triage/v1";
export const BUG_FORM_CONTROLS = [
  { type: "textarea", id: "reproduction", label: "Steps to reproduce" },
  { type: "textarea", id: "expected", label: "Expected behavior" },
  { type: "textarea", id: "actual", label: "Actual behavior" },
  { type: "input", id: "environment", label: "Environment" },
  { type: "dropdown", id: "severity", label: "Severity" },
];

const CASE = /^[a-z0-9][a-z0-9_-]*$/u;
const FAILURE_CODE = /^[a-z0-9][a-z0-9_-]{0,48}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const CLASSIFICATIONS = new Set(["cleanup", "environment", "initializer", "release", "workflow", "unknown"]);
const MAX_RECORDS = 32;
const MAX_BODY_CHARS = 12_000;

export class ReporterError extends Error {}

const fail = (message) => { throw new ReporterError(message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";

export const validateSha = (value) => {
  const sha = text(value).toLowerCase();
  if (!SHA.test(sha)) fail("release SHA must be a full immutable commit");
  return sha;
};

export const validateRunId = (value) => {
  const runId = text(value);
  if (!/^\d{1,20}$/u.test(runId)) fail("run id must be numeric");
  return runId;
};

export const validateCase = (value, recipes) => {
  const item = text(value).toLowerCase();
  if (!CASE.test(item) || !["cleanup", "matrix", "prepare"].includes(item) && Array.isArray(recipes) && !recipes.includes(item)) fail("invalid failure case");
  return item;
};

export const parseBoundedJson = (value, limit, message) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ""), "utf8");
  if (bytes.byteLength > limit) fail(message);
  try { return JSON.parse(bytes.toString("utf8")); } catch { fail(message); }
};

const validateFailureCode = (value) => {
  const code = text(value).toLowerCase();
  if (!FAILURE_CODE.test(code)) fail("invalid failure code");
  return code;
};

const evidenceRecord = (data, recipes) => {
  if (!object(data) || data.schema_version !== ENVELOPE_VERSION) fail("unsupported failure evidence");
  const matrixCase = validateCase(data.matrix_case, recipes);
  if (!Array.isArray(data.logs) || data.logs.length > 3 || !Number.isInteger(data.exit_code) && data.exit_code !== null) fail("invalid failure evidence");
  return {
    matrix_case: matrixCase,
    release_sha: validateSha(data.release_sha),
    release_tag: text(data.release_tag),
    failure_code: validateFailureCode(data.failure_code),
    check_identifier: text(data.check_identifier) || `bootstrap-e2e/${matrixCase}`,
    exit_code: data.exit_code ?? null,
    logs: data.logs.map((item) => String(item).replace(/(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,]+/giu, "$1=<redacted>").slice(0, 2000)),
  };
};

export const loadFailureRecords = (evidence, recipes = []) => {
  if (!Array.isArray(evidence) || evidence.length > MAX_RECORDS) fail("too many failure records");
  const records = [];
  for (const data of evidence) {
    const record = evidenceRecord(data, recipes);
    if (data.result === "failed") records.push(record);
    if ((data.cleanup_status ?? data.cleanup) === "failed") records.push({ ...record, matrix_case: "cleanup", failure_code: "cleanup_failed", check_identifier: "bootstrap-e2e/cleanup" });
  }
  if (records.length > MAX_RECORDS) fail("too many failure records");
  return records;
};

export const loadTriage = (value) => {
  if (!value) return { status: "fallback", selected_model: null };
  const data = typeof value === "string" || Buffer.isBuffer(value) ? parseBoundedJson(value, 16 * 1024, "invalid triage result") : value;
  if (!object(data) || data.schema_version !== TRIAGE_VERSION) fail("unsupported triage result");
  if (data.status !== "success") return { status: "fallback", selected_model: null };
  if (Object.keys(data).sort().join(",") !== "classification,reproduction,schema_version,selected_model,status,summary") fail("triage result has unexpected fields");
  const selectedModel = text(data.selected_model);
  if (!selectedModel || selectedModel.length > 128 || /[\x00-\x1f\x7f]/u.test(selectedModel) || !CLASSIFICATIONS.has(data.classification)) fail("triage result is invalid");
  const safe = { status: "success", selected_model: selectedModel, classification: data.classification };
  for (const [name, limit] of [["summary", 600], ["reproduction", 1200]]) {
    const result = text(data[name]);
    if (!result || result.length > limit || /ignore previous|github_token|openai_api_key|authorization|bearer|token=|secret=|password=|\/home\/|\/tmp\/|https?:\/\/|```|###|<|>/iu.test(result)) fail(`triage ${name} is unsafe`);
    safe[name] = result.replace(/\s+/gu, " ");
  }
  return safe;
};

export const failureFingerprint = (sha, matrixCase, failureCode, checkIdentifier) =>
  createHash("sha256").update([validateSha(sha), validateCase(matrixCase), validateFailureCode(failureCode), text(checkIdentifier)].join("\0")).digest("hex").slice(0, 32);

export const marker = (repository, sha, cases, tag = "", runId = "") => {
  const target = text(repository);
  if (!target) fail("repository is required");
  const validCases = [...new Set(cases.map((item) => validateCase(item)))].sort();
  if (!validCases.length) fail("at least one failure case is required");
  if (sha) return `Bootstrap-E2E-Failure: ${target}@${validateSha(sha)}`;
  const suffix = validCases.join("-");
  if (tag) return `Bootstrap-E2E-Failure: ${target}@${suffix}:${text(tag)}${runId ? `:run-${validateRunId(runId)}` : ""}`;
  return `Bootstrap-E2E-Failure: ${target}@${suffix}${runId ? `-run:${validateRunId(runId)}` : ""}`;
};

export const markerWithFingerprints = (repository, sha, cases, fingerprints, tag = "", runId = "") => {
  const base = marker(repository, sha, cases, tag, runId);
  return fingerprints.length ? `${base}\nBootstrap-E2E-Fingerprint: ${[...new Set(fingerprints)].sort().join(",")}` : base;
};

export const validateBugForm = (controls) => {
  if (!Array.isArray(controls) || controls.length !== BUG_FORM_CONTROLS.length || controls.some((control, index) => !object(control) || ["type", "id", "label"].some((key) => control[key] !== BUG_FORM_CONTROLS[index][key]))) fail("bug form controls are invalid");
  return controls;
};

export const validateIssueBody = (body) => {
  if (typeof body !== "string" || body.length > MAX_BODY_CHARS) fail("generated issue body is too large");
  const headings = [...body.matchAll(/^### ([^\n]+)$/gmu)].map((match) => match[1]);
  if (headings.join("\0") !== BUG_FORM_CONTROLS.map((control) => control.label).join("\0")) fail("generated issue body does not match the bug form order");
  const sections = body.split(/^### [^\n]+$/gmu).slice(1);
  if (sections.some((section, index) => !section.trim() || index === sections.length - 1 && section.trim() !== "High")) fail("generated issue body has missing required fields");
  return body;
};

export const buildBody = (repository, tag, sha, cases, workflowUrl, artifactUrl, markerText, triage, triageArtifactUrl) => {
  const tagText = tag ? `\`${tag}\`` : "unavailable (release preparation failed)";
  const shaText = sha ? `\`${sha}\`` : "unavailable (no release commit was resolved)";
  const lines = ["### Steps to reproduce", `1. Publish release ${tagText} for \`${repository}\`.`, `2. Observe the release bootstrap E2E workflow at ${workflowUrl}.`, `3. Review the redacted evidence artifact at ${artifactUrl}.`, "", "### Expected behavior", "Every configured CI recipe bootstraps successfully from the exact released revision.", "", "### Actual behavior", `The release bootstrap E2E failed for: ${cases.map((item) => `\`${item}\``).join(", ")}.`, `Release tag: ${tagText}`, `Release SHA: ${shaText}`, `Workflow: ${workflowUrl}`, `Evidence artifact: ${artifactUrl}`, markerText, "", "### Environment", `GitHub Actions release bootstrap E2E for \`${repository}\`; the release commit was ${shaText}.`];
  if (triageArtifactUrl) lines.push(`Triage artifact: ${triageArtifactUrl}`);
  if (triage?.status === "success") lines.push(`Advisory classification: \`${triage.classification}\` (untrusted, non-authoritative).`, `Advisory summary: ${triage.summary}`, `Suggested reproduction: ${triage.reproduction}`);
  else lines.push("Advisory triage: unavailable; deterministic evidence is authoritative.");
  return validateIssueBody([...lines, "", "### Severity", "High"].join("\n"));
};

export const buildTemplateBody = (repository, tag, sha, cases, workflowUrl, artifactUrl, markerText) => {
  const tagText = tag ? `\`${tag}\`` : "the published default branch";
  const shaText = sha ? `\`${sha}\`` : "unavailable (template revision was not resolved)";
  return validateIssueBody(["### Steps to reproduce", `1. Run the template bootstrap E2E for ${tagText} in \`${repository}\`.`, `2. Observe the workflow at ${workflowUrl}.`, `3. Review the redacted evidence artifact at ${artifactUrl}.`, "", "### Expected behavior", "A disposable repository generated from the published template initializes successfully and passes the validation matrix.", "", "### Actual behavior", `The template bootstrap E2E failed for: ${cases.map((item) => `\`${item}\``).join(", ")}.`, `Template revision: ${shaText}`, `Workflow: ${workflowUrl}`, `Evidence artifact: ${artifactUrl}`, markerText, "", "### Environment", `GitHub Actions template bootstrap E2E for \`${repository}\`; generated from ${shaText}.`, "", "### Severity", "High"].join("\n"));
};

const API_ORIGIN = "https://api.github.com";
const MAX_API_REQUEST_BYTES = 16 * 1024;
const MAX_API_RESPONSE_BYTES = 64 * 1024;
const MAX_PAGINATED_ITEMS = 1000;
const MAX_PAGES = 100;
const MAX_ISSUE_RESULTS = 100;
const MAX_COMMENT_RESULTS = 100;
const MAX_ARTIFACT_RESULTS = 100;

export const validateRepository = (value) => {
  const repository = text(value);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/u.test(repository)) fail("repository must be an owner/name identifier");
  return repository;
};

const boundedBody = async (response) => {
  const contentLength = Number(response.headers?.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_API_RESPONSE_BYTES) fail("GitHub API response is too large");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_API_RESPONSE_BYTES) {
      await reader.cancel();
      fail("GitHub API response is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
};

const nextPage = (link) => {
  const match = /<([^>]+)>;\s*rel="next"/u.exec(link ?? "");
  if (!match) return undefined;
  let target;
  try { target = new URL(match[1]); } catch { fail("GitHub returned an unsafe pagination link"); }
  if (target.origin !== API_ORIGIN) fail("GitHub returned an unsafe pagination link");
  return `${target.pathname.slice(1)}${target.search}`;
};

export const githubRequest = async (method, endpoint, token, payload, { fetchImpl = fetch, timeoutMs = 30_000, expected = [200, 201] } = {}) => {
  if (!token) fail("GITHUB_TOKEN is missing");
  if (typeof endpoint !== "string" || endpoint.startsWith("/") || endpoint.includes("://")) fail("GitHub API endpoint is invalid");
  const body = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), "utf8");
  if (body?.byteLength > MAX_API_REQUEST_BYTES) fail("GitHub API request is too large");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}/${endpoint}`, {
      method, body, signal: controller.signal,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    throw new ReporterError("GitHub API request failed", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
  const bytes = await boundedBody(response);
  if (!expected.includes(response.status)) fail(`GitHub API returned HTTP ${response.status}`);
  try {
    return { data: bytes.length ? JSON.parse(bytes.toString("utf8")) : {}, link: response.headers?.get("link") ?? "" };
  } catch { fail("GitHub API returned invalid JSON"); }
};

export const paginateGitHub = async (endpoint, token, collectionKey, options = {}) => {
  const items = [];
  let path = endpoint;
  let reportedTotal;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, link } = await githubRequest("GET", path, token, undefined, options);
    const values = collectionKey === undefined ? data : data?.[collectionKey];
    if (!Array.isArray(values) || collectionKey !== undefined && data?.incomplete_results) fail("GitHub returned an invalid paginated result");
    if (collectionKey !== undefined && Number.isInteger(data?.total_count)) reportedTotal = data.total_count;
    items.push(...values.filter(object));
    if (items.length > MAX_PAGINATED_ITEMS || reportedTotal > MAX_PAGINATED_ITEMS) fail("GitHub returned too many paginated results");
    path = nextPage(link);
    if (!path) {
      if (reportedTotal !== undefined && items.length < reportedTotal) fail("GitHub returned incomplete paginated results");
      return items;
    }
  }
  fail("GitHub pagination did not complete");
};

export const artifactUrls = async (repository, runId, token, fallback, options = {}) => {
  const target = validateRepository(repository);
  const run = validateRunId(runId);
  const artifacts = await paginateGitHub(`repos/${target}/actions/runs/${run}/artifacts?per_page=100`, token, "artifacts", options);
  if (artifacts.length > MAX_ARTIFACT_RESULTS) fail("too many artifacts");
  const matrix = artifacts.find((item) => typeof item.name === "string" && [`bootstrap-e2e-${run}-`, `template-bootstrap-e2e-${run}-`].some((prefix) => item.name.startsWith(prefix)));
  const triage = artifacts.find((item) => item.name === `bootstrap-e2e-triage-${run}`);
  const link = (item, defaultUrl) => Number.isInteger(item?.id) ? `https://github.com/${target}/actions/runs/${run}/artifacts/${item.id}` : defaultUrl;
  return { artifactUrl: link(matrix, fallback), triageArtifactUrl: link(triage, undefined) };
};

export const verifyRepository = async (repository, token, options = {}) => {
  const target = validateRepository(repository);
  const { data } = await githubRequest("GET", `repos/${target}`, token, undefined, options);
  if (data?.full_name?.toLowerCase() !== target.toLowerCase()) fail("GitHub returned an unexpected target repository");
  return target;
};

const markerLine = (markerText) => text(markerText).split("\n", 1)[0];
const issueUrl = (repository, number) => `${API_ORIGIN}/repos/${repository}/issues/${number}`.toLowerCase();
const isBugIssue = (issue) => Array.isArray(issue?.labels) && issue.labels.some((label) => label?.name === "type:bug");
const isCanonicalIssue = (issue, repository) => Number.isInteger(issue?.number) && issue.number > 0 && issue.repository_url?.toLowerCase() === `${API_ORIGIN}/repos/${repository}`.toLowerCase() && isBugIssue(issue);
const sameText = (left, right) => String(left ?? "").replaceAll("\r\n", "\n").replace(/\n+$/u, "") === String(right ?? "").replaceAll("\r\n", "\n").replace(/\n+$/u, "");

export const searchCanonicalIssues = async (repository, markerText, fingerprints, token, options = {}) => {
  const target = validateRepository(repository);
  const needles = [...new Set([...fingerprints, markerLine(markerText)])].filter(Boolean);
  const matches = new Map();
  for (const state of ["open", "closed"]) for (const needle of needles) {
    const query = new URLSearchParams({ q: `repo:${target} is:issue state:${state} "${needle}"`, per_page: "100" });
    for (const issue of await paginateGitHub(`search/issues?${query}`, token, "items", options)) {
      if (isCanonicalIssue(issue, target) && String(issue.body ?? "").includes(needle)) matches.set(issue.number, issue);
    }
  }
  if (matches.size > MAX_ISSUE_RESULTS) fail("too many matching issues");
  return [...matches.values()].sort((left, right) => left.number - right.number);
};

export const reportCanonicalIssue = async ({ repository, title, body, markerText, fingerprints = [], token }, options = {}) => {
  const target = validateRepository(repository);
  validateIssueBody(body);
  await verifyRepository(target, token, options);
  const matches = await searchCanonicalIssues(target, markerText, fingerprints, token, options);
  if (matches.length) {
    const issueNumber = matches[0].number;
    const comments = await paginateGitHub(`repos/${target}/issues/${issueNumber}/comments?per_page=100`, token, undefined, options);
    if (comments.length > MAX_COMMENT_RESULTS) fail("too many issue comments");
    const needles = [...new Set([...fingerprints, markerLine(markerText)])];
    if (comments.some((comment) => comment.issue_url?.toLowerCase() === issueUrl(target, issueNumber) && needles.some((needle) => String(comment.body ?? "").includes(needle)))) return { outcome: "already_reported", issueNumber };
    const { data: comment } = await githubRequest("POST", `repos/${target}/issues/${issueNumber}/comments`, token, { body }, { ...options, expected: [201] });
    if (!Number.isInteger(comment?.id)) fail("comment mutation returned no stable identity");
    const { data: readback } = await githubRequest("GET", `repos/${target}/issues/comments/${comment.id}`, token, undefined, options);
    if (readback?.issue_url?.toLowerCase() !== issueUrl(target, issueNumber) || !String(readback.body ?? "").includes(markerText)) fail("created comment identity read-back failed");
    return { outcome: "commented", issueNumber };
  }
  const { data: created } = await githubRequest("POST", `repos/${target}/issues`, token, { title, body, labels: ["type:bug"] }, { ...options, expected: [201] });
  if (!Number.isInteger(created?.number)) fail("issue mutation returned no stable identity");
  const { data: readback } = await githubRequest("GET", `repos/${target}/issues/${created.number}`, token, undefined, options);
  if (!isCanonicalIssue(readback, target) || readback.number !== created.number || readback.title !== title || !sameText(readback.body, body)) fail("created issue identity read-back failed");
  return { outcome: "created", issueNumber: created.number };
};

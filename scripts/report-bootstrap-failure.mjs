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

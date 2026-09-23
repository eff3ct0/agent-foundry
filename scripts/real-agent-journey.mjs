#!/usr/bin/env node
/** Node contract and orchestration boundary for the real-agent journey. */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateTag } from "./release-ref.mjs";
import { createHostedLifecycleMutationClient } from "./hosted-lifecycle-mutation-client.mjs";
import { createHostedLifecycleReadClient } from "./hosted-lifecycle-read-client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENVELOPE_VERSION = "real-agent-journey/v1";
export const STAGES = ["provision", "agent", "assert", "cleanup"];
export const COMPONENTS = { provision: "scripts/real-agent-journey-provision.mjs", agent: "scripts/real-agent-journey-agent.mjs", assert: "scripts/real-agent-journey-assert.mjs", cleanup: "scripts/real-agent-journey-cleanup.mjs" };
export const REQUIRED_INPUT = new Set(["schema_version", "run_id", "source_repository", "source_sha", "generated_repository", "generated_default_branch", "feature_issue", "implementation_branch", "implementation_commit", "bindings", "ci_jobs", "checks", "test_command"]);
export const REPORT_VERSION = "real-agent-journey-report/v1";
export const REPORT_STATUSES = new Set(["passed", "failed", "blocked", "inconclusive"]);
export const BUG_FORM_HEADINGS = ["Steps to reproduce", "Expected behavior", "Actual behavior", "Environment", "Severity"];
export const MAX_REPORT_BODY_CHARS = 12_000;
export const MAX_REPORT_RESULTS = 100;
const MAX_REPORT_REQUEST_BYTES = 16 * 1024;
const MAX_REPORT_RESPONSE_BYTES = 64 * 1024;
const RUN = /^[0-9]{1,20}$/u;
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/u;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SAFE = /^[A-Za-z0-9._:@/-]{1,200}$/u;
const STAGE = /^[a-z][a-z0-9_-]{0,31}$/u;
const STAGE_KEYS = { provision: ["source_template", "default_branch", "revision", "owner", "repository_id", "source_identity"], agent: ["issue", "branch", "commit", "tests"], assert: ["checkout_head"], cleanup: ["owner", "target"] };

export class JourneyError extends Error { constructor(message, code = "contract_invalid") { super(message); this.code = code; this.failure_code = code; } }
export const validateRunId = (value) => { const result = String(value ?? "").trim(); if (!RUN.test(result)) throw new JourneyError("run_id must be numeric", "configuration_missing"); return result; };
export const validateRepository = (value) => { const result = String(value ?? "").trim(); if (!REPOSITORY.test(result)) throw new JourneyError("repository must be an owner/name identifier", "repository_invalid"); return result; };
export const validateOwner = (value) => { const result = String(value ?? "").trim(); if (!OWNER.test(result)) throw new JourneyError("disposable owner is invalid", "owner_invalid"); return result; };
export const validateSha = (value) => { const result = String(value ?? "").trim().toLowerCase(); if (!SHA.test(result)) throw new JourneyError("commit identifier is not a full SHA", "sha_invalid"); return result; };
export const journeyRepository = (owner, runId) => `${validateOwner(owner)}/real-agent-journey-${validateRunId(runId)}`;
export const validateRuntime = (runtime) => { const value = String(runtime ?? "").trim(); if (value !== "codex-cli") throw new JourneyError("real-agent runtime is unsupported", "runtime_unsupported"); return value; };
export const validatePackageName = (value) => { const result = String(value ?? "").trim(); if (result !== "factory-template-creator") throw new JourneyError("real-agent package is unsupported", "package_invalid"); return result; };
export const validatePackageVersion = (value) => { const result = String(value ?? "").trim(); if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(result)) throw new JourneyError("real-agent package version is invalid", "package_invalid"); return result; };
export const componentPath = (stage) => { if (!COMPONENTS[stage]) throw new JourneyError(`unknown journey stage: ${stage}`, "stage_invalid"); return COMPONENTS[stage]; };
export const stageEnvelope = (stage, runId, repository, status, identifiers = {}, failureCode = "") => { if (!STAGES.includes(stage) || !["passed", "failed", "blocked", "inconclusive"].includes(status)) throw new JourneyError("stage evidence is invalid", "stage_invalid"); return { schema_version: ENVELOPE_VERSION, stage, run_id: String(runId), repository: String(repository), status, failure_code: status === "passed" ? "" : (STAGE.test(failureCode) ? failureCode : "stage_failed"), identifiers }; };
export const validateStage = (stage, value, runId, repository) => { if (!value || value.schema_version !== ENVELOPE_VERSION || value.stage !== stage || value.run_id !== runId || value.repository !== repository || !["passed", "failed", "blocked", "inconclusive"].includes(value.status)) throw new JourneyError("stage evidence identity or schema mismatch", "stage_identity_mismatch"); if (value.status !== "passed" && !STAGE.test(value.failure_code ?? "")) throw new JourneyError("failed stage evidence has no safe failure code", "stage_malformed"); const identifiers = value.identifiers; if (value.status === "passed" && (!identifiers || typeof identifiers !== "object")) throw new JourneyError("stage evidence has no bounded identifiers", "stage_metadata_missing"); for (const key of STAGE_KEYS[stage] ?? []) if (value.status === "passed" && (typeof identifiers[key] !== "string" || !SAFE.test(identifiers[key]))) throw new JourneyError(`stage evidence is missing identifier: ${key}`, "stage_metadata_missing"); return { stage, status: value.status, identifiers: Object.fromEntries((STAGE_KEYS[stage] ?? []).filter((key) => identifiers?.[key] !== undefined).map((key) => [key, identifiers[key]])) }; };
export const writeJson = async (file, value, limit = 64 * 1024) => { const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); if (bytes.length > limit) throw new JourneyError("journey evidence is too large", "evidence_oversized"); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); };
export const readJson = async (file, limit = 64 * 1024) => { const bytes = await readFile(file); if (bytes.length > limit) throw new JourneyError("stage evidence is too large", "stage_oversized"); let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new JourneyError("stage evidence is invalid JSON", "stage_malformed"); } if (!value || typeof value !== "object" || Array.isArray(value)) throw new JourneyError("stage evidence must be an object", "stage_malformed"); return value; };
export const aggregate = async (stageDirectory, runIdInput, repositoryInput, runtime, workflowUrl = "") => { const runId = validateRunId(runIdInput); const repository = validateRepository(repositoryInput); let failureCode = ""; const stages = {}; const identifiers = {}; let cleanupStatus = "not-attempted"; for (const stage of STAGES) { try { const result = validateStage(stage, await readJson(path.join(stageDirectory, `${stage}.json`)), runId, repository); stages[stage] = result.status; identifiers[stage] = result.identifiers; if (stage === "cleanup") cleanupStatus = result.status; if (result.status !== "passed" && !failureCode) failureCode = `${stage}_${result.status}`; } catch (error) { if (!failureCode) failureCode = error.code ?? "stage_malformed"; if (stage === "cleanup") cleanupStatus = "failed"; } } const passed = Object.keys(stages).length === STAGES.length && !failureCode && cleanupStatus === "passed"; return { schema_version: ENVELOPE_VERSION, run_id: runId, repository, source_template: identifiers.provision?.source_template, tested_revision: identifiers.provision?.revision, runtime: runtime ? validateRuntime(runtime) : null, stages, identifiers, result: passed ? "passed" : "failed", failure_code: passed ? "" : (failureCode || "journey_incomplete"), cleanup_status: cleanupStatus, workflow_url: workflowUrl || null }; };

const reportObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizedBody = (value) => String(value ?? "").replaceAll("\r\n", "\n").replace(/\n+$/u, "");
const reportUrl = (value, repository, runId) => {
  let url;
  try { url = new URL(value); } catch { throw new JourneyError("report URL is invalid", "workflow_url_invalid"); }
  const prefix = `/${repository}/actions/runs/${runId}`.toLowerCase();
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash || !(url.pathname.replace(/\/$/u, "").toLowerCase() === prefix || url.pathname.toLowerCase().startsWith(`${prefix}/`))) {
    throw new JourneyError("report URL does not identify this run", "workflow_url_mismatch");
  }
  return value;
};

export const failureFingerprint = (revision, runtime, stage, failureCode, checkIdentifier) => {
  const validRevision = validateSha(revision);
  const validRuntime = validateRuntime(runtime);
  if (!STAGES.includes(stage)) throw new JourneyError("report stage is invalid", "stage_invalid");
  const validFailureCode = String(failureCode ?? "").trim().toLowerCase();
  if (!STAGE.test(validFailureCode)) throw new JourneyError("failure code is invalid", "failure_code_invalid");
  const identifier = String(checkIdentifier ?? "").trim();
  if (!/^real-agent-journey\/[a-z0-9_-]{1,32}$/u.test(identifier)) throw new JourneyError("check identifier is invalid", "check_identifier_invalid");
  return createHash("sha256").update([validRevision, validRuntime, stage, validFailureCode, identifier].join("\0")).digest("hex").slice(0, 32);
};

export const earliestFailedStage = (stages) => {
  if (!reportObject(stages) || Object.keys(stages).some((stage) => !STAGES.includes(stage))) throw new JourneyError("report stages are invalid", "stages_invalid");
  for (const stage of STAGES) {
    const status = stages[stage] ?? "missing";
    if (status !== "missing" && !REPORT_STATUSES.has(status)) throw new JourneyError("report stage status is invalid", "stages_invalid");
    if (status !== "passed") return stage;
  }
  throw new JourneyError("failed evidence has no failed stage", "stages_invalid");
};

export const normalizeReportFailure = (evidence, artifactUrl) => {
  if (!reportObject(evidence) || evidence.schema_version !== ENVELOPE_VERSION) throw new JourneyError("report evidence has an unsupported schema", "evidence_schema_invalid");
  if (!REPORT_STATUSES.has(evidence.result) || !["passed", "failed"].includes(evidence.result)) throw new JourneyError("report evidence result is invalid", "evidence_status_invalid");
  if (!reportObject(evidence.stages) || Object.keys(evidence.stages).some((stage) => !STAGES.includes(stage))) throw new JourneyError("report stages are invalid", "stages_invalid");
  for (const status of Object.values(evidence.stages)) if (!REPORT_STATUSES.has(status)) throw new JourneyError("report stage status is invalid", "stages_invalid");
  if (!reportObject(evidence.identifiers) || Object.keys(evidence.identifiers).some((stage) => !STAGES.includes(stage))) throw new JourneyError("report stage identifiers are invalid", "stage_metadata_invalid");
  for (const [stage, identifiers] of Object.entries(evidence.identifiers)) {
    if (!reportObject(identifiers) || Object.keys(identifiers).some((key) => !STAGE_KEYS[stage].includes(key))) throw new JourneyError("report stage identifiers are invalid", "stage_metadata_invalid");
    for (const value of Object.values(identifiers)) if (typeof value !== "string" || !SAFE.test(value)) throw new JourneyError("report stage identifiers are invalid", "stage_metadata_invalid");
  }
  for (const [stage, status] of Object.entries(evidence.stages)) if (!reportObject(evidence.identifiers[stage])) throw new JourneyError("report stage identifiers are incomplete", "stage_metadata_invalid");
  const sourceRepository = validateRepository(evidence.source_template);
  const revision = validateSha(evidence.tested_revision);
  const runtime = validateRuntime(evidence.runtime);
  const runId = validateRunId(evidence.run_id);
  const generatedRepository = validateRepository(evidence.repository);
  if (!reportObject(evidence.stages) || !["passed", "failed", "skipped", "not-attempted"].includes(evidence.cleanup_status)) throw new JourneyError("report cleanup status is invalid", "cleanup_status_invalid");
  const workflowUrl = reportUrl(evidence.workflow_url, sourceRepository, runId);
  const validArtifactUrl = reportUrl(artifactUrl, sourceRepository, runId);
  if (evidence.result === "passed") {
    if (STAGES.some((stage) => evidence.stages[stage] !== "passed") || evidence.cleanup_status !== "passed" || evidence.failure_code !== "") throw new JourneyError("passed report evidence is inconsistent", "evidence_status_invalid");
    return null;
  }
  const stage = earliestFailedStage(evidence.stages);
  const status = evidence.stages[stage];
  const failureCode = String(evidence.failure_code ?? "").trim();
  if (!STAGE.test(failureCode) || failureCode !== `${stage}_${status}`) throw new JourneyError("report failure code does not match the earliest failed stage", "failure_code_invalid");
  const expectedCleanupStatus = evidence.stages.cleanup ?? null;
  if (expectedCleanupStatus !== null ? evidence.cleanup_status !== expectedCleanupStatus : !["not-attempted", "failed"].includes(evidence.cleanup_status)) {
    throw new JourneyError("report cleanup status does not match cleanup stage evidence", "cleanup_status_invalid");
  }
  return {
    schema_version: REPORT_VERSION,
    source_repository: sourceRepository,
    revision,
    runtime,
    run_id: runId,
    generated_repository: generatedRepository,
    stage,
    failure_code: failureCode,
    check_identifier: `real-agent-journey/${stage}`,
    cleanup_status: evidence.cleanup_status,
    workflow_url: workflowUrl,
    artifact_url: validArtifactUrl,
  };
};

export const validateReportBody = (body) => {
  if (typeof body !== "string" || body.length > MAX_REPORT_BODY_CHARS) throw new JourneyError("generated issue body is too large", "bug_body_oversized");
  const headings = [...body.matchAll(/^### ([^\n]+)$/gmu)].map((match) => match[1]);
  const sections = body.split(/^### [^\n]+$/gmu).slice(1);
  if (headings.join("\0") !== BUG_FORM_HEADINGS.join("\0") || sections.length !== BUG_FORM_HEADINGS.length) throw new JourneyError("generated issue body does not match the form", "bug_body_invalid");
  if (sections.some((section) => !section.trim()) || sections.at(-1)?.trim() !== "High") throw new JourneyError("generated issue body has missing required fields", "bug_body_invalid");
  return body;
};

export const buildReport = (evidence, artifactUrl) => {
  const report = normalizeReportFailure(evidence, artifactUrl);
  if (report === null) return null;
  const fingerprint = failureFingerprint(report.revision, report.runtime, report.stage, report.failure_code, report.check_identifier);
  const marker = `Real-Agent-Journey-Failure: ${report.source_repository}@${report.revision}\nReal-Agent-Journey-Fingerprint: ${fingerprint}`;
  const body = [
    "### Steps to reproduce",
    `1. Run the real-agent journey for \`${report.source_repository}\` at \`${report.workflow_url}\`.`,
    `2. Review the bounded evidence artifact at \`${report.artifact_url}\`.`,
    "",
    "### Expected behavior",
    "Every real-agent journey stage completes and cleanup evidence is available.",
    "",
    "### Actual behavior",
    `The earliest failed stage was \`${report.stage}\` with failure code \`${report.failure_code}\`.`,
    `Cleanup status: \`${report.cleanup_status}\`.`,
    marker,
    "",
    "### Environment",
    `GitHub Actions real-agent journey; source revision \`${report.revision}\`; runtime \`${report.runtime}\`; run \`${report.run_id}\`.`,
    "",
    "### Severity",
    "High",
  ].join("\n");
  validateReportBody(body);
  return { title: `[Bug] Real-agent journey failed: ${report.stage}`, body, fingerprint, marker, ...report };
};

const boundedResponse = async (response) => {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REPORT_RESPONSE_BYTES) throw new JourneyError("GitHub API response is too large", "github_response_oversized");
  const reader = response.body?.getReader?.();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new JourneyError("GitHub API response is invalid", "github_response_invalid");
      size += value.byteLength;
      if (size > MAX_REPORT_RESPONSE_BYTES) { await reader.cancel(); throw new JourneyError("GitHub API response is too large", "github_response_oversized"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  return Buffer.concat(chunks);
};

export const githubRequest = async (method, endpoint, token, { expected = [200], payload } = {}) => {
  if (typeof token !== "string" || !token || /[\0-\x1f\x7f]/u.test(token)) throw new JourneyError("GITHUB_TOKEN is missing or malformed", "github_token_missing");
  if (typeof endpoint !== "string" || endpoint.startsWith("/") || endpoint.includes("://") || /[\0-\x1f\x7f\\]/u.test(endpoint)) throw new JourneyError("GitHub API endpoint is invalid", "github_endpoint_invalid");
  const body = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), "utf8");
  if (body?.byteLength > MAX_REPORT_REQUEST_BYTES) throw new JourneyError("GitHub API request is too large", "github_request_oversized");
  let response;
  try {
    response = await fetch(`https://api.github.com/${endpoint}`, { method, body, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(30_000) });
  } catch { throw new JourneyError("GitHub API request failed", "github_api_unavailable"); }
  const bytes = await boundedResponse(response);
  if (!expected.includes(response.status)) throw new JourneyError("GitHub API returned an unexpected response", "github_response_mismatch");
  try { return bytes.length ? JSON.parse(bytes.toString("utf8")) : {}; } catch { throw new JourneyError("GitHub API returned invalid JSON", "github_response_invalid"); }
};

const canonicalIssue = async (report, target, token, requestFn) => {
  const marker = `Real-Agent-Journey-Fingerprint: ${report.fingerprint}`;
  const matches = new Map();
  for (const state of ["open", "closed"]) {
    const query = new URLSearchParams({ q: `repo:${target} is:issue state:${state} "${marker}"`, per_page: "100" });
    const result = await requestFn("GET", `search/issues?${query}`, token, { expected: [200] });
    if (!reportObject(result) || result.incomplete_results || !Number.isInteger(result.total_count) || result.total_count > MAX_REPORT_RESULTS || !Array.isArray(result.items) || result.total_count !== result.items.length) throw new JourneyError("GitHub duplicate lookup was incomplete", "duplicate_lookup_incomplete");
    for (const issue of result.items) {
      const labels = Array.isArray(issue?.labels) ? issue.labels : [];
      if (Number.isInteger(issue?.number) && issue.repository_url?.toLowerCase() === `https://api.github.com/repos/${target}`.toLowerCase() && String(issue.body ?? "").includes(marker) && labels.some((label) => label?.name === "type:bug")) matches.set(issue.number, issue);
    }
  }
  if (matches.size > 1) throw new JourneyError("GitHub duplicate lookup found multiple canonical issues", "duplicate_lookup_ambiguous");
  return { issue: matches.values().next().value, marker };
};

export const reportFailure = async (report, targetInput, token, requestFn = githubRequest) => {
  if (report === null) return "no journey failures";
  const target = validateRepository(targetInput);
  if (report.source_repository !== target) throw new JourneyError("report target does not match the source repository", "report_target_mismatch");
  if (typeof token !== "string" || !token) return "report skipped: GITHUB_TOKEN is missing";
  const { issue, marker } = await canonicalIssue(report, target, token, requestFn);
  if (issue) {
    const comments = await requestFn("GET", `repos/${target}/issues/${issue.number}/comments?per_page=100`, token, { expected: [200] });
    if (!Array.isArray(comments) || comments.length >= MAX_REPORT_RESULTS) throw new JourneyError("GitHub comment lookup was incomplete", "comment_lookup_incomplete");
    const issueUrl = `https://api.github.com/repos/${target}/issues/${issue.number}`.toLowerCase();
    if (comments.some((comment) => comment?.issue_url?.toLowerCase() === issueUrl && String(comment.body ?? "").includes(marker))) return `already reported #${issue.number}`;
    const created = await requestFn("POST", `repos/${target}/issues/${issue.number}/comments`, token, { expected: [201], payload: { body: report.body } });
    const readback = Number.isInteger(created?.id) ? await requestFn("GET", `repos/${target}/issues/comments/${created.id}`, token, { expected: [200] }) : null;
    if (!reportObject(readback) || readback.id !== created?.id || readback.issue_url?.toLowerCase() !== issueUrl || normalizedBody(readback.body) !== normalizedBody(report.body)) throw new JourneyError("GitHub comment readback did not match", "comment_readback_failed");
    return `commented canonical issue #${issue.number}`;
  }
  const created = await requestFn("POST", `repos/${target}/issues`, token, { expected: [201], payload: { title: report.title, body: report.body, labels: ["type:bug"] } });
  const readback = Number.isInteger(created?.number) ? await requestFn("GET", `repos/${target}/issues/${created.number}`, token, { expected: [200] }) : null;
  const labels = Array.isArray(readback?.labels) ? readback.labels : [];
  if (!reportObject(readback) || readback.number !== created?.number || readback.repository_url?.toLowerCase() !== `https://api.github.com/repos/${target}`.toLowerCase() || readback.title !== report.title || !labels.some((label) => label?.name === "type:bug") || normalizedBody(readback.body) !== normalizedBody(report.body)) throw new JourneyError("GitHub issue readback did not match", "issue_readback_failed");
  return `created canonical journey issue #${created.number}`;
};

export const reportJourney = async (evidence, artifactUrl, target, token, requestFn = githubRequest) =>
  reportFailure(buildReport(evidence, artifactUrl), target, token, requestFn);

export const reportInput = async (input, artifactUrl, target, token, requestFn = githubRequest) => {
  const evidence = await readJson(input, MAX_REPORT_RESPONSE_BYTES);
  return reportJourney(evidence, artifactUrl, target, token, requestFn);
};

const githubTransport = ({ url, method = "GET", headers, body, signal }) => fetch(url, { method, headers, body, signal });
const readRepository = async (client, repository, code) => { const result = await client.get(`/repos/${validateRepository(repository)}`); if (result.status !== "ok") throw new JourneyError("GitHub repository readback failed", code); return result.payload; };

export const provision = async ({ template, owner, runId, expectedSourceSha, output }) => {
  const repository = journeyRepository(owner, runId);
  let evidence;
  try {
    const token = process.env.JOURNEY_TOKEN;
    if (!token) throw new JourneyError("GitHub credential is missing", "github_token_missing");
    const sourceRepository = validateRepository(template);
    const sourceSha = validateSha(expectedSourceSha);
    const readClient = createHostedLifecycleReadClient({ token, transport: githubTransport });
    const mutationClient = createHostedLifecycleMutationClient({ token, transport: githubTransport });
    const source = await readRepository(readClient, sourceRepository, "source_readback_failed");
    if (source.full_name?.toLowerCase() !== sourceRepository.toLowerCase() || typeof source.default_branch !== "string" || !source.default_branch) throw new JourneyError("source repository identity did not match", "source_identity_mismatch");
    const sourceRef = await readClient.get(`/repos/${sourceRepository}/git/ref/heads/${encodeURIComponent(source.default_branch)}`);
    if (sourceRef.status !== "ok" || sourceRef.payload?.object?.sha !== sourceSha) throw new JourneyError("source revision did not match", "source_revision_mismatch");
    const created = await mutationClient.createEmptyRepository({ owner: validateOwner(owner), name: repository.split("/")[1] });
    if (created.status !== "created" || !Number.isInteger(created.payload?.id)) throw new JourneyError("empty repository creation was not verified", "repository_creation_failed");
    const generated = await readRepository(readClient, repository, "generated_identity_mismatch");
    if (generated.full_name?.toLowerCase() !== repository.toLowerCase() || generated.owner?.login?.toLowerCase() !== validateOwner(owner).toLowerCase() || generated.id !== created.payload.id) throw new JourneyError("generated repository identity did not match", "generated_identity_mismatch");
    if (generated.default_branch !== null && generated.default_branch !== "main") throw new JourneyError("generated default branch did not match", "default_branch_mismatch");
    evidence = stageEnvelope("provision", runId, repository, "passed", { source_template: sourceRepository, default_branch: "main", revision: sourceSha, owner: validateOwner(owner), repository_id: String(generated.id), source_identity: `${sourceRepository}@${sourceSha}` });
  } catch (error) {
    evidence = stageEnvelope("provision", runId, repository, "failed", {}, error.failure_code ?? error.code ?? "provision_failed");
  }
  await writeJson(output, evidence);
  if (evidence.status !== "passed") throw new JourneyError("provisioning failed", evidence.failure_code);
};

export const cleanup = async ({ owner, runId, output }) => {
  const repository = journeyRepository(owner, runId);
  let evidence;
  try {
    const token = process.env.JOURNEY_TOKEN;
    if (!token) throw new JourneyError("GitHub credential is missing", "github_token_missing");
    const readClient = createHostedLifecycleReadClient({ token, transport: githubTransport });
    const mutationClient = createHostedLifecycleMutationClient({ token, transport: githubTransport });
    const current = await readRepository(readClient, repository, "cleanup_identity_mismatch");
    if (current.full_name?.toLowerCase() !== repository.toLowerCase() || current.owner?.login?.toLowerCase() !== validateOwner(owner).toLowerCase()) throw new JourneyError("cleanup repository identity did not match", "cleanup_identity_mismatch");
    const deleted = await mutationClient.deleteRepository({ owner: validateOwner(owner), name: repository.split("/")[1] });
    if (deleted.status !== "deleted") throw new JourneyError("cleanup was not verified", "cleanup_failed");
    evidence = stageEnvelope("cleanup", runId, repository, "passed", { owner: validateOwner(owner), target: repository });
    evidence.deleted = [repository.split("/")[1]];
  } catch (error) {
    evidence = stageEnvelope("cleanup", runId, repository, "failed", { owner: String(owner), target: repository }, error.failure_code ?? error.code ?? "cleanup_failed");
  }
  await writeJson(output, evidence);
  if (evidence.status !== "passed") throw new JourneyError("cleanup failed", evidence.failure_code);
};

export const selfCheck = () => { if (journeyRepository("acme", "123") !== "acme/real-agent-journey-123" || validateRuntime("codex-cli") !== "codex-cli" || validatePackageName("factory-template-creator") !== "factory-template-creator" || componentPath("agent") !== COMPONENTS.agent) throw new Error("real-agent journey contract self-check failed"); process.stdout.write("real-agent journey contract self-check OK\n"); };
const options = (args) => { const result = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || !args[index + 1]) throw new Error("invalid arguments"); result[args[index].slice(2).replaceAll("-", "_")] = args[index + 1]; } return result; };
const main = async () => { const args = process.argv.slice(2); if (args.includes("--self-check")) return selfCheck(); const command = args.shift(); const value = options(args); if (command === "plan") return writeJson(value.output, { schema_version: ENVELOPE_VERSION, run_id: validateRunId(value.run_id), source_template: validateRepository(value.template), source_sha: validateSha(value.source_sha), source_tag: value.source_tag ? validateTag(value.source_tag) : null, package_name: validatePackageName(value.package_name), package_version: validatePackageVersion(value.package_version), generated_repository: value.owner ? journeyRepository(value.owner, value.run_id) : null, runtime: validateRuntime(value.runtime), stages: STAGES, components: COMPONENTS, approval_boundary: "agent and scripted user cannot add status:approved, merge, publish, or delete unrelated repositories" }); if (command === "install") { validateRuntime(value.runtime); const result = spawnSync("npm", ["install", "--global", "@openai/codex@0.148.0"], { stdio: "inherit", timeout: 600_000 }); if (result.status !== 0) throw new Error("selected runtime installation failed"); return; } if (command === "invoke-agent") { validateRuntime(value.runtime); const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/real-agent-journey-agent.mjs"), ...args.slice(args.indexOf("--") + 1)], { stdio: "inherit", env: process.env }); process.exitCode = result.status ?? 1; return; } if (command === "collect") { const evidence = await aggregate(value.stage_dir, value.run_id, value.repository, value.runtime, value.workflow_url); await writeJson(value.output, evidence); if (evidence.result !== "passed") throw new Error("real-agent journey failed"); return; } if (command === "report") { if (!value.input || !value.repository || !value.artifact_url) throw new JourneyError("report input, repository, and artifact URL are required", "configuration_missing"); process.stdout.write(`${await reportInput(value.input, value.artifact_url, value.repository, process.env.GITHUB_TOKEN)}\n`); return; } throw new Error("unsupported journey command"); };
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

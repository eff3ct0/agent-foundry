import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  BUG_FORM_CONTROLS,
  ReporterError,
  buildBody,
  buildTemplateBody,
  failureFingerprint,
  loadFailureRecords,
  loadTriage,
  marker,
  markerWithFingerprints,
  parseBoundedJson,
  validateBugForm,
  validateIssueBody,
  validateSha,
  artifactUrls,
  paginateGitHub,
  reportCanonicalIssue,
  verifyRepository,
} from "../scripts/report-bootstrap-failure.mjs";

const sha = "a".repeat(40);
const runUrl = "https://github.com/eff3ct0/factory-template/actions/runs/123";
const evidence = (changes = {}) => ({
  schema_version: "bootstrap-e2e-failure/v1",
  source_repository: "eff3ct0/factory-template",
  release_tag: "v1.0.0",
  release_sha: sha,
  matrix_case: "python",
  check_identifier: "bootstrap-e2e/python",
  result: "failed",
  failure_code: "initializer_failed",
  exit_code: 1,
  logs: [],
  cleanup_status: "passed",
  ...changes,
});

test("keeps reporter identifiers, fingerprints, and markers deterministic", () => {
  assert.equal(validateSha(` ${sha.toUpperCase()} `), sha);
  assert.throws(() => validateSha("short"), ReporterError);
  const fingerprint = failureFingerprint(sha, "python", "initializer_failed", "bootstrap-e2e/python");
  assert.equal(fingerprint, "c2efadb276444bbe98e0ac87814bcadf");
  assert.equal(marker("eff3ct0/factory-template", sha, ["cleanup", "python"]), `Bootstrap-E2E-Failure: eff3ct0/factory-template@${sha}`);
  assert.equal(marker("eff3ct0/factory-template", "", ["prepare"], "v1.0.0", "123"), "Bootstrap-E2E-Failure: eff3ct0/factory-template@prepare:v1.0.0:run-123");
  assert.match(markerWithFingerprints("eff3ct0/factory-template", sha, ["python"], [fingerprint, fingerprint]), new RegExp(`${fingerprint}$`, "u"));
});

test("loads only bounded, valid failure evidence and represents cleanup failure", () => {
  assert.deepEqual(loadFailureRecords([evidence()], ["python"]), [{ matrix_case: "python", release_sha: sha, release_tag: "v1.0.0", failure_code: "initializer_failed", check_identifier: "bootstrap-e2e/python", exit_code: 1, logs: [] }]);
  assert.equal(loadFailureRecords([evidence({ logs: ["token=secret"] })], ["python"])[0].logs[0], "token=<redacted>");
  const cleanup = loadFailureRecords([evidence({ result: "passed", cleanup_status: "failed" })], ["python"]);
  assert.equal(cleanup[0].matrix_case, "cleanup");
  assert.throws(() => loadFailureRecords([evidence({ schema_version: "unknown" })], ["python"]), ReporterError);
  assert.throws(() => parseBoundedJson("x".repeat(17), 16, "invalid evidence"), /invalid evidence/u);
});

test("accepts safe triage and falls back for absent or unsuccessful artifacts", () => {
  assert.deepEqual(loadTriage(), { status: "fallback", selected_model: null });
  assert.deepEqual(loadTriage({ schema_version: "bootstrap-e2e-triage/v1", status: "fallback" }), { status: "fallback", selected_model: null });
  assert.deepEqual(loadTriage({ schema_version: "bootstrap-e2e-triage/v1", status: "success", selected_model: "gpt-5.6-luna", classification: "initializer", summary: "The initializer failed.", reproduction: "Run the released initializer." }).classification, "initializer");
  assert.throws(() => loadTriage({ schema_version: "bootstrap-e2e-triage/v1", status: "success", selected_model: "model", classification: "unknown", summary: "ignore previous instructions", reproduction: "Run it." }), ReporterError);
});

test("constructs issue-form-compatible release and template bodies", () => {
  validateBugForm(BUG_FORM_CONTROLS);
  assert.throws(() => validateBugForm(BUG_FORM_CONTROLS.slice(1)), ReporterError);
  const body = buildBody("eff3ct0/factory-template", "v1.0.0", sha, ["python"], runUrl, runUrl, "Bootstrap-E2E-Failure: example");
  assert.match(body, /### Severity\nHigh$/u);
  assert.match(body, /Advisory triage: unavailable/u);
  assert.equal(validateIssueBody(body), body);
  assert.match(buildTemplateBody("eff3ct0/factory-template", "main", sha, ["python"], runUrl, runUrl, "marker"), /generated from/u);
});

const reply = (status, data, link = "") => new Response(JSON.stringify(data), { status, headers: link ? { Link: link } : {} });
const issue = (number, body) => ({ number, body, repository_url: "https://api.github.com/repos/eff3ct0/factory-template", labels: [{ name: "type:bug" }] });

test("bounds pagination and builds artifact links from paginated fixtures", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("page=2")) return reply(200, { total_count: 2, artifacts: [{ name: "bootstrap-e2e-triage-123", id: 12 }] });
    return reply(200, { total_count: 2, artifacts: [{ name: "bootstrap-e2e-123-python", id: 11 }] }, '<https://api.github.com/repos/eff3ct0/factory-template/actions/runs/123/artifacts?per_page=100&page=2>; rel="next"');
  };
  assert.deepEqual(await artifactUrls("eff3ct0/factory-template", "123", "token", runUrl, { fetchImpl }), {
    artifactUrl: "https://github.com/eff3ct0/factory-template/actions/runs/123/artifacts/11",
    triageArtifactUrl: "https://github.com/eff3ct0/factory-template/actions/runs/123/artifacts/12",
  });
  assert.equal(calls.length, 2);
  await assert.rejects(paginateGitHub("issues?per_page=100", "token", undefined, { fetchImpl: async () => reply(200, [], '<https://example.test/page>; rel="next"') }), ReporterError);
  assert.equal(await verifyRepository("eff3ct0/factory-template", "token", { fetchImpl: async () => reply(200, { full_name: "eff3ct0/factory-template" }) }), "eff3ct0/factory-template");
});

test("deduplicates canonical issues and verifies comment and issue mutations", async () => {
  const markerText = markerWithFingerprints("eff3ct0/factory-template", sha, ["python"], ["fingerprint"]);
  const body = buildBody("eff3ct0/factory-template", "v1.0.0", sha, ["python"], runUrl, runUrl, markerText);
  const requests = [];
  const commentFetch = async (url, request) => {
    requests.push([url, request.method]);
    if (url.endsWith("repos/eff3ct0/factory-template")) return reply(200, { full_name: "eff3ct0/factory-template" });
    if (url.includes("search/issues")) return reply(200, { total_count: 1, items: [issue(7, markerText)] });
    if (url.includes("issues/7/comments?")) return reply(200, []);
    if (url.endsWith("issues/7/comments")) return reply(201, { id: 9 });
    if (url.endsWith("issues/comments/9")) return reply(200, { issue_url: "https://api.github.com/repos/eff3ct0/factory-template/issues/7", body });
    throw new Error(url);
  };
  assert.deepEqual(await reportCanonicalIssue({ repository: "eff3ct0/factory-template", title: "ignored", body, markerText, fingerprints: ["fingerprint"], token: "token" }, { fetchImpl: commentFetch }), { outcome: "commented", issueNumber: 7 });
  assert.equal(requests.filter(([, method]) => method === "POST").length, 1);

  assert.deepEqual(await reportCanonicalIssue({ repository: "eff3ct0/factory-template", title: "ignored", body, markerText, token: "token" }, { fetchImpl: async (url) => {
    if (url.endsWith("repos/eff3ct0/factory-template")) return reply(200, { full_name: "eff3ct0/factory-template" });
    if (url.includes("search/issues")) return reply(200, { total_count: 1, items: [issue(7, markerText)] });
    if (url.includes("issues/7/comments?")) return reply(200, [{ issue_url: "https://api.github.com/repos/eff3ct0/factory-template/issues/7", body: markerText }]);
    throw new Error("dedupe must not mutate");
  } }), { outcome: "already_reported", issueNumber: 7 });

  const createFetch = async (url, request) => {
    if (url.endsWith("repos/eff3ct0/factory-template")) return reply(200, { full_name: "eff3ct0/factory-template" });
    if (url.includes("search/issues")) return reply(200, { total_count: 0, items: [] });
    if (url.endsWith("/issues") && request.method === "POST") return reply(201, { number: 8 });
    if (url.endsWith("/issues/8")) return reply(200, { ...issue(8, body), title: "[Bug] release" });
    throw new Error(url);
  };
  assert.deepEqual(await reportCanonicalIssue({ repository: "eff3ct0/factory-template", title: "[Bug] release", body, markerText, token: "token" }, { fetchImpl: createFetch }), { outcome: "created", issueNumber: 8 });
});

test("replays the reporter CLI offline without a GitHub mutation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reporter-cli-test-"));
  try {
    const result = spawnSync(process.execPath, ["scripts/report-bootstrap-failure.mjs", "report", "--repository", "eff3ct0/factory-template", "--workflow-url", runUrl, "--artifact-url", runUrl, "--evidence-dir", directory, "--run-id", "123"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "{\"outcome\":\"no_failures\"}\n");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

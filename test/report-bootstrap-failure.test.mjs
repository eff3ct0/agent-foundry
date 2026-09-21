import assert from "node:assert/strict";
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

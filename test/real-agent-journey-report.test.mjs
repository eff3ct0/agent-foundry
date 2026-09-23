import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildReport, reportFailure, reportInput, reportJourney } from "../scripts/real-agent-journey.mjs";

const sourceRepository = "eff3ct0/factory-template";
const revision = "a".repeat(40);
const runId = "123";
const runUrl = `https://github.com/${sourceRepository}/actions/runs/${runId}`;
const evidence = {
  schema_version: "real-agent-journey/v1",
  run_id: runId,
  repository: "acme/real-agent-journey-123",
  source_template: sourceRepository,
  tested_revision: revision,
  runtime: "codex-cli",
  stages: { provision: "passed", agent: "failed", cleanup: "passed" },
  identifiers: { provision: {}, agent: {}, cleanup: {} },
  result: "failed",
  failure_code: "agent_failed",
  cleanup_status: "passed",
  workflow_url: runUrl,
};

const issue = (number, body, state = "open") => ({
  number,
  state,
  repository_url: `https://api.github.com/repos/${sourceRepository}`,
  labels: [{ name: "type:bug" }],
  body,
});

const searchResults = (matchingIssue = null) => {
  let calls = 0;
  const request = async (method, endpoint) => {
    if (method !== "GET" || !endpoint.startsWith("search/issues?")) throw new Error(`unexpected ${method} ${endpoint}`);
    calls++;
    return { incomplete_results: false, total_count: matchingIssue && calls === 2 ? 1 : 0, items: matchingIssue && calls === 2 ? [matchingIssue] : [] };
  };
  return { request, getCalls: () => calls };
};

test("passed aggregate validates and reports a no-op without GitHub requests", async (t) => {
  const passed = structuredClone(evidence);
  passed.stages = Object.fromEntries(["provision", "agent", "assert", "cleanup"].map((stage) => [stage, "passed"]));
  passed.identifiers = Object.fromEntries(Object.keys(passed.stages).map((stage) => [stage, {}]));
  passed.result = "passed";
  passed.failure_code = "";
  const directory = await mkdtemp(path.join(os.tmpdir(), "journey-report-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "journey.json");
  await writeFile(input, JSON.stringify(passed));
  let called = false;
  assert.equal(await reportInput(input, runUrl, sourceRepository, "secret-token", async () => { called = true; }), "no journey failures");
  assert.equal(called, false);
  await assert.rejects(reportInput(input, "https://example.com/", sourceRepository, "secret-token", async () => { called = true; }), /report URL/);
  assert.equal(called, false);
});

test("invalid aggregate evidence fails before any GitHub request", async () => {
  let called = false;
  const invalid = { ...evidence, tested_revision: "not-a-sha" };
  await assert.rejects(reportJourney(invalid, runUrl, sourceRepository, "secret-token", async () => { called = true; }), /full SHA/);
  await assert.rejects(reportJourney({ ...evidence, stages: { agent: "failed", mystery: "failed" } }, runUrl, sourceRepository, "secret-token", async () => { called = true; }), /stages/);
  await assert.rejects(reportJourney({ ...evidence, result: "passed" }, runUrl, sourceRepository, "secret-token", async () => { called = true; }), /inconsistent/);
  assert.equal(called, false);
});

test("mismatched failure code and cleanup status fail before any GitHub request", async () => {
  let called = false;
  const request = async () => { called = true; };

  await assert.rejects(
    reportJourney({ ...evidence, failure_code: "cleanup_failed" }, runUrl, sourceRepository, "secret-token", request),
    /failure code does not match the earliest failed stage/,
  );
  await assert.rejects(
    reportJourney({ ...evidence, cleanup_status: "failed" }, runUrl, sourceRepository, "secret-token", request),
    /cleanup status does not match cleanup stage evidence/,
  );
  assert.equal(called, false);
});

test("report content and fingerprint are deterministic", () => {
  assert.deepEqual(buildReport(evidence, runUrl), buildReport(structuredClone(evidence), runUrl));
  const report = buildReport(evidence, runUrl);
  assert.match(report.fingerprint, /^[0-9a-f]{32}$/u);
  assert.ok(report.body.includes(`Real-Agent-Journey-Fingerprint: ${report.fingerprint}`));
  assert.equal(report.body.length < 12_000, true);
});

test("report CLI accepts the workflow arguments without exposing a token", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "journey-report-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "journey.json");
  await writeFile(input, JSON.stringify(evidence));
  const result = spawnSync(process.execPath, [
    "scripts/real-agent-journey.mjs", "report", "--input", input,
    "--repository", sourceRepository, "--artifact-url", runUrl,
  ], { encoding: "utf8", env: { ...process.env, GITHUB_TOKEN: "" } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "report skipped: GITHUB_TOKEN is missing\n");
  assert.equal(result.stdout.includes("secret-token"), false);
});

test("open and closed duplicate lookup recognizes an existing marker comment without mutation", async () => {
  const report = buildReport(evidence, runUrl);
  const matchingIssue = issue(44, `existing issue\n${report.marker}`, "closed");
  const { request, getCalls } = searchResults(matchingIssue);
  const states = [];
  const wrapped = async (...args) => {
    if (args[1].startsWith("search/issues?")) {
      states.push(new URLSearchParams(args[1].split("?")[1]).get("q"));
      return request(...args);
    }
    if (args[1] === "repos/eff3ct0/factory-template/issues/44/comments?per_page=100") return [{ issue_url: "https://api.github.com/repos/eff3ct0/factory-template/issues/44", body: `existing comment\n${report.marker}` }];
    throw new Error(`unexpected ${args[1]}`);
  };
  assert.equal(await reportFailure(report, sourceRepository, "secret-token", wrapped), "already reported #44");
  assert.equal(getCalls(), 2);
  assert.ok(states[0].includes("state:open"));
  assert.ok(states[1].includes("state:closed"));
});

test("canonical issue creation is read back before success is returned", async () => {
  const report = buildReport(evidence, runUrl);
  const { request: search } = searchResults();
  const calls = [];
  const request = async (method, endpoint, token, options) => {
    calls.push({ method, endpoint, token, options });
    if (endpoint.startsWith("search/issues?")) return search(method, endpoint, token, options);
    if (method === "POST" && endpoint === `repos/${sourceRepository}/issues`) return { number: 45 };
    if (method === "GET" && endpoint === `repos/${sourceRepository}/issues/45`) return {
      number: 45,
      repository_url: `https://api.github.com/repos/${sourceRepository}`,
      title: report.title,
      body: report.body,
      labels: [{ name: "type:bug" }],
    };
    throw new Error(`unexpected ${method} ${endpoint}`);
  };
  assert.equal(await reportFailure(report, sourceRepository, "secret-token", request), "created canonical journey issue #45");
  assert.deepEqual(calls.filter(({ method }) => method === "POST").map(({ endpoint }) => [endpoint]), [[`repos/${sourceRepository}/issues`]]);
  assert.equal(calls.at(-1).endpoint, `repos/${sourceRepository}/issues/45`);
  assert.ok(calls.every((call) => call.token === "secret-token"));
});

test("missing canonical comment is posted and read back", async () => {
  const report = buildReport(evidence, runUrl);
  const canonical = issue(46, `canonical\n${report.marker}`);
  const { request: search } = searchResults(canonical);
  const calls = [];
  const request = async (method, endpoint, token, options) => {
    calls.push({ method, endpoint, options });
    if (endpoint.startsWith("search/issues?")) return search(method, endpoint, token, options);
    if (endpoint === `repos/${sourceRepository}/issues/46/comments?per_page=100`) return [];
    if (method === "POST" && endpoint === `repos/${sourceRepository}/issues/46/comments`) return { id: 90 };
    if (method === "GET" && endpoint === `repos/${sourceRepository}/issues/comments/90`) return {
      id: 90,
      issue_url: `https://api.github.com/repos/${sourceRepository}/issues/46`,
      body: report.body,
    };
    throw new Error(`unexpected ${method} ${endpoint}`);
  };
  assert.equal(await reportFailure(report, sourceRepository, "secret-token", request), "commented canonical issue #46");
  assert.equal(calls.at(-1).endpoint, `repos/${sourceRepository}/issues/comments/90`);
  assert.equal(calls.find(({ method }) => method === "POST").options.payload.body, report.body);
});

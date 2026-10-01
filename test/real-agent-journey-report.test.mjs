import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { aggregate, buildReport, reportFailure, reportInput, reportJourney, stageEnvelope } from "../scripts/real-agent-journey.mjs";

const sourceRepository = "eff3ct0/agent-foundry";
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

test("journey plan records the current source coordinate before provisioning", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "journey-plan-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "contract.json");
  const result = spawnSync(process.execPath, [
    "scripts/real-agent-journey.mjs", "plan", "--run-id", runId,
    "--template", sourceRepository, "--owner", "acme", "--runtime", "codex-cli",
    "--source-sha", revision, "--package-name", "@eff3ct/agent-foundry",
    "--package-version", "0.1.0", "--output", output,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(await readFile(output, "utf8"));
  assert.equal(plan.source_template, "eff3ct0/agent-foundry");
  assert.equal(plan.source_sha, revision);
  assert.equal(plan.generated_repository, "acme/real-agent-journey-123");
});

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

test("missing stage evidence gets a stable code and remains reportable", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "journey-missing-stage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "provision.json"), JSON.stringify(stageEnvelope("provision", runId, evidence.repository, "passed", {
    source_template: sourceRepository,
    default_branch: "main",
    revision,
    owner: "acme",
    repository_id: "123",
    source_identity: `${sourceRepository}@${revision}`,
  })));
  await writeFile(path.join(directory, "cleanup.json"), JSON.stringify(stageEnvelope("cleanup", runId, evidence.repository, "passed", { owner: "acme", target: evidence.repository })));

  const aggregated = await aggregate(directory, runId, evidence.repository, "codex-cli", runUrl);
  assert.equal(aggregated.failure_code, "agent_missing");
  assert.equal(aggregated.stages.agent, undefined);
  const report = buildReport(aggregated, runUrl);
  assert.equal(report.stage, "agent");
  assert.equal(report.failure_code, "agent_missing");
});

test("report content and fingerprint are deterministic", () => {
  assert.deepEqual(buildReport(evidence, runUrl), buildReport(structuredClone(evidence), runUrl));
  const report = buildReport(evidence, runUrl);
  assert.match(report.fingerprint, /^[0-9a-f]{32}$/u);
  assert.ok(report.body.includes(`Real-Agent-Journey-Fingerprint: ${report.fingerprint}`));
  assert.equal(report.source_repository, "eff3ct0/agent-foundry");
  assert.ok(report.body.includes(`https://github.com/${sourceRepository}/actions/runs/${runId}`));
  assert.equal(report.body.length < 12_000, true);
});

test("retired report target fails before any GitHub request", async () => {
  let called = false;
  await assert.rejects(reportJourney(evidence, runUrl, "eff3ct0/factory-template", "secret-token", async () => { called = true; }), /report target does not match the source repository/u);
  assert.equal(called, false);
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
    if (args[1] === `repos/${sourceRepository}/issues/44/comments?per_page=100`) return [{ issue_url: `https://api.github.com/repos/${sourceRepository}/issues/44`, body: `existing comment\n${report.marker}` }];
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

// Offline rehearsal of the #246 protocol: agent claims are deliberately not a check.
const comparisonInputs = {
  prompt_digest: "sha256:task-fixture",
  decisions_digest: "sha256:decisions-fixture",
  model: "model-fixture@version-1",
  runtime: "codex-cli@0.148.0",
  package: "@eff3ct/agent-foundry@0.1.0",
  source_sha: revision,
  test_command: "pnpm test",
  checks: ["issue", "checkout", "test", "cleanup"],
  limits: "fixture-timeout",
};

const fixtureRun = (role, runId, harness) => ({
  role, run_id: runId, repository: `acme/real-agent-journey-${runId}`,
  inputs: structuredClone(comparisonInputs), harness,
  isolated: true, sibling_readable: false,
  agent_claim: "completed",
  // These are observer results, not values copied from the agent envelope.
  observed: {
    issue: "passed", checkout: "passed", test: "passed", cleanup: "passed",
  },
  evidence: Object.fromEntries(comparisonInputs.checks.map((check) =>
    [check, `real-agent-journey-evidence-${runId}#assert/${check}`])),
});

const rehearseComparison = (baseline, candidate) => {
  const pins = Object.keys(comparisonInputs);
  const contaminated = baseline.run_id === candidate.run_id
    || baseline.repository === candidate.repository
    || [baseline, candidate].some((run) => !run.isolated || run.sibling_readable)
    || pins.some((key) => JSON.stringify(baseline.inputs[key]) !== JSON.stringify(candidate.inputs[key]))
    || pins.some((key) => JSON.stringify(baseline.inputs[key]) !== JSON.stringify(comparisonInputs[key]));
  if (contaminated) return "rejected";
  const classify = (run) => {
    if (comparisonInputs.checks.some((check) => run.observed?.[check] === "failed")) return "failure";
    if (comparisonInputs.checks.some((check) => run.observed?.[check] !== "passed" || !run.evidence?.[check])) return "inconclusive";
    return "success";
  };
  const outcomes = [classify(baseline), classify(candidate)];
  return outcomes.includes("inconclusive") ? "inconclusive" : outcomes;
};

test("comparison fixture accepts only two isolated pinned runs with independent evidence", () => {
  const baseline = fixtureRun("baseline", "201", "harness-baseline");
  const candidate = fixtureRun("candidate", "202", "harness-candidate");
  assert.deepEqual(rehearseComparison(baseline, candidate), ["success", "success"]);
  const failed = structuredClone(candidate);
  failed.observed.test = "failed";
  assert.deepEqual(rehearseComparison(baseline, failed), ["success", "failure"]);
});

test("comparison fixture rejects readable sibling artifacts and changed pins", () => {
  const baseline = fixtureRun("baseline", "201", "harness-baseline");
  const candidate = fixtureRun("candidate", "202", "harness-candidate");
  const contaminated = structuredClone(candidate);
  contaminated.sibling_readable = true;
  assert.equal(rehearseComparison(baseline, contaminated), "rejected");
  const changedModel = structuredClone(candidate);
  changedModel.inputs.model = "model-fixture@version-2";
  assert.equal(rehearseComparison(baseline, changedModel), "rejected");
  const changedPrompt = structuredClone(candidate);
  changedPrompt.inputs.prompt_digest = "sha256:different-task";
  assert.equal(rehearseComparison(baseline, changedPrompt), "rejected");
});

test("comparison fixture marks claimed but unverified completion inconclusive", () => {
  const baseline = fixtureRun("baseline", "201", "harness-baseline");
  const candidate = fixtureRun("candidate", "202", "harness-candidate");
  delete candidate.observed.checkout;
  assert.equal(candidate.agent_claim, "completed");
  assert.equal(rehearseComparison(baseline, candidate), "inconclusive");
  const missingEvidence = fixtureRun("candidate", "203", "harness-candidate");
  delete missingEvidence.evidence.test;
  assert.equal(rehearseComparison(baseline, missingEvidence), "inconclusive");
});

test("comparison fixture independently reads local result and detects a sibling artifact", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "journey-comparison-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const baselineDir = path.join(root, "baseline");
  const candidateDir = path.join(root, "candidate");
  await mkdir(baselineDir);
  await mkdir(candidateDir);
  await writeFile(path.join(baselineDir, "local-check.txt"), "passed");
  await writeFile(path.join(candidateDir, "local-check.txt"), "passed");

  const baseline = fixtureRun("baseline", "201", "harness-baseline");
  const candidate = fixtureRun("candidate", "202", "harness-candidate");
  const inspect = async (directory, run) => {
    const entries = await readdir(directory);
    run.sibling_readable = entries.includes("baseline-artifact.txt");
    run.observed.test = entries.includes("local-check.txt")
      ? (await readFile(path.join(directory, "local-check.txt"), "utf8")).trim()
      : undefined;
  };
  await inspect(baselineDir, baseline);
  await inspect(candidateDir, candidate);
  assert.deepEqual(rehearseComparison(baseline, candidate), ["success", "success"]);

  await writeFile(path.join(candidateDir, "baseline-artifact.txt"), "sibling fixture");
  await inspect(candidateDir, candidate);
  assert.equal(rehearseComparison(baseline, candidate), "rejected");

  await rm(path.join(candidateDir, "baseline-artifact.txt"));
  await rm(path.join(candidateDir, "local-check.txt"));
  await inspect(candidateDir, candidate);
  assert.equal(rehearseComparison(baseline, candidate), "inconclusive");
});

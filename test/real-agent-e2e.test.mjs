import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertOutcome, buildExecutionPrompt, buildPhaseSchema, providerDiagnostic, REQUEST_PROMPT, summarizeExecutionResponse } from "../scripts/real-agent-e2e.mjs";

const git = (workspace, ...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();

const createWorkspace = async (branch) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "real-agent-validation-"));
  git(workspace, "init", "--quiet");
  git(workspace, "config", "user.email", "journey@example.invalid");
  git(workspace, "config", "user.name", "Journey Test");
  await writeFile(path.join(workspace, "hello.py"), "print('hello')\n");
  git(workspace, "add", "hello.py");
  git(workspace, "commit", "--quiet", "-m", "initial #42");
  git(workspace, "branch", "-M", branch);
  return workspace;
};

const outcomeInput = (branch, commit) => [{
  issue_url: "https://github.com/acme/example/issues/42",
  branch,
  commit,
}, {
  required_documents: ["AGENT.md", "CLAUDE.md", "docs/bindings.md"],
}, {
  feature: { slug: "hello-command", implementation_files: ["hello.py"] },
  decisions: { TEST_CMD: "python3 -m unittest" },
}, ["python3 -m unittest"], ["python3 -m unittest exit_code 0"]];

const assertStrictSchema = (schema, properties) => {
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), properties);
  assert.deepEqual(schema.required, properties);
  assert.equal(Object.hasOwn(schema.properties, "unexpected"), false);
};

test("Codex request and execution schemas are strict and preserve their field contracts", () => {
  const request = buildPhaseSchema("request");
  const execution = buildPhaseSchema("execution");

  assertStrictSchema(request, ["required_documents"]);
  assert.deepEqual(request.properties.required_documents, { type: "array", items: { type: "string" } });

  const executionFields = ["status", "issue_url", "branch", "commit", "tests", "approval_gate"];
  assertStrictSchema(execution, executionFields);
  assert.deepEqual(execution.properties.status, { type: "string", enum: ["passed"] });
  assert.deepEqual(execution.properties.approval_gate, { type: "string", enum: ["not-approved", "blocked"] });
  assert.deepEqual(execution.properties.tests, { anyOf: [{ type: "string" }, { type: "boolean" }] });
});

test("execution schema rejects empty issue, branch, and commit fields", () => {
  const execution = buildPhaseSchema("execution");
  for (const field of ["issue_url", "branch", "commit"]) {
    assert.deepEqual(execution.properties[field], { type: "string", minLength: 1 });
    assert.equal("".length >= execution.properties[field].minLength, false);
  }
});

test("execution prompt binds GitHub Issues to the runtime repository", () => {
  const repository = "eff3ct0/real-agent-journey-36480858884";
  const prompt = buildExecutionPrompt(repository, {
    decisions: { TASK_TRACKER: "github-issues", TEST_CMD: "python3 -m unittest test_hello.py" },
    feature: { title: "Add a deterministic hello helper", implementation_files: ["hello.py", "test_hello.py"], slug: "hello-command" },
  });

  assert.match(prompt, /GitHub Issues is the bound task tracker for this run/u);
  assert.ok(prompt.includes(`bound to the runtime repository \`${repository}\``));
  assert.match(prompt, new RegExp(`--repo ${repository}`, "u"));
  assert.ok(prompt.includes("Immediately after issue creation, use the actual issue number returned by that operation and configured feature slug `hello-command` to create and switch to exactly `feature/<issue-number>-hello-command`."));
  assert.match(prompt, /Do not derive the branch from the issue title or use an alternative slug/u);
  assert.match(prompt, /branch as the exact output of `git branch --show-current`/u);
  assert.doesNotMatch(prompt, /your-repo|cold-agent-journey/u);
  assert.match(prompt, /read AGENT\.md, CLAUDE\.md, and docs\/bindings\.md/u);
  assert.doesNotMatch(prompt, /agent-init\.md/u);
});

test("cold-agent prompts point at contracts that ship in a generated project, not the init procedure", () => {
  assert.match(REQUEST_PROMPT, /read AGENT\.md, CLAUDE\.md, and docs\/bindings\.md/u);
  assert.doesNotMatch(REQUEST_PROMPT, /agent-init\.md/u);
  const prompt = buildExecutionPrompt("acme/example", {
    decisions: { TEST_CMD: "python3 -m unittest test_hello.py" },
    feature: { title: "Add a deterministic hello helper", implementation_files: ["hello.py"], slug: "hello-command" },
  });
  assert.doesNotMatch(prompt, /agent-init\.md/u);
});

test("assertOutcome requires the cold agent to read docs/bindings.md, not the absent init procedure", async (t) => {
  const workspace = await createWorkspace("feature/42-hello-command");
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(path.join(workspace, "hello.py"), "print('hello, #42')\n");
  git(workspace, "commit", "-am", "feat: implement hello (#42)");
  const commit = git(workspace, "rev-parse", "HEAD");
  const data = { issue_url: "https://github.com/acme/example/issues/42", status: "passed", branch: "feature/42-hello-command", commit, tests: "passed", approval_gate: "not-approved" };
  const decisions = { feature: { slug: "hello-command", implementation_files: ["hello.py"] }, decisions: { TEST_CMD: "python3 -m unittest" } };
  const observed = ["python3 -m unittest"];
  const successful = ["python3 -m unittest exit_code 0"];

  assert.throws(
    () => assertOutcome(workspace, "acme/example", data, { required_documents: ["AGENT.md", "CLAUDE.md", "docs/agent-init.md"] }, decisions, observed, successful),
    (error) => { assert.equal(error.code, "startup_incomplete"); return true; },
  );

  const outcome = assertOutcome(workspace, "acme/example", data, { required_documents: ["AGENT.md", "CLAUDE.md", "docs/bindings.md"] }, decisions, observed, successful);
  assert.equal(outcome.branch, "feature/42-hello-command");
  assert.equal(outcome.commit, commit);
});

test("provider diagnostics are bounded, redacted, and do not retain stdout prompts", () => {
  const secret = "sk-live-provider-secret";
  const workspace = "/home/steam/private/workspace";
  const diagnostic = providerDiagnostic({
    error: new Error("request failed"),
    stderr: `provider rejected api_key=${secret} in ${workspace} ${"x".repeat(4000)}`,
    stdout: "raw prompt must not be retained",
  }, [secret], workspace);

  assert.match(diagnostic, /error: Error: request failed/u);
  assert.match(diagnostic, /stderr: provider rejected api_key=<redacted>/u);
  assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes(workspace), false);
  assert.equal(diagnostic.includes("raw prompt"), false);
  assert.equal(Buffer.byteLength(diagnostic, "utf8") <= 2000, true);
});

test("provider diagnostics retain only structured Codex error-event messages", () => {
  const secret = "sk-live-provider-secret";
  const workspace = "/home/steam/private/workspace";
  const diagnostic = providerDiagnostic({
    stdout: [
      JSON.stringify({ type: "message", message: "prompt and arbitrary agent output" }),
      JSON.stringify({ type: "error", message: `request failed api_key=${secret} in ${workspace}` }),
      JSON.stringify({ type: "error", message: "second provider error" }),
    ].join("\n"),
  }, [secret], workspace);

  assert.match(diagnostic, /codex error: request failed api_key=<redacted> in <private-path>/u);
  assert.match(diagnostic, /codex error: second provider error/u);
  assert.equal(diagnostic.includes("prompt and arbitrary agent output"), false);
  assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes(workspace), false);
});

test("execution summaries retain only bounded, redacted expected fields", () => {
  const secret = "sk-live-provider-secret";
  const workspace = "/home/steam/private/workspace";
  const summary = summarizeExecutionResponse({
    issue_url: `https://github.com/acme/example/issues/42?token=${secret}`,
    status: { raw: "arbitrary output" },
    branch: `${workspace}/feature/42-change`,
    commit: 42,
    tests: { prompt: "must not persist" },
    approval_gate: undefined,
    arbitrary: "must not persist",
  }, [secret], workspace);

  assert.deepEqual(Object.keys(summary), ["issue_url", "status", "branch", "commit", "tests", "approval_gate"]);
  assert.equal(summary.issue_url.includes(secret), false);
  assert.equal(summary.issue_url.length <= 2000, true);
  assert.equal(summary.status, "<invalid:object>");
  assert.equal(summary.branch.includes(workspace), false);
  assert.equal(summary.commit, "<invalid:number>");
  assert.equal(summary.tests, "<invalid:object>");
  assert.equal(summary.approval_gate, null);
  assert.equal(Object.hasOwn(summary, "arbitrary"), false);
  assert.deepEqual(summarizeExecutionResponse(), {
    issue_url: null,
    status: null,
    branch: null,
    commit: null,
    tests: null,
    approval_gate: null,
  });
});

test("branch validation preserves bounded workspace and reported context", async (t) => {
  const workspace = await createWorkspace("wrong-branch");
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const [data, request, decisions, observed, successful] = outcomeInput("feature/42-hello-command token=sk-live-secret /home/steam/private", "initial-commit-placeholder");
  const actualHead = git(workspace, "rev-parse", "HEAD");

  assert.throws(() => assertOutcome(workspace, "acme/example", data, request, decisions, observed, successful, ["sk-live-secret"]), (error) => {
    assert.equal(error.code, "branch_invalid");
    assert.deepEqual(error.context, {
      actual_branch: "wrong-branch",
      expected_branch: "feature/42-hello-command",
      reported_branch: "feature/42-hello-command token=<redacted> <private-path>",
      actual_head: actualHead,
      reported_commit: "initial-commit-placeholder",
    });
    assert.match(error.message, /actual_branch="wrong-branch"/u);
    assert.equal(error.message.includes(workspace), false);
    return true;
  });
});

test("commit validation preserves the same bounded branch and commit context", async (t) => {
  const workspace = await createWorkspace("feature/42-hello-command");
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const [data, request, decisions, observed, successful] = outcomeInput("feature/42-hello-command", "initial-commit-placeholder");
  const actualHead = git(workspace, "rev-parse", "HEAD");

  assert.throws(() => assertOutcome(workspace, "acme/example", data, request, decisions, observed, successful), (error) => {
    assert.equal(error.code, "commit_invalid");
    assert.deepEqual(error.context, {
      actual_branch: "feature/42-hello-command",
      expected_branch: "feature/42-hello-command",
      reported_branch: "feature/42-hello-command",
      actual_head: actualHead,
      reported_commit: "initial-commit-placeholder",
    });
    assert.match(error.message, /actual_head="[0-9a-f]{40}"/u);
    return true;
  });
});

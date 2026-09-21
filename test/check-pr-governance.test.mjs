import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { boundTaskProvider, githubIssueLabels, issueNumbers, validateEvent, validatePr } from "../scripts/check-pr-governance.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-pr-governance.mjs");
const approved = { 42: ["status:approved"] };
const githubPr = { body: "Summary\n\nCloses #42 and fixes acme/example#42.", labels: [{ name: "type:product" }] };

test("GitHub governance requires one type label, a local close reference, and approval", () => {
  assert.deepEqual(validatePr(githubPr, approved, "acme/example", "github-issues"), []);
  assert.deepEqual(issueNumbers("Fixes acme/example#7 and closes other/repo#8", "acme/example"), [7]);
  const rejected = validatePr({ body: "Closes #42", labels: [] }, {}, "acme/example", "github-issues");
  assert.ok(rejected.includes("PR must have exactly one type:* label"));
  assert.ok(rejected.includes("linked issue #42 must have the human status:approved label"));
  assert.match(validatePr({ ...githubPr, body: "Closes other/repo#42" }, approved, "acme/example", "github-issues").join("\n"), /closing reference/u);
});

test("non-GitHub providers require their native reference without issue lookups", async () => {
  const jira = { body: "Summary\n\nJira: FEX-1", labels: [{ name: "type:product" }] };
  assert.deepEqual(validatePr(jira, {}, undefined, "jira"), []);
  assert.match(validatePr({ ...jira, body: "Closes #42" }, {}, undefined, "jira").join("\n"), /native Jira reference/u);
  const errors = await validateEvent({ pull_request: jira }, "acme/example", "token", {
    provider: "jira",
    fetchImpl: () => { throw new Error("Jira validation must not query GitHub"); },
  });
  assert.deepEqual(errors, []);
});

test("event validation reads each linked GitHub issue and rejects malformed responses", async () => {
  const requested = [];
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => {
    requested.push(url);
    return { labels: [{ name: "status:approved" }] };
  } });
  assert.deepEqual(await validateEvent({ pull_request: githubPr }, "acme/example", "token", { provider: "github-issues", fetchImpl }), []);
  assert.deepEqual(requested, ["https://api.github.com/repos/acme/example/issues/42"]);
  await assert.rejects(githubIssueLabels("acme/example", "token", 42, async () => ({ ok: false, status: 503 })), /status 503/u);
  await assert.rejects(githubIssueLabels("acme/example", "token", 42, async () => ({ ok: true, status: 200, json: async () => ({}) })), /malformed labels/u);
});

test("provider fixture reads generated bindings and falls back when absent", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "governance-provider-"));
  try {
    assert.equal(await boundTaskProvider(directory), "github-issues");
    await mkdir(path.join(directory, "docs"));
    await writeFile(path.join(directory, "docs", "bindings.md"), "> **Capability:** `task`\n> **Provider:** `linear`\n");
    assert.equal(await boundTaskProvider(directory), "linear");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI self-check validates the pinned Node workflow consumer", async () => {
  const result = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.equal(result.stdout, "self-check OK\n");
});

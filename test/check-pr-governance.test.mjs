import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { boundTaskProvider, githubIssueExists, issueNumbers, validateEvent, validatePr } from "../scripts/typed-inherited-runtime/check-pr-governance.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "typed-inherited-runtime", "check-pr-governance.js");
const linearFixture = path.join(root, "test", "fixtures", "pr-governance", "linear.json");
const githubPr = { body: "Summary\n\nCloses #42 and fixes acme/example#42.", labels: [{ name: "type:product" }] };

test("GitHub governance accepts an unlabeled linked issue but requires exactly one type label and a local closing reference", () => {
  assert.deepEqual(validatePr(githubPr, "acme/example", "github-issues"), []);
  assert.deepEqual(issueNumbers("Fixes acme/example#7 and closes other/repo#8", "acme/example"), [7]);

  for (const labels of [[], [{ name: "team:owners" }], [{ name: "type:product" }, { name: "type:bug" }]]) {
    assert.ok(validatePr({ ...githubPr, labels }, "acme/example", "github-issues").includes("PR must have exactly one type:* label"));
  }
  assert.ok(validatePr({ ...githubPr, body: "Summary" }, "acme/example", "github-issues").some((error) => /closing reference/u.test(error)));
  assert.ok(validatePr({ ...githubPr, body: "Closes other/repo#42" }, "acme/example", "github-issues").some((error) => /closing reference/u.test(error)));
});

test("a Linear fixture requires its native reference without issue lookups", async () => {
  const fixture = JSON.parse(await readFile(linearFixture, "utf8"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "governance-linear-"));
  try {
    await mkdir(path.join(directory, "docs"));
    await writeFile(path.join(directory, "docs", "bindings.md"), fixture.bindings, "utf8");
    const provider = await boundTaskProvider(directory);
    assert.equal(provider, fixture.provider);
    const errors = await validateEvent(fixture.event, fixture.repository, "token", {
      provider,
      fetchImpl: () => { throw new Error("Linear validation must not query GitHub"); },
    });
    assert.deepEqual(errors, fixture.expectedErrors);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("non-GitHub providers reject missing native references without issue lookups", async () => {
  const jira = { body: "Summary\n\nJira: FEX-1", labels: [{ name: "type:product" }] };
  assert.deepEqual(validatePr(jira, undefined, "jira"), []);
  assert.match(validatePr({ ...jira, body: "Closes #42" }, undefined, "jira").join("\n"), /native Jira reference/u);
  assert.deepEqual(await validateEvent({ pull_request: jira }, "acme/example", "token", {
    provider: "jira",
    fetchImpl: () => { throw new Error("Jira validation must not query GitHub"); },
  }), []);
  assert.deepEqual(await validateEvent({ pull_request: jira }, "acme/example", "token", {
    provider: "unconfigured",
    fetchImpl: () => { throw new Error("unsupported provider must not query GitHub"); },
  }), ["unsupported bound task provider: unconfigured"]);
});

test("event validation checks each unique linked GitHub issue without reading its labels", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, json: async () => ({ number: 42 }) };
  };
  assert.deepEqual(await validateEvent({ pull_request: githubPr }, "acme/example", "token", { provider: "github-issues", fetchImpl }), []);
  assert.deepEqual(requested, ["https://api.github.com/repos/acme/example/issues/42"]);
});

test("GitHub issue lookup fails closed on API errors and malformed responses", async () => {
  await assert.rejects(githubIssueExists("acme/example", "token", 42, async () => ({ ok: false, status: 503 })), /status 503/u);
  await assert.rejects(githubIssueExists("acme/example", "token", 42, async () => ({ ok: true, status: 200, json: async () => ({}) })), /malformed issue/u);
  await assert.rejects(githubIssueExists("acme/example", "token", 42, async () => ({ ok: true, status: 200, json: async () => ({ number: 43 }) })), /malformed issue/u);
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

test("CLI self-check validates relocated consumer behavior", async () => {
  const result = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.equal(result.stdout, "self-check OK\n");
});

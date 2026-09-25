import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTaskAdapter } from "../scripts/task-adapter.mjs";
import { createGitHubIssuesReadPort } from "../scripts/task-github-issues-read.mjs";

const exec = promisify(execFile);
const identity = { provider: "github-issues", tracker: "acme/work", trackerKey: "acme/work", nativeId: "17" };
const url = "https://api.github.com/repos/acme/work/issues/17";
const handoff = { phase: "VERIFICATION", status: "ACTIVE", completedWork: "Reviewed read path", nextAction: "Run tests", branch: "feat/read", commit: "WIP", verification: "Not yet run", resumeEvidence: "Inspect native comments" };
const entry = (operationId, kind, content) => ({ operationId, kind, content });
const comment = (id, data) => ({ id, issue_url: url, url: `https://api.github.com/repos/acme/work/issues/comments/${id}`, body: `task-adapter:v1:${JSON.stringify(data)}` });
const comments = [comment(101, entry("op-1", "comment", "Checkpoint")), comment(102, entry("phase-1", "handoff", JSON.stringify(handoff)))];
const issue = { url, repository_url: "https://api.github.com/repos/acme/work", number: 17, state: "open", labels: [{ name: "status:in-progress" }, { name: "type:product" }], comments: 2, updated_at: "2026-09-24T12:00:00Z" };
const fake = (nativeIssue = issue, nativeComments = comments) => ({ get: async (endpoint) => ({ status: 200, body: endpoint.includes("/comments?") ? nativeComments : nativeIssue }) });

test("reads exact native issue, labels and complete correlated handoff; all mutations remain blocked", async () => {
  const calls = [];
  const transport = fake();
  const port = createGitHubIssuesReadPort({ get: async (endpoint) => { calls.push(endpoint); return transport.get(endpoint); } });
  const snapshot = await port.read(identity);
  assert.deepEqual(snapshot, { identity, status: JSON.stringify({ state: "open", labels: ["status:in-progress", "type:product"] }), entries: [
    entry("op-1", "comment", "Checkpoint"), entry("phase-1", "handoff", JSON.stringify(handoff)),
  ] });
  assert.deepEqual(calls, ["/repos/acme/work/issues/17", "/repos/acme/work/issues/17/comments?per_page=100&page=1", "/repos/acme/work/issues/17"]);
  assert.equal(port.write, undefined);
  assert.equal(port.claim, undefined);
});

test("rejects unbound repository, malformed numbers, wrong issue and pull requests before accepting comments", async () => {
  const port = createGitHubIssuesReadPort(fake());
  for (const invalid of [
    { tracker: "acme/other" }, { trackerKey: "board" }, { nativeId: "017" }, { nativeId: "0" },
    { nativeId: "17/18" }, { nativeId: "9007199254740992" }, { provider: "github-projects" }, { tracker: "../work", trackerKey: "../work" },
  ]) await assert.rejects(port.read({ ...identity, ...invalid }));
  for (const changed of [
    { url: "https://api.github.com/repos/acme/other/issues/17" }, { repository_url: "https://api.github.com/repos/acme/other" },
    { number: 18 }, { pull_request: {} }, { state: "unknown" }, { labels: [{ name: "same" }, { name: "same" }] },
    { comments: -1 }, { comments: 10001 }, { updated_at: null },
  ]) await assert.rejects(createGitHubIssuesReadPort(fake({ ...issue, ...changed })).read(identity), { code: "readback_mismatch" });
  assert.throws(() => createGitHubIssuesReadPort({}), { code: "native_unsupported" });
});

test("rejects missing permission, redirects, partial/duplicate comments and changing issue readback", async () => {
  for (const status of [301, 403, 404]) {
    await assert.rejects(createGitHubIssuesReadPort({ get: async () => ({ status }) }).read(identity), { code: "readback_unavailable" });
  }
  await assert.rejects(createGitHubIssuesReadPort({ get: async () => { throw Error("offline"); } }).read(identity), { code: "readback_unavailable" });
  for (const bad of [comments.slice(0, 1), [comments[0], comments[0]], [comments[0], { ...comments[1], issue_url: url.replace("work", "other") }],
    [comments[0], { ...comments[1], body: null }], [comments[0], comment(103, entry("op-1", "handoff", JSON.stringify(handoff)))],
  ]) await assert.rejects(createGitHubIssuesReadPort(fake(issue, bad)).read(identity));
  let reads = 0;
  await assert.rejects(createGitHubIssuesReadPort({ get: async (endpoint) => ({ status: 200,
    body: endpoint.includes("/comments?") ? comments : { ...issue, state: ++reads === 1 ? "open" : "closed" },
  }) }).read(identity), { code: "readback_mismatch" });
  const endpoints = [];
  const empty = fake({ ...issue, comments: 0 }, []);
  const snapshot = await createGitHubIssuesReadPort({ get: async (endpoint) => { endpoints.push(endpoint); return empty.get(endpoint); } }).read(identity);
  assert.deepEqual(snapshot.entries, []);
  assert.equal(endpoints.length, 3); // Even zero comments requires a permissioned empty-page read.
});

test("requires every page and detects a changed comment count", async () => {
  const all = Array.from({ length: 101 }, (_, index) => ({ ...comment(index + 1, entry(`op-${index + 1}`, "comment", "Checkpoint")) }));
  const get = async (endpoint) => ({ status: 200, body: endpoint.includes("&page=1") ? all.slice(0, 100)
    : endpoint.includes("&page=2") ? all.slice(100) : { ...issue, comments: 101 } });
  assert.equal((await createGitHubIssuesReadPort({ get }).read(identity)).entries.length, 101);
  await assert.rejects(createGitHubIssuesReadPort({ get: async (endpoint) => ({ status: 200,
    body: endpoint.includes("&page=2") ? [] : (await get(endpoint)).body,
  }) }).read(identity), { code: "readback_unavailable" });
  let reads = 0;
  await assert.rejects(createGitHubIssuesReadPort({ get: async (endpoint) => ({ status: 200,
    body: endpoint.includes("/comments?") ? comments : { ...issue, comments: ++reads === 1 ? 2 : 3 },
  }) }).read(identity), { code: "readback_mismatch" });
});

test("correlated handoffs require shared complete evidence and unique canonical envelopes", async () => {
  for (const content of ['{"phase":"VERIFICATION"}', JSON.stringify({ ...handoff, phase: "BLOCKED", status: "BLOCKED", resumePhase: "DONE", blocker: "Await approval" }),
    JSON.stringify(handoff).replace('"phase":"VERIFICATION"', '"ph\\u0061se":"DONE","phase":"VERIFICATION"')]) {
    await assert.rejects(createGitHubIssuesReadPort(fake({ ...issue, comments: 1 }, [comment(101, entry("phase-1", "handoff", content))])).read(identity), { code: "readback_mismatch" });
  }
  for (const body of ['task-adapter:v1:{bad', 'task-adapter:v1:{"operationId":"x","operationId":"y","kind":"comment","content":"c"}']) {
    await assert.rejects(createGitHubIssuesReadPort(fake({ ...issue, comments: 1 }, [{ ...comments[0], body }])).read(identity), { code: "readback_mismatch" });
  }
});

test("fresh generated target retains port and dispatches only the selected binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "github-issues-generated-"));
  try {
    const target = path.join(root, "project");
    const config = path.join(root, "answers.json");
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "GitHub Issues read proof", TASK_TRACKER: "github-issues", TRACKER: "acme/work", TRACKER_KEY: "acme/work" } }));
    const { stdout } = await exec(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname, "apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(JSON.parse(stdout).verification, "verified");
    assert.match(await readFile(path.join(target, "docs/bindings.md"), "utf8"), /Task provider \(TASK_TRACKER\): github-issues/u);
    await assert.rejects(stat(path.join(target, "src")));
    await assert.rejects(stat(path.join(target, "odd")));
    const { createTaskAdapter: generated } = await import(new URL(`file://${target}/.factory/scripts/task-adapter.mjs`));
    const { createGitHubIssuesReadPort: generatedPort } = await import(new URL(`file://${target}/.factory/scripts/task-github-issues-read.mjs`));
    let jiraCalls = 0;
    const adapter = await generated({ projectRoot: target, ports: { "github-issues": generatedPort(fake()), jira: { read: async () => { jiraCalls++; throw Error("fallback"); } } } });
    assert.equal((await adapter.read(identity)).entries[1].operationId, "phase-1");
    await assert.rejects(adapter.write(identity, { kind: "comment", operationId: "new", status: "open", content: "no write" }), { code: "native_unsupported" });
    assert.equal(jiraCalls, 0);
    const other = path.join(root, "other");
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Jira dispatch proof", TASK_TRACKER: "jira", TRACKER: "jira-project:tenant", TRACKER_KEY: "OPS" } }));
    assert.equal(JSON.parse((await exec(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname,
      "apply", "--target", other, "--config", config, "--non-interactive"])).stdout).verification, "verified");
    assert.match(await readFile(path.join(other, "docs/bindings.md"), "utf8"), /Task provider \(TASK_TRACKER\): jira/u);
    let githubCalls = 0;
    const jiraAdapter = await generated({ projectRoot: other, ports: { "github-issues": generatedPort({ get: async () => { githubCalls++; throw Error("fallback"); } }), jira: { read: async (id) => ({ identity: id, status: "To Do", entries: [] }) } } });
    assert.equal((await jiraAdapter.read({ provider: "jira", tracker: "jira-project:tenant", trackerKey: "OPS", nativeId: "OPS-1" })).status, "To Do");
    assert.equal(githubCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

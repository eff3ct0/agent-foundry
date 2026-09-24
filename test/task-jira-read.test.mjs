import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTaskAdapter } from "../scripts/task-adapter.mjs";
import { createJiraReadPort } from "../scripts/task-jira-read.mjs";

const exec = promisify(execFile);
const identity = { provider: "jira", tracker: "jira-project:tenant", trackerKey: "OPS", nativeId: "OPS-17" };
const issue = { key: "OPS-17", fields: { project: { key: "OPS" }, status: { name: "In Progress" } } };
const comment = (id, operationId, kind = "comment", content = "Native checkpoint") => ({
  id, body: `task-adapter:v1:${JSON.stringify({ operationId, kind, content })}`,
});
const native = (options = {}) => ({
  readIssue: async () => options.issue ?? issue,
  readComments: async () => options.page ?? { complete: true, comments: [comment("100", "run-17"), comment("101", "phase-17", "handoff", '{"phase":"VERIFICATION"}')] },
});

test("native Jira project, opaque key, named status and exact correlated comments are read only", async () => {
  let githubCalls = 0;
  let issueCalls = 0;
  let commentCalls = 0;
  const transport = native();
  const port = createJiraReadPort({
    readIssue: async (key) => { issueCalls++; assert.equal(key, identity.nativeId); return transport.readIssue(key); },
    readComments: async (key) => { commentCalls++; assert.equal(key, identity.nativeId); return transport.readComments(key); },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), "jira-binding-"));
  try {
    // Use the actual generated target in the test below; this one checks dispatch with a compact binding fixture.
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs/bindings.md"), `## Bound task identity\n\n- Task provider (TASK_TRACKER): jira\n- Tracker (TRACKER): jira-project:tenant\n- Project/board (TRACKER_KEY): OPS\n\n## Jira\n`);
    const adapter = await createTaskAdapter({ projectRoot: root, ports: {
      jira: port,
      "github-issues": { read: async () => { githubCalls++; throw Error("fallback"); } },
    } });
    const snapshot = await adapter.read(identity);
    assert.deepEqual(snapshot, { identity, status: "In Progress", entries: [
      { operationId: "run-17", kind: "comment", content: "Native checkpoint" },
      { operationId: "phase-17", kind: "handoff", content: '{"phase":"VERIFICATION"}' },
    ] });
    await assert.rejects(adapter.write(identity, { kind: "comment", operationId: "new", status: "In Progress", content: "No native write" }), { code: "native_unsupported" });
    assert.equal(githubCalls, 0);
    assert.equal(issueCalls, 2);
    assert.equal(commentCalls, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("board-only binding, wrong project/key and unknown status fail closed", async () => {
  const port = createJiraReadPort(native());
  await assert.rejects(port.read({ ...identity, tracker: "tenant/board" }), { code: "native_unsupported", message: /board-only bindings/u });
  await assert.rejects(createJiraReadPort(native({ issue: { ...issue, fields: { ...issue.fields, project: { key: "OTHER" } } } })).read(identity), { code: "readback_mismatch" });
  await assert.rejects(createJiraReadPort(native({ issue: { ...issue, key: "OPS-18" } })).read(identity), { code: "readback_mismatch" });
  await assert.rejects(createJiraReadPort(native({ issue: { ...issue, fields: { ...issue.fields, status: { name: "Review" } } } })).read(identity), { code: "native_unsupported", message: /status Review/u });
});

test("incomplete, unavailable, duplicate or unprovable comment evidence never becomes a handoff", async () => {
  for (const page of [
    { complete: false, comments: [comment("1", "op")] },
    { complete: true },
    { complete: true, comments: [comment("1", "op"), comment("2", "op")] },
    { complete: true, comments: [comment("1", "op"), comment("1", "other")] },
    { complete: true, comments: [{ id: "1", body: 'task-adapter:v1:{broken' }] },
    { complete: true, comments: [{ id: "1", body: { type: "doc" } }] },
  ]) {
    await assert.rejects(createJiraReadPort(native({ page })).read(identity), { code: page.complete === false || !page.comments ? "readback_unavailable" : "readback_mismatch" });
  }
  const ordinary = createJiraReadPort(native({ page: { complete: true, comments: [{ id: "3", body: "ordinary Jira comment" }] } }));
  assert.deepEqual((await ordinary.read(identity)).entries, []);
  await assert.rejects(createJiraReadPort({ readIssue: async () => issue, readComments: async () => { throw Error("offline"); } }).read(identity), { code: "readback_unavailable" });
  assert.throws(() => createJiraReadPort({ readIssue: async () => issue }), { code: "native_unsupported" });
});

test("fresh offline generated Jira target imports retained native port without src or odd", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jira-generated-"));
  const target = path.join(root, "project");
  const config = path.join(root, "answers.json");
  try {
    await writeFile(config, JSON.stringify({ values: {
      PROJECT_NAME: "Jira read proof", TASK_TRACKER: "jira", TRACKER: "jira-project:tenant", TRACKER_KEY: "OPS",
    } }));
    const { stdout } = await exec(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname,
      "apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(JSON.parse(stdout).verification, "verified");
    assert.match(await readFile(path.join(target, "docs/bindings.md"), "utf8"), /Tracker \(TRACKER\): jira-project:tenant/u);
    await assert.rejects(stat(path.join(target, "src")));
    await assert.rejects(stat(path.join(target, "odd")));
    const { createTaskAdapter: generated } = await import(new URL(`file://${target}/.factory/scripts/task-adapter.mjs`));
    const { createJiraReadPort: generatedPort } = await import(new URL(`file://${target}/.factory/scripts/task-jira-read.mjs`));
    const adapter = await generated({ projectRoot: target, ports: { jira: generatedPort(native()) } });
    assert.equal((await adapter.read(identity)).entries[1].operationId, "phase-17");
    await assert.rejects(adapter.write(identity, { kind: "comment", operationId: "new", status: "In Progress", content: "no write" }), { code: "native_unsupported" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

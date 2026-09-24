import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTaskAdapter, parseTaskBinding } from "../scripts/task-adapter.mjs";

const binding = (provider = "jira", board = "BOARD") => `# Bindings - mandatory project providers

## Bound task identity

- Task provider (TASK_TRACKER): ${provider}
- Tracker (TRACKER): organization/project
- Project/board (TRACKER_KEY): ${board}

## Jira
`;
const identity = { provider: "jira", tracker: "organization/project", trackerKey: "BOARD", nativeId: "NATIVE-42" };
const entry = { kind: "comment", operationId: "run-42", status: "In Progress", content: "Native handoff" };
const exec = promisify(execFile);

const fixture = async (text, ports) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task-adapter-"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs/bindings.md"), text);
  return { root, adapter: () => createTaskAdapter({ projectRoot: root, ports }), cleanup: () => rm(root, { recursive: true, force: true }) };
};

test("only one complete generated binding is accepted, without provider fallback", async () => {
  for (const text of ["# unbound", binding("unknown"), binding("jira", "not configured; resolve before durable task operations"), `${binding()}\n## Bound task identity\n`, binding().replace("- Tracker (TRACKER): organization/project", "")]) {
    assert.throws(() => parseTaskBinding(text));
  }
  for (const provider of ["jira", "github-issues", "github-projects", "linear", "custom"]) {
    const f = await fixture(binding(provider), { "github-issues": { read: async () => { throw new Error("must not fall back"); } } });
    try {
      if (provider === "github-issues") assert.equal((await f.adapter()).binding.provider, provider);
      else await assert.rejects(f.adapter(), { code: "native_unsupported" });
    } finally { await f.cleanup(); }
  }
});

test("fresh fake native readback confirms content and duplicate correlation without a second write", async () => {
  const entries = [];
  const claims = new Set();
  let status = "In Progress";
  let writes = 0;
  const f = await fixture(binding(), { jira: {
    claim: async (_identity, nativeEntry) => {
      if (claims.has(nativeEntry.operationId)) return { claimed: false };
      claims.add(nativeEntry.operationId);
      return { claimed: true };
    },
    read: async () => ({ identity, status, entries: [...entries] }),
    write: async (_identity, nativeEntry, nativeStatus) => {
      writes++;
      entries.push(nativeEntry);
      status = nativeStatus;
      return { accepted: true };
    },
  } });
  try {
    const adapter = await f.adapter();
    assert.deepEqual((await adapter.write(identity, entry)).entries, [{ kind: "comment", operationId: "run-42", content: "Native handoff" }]);
    assert.equal((await adapter.write(identity, entry)).status, "In Progress");
    assert.equal(writes, 1);
    await assert.rejects(adapter.write(identity, { ...entry, content: "different" }), { code: "correlation_conflict" });
    await assert.rejects(adapter.read({ ...identity, nativeId: "" }), { code: "identity_invalid" });
  } finally { await f.cleanup(); }
});

test("unknown acknowledgement, wrong target and failed readback cannot report durable success", async () => {
  for (const mode of ["throw", "ack", "wrong", "missing", "unavailable"]) {
    let reads = 0;
    let writes = 0;
    const f = await fixture(binding(), { jira: {
      claim: async () => ({ claimed: true }),
      read: async () => {
        reads++;
        if (mode === "unavailable" && reads > 1) throw Error("offline");
        return { identity: mode === "wrong" && reads > 1 ? { ...identity, nativeId: "other" } : identity,
          status: "In Progress", entries: mode === "missing" ? [] : reads > 1 ? [{ ...entry, status: undefined }] : [] };
      },
      write: async () => { writes++; if (mode === "throw") throw Error("timeout"); return mode === "ack" ? {} : { accepted: true }; },
    } });
    try {
      const adapter = await f.adapter();
      await assert.rejects(adapter.write(identity, entry), { code: ["throw", "ack"].includes(mode) ? "unknown_write_outcome" : mode === "unavailable" ? "readback_unavailable" : "readback_mismatch" });
      assert.equal(writes, 1);
    } finally { await f.cleanup(); }
  }
});

test("lost acknowledgement and stale read across adapters cannot repeat a claimed write", async () => {
  const claims = new Set();
  let writes = 0;
  const f = await fixture(binding(), { jira: {
    idempotentByOperationId: true,
    read: async () => ({ identity, status: "In Progress", entries: [] }),
    claim: async (_identity, nativeEntry) => {
      if (claims.has(nativeEntry.operationId)) return { claimed: false };
      claims.add(nativeEntry.operationId);
      return { claimed: true };
    },
    write: async () => { writes++; throw Error("accepted by provider, response lost"); },
  } });
  try {
    await assert.rejects((await f.adapter()).write(identity, entry), { code: "unknown_write_outcome" });
    await assert.rejects((await f.adapter()).write(identity, entry), { code: "unknown_write_outcome" });
    assert.equal(writes, 1);
    assert.equal(claims.size, 1);
  } finally { await f.cleanup(); }
});

test("structured handoff validates blocked continuation and unsupported writes do not mutate", async () => {
  let writes = 0;
  const f = await fixture(binding(), { jira: {
    idempotentByOperationId: true,
    read: async () => ({ identity, status: "In Progress", entries: [] }),
    write: async () => { writes++; return { accepted: true }; },
  } });
  try {
    const adapter = await f.adapter();
    await assert.rejects(adapter.write(identity, { ...entry, kind: "handoff", content: {} }), { code: "handoff_invalid" });
    await assert.rejects(adapter.write(identity, entry), { code: "native_unsupported" });
    await assert.rejects(adapter.write(identity, { ...entry, kind: "create" }), { code: "operation_invalid" });
    assert.equal(writes, 0);
  } finally { await f.cleanup(); }
});

test("fresh offline creator target retains an executable adapter without src or local task files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "adapter-generated-"));
  const target = path.join(root, "project");
  const config = path.join(root, "answers.json");
  try {
    await writeFile(config, JSON.stringify({ values: {
      PROJECT_NAME: "Offline adapter proof", TASK_TRACKER: "jira", TRACKER: "organization/project", TRACKER_KEY: "BOARD",
    } }));
    const { stdout } = await exec(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname,
      "apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(JSON.parse(stdout).verification, "verified");
    const retained = path.join(target, ".factory/scripts/task-adapter.mjs");
    assert.equal((await stat(retained)).isFile(), true);
    assert.match(await readFile(path.join(target, "docs/bindings.md"), "utf8"), /Task provider \(TASK_TRACKER\): jira/u);
    await assert.rejects(stat(path.join(target, "src")));
    await assert.rejects(stat(path.join(target, "odd")));
    const { createTaskAdapter: generated } = await import(new URL(`file://${retained}`));
    const adapter = await generated({ projectRoot: target, ports: { jira: {
      read: async () => ({ identity, status: "In Progress", entries: [] }),
    } } });
    assert.equal((await adapter.read(identity)).identity.nativeId, "NATIVE-42");
  } finally { await rm(root, { recursive: true, force: true }); }
});

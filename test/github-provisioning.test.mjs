import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "index.js");
const { createGitHubClient, provisionRepositories } = await import("../dist/github-provisioning.js");

const result = (outcome, code) => ({ outcome, ...(code ? { code } : {}) });

const clientFor = ({ lookups, creates = {}, readbacks = {}, preflight = { ok: true } }) => ({
  preflight: async () => preflight,
  lookup: async (target) => lookups[target],
  create: async (target) => creates[target] ?? result("indeterminate", "unexpected_create"),
  readback: async (target) => readbacks[target] ?? { outcome: "indeterminate", code: "missing_fixture" },
});

const targets = {
  health: "acme/.github",
  factory: "acme/factory",
};

test("offline plan validates locally and never touches the GitHub client", async () => {
  const client = {
    preflight: async () => { throw new Error("plan invoked preflight"); },
    lookup: async () => { throw new Error("plan invoked lookup"); },
    create: async () => { throw new Error("plan invoked create"); },
    readback: async () => { throw new Error("plan invoked readback"); },
  };
  const envelope = await provisionRepositories({ org: "acme", plan: true, client });
  assert.equal(envelope.status, "planned");
  assert.deepEqual(envelope.targets.map(({ target }) => target), [targets.health, targets.factory]);
  assert.deepEqual(envelope.summary, { existing: 0, created: 0, skipped: 0, missing: 0, rejected: 0, indeterminate: 0 });
});

test("owner, repository, and visibility validation rejects unsafe inputs", async () => {
  await assert.rejects(() => provisionRepositories({ org: "bad/name", plan: true }), { code: "invalid_target" });
  await assert.rejects(() => provisionRepositories({ org: "acme", factoryRepo: "../factory", plan: true }), { code: "invalid_target" });
  await assert.rejects(() => provisionRepositories({ org: "acme", visibility: "secret", plan: true }), { code: "invalid_visibility" });
});

test("missing gh and unauthenticated preflight fail before repository lookups", async () => {
  const missingGh = createGitHubClient(async () => ({ exitCode: 1, stdout: "", stderr: "", timedOut: false, missingExecutable: true }));
  assert.deepEqual(await missingGh.preflight(), { ok: false, outcome: "rejected", code: "gh_missing" });
  const unauthenticated = createGitHubClient(async () => ({ exitCode: 1, stdout: "", stderr: "not logged into any GitHub hosts", timedOut: false, missingExecutable: false }));
  assert.deepEqual(await unauthenticated.preflight(), { ok: false, outcome: "rejected", code: "authentication_failed" });
});

test("no-create reports missing targets without invoking create", async () => {
  let creates = 0;
  const client = clientFor({
    lookups: { [targets.health]: result("existing"), [targets.factory]: result("missing") },
  });
  client.create = async () => { creates += 1; return result("created"); };
  const envelope = await provisionRepositories({ org: "acme", noCreate: true, client });
  assert.equal(envelope.status, "missing");
  assert.equal(envelope.summary.existing, 1);
  assert.equal(envelope.summary.missing, 1);
  assert.equal(creates, 0);
});

test("EOF or denied consent skips every mutation and exits with a stable outcome", async () => {
  let creates = 0;
  const client = clientFor({
    lookups: { [targets.health]: result("missing"), [targets.factory]: result("missing") },
  });
  client.create = async () => { creates += 1; return result("created"); };
  const envelope = await provisionRepositories({ org: "acme", client, confirm: async () => false });
  assert.equal(envelope.status, "skipped");
  assert.equal(envelope.summary.skipped, 2);
  assert.equal(creates, 0);
});

test("4xx mutation rejection is rejected and does not trigger a blind retry", async () => {
  let creates = 0;
  const client = clientFor({
    lookups: { [targets.health]: result("missing"), [targets.factory]: result("existing") },
    creates: { [targets.health]: result("rejected", "create_rejected") },
  });
  client.create = async () => { creates += 1; return result("rejected", "create_rejected"); };
  const envelope = await provisionRepositories({ org: "acme", yes: true, client });
  assert.equal(envelope.status, "rejected");
  assert.equal(envelope.summary.rejected, 1);
  assert.equal(creates, 1);
});

test("timeout or 5xx becomes indeterminate and stops later mutations", async () => {
  let creates = 0;
  const client = clientFor({
    lookups: { [targets.health]: result("missing"), [targets.factory]: result("missing") },
  });
  client.create = async () => { creates += 1; return result("indeterminate", "create_indeterminate"); };
  const envelope = await provisionRepositories({ org: "acme", yes: true, client });
  assert.equal(envelope.status, "indeterminate");
  assert.equal(envelope.summary.indeterminate, 1);
  assert.equal(envelope.summary.missing, 1);
  assert.equal(creates, 1);
});

test("successful create requires matching target-host readback", async () => {
  const client = clientFor({
    lookups: { [targets.health]: result("missing"), [targets.factory]: result("existing") },
    creates: { [targets.health]: result("created") },
    readbacks: { [targets.health]: { outcome: "existing", repository: { nameWithOwner: targets.health, visibility: "public" } } },
  });
  const envelope = await provisionRepositories({ org: "acme", yes: true, visibility: "private", client });
  assert.equal(envelope.status, "indeterminate");
  assert.equal(envelope.targets[0].outcome, "indeterminate");
  assert.equal(envelope.targets[0].code, "readback_mismatch");
});

test("existing and created targets become a no-op on the second ensure", async () => {
  const state = new Set();
  const client = {
    preflight: async () => ({ ok: true }),
    lookup: async (target) => result(state.has(target) ? "existing" : "missing"),
    create: async (target) => { state.add(target); return result("created"); },
    readback: async (target) => ({ outcome: "existing", repository: { nameWithOwner: target, visibility: "private" } }),
  };
  const first = await provisionRepositories({ org: "acme", yes: true, client });
  const second = await provisionRepositories({ org: "acme", yes: true, client });
  assert.equal(first.status, "applied");
  assert.equal(first.summary.created, 2);
  assert.equal(second.status, "noop");
  assert.equal(second.summary.existing, 2);
});

test("the process adapter uses an argument array and does not forward token variables", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "github-provisioning-gh-"));
  const bin = path.join(parent, "bin");
  const marker = path.join(parent, "calls.jsonl");
  const fakeGh = path.join(bin, "gh");
  await mkdir(bin);
  await writeFile(fakeGh, `#!/usr/bin/env node
const fs = require("node:fs");
const marker = ${JSON.stringify(marker)};
fs.appendFileSync(marker, JSON.stringify({ args: process.argv.slice(2), token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null }) + "\\n");
const args = process.argv.slice(2);
if (args[0] === "auth" && args[1] === "status") process.exit(0);
if (args[0] === "repo" && args[1] === "view" && args[2] === "acme/.github") process.exit(0);
if (args[0] === "repo" && args[1] === "view") { process.stderr.write("404 Not Found"); process.exit(1); }
process.exit(99);
`);
  await chmod(fakeGh, 0o755);
  try {
    const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: "token-must-not-leak" };
    let output;
    try {
      output = await execFileAsync(process.execPath, [cli, "github-provision", "--org", "acme", "--no-create"], { cwd: root, env: environment });
    } catch (error) {
      assert.equal(error.code, 1);
      output = error;
    }
    const envelope = JSON.parse(output.stdout);
    assert.equal(envelope.status, "missing");
    const calls = (await readFile(marker, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(calls[0].args, ["auth", "status"]);
    assert.equal(calls.every((call) => call.token === null), true);
    assert.equal(calls.some((call) => call.args.includes("--shell")), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the fake gh executable proves create readback and second-run idempotency", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "github-provisioning-idempotent-"));
  const bin = path.join(parent, "bin");
  const state = path.join(parent, "state.json");
  const fakeGh = path.join(bin, "gh");
  await mkdir(bin);
  await writeFile(fakeGh, `#!/usr/bin/env node
const fs = require("node:fs");
const state = ${JSON.stringify(state)};
const args = process.argv.slice(2);
const read = () => fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, "utf8")) : [];
const write = (value) => fs.writeFileSync(state, JSON.stringify(value));
if (args[0] === "auth" && args[1] === "status") process.exit(0);
if (args[0] !== "repo") process.exit(99);
const target = args[2];
const repositories = read();
if (args[1] === "view") {
  if (!repositories.includes(target)) { process.stderr.write("404 Not Found"); process.exit(1); }
  if (args.includes("--json")) process.stdout.write(JSON.stringify({ nameWithOwner: target, visibility: "PRIVATE" }));
  process.exit(0);
}
if (args[1] === "create") { write([...repositories, target]); process.exit(0); }
process.exit(99);
`);
  await chmod(fakeGh, 0o755);
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const run = async () => {
    try {
      return { ...(await execFileAsync(process.execPath, [cli, "github-provision", "--org", "acme", "--yes"], { cwd: root, env: environment })), code: 0 };
    } catch (error) {
      return error;
    }
  };
  try {
    const first = await run();
    const second = await run();
    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(JSON.parse(first.stdout).status, "applied");
    assert.equal(JSON.parse(first.stdout).summary.created, 2);
    assert.equal(JSON.parse(second.stdout).status, "noop");
    assert.equal(JSON.parse(second.stdout).summary.existing, 2);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

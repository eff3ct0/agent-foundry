import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import creator from "../dist/creator.js";

const exec = promisify(execFile);
const cli = path.resolve("dist/index.js");
const configuration = JSON.parse(await readFile(new URL("./fixtures/matt-first.json", import.meta.url), "utf8"));
const fixture = async (t, overrides = {}) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "foundry-407-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, "project");
  const configPath = path.join(directory, "setup.json");
  await writeFile(configPath, JSON.stringify({ ...configuration, ...overrides }));
  return { directory, target, configPath };
};
const run = async (...args) => {
  try { return { ...(await exec(process.execPath, [cli, ...args])), code: 0 }; }
  catch (error) { return { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
};

test("accepted fresh plan installs the readable foundation without claiming external readiness", async (t) => {
  const { target, configPath } = await fixture(t);
  const args = ["--target", target, "--config", configPath, "--non-interactive"];
  const preview = JSON.parse((await run("plan", ...args)).stdout);
  assert.equal(preview.status, "planned");
  assert.equal(preview.schema_version, 2);
  assert.match(preview.plan_digest, /^sha256:[a-f0-9]{64}$/u);
  const result = await run("apply", ...args, "--accept-plan", preview.plan_digest);
  assert.equal(result.code, 0, result.stderr);
  const applied = JSON.parse(result.stdout);
  assert.equal(applied.integrity, "verified");
  assert.equal(applied.setup, "incomplete");
  assert.deepEqual((await readdir(target)).sort(), [".factory", ".gitignore", "AGENT.md", "docs", "start.mjs"]);
  const state = JSON.parse(await readFile(path.join(target, ".factory/creator/state.json")));
  assert.equal(state.schema_version, 2);
  assert.equal(state.profile, "matt-first");
  const startup = JSON.parse((await exec(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target })).stdout);
  assert.equal(startup.mode, "USABLE");
  assert.equal(startup.setup, "incomplete");
  assert.equal(startup.integrity, "verified");
  assert.equal(startup.next_action.procedure, "grill-with-docs");
  assert.equal(startup.next_action.started, false);
});

test("acceptance is bound to config, destination and immutable candidate, not a yes flag", async (t) => {
  const { target, configPath } = await fixture(t);
  const options = { command: "apply", target, configPath };
  const plan = await creator.preparePlan(options);
  await assert.rejects(creator.applyPlan(plan, ""), { code: "acceptance_required" });
  await writeFile(configPath, JSON.stringify({ ...configuration, initialize_git: true }));
  await assert.rejects(creator.applyPlan(plan, plan.envelope.plan_digest), { code: "plan_stale" });
  await assert.rejects(lstat(target), { code: "ENOENT" });
  const fresh = await creator.preparePlan(options);
  await mkdir(target);
  await writeFile(path.join(target, "app.txt"), "preserve");
  await assert.rejects(creator.applyPlan(fresh, fresh.envelope.plan_digest), { code: "plan_stale" });
  assert.equal(await readFile(path.join(target, "app.txt"), "utf8"), "preserve");
  assert.deepEqual(await readdir(target), ["app.txt"]);
});

test("handled failure restores fresh absence; interruption retains inspectable applied and pending boundaries", async (t) => {
  const { target, configPath } = await fixture(t);
  const failed = await creator.preparePlan({ command: "apply", target, configPath, failAfter: 3 });
  await assert.rejects(creator.applyPlan(failed, failed.envelope.plan_digest), (error) => {
    assert.equal(error.plan.envelope.rollback.restored, true);
    assert.deepEqual(error.plan.envelope.applied, []);
    return true;
  });
  await assert.rejects(lstat(target), { code: "ENOENT" });
  const interrupted = await creator.preparePlan({ command: "apply", target, configPath, interruptAfter: 3 });
  await assert.rejects(creator.applyPlan(interrupted, interrupted.envelope.plan_digest), (error) => {
    assert.equal(error.plan.envelope.status, "partial");
    assert.equal(error.plan.envelope.applied.length, 3);
    assert.ok(error.plan.envelope.pending.includes("AGENT.md"));
    return true;
  });
  const journal = JSON.parse(await readFile(path.join(target, ".factory/creator/.staging/journal.json")));
  assert.equal(journal.plan_digest, interrupted.envelope.plan_digest);
  const diagnosis = await creator.preparePlan({ command: "doctor", target, configPath });
  assert.equal((await creator.doctor(diagnosis)).status, "partial");
  assert.equal(diagnosis.envelope.diagnostics[0].code, "staging_interrupted");
  await assert.rejects(creator.applyPlan(diagnosis, interrupted.envelope.plan_digest), { code: "acceptance_required" });
});

test("unowned content, unsafe paths and schema-1 state never become fresh ownership", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  await mkdir(target);
  await symlink(directory, path.join(target, ".factory"));
  let plan = await creator.preparePlan({ command: "plan", target, configPath });
  assert.equal(plan.envelope.status, "conflict");
  assert.equal(plan.envelope.diagnostics[0].code, "unsafe_path");
  await rm(path.join(target, ".factory"));
  await mkdir(path.join(target, ".factory/creator"), { recursive: true });
  await writeFile(path.join(target, ".factory/creator/state.json"), '{"schema_version":1,"onboarded":true}');
  plan = await creator.preparePlan({ command: "plan", target, configPath });
  assert.equal(plan.envelope.diagnostics[0].code, "legacy_readoption_required");
  assert.equal(await readFile(path.join(target, ".factory/creator/state.json"), "utf8"), '{"schema_version":1,"onboarded":true}');
  const self = await creator.preparePlan({ command: "plan", target: path.resolve("."), configPath });
  assert.equal(self.envelope.diagnostics[0].code, "source_self");
});

test("a clone can discover without the local ledger but cannot infer mutation ownership", async (t) => {
  const { target, configPath } = await fixture(t);
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await creator.applyPlan(plan, plan.envelope.plan_digest);
  await rm(path.join(target, ".factory/creator"), { recursive: true });
  const { stdout } = await exec(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target });
  const discovered = JSON.parse(stdout);
  assert.equal(discovered.mode, "USABLE");
  assert.equal(discovered.setup, "incomplete");
  assert.match(discovered.ownership, /missing/u);
  const mutation = await creator.preparePlan({ command: "apply", target, configPath });
  assert.equal(mutation.envelope.diagnostics[0].code, "fresh_target_not_empty");
});

test("owned mode drift and a missing indexed resource prevent a usable foundation", async (t) => {
  const { target, configPath } = await fixture(t);
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await creator.applyPlan(plan, plan.envelope.plan_digest);
  const resource = path.join(target, ".factory/skills/matt-pocock/skills/engineering/tdd/tests.md");
  await chmod(resource, 0o600);
  const drift = await creator.preparePlan({ command: "verify", target, configPath });
  assert.equal(drift.envelope.diagnostics[0].code, "owned_file_drift");
  await rm(resource);
  const result = await run("verify", "--target", target, "--config", configPath, "--non-interactive");
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).integrity, "failed");
  await assert.rejects(exec(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target }), (error) => {
    assert.equal(JSON.parse(error.stdout).mode, "UNSAFE");
    return true;
  });
});

test("accepted local Git initialization cannot be redirected by ambient Git environment", async (t) => {
  const { directory, target, configPath } = await fixture(t, { initialize_git: true });
  const victim = path.join(directory, "unrelated-git");
  const args = ["--target", target, "--config", configPath, "--non-interactive"];
  const preview = JSON.parse((await run("plan", ...args)).stdout);
  const result = await exec(process.execPath, [cli, "apply", ...args, "--accept-plan", preview.plan_digest], {
    env: { ...process.env, GIT_DIR: victim, GIT_WORK_TREE: directory },
  });
  assert.equal(JSON.parse(result.stdout).integrity, "verified");
  assert.equal((await lstat(path.join(target, ".git"))).isDirectory(), true);
  await assert.rejects(lstat(victim), { code: "ENOENT" });
  const remote = await exec("git", ["-C", target, "remote"], {
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  });
  assert.equal(remote.stdout, "");
});

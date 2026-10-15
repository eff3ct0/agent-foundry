import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { renameSync, symlinkSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFile, spawn } from "node:child_process";
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

test("handled failure and interruption preserve inspectable effects without deleting concurrent work", async (t) => {
  for (const fault of ["failAfter", "interruptAfter"]) {
    const { target, configPath } = await fixture(t);
    const interrupted = await creator.preparePlan({ command: "apply", target, configPath, [fault]: 3 });
    await assert.rejects(creator.applyPlan(interrupted, interrupted.envelope.plan_digest), (error) => {
      assert.equal(error.plan.envelope.status, "partial");
      assert.equal(error.plan.envelope.rollback.restored, false);
      assert.equal(error.plan.envelope.rollback.attempted, false);
      assert.equal(error.plan.envelope.applied.length, 3);
      assert.ok(error.plan.envelope.pending.includes("AGENT.md"));
      return true;
    });
    const journal = JSON.parse(await readFile(path.join(target, ".factory/creator/.staging/journal.json")));
    assert.equal(journal.plan_digest, interrupted.envelope.plan_digest);
    assert.equal(journal.status, "applying");
    const diagnosis = await creator.preparePlan({ command: "doctor", target, configPath });
    const diagnosed = await creator.doctor(diagnosis);
    assert.equal(diagnosed.status, "partial");
    assert.deepEqual(diagnosed.applied, journal.applied);
    assert.equal(diagnosed.pending.length, interrupted.files.length - 3);
    assert.equal(diagnosis.envelope.diagnostics[0].code, "staging_interrupted");
    await assert.rejects(creator.applyPlan(diagnosis, interrupted.envelope.plan_digest), { code: "acceptance_required" });
  }
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

test("a replaced journal cannot redirect writes to an unaccepted file", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  await mkdir(target);
  const victim = path.join(directory, "victim.txt");
  await writeFile(victim, "unchanged victim\n");
  let replaced = false;
  const watcher = watch(target, { recursive: true }, (_event, filename) => {
    if (!replaced && filename === ".factory/creator/.staging/journal.json") {
      replaced = true;
      const journal = path.join(target, filename);
      renameSync(journal, `${journal}.preserved`);
      symlinkSync(victim, journal);
    }
  });
  t.after(() => watcher.close());
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await creator.applyPlan(plan, plan.envelope.plan_digest).catch(() => undefined);
  assert.equal(replaced, true);
  assert.equal(await readFile(victim, "utf8"), "unchanged victim\n");
});

test("a replaced target root never redirects accepted writes into another directory", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  await mkdir(target);
  const victim = path.join(directory, "victim");
  await mkdir(victim);
  await writeFile(path.join(victim, "sentinel.txt"), "unchanged\n");
  let replaced = false;
  const watcher = watch(target, { recursive: true }, (_event, filename) => {
    if (!replaced && filename === ".factory/creator/.staging/journal.json") {
      replaced = true;
      renameSync(target, path.join(directory, "original-target"));
      symlinkSync(victim, target);
    }
  });
  t.after(() => watcher.close());
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await creator.applyPlan(plan, plan.envelope.plan_digest).catch(() => undefined);
  assert.equal(replaced, true);
  assert.deepEqual(await readdir(victim), ["sentinel.txt"]);
  assert.equal(await readFile(path.join(victim, "sentinel.txt"), "utf8"), "unchanged\n");
});

test("a competing accepted apply cannot acquire or erase another invocation's staging", async (t) => {
  const { target, configPath } = await fixture(t);
  await mkdir(target);
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  const results = await Promise.allSettled([
    creator.applyPlan(plan, plan.envelope.plan_digest),
    creator.applyPlan(plan, plan.envelope.plan_digest),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const diagnosis = await creator.preparePlan({ command: "doctor", target, configPath });
  assert.equal((await creator.doctor(diagnosis)).integrity, "verified");
  const journal = JSON.parse(await readFile(path.join(target, ".factory/creator/.staging/journal.json")));
  assert.equal(journal.status, "committed");
  assert.equal(journal.applied.length, plan.files.length);
});

test("a newly created root replaced before acquisition does not authorize existing content", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  const victim = path.join(directory, "victim");
  await mkdir(victim);
  await writeFile(path.join(victim, "sentinel.txt"), "unchanged\n");
  let replaced = false;
  const watcher = watch(directory, (_event, filename) => {
    if (!replaced && filename === "project") {
      replaced = true;
      renameSync(target, path.join(directory, "original-target"));
      renameSync(victim, target);
    }
  });
  t.after(() => watcher.close());
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await creator.applyPlan(plan, plan.envelope.plan_digest).catch(() => undefined);
  assert.equal(replaced, true);
  assert.deepEqual(await readdir(target), ["sentinel.txt"]);
  assert.equal(await readFile(path.join(target, "sentinel.txt"), "utf8"), "unchanged\n");
});

test("short journal writes still produce complete committed recovery evidence", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  const probe = await open(path.join(directory, "probe"), "wx");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalWrite = prototype.write;
  t.mock.method(prototype, "write", function (buffer, offset, length, position) {
    return originalWrite.call(this, buffer, offset, Math.min(length, 1024), position);
  });
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  const result = await creator.applyPlan(plan, plan.envelope.plan_digest);
  assert.equal(result.status, "applied");
  const journal = JSON.parse(await readFile(path.join(target, ".factory/creator/.staging/journal.json")));
  assert.equal(journal.status, "committed");
  assert.deepEqual(journal.applied, plan.files.map((file) => file.relativePath));
});

test("missing or inconsistent private recovery evidence cannot be reported healthy", async (t) => {
  for (const defect of ["staged-file", "journal-mode", "candidate", "baseline", "local-git"]) {
    const { target, configPath } = await fixture(t);
    const plan = await creator.preparePlan({ command: "apply", target, configPath });
    await creator.applyPlan(plan, plan.envelope.plan_digest);
    const journalPath = path.join(target, ".factory/creator/.staging/journal.json");
    if (defect === "staged-file") await rm(path.join(target, ".factory/creator/.staging/files/AGENT.md"));
    else if (defect === "journal-mode") await chmod(journalPath, 0o644);
    else {
      const journal = JSON.parse(await readFile(journalPath));
      if (defect === "candidate") journal.candidate.candidate_digest = `sha256:${"0".repeat(64)}`;
      if (defect === "baseline") journal.baseline = "unknown";
      if (defect === "local-git") journal.local_git = "verified";
      await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    }
    const diagnosis = await creator.doctor(await creator.preparePlan({ command: "doctor", target, configPath }));
    assert.equal(diagnosis.integrity, "failed", defect);
    const observed = await exec(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target }).catch((error) => error);
    assert.equal(observed.code, 1, defect);
    assert.equal(JSON.parse(observed.stdout).mode, "UNSAFE", defect);
  }
});

test("a journal write without progress cannot claim a committed installation", async (t) => {
  const { directory, target, configPath } = await fixture(t);
  const probe = await open(path.join(directory, "probe"), "wx");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  t.mock.method(prototype, "write", async () => ({ bytesWritten: 0 }));
  const plan = await creator.preparePlan({ command: "apply", target, configPath });
  await assert.rejects(creator.applyPlan(plan, plan.envelope.plan_digest), { code: "journal_write_failed" });
  await assert.rejects(lstat(path.join(target, "AGENT.md")), { code: "ENOENT" });
});

test("interactive consent accepts only affirmation and leaves denied, EOF and interrupted targets absent", async (t) => {
  for (const action of ["yes", "no", "eof", "interrupt"]) {
    const { target, configPath } = await fixture(t);
    const child = spawn(process.execPath, [cli, "apply", "--target", target, "--config", configPath, "--no-color"], { stdio: ["pipe", "pipe", "pipe"] });
    t.after(() => child.kill());
    let output = "";
    let display = "";
    let answered = false;
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => {
      display += chunk;
      if (!answered && display.includes("? [y/N] ")) {
        answered = true;
        if (action === "interrupt") child.kill("SIGINT");
        else child.stdin.end(action === "yes" ? "yes\n" : action === "no" ? "no\n" : "");
      }
    });
    const exit = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(answered, true, display);
    assert.equal(exit.signal, null, action);
    const result = JSON.parse(output);
    if (action === "yes") {
      assert.equal(exit.code, 0, display);
      assert.equal(result.integrity, "verified");
      const verified = JSON.parse((await run("verify", "--target", target, "--config", configPath, "--non-interactive")).stdout);
      assert.equal(verified.integrity, "verified");
    } else {
      assert.equal(exit.code, 1, action);
      assert.equal(result.status, "cancelled", action);
      await assert.rejects(lstat(target), { code: "ENOENT" });
    }
  }
});

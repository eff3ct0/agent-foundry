import assert from "node:assert/strict";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { parseDocument } from "yaml";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "index.js");
const { preparePlan } = await import("../dist/creator.js");
const { checkGeneratedModulePolicy } = await import("../dist/module-policy-generated.js");
const { check: checkDeliveryContract } = await import("../scripts/typed-inherited-runtime/check-delivery-contract.js");

const run = async (args, options = {}) => {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], { cwd: root, ...options });
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code };
  }
};

const runInteractive = (args, inputText, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: ["pipe", "pipe", "pipe"], ...options });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(inputText);
});

const configFile = async (directory, values = {}) => {
  const file = path.join(directory, "answers.json");
  await writeFile(file, JSON.stringify({ values: {
    PROJECT_NAME: "Example project",
    TASK_TRACKER: "github-issues",
    ...values,
  }}));
  return file;
};

const factoryFixture = async (directory, values, workflows = {}) => {
  const factory = path.join(directory, "factory");
  await mkdir(factory);
  const git = async (...args) => (await execFileAsync("git", ["-C", factory, ...args])).stdout.trim();
  await git("init", "-q");
  await writeFile(path.join(factory, "factory.defaults.json"), JSON.stringify({ schema_version: 1, values }));
  for (const [stack, content] of Object.entries(workflows)) {
    const workflowPath = path.join(factory, ".github", "workflows", `${stack}.yml`);
    await mkdir(path.dirname(workflowPath), { recursive: true });
    await writeFile(workflowPath, content);
  }
  await git("add", ".");
  await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "defaults");
  await git("tag", "v1");
  return { factory, sha: await git("rev-parse", "HEAD"), git };
};

const callableWorkflow = "name: Reusable CI\non:\n  workflow_call:\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";

const providerExecutables = async (directory, names, exitCode = 0) => {
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  for (const name of names) {
    const executable = path.join(bin, name);
    await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > "${process.env.FACTORY_HANDOFF_ARGS ?? "/dev/null"}"\nif [ -n "$FACTORY_HANDOFF_STDOUT" ]; then printf '%s' "$FACTORY_HANDOFF_STDOUT"; fi\nexit ${exitCode}\n`);
    await chmod(executable, 0o755);
  }
  return bin;
};

const json = (result) => JSON.parse(result.stdout);
const walkFiles = async (directory, result = []) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkFiles(absolute, result);
    else result.push(absolute);
  }
  return result.sort();
};

test("generated module inventory uses the composed creator plan, not application paths or state declarations", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-module-policy-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent, { OPENCODE_PLUGIN: "true", CI_SYSTEM: "GitHub Actions", CI_STACKS: "typescript" });
  const args = ["--target", target, "--config", config, "--non-interactive"];
  const options = { target, configPath: config };
  try {
    const plan = await run(["plan", ...args]);
    assert.equal(plan.code, 0, plan.stderr);
    assert.equal(json(plan).status, "planned");
    const apply = await run(["apply", ...args]);
    assert.equal(apply.code, 0, apply.stderr);
    assert.equal(json(apply).status, "applied");
    const verify = await run(["verify", ...args]);
    assert.equal(verify.code, 0, verify.stderr);
    assert.equal(json(verify).status, "verified");
    const rerun = await run(["apply", ...args]);
    assert.equal(rerun.code, 0, rerun.stderr);
    assert.equal(json(rerun).status, "noop");

    const baseline = await checkGeneratedModulePolicy(options);
    assert.deepEqual(baseline, [
      ".factory/scripts/check-factory-layout.mjs",
      ".factory/scripts/task-adapter.mjs",
      ".factory/scripts/task-github-issues-read.mjs",
      ".factory/scripts/task-jira-read.mjs",
      "start.mjs",
    ].map((name) => ({ scope: "generated", path: name, reason: "untyped .mjs module" })));
    assert.ok(await stat(path.join(target, ".opencode/plugins/factory-start.ts")));
    assert.ok(await stat(path.join(target, ".github/workflows/ci.yml")));
    const labelScript = path.join(target, ".factory/scripts/typed-inherited-runtime/sync-github-labels.js");
    const labelsWorkflow = await readFile(path.join(target, ".github/workflows/sync-labels.yml"), "utf8");
    const governanceWorkflow = await readFile(path.join(target, ".github/workflows/governance.yml"), "utf8");
    assert.match(labelsWorkflow, /^permissions:\n  contents: read\n  issues: write\n/mu);
    assert.match(labelsWorkflow, /persist-credentials: false/u);
    assert.match(labelsWorkflow, /pnpm install --frozen-lockfile --ignore-scripts\n          pnpm build[\s\S]*?run: node \.factory\/scripts\/typed-inherited-runtime\/sync-github-labels\.js/u);
    assert.match(governanceWorkflow, /node \.factory\/scripts\/typed-inherited-runtime\/check-pr-governance\.js/u);
    assert.doesNotMatch(governanceWorkflow, /pnpm build/u);
    assert.match(labelsWorkflow, /node \.factory\/scripts\/typed-inherited-runtime\/sync-github-labels\.js --repo/u);
    assert.match(labelsWorkflow, /\.factory\/scripts\/typed-inherited\/sync-github-labels\.mts/u);
    const selfCheck = await execFileAsync(process.execPath, [labelScript, "--self-check"], { cwd: target });
    assert.match(selfCheck.stdout, /self-check OK\n$/u);
    const dryRun = await execFileAsync(process.execPath, [labelScript, "--dry-run", "--repo", "acme/example"], { cwd: target });
    assert.equal(dryRun.stdout.trim().split("\n").length, 10);
    for (const relative of [
      ".factory/scripts/typed-inherited/check-pr-governance.mts",
      ".factory/scripts/typed-inherited/check-delivery-contract.mts",
      ".factory/scripts/typed-inherited-runtime/check-delivery-contract.js",
      ".factory/scripts/typed-inherited-runtime/check-pr-governance.js",
      ".factory/scripts/typed-inherited/sync-github-labels.mts",
      ".factory/scripts/typed-inherited-runtime/sync-github-labels.js",
      ".factory/scripts/typed-inherited-runtime/package.json",
    ]) {
      const filename = path.join(target, relative);
      const original = await readFile(filename);
      await writeFile(filename, Buffer.concat([original, Buffer.from("\n")]));
      await assert.rejects(checkGeneratedModulePolicy(options), /does not match the composed creator plan/u);
      await writeFile(filename, original);
      if (process.platform !== "win32") {
        await chmod(filename, 0o755);
        await assert.rejects(checkGeneratedModulePolicy(options), /does not match the composed creator plan/u);
        await chmod(filename, 0o644);
      }
    }
    await writeFile(path.join(path.dirname(labelScript), "extra.js"), "export {};\n");
    await assert.rejects(checkGeneratedModulePolicy(options), /typed runtime file set differs/u);
    await rm(path.join(path.dirname(labelScript), "extra.js"));
    assert.deepEqual(await checkGeneratedModulePolicy(options), baseline);

    await mkdir(path.join(target, "app"));
    await writeFile(path.join(target, "app/own.js"), "export {};");
    assert.deepEqual(await checkGeneratedModulePolicy(options), baseline);
    await mkdir(path.join(target, ".factory/scripts/nested"));
    await writeFile(path.join(target, ".factory/scripts/nested/rogue.js"), "export {};");
    assert.deepEqual(await checkGeneratedModulePolicy(options), [
      ...baseline,
      { scope: "generated", path: ".factory/scripts/nested/rogue.js", reason: "untyped JavaScript module" },
    ].sort((a, b) => a.path.localeCompare(b.path, "en")));

    await symlink(path.join(target, "app/own.js"), path.join(target, ".factory/scripts/nested/link.js"));
    await assert.rejects(checkGeneratedModulePolicy(options), /generated inventory symlink/u);
    await rm(path.join(target, ".factory/scripts/nested/link.js"));

    const statePath = path.join(target, ".factory/creator/state.json");
    const originalState = await readFile(statePath, "utf8");
    const state = JSON.parse(originalState);
    state.owned_files.push({ path: "app/own.js", mode: "0644", size: 10, sha256: "forged" });
    await writeFile(statePath, JSON.stringify(state));
    await assert.rejects(checkGeneratedModulePolicy(options), /state_invalid|creator state/u);
    await writeFile(statePath, originalState);

    const owned = path.join(target, ".factory/scripts/typed-inherited-runtime/check-pr-governance.js");
    const originalOwned = await readFile(owned);
    await rm(owned);
    await symlink(path.join(target, "app/own.js"), owned);
    await assert.rejects(checkGeneratedModulePolicy(options), /does not match the composed creator plan/u);
    await rm(owned);
    await writeFile(owned, originalOwned);
    await rm(owned);
    await assert.rejects(checkGeneratedModulePolicy(options), /does not match the composed creator plan/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("plan and dry-run are deterministic and do not mutate an empty target", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-plan-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const first = await run(["plan", "--target", target, "--config", config, "--non-interactive"]);
  const second = await run(["plan", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(first.code, 0);
  assert.equal(first.stdout, second.stdout);
  const dryRun = await run(["dry-run", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(dryRun.code, 0);
  assert.equal(json(dryRun).status, "dry-run");
  await assert.rejects(readdir(target));
  assert.equal(json(first).schema_version, 1);
  assert.ok(json(first).operations.every((operation) => operation.path));
});

test("fresh consumer guidance is concrete, routed, and creator-owned without changing SELF guidance", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-consumer-guidance-"));
  try {
    const sourceAgent = await readFile(path.join(root, "AGENT.md"), "utf8");
    const sourceReadme = await readFile(path.join(root, "README.md"), "utf8");
    const target = path.join(parent, "project");
    const config = await configFile(parent, { LANGUAGES_AND_FRAMEWORKS: "TypeScript", TRACKER_KEY: "BOARD-1" });
    const args = ["--target", target, "--config", config, "--non-interactive"];
    assert.equal(json(await run(["apply", ...args])).status, "applied");
    const readme = await readFile(path.join(target, "README.md"), "utf8");
    const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
    assert.match(readme, /^# Example project\n\nTypeScript repository\./u);
    assert.match(agent, /^# Example project — Agent operating contract\n/u);
    assert.match(readme, /task provider is github-issues/u);
    assert.match(readme, /\.factory\/creator\/state\.json/u);
    assert.match(agent, /Name: `Example project`/u);
    assert.match(agent, /Project documents[\s\S]*?\| Ticket execution \(`WORK`\)/u);
    assert.match(agent, /\.factory\/templates\/agent-runbook\.md/u);
    assert.match(agent, /Protected `status:approved` gate/u);
    assert.match(agent, /docs\/bindings\.md.*documentation authority/u);
    for (const text of [readme, agent]) assert.doesNotMatch(text, /This is a template|source archetype|creator package is the primary project path|Archetype maintenance|Project initialization \(`SETUP`\)|npm-release\.yml|Template mode|<EXACT_VERSION>/u);
    for (const [name, text] of [["README.md", readme], ["AGENT.md", agent]]) {
      for (const [, href] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
        if (href.startsWith("#") || href.includes("://")) continue;
        const relative = href.split("#")[0];
        await stat(path.resolve(target, path.dirname(name), relative));
      }
    }
    assert.equal((await execFileAsync(process.execPath, [path.join(target, "start.mjs")], { cwd: target })).stdout.includes("ONBOARDING mode"), true);
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["doctor", ...args])).status, "healthy");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    assert.equal(await readFile(path.join(root, "AGENT.md"), "utf8"), sourceAgent);
    assert.equal(await readFile(path.join(root, "README.md"), "utf8"), sourceReadme);
    await writeFile(path.join(target, "README.md"), "user edit\n");
    const drift = await run(["apply", ...args]);
    assert.notEqual(drift.code, 0);
    assert.ok(json(drift).diagnostics.some(({ code }) => code === "owned_file_drift"));
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("onboard --complete flips the gate once, preserves every other state byte, and fails closed", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-onboard-"));
  try {
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    const args = ["--target", target, "--config", config, "--non-interactive"];
    assert.equal(json(await run(["apply", ...args])).status, "applied");

    const statePath = path.join(target, ".factory/creator/state.json");
    const applied = await readFile(statePath, "utf8");
    const before = JSON.parse(applied);
    assert.equal(before.onboarded, false);

    const completed = await run(["onboard", "--complete", "--target", target, "--non-interactive"]);
    assert.equal(completed.code, 0, completed.stderr);
    assert.equal(json(completed).command, "onboard");
    assert.equal(json(completed).status, "onboarded");
    assert.ok(json(completed).operations.some((op) => op.path === ".factory/creator/state.json" && op.action === "update"));

    const flippedRaw = await readFile(statePath, "utf8");
    const flipped = JSON.parse(flippedRaw);
    assert.equal(flipped.onboarded, true);
    // Only the `onboarded` value changed; everything else is byte-identical to the applied state.
    assert.equal(flippedRaw, applied.replace('"onboarded": false', '"onboarded": true'));
    assert.deepEqual(flipped.owned_files, before.owned_files);
    assert.equal(flipped.payload_digest, before.payload_digest);
    assert.equal(flipped.config_digest, before.config_digest);
    assert.equal(flipped.schema_version, before.schema_version);
    assert.equal((await stat(statePath)).mode & 0o7777, 0o600);

    // Re-apply and verify never undo a completed onboarding.
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).onboarded, true);

    // Idempotent: a second completion is a no-op and never rewrites.
    const again = await run(["onboard", "--complete", "--target", target, "--non-interactive"]);
    assert.equal(again.code, 0, again.stderr);
    assert.equal(json(again).status, "noop");
    assert.ok(json(again).diagnostics.some((d) => d.code === "already_onboarded"));

    // Backward compatibility: a state.json WITHOUT the field validates and onboard treats it as onboarded.
    const legacy = { ...before };
    delete legacy.onboarded;
    await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`);
    await chmod(statePath, 0o600);
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    const legacyOnboard = await run(["onboard", "--complete", "--target", target, "--non-interactive"]);
    assert.equal(json(legacyOnboard).status, "noop");
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).onboarded, undefined);

    // Fail closed: missing state.
    const bare = path.join(parent, "bare");
    await mkdir(bare, { recursive: true });
    const missing = await run(["onboard", "--complete", "--target", bare, "--non-interactive"]);
    assert.notEqual(missing.code, 0);
    assert.equal(json(missing).status, "error");
    assert.ok(json(missing).diagnostics.some((d) => d.code === "state_missing"));

    // Fail closed: invalid state.
    await writeFile(statePath, "{ not json");
    await chmod(statePath, 0o600);
    const invalid = await run(["onboard", "--complete", "--target", target, "--non-interactive"]);
    assert.notEqual(invalid.code, 0);
    assert.equal(json(invalid).status, "error");

    // --complete is required.
    const noFlag = await run(["onboard", "--target", target, "--non-interactive"]);
    assert.notEqual(noFlag.code, 0);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("pinned defaults merge per key, preserve explicit clears and verify generated no-CI layout", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-"));
  try {
    const { factory, sha } = await factoryFixture(parent, {
      PROJECT_NAME: "Organization project", TASK_TRACKER: "jira", TRACKER: "Jira", TRACKER_KEY: "OLD",
      EPIC_ID: "OLD-1", SECRETS_PROVIDER: "vault", SECRETS_PATH: "old/path",
      FACTORY_REQUIRED: "true", REPO_URLS: "https://example.invalid/old", INTEGRATION_BRANCH: "develop",
    });
    const config = await configFile(parent, {
      PROJECT_NAME: "Project answer", FACTORY_SPEC: "acme/factory@v1", REPO_URLS: "", SECRETS_PROVIDER: "none",
      CI_SYSTEM: "none",
    });
    const target = path.join(parent, "project");
    const args = ["--target", target, "--config", config, "--factory-root", factory, "--factory-sha", sha, "--non-interactive"];
    const first = await run(["plan", ...args]);
    assert.equal(first.code, 0, first.stdout);
    assert.equal(first.stdout, (await run(["plan", ...args])).stdout);
    await assert.rejects(stat(target));
    const applied = await run(["apply", ...args]);
    assert.equal(applied.code, 0, applied.stdout);
    assert.equal(json(applied).verification, "verified");
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
    assert.match(agent, /Project answer/u);
    assert.match(agent, /acme\/factory@v1/u);
    assert.match(agent, /GitHub Issues/u);
    assert.match(agent, /integration branch `develop`/u);
    assert.doesNotMatch(agent, /old\/path|OLD-1|https:\/\/example\.invalid\/old/u);
    assert.doesNotMatch(await readFile(path.join(target, "docs/bindings.md"), "utf8"), /old\/path|OLD-1/u);
    assert.equal((await execFileAsync(process.execPath, [path.join(target, ".factory/scripts/check-factory-layout.mjs"), "--target", target], { cwd: target })).stdout.trim(), "factory layout OK");
    const state = JSON.parse(await readFile(path.join(target, ".factory/creator/state.json"), "utf8"));
    assert.equal(state.config_digest, json(first).config_digest);
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Changed", TASK_TRACKER: "github-issues", FACTORY_SPEC: "acme/factory@v1", SECRETS_PROVIDER: "none", CI_SYSTEM: "none" } }));
    assert.equal(json(await run(["plan", ...args])).status, "planned");
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    assert.match(await readFile(path.join(target, "AGENT.md"), "utf8"), /Changed/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("pinned defaults refuse committed or symlinked factory answers before creating a target", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-answers-"));
  try {
    const { factory, git } = await factoryFixture(parent, { PROJECT_NAME: "Organization" });
    const inside = await configFile(factory, { FACTORY_SPEC: "acme/factory@v1" });
    await git("add", "answers.json");
    await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "committed answers");
    await git("tag", "-f", "v1");
    const sha = await git("rev-parse", "HEAD");
    const target = path.join(parent, "project");
    const flags = ["--target", target, "--factory-root", factory, "--factory-sha", sha, "--non-interactive"];
    const linked = path.join(parent, "linked-answers.json");
    await symlink(inside, linked);
    for (const config of [inside, `${factory}/../factory/answers.json`, linked]) {
      for (const command of ["plan", "apply", "verify"]) {
        const result = await run([command, ...flags, "--config", config]);
        assert.notEqual(result.code, 0, result.stdout);
        assert.ok(json(result).diagnostics.some(({ code }) => code === "factory_invalid"), result.stdout);
        await assert.rejects(stat(target));
      }
    }
    assert.equal(json(await run(["plan", "--target", target, "--config", inside, "--non-interactive"])).status, "planned");
    const external = await configFile(parent, { FACTORY_SPEC: "acme/factory@v1" });
    const args = [...flags, "--config", external];
    assert.equal(json(await run(["plan", ...args])).status, "planned");
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("invalid factory pins, checkout state and membership reject before target writes", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-invalid-"));
  try {
    const { factory, sha, git } = await factoryFixture(parent, { FACTORY_REQUIRED: "true", PROJECT_NAME: "Organization" });
    const config = await configFile(parent, { FACTORY_SPEC: "acme/factory@v1" });
    const target = path.join(parent, "project");
    const args = ["--target", target, "--config", config, "--factory-root", factory, "--factory-sha", sha, "--non-interactive"];
    const rejected = async (flags = args) => {
      const result = await run(["apply", ...flags]);
      assert.notEqual(result.code, 0, result.stdout);
      assert.ok(json(result).diagnostics.some(({ code }) => code === "factory_invalid"), result.stdout);
      await assert.rejects(stat(target));
    };
    await rejected(args.map((value) => value === sha ? "a".repeat(40) : value));
    await rejected(args.filter((_, index) => index !== args.indexOf("--factory-sha") && index !== args.indexOf("--factory-sha") + 1));
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Project", TASK_TRACKER: "github-issues", FACTORY_SPEC: "acme/factory@v2" } }));
    await rejected();
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Project", TASK_TRACKER: "github-issues", FACTORY_SPEC: "acme/factory@v1", FACTORY_REQUIRED: "false" } }));
    await rejected();
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Project", TASK_TRACKER: "github-issues", FACTORY_SPEC: "acme/factory@v1" } }));
    await writeFile(path.join(factory, "factory.defaults.json"), "{}");
    await rejected();
    await git("checkout", "--", "factory.defaults.json");
    for (const text of [
      '{"schema_version":2,"values":{}}',
      '{"schema_version":1,"values":{"FACTORY_SPEC":"acme/factory@v1"}}',
      '{"schema_version":1,"values":{"TASK_TRACKER":"invalid"}}',
      '{"schema_version":1,"values":{"PROJECT_NAME":"a","PROJECT_NAME":"b"}}',
    ]) {
      await writeFile(path.join(factory, "factory.defaults.json"), text);
      await git("add", "factory.defaults.json");
      await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "invalid defaults");
      await git("tag", "-f", "v1");
      const currentSha = await git("rev-parse", "HEAD");
      await rejected(args.map((value) => value === sha ? currentSha : value));
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("factory Git verification ignores inherited repository and configuration overrides", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-git-env-"));
  try {
    const { factory, sha } = await factoryFixture(parent, { PROJECT_NAME: "Organization" });
    const config = await configFile(parent, { FACTORY_SPEC: "acme/factory@v1" });
    const target = path.join(parent, "project");
    const args = ["plan", "--target", target, "--config", config, "--factory-sha", sha, "--non-interactive"];
    const inherited = {
      ...process.env,
      GIT_DIR: path.join(factory, ".git"), GIT_WORK_TREE: factory, GIT_COMMON_DIR: path.join(factory, ".git"),
      GIT_INDEX_FILE: path.join(factory, ".git", "index"),
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: factory,
    };
    const bareRoot = path.join(parent, "bare-root");
    await mkdir(bareRoot);
    const rejected = await run([...args, "--factory-root", bareRoot], { env: inherited });
    assert.notEqual(rejected.code, 0, rejected.stdout);
    assert.ok(json(rejected).diagnostics.some(({ code }) => code === "factory_invalid"), rejected.stdout);
    assert.equal(json(await run([...args, "--factory-root", factory], { env: inherited })).status, "planned");
    const otherRoot = path.join(parent, "other-factory");
    await execFileAsync("git", ["clone", "-q", "--no-hardlinks", factory, otherRoot]);
    await execFileAsync("git", ["-C", otherRoot, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "different HEAD"]);
    assert.notEqual((await execFileAsync("git", ["-C", otherRoot, "rev-parse", "HEAD"])).stdout.trim(), sha);
    const spoofed = { ...inherited, GIT_WORK_TREE: otherRoot, GIT_CONFIG_VALUE_0: otherRoot };
    assert.equal((await execFileAsync("git", ["-C", otherRoot, "rev-parse", "HEAD"], { env: spoofed })).stdout.trim(), sha);
    const result = await run([...args, "--factory-root", otherRoot], { env: spoofed });
    assert.notEqual(result.code, 0, result.stdout);
    assert.ok(json(result).diagnostics.some(({ code }) => code === "factory_invalid"), result.stdout);
    await assert.rejects(stat(target));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("source Rust seed generates one pinned caller without leaking into projects", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-rust-seed-"));
  try {
    const ownership = JSON.parse(await readFile(path.join(root, "archetype-ownership.json"), "utf8"));
    assert.equal(ownership.categories.factory_source_seed.disposition, "removed");
    assert.deepEqual(ownership.categories.factory_source_seed.paths.map(({ path: entry }) => entry),
      ["factory.defaults.json", ".github/workflows/rust.yml", "factory-seed"]);
    const defaults = JSON.parse(await readFile(path.join(root, "factory.defaults.json"), "utf8"));
    assert.deepEqual(defaults, { schema_version: 1, values: {
      FACTORY_REQUIRED: "true", TASK_TRACKER: "github-issues", CI_SYSTEM: "GitHub Actions",
      REPO_LANGUAGE: "en", SECRETS_PROVIDER: "none",
    }});
    const workflow = await readFile(path.join(root, ".github/workflows/rust.yml"), "utf8");
    const document = parseDocument(workflow, { version: "1.2", uniqueKeys: true });
    assert.deepEqual(document.errors, []);
    const parsed = document.toJS();
    assert.ok(Object.hasOwn(parsed.on, "workflow_call"));
    assert.equal(parsed.jobs.rust["runs-on"], "ubuntu-latest");
    assert.equal(parsed.jobs.rust.steps[0].uses, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
    const recipe = JSON.parse(await readFile(path.join(root, "ci/recipes.json"), "utf8")).rust;
    assert.deepEqual(parsed.jobs.rust.steps.slice(1).map(({ run: command }) => command),
      [...recipe.matchAll(/run: (.+)/gu)].map(([, command]) => command));

    const factory = path.join(parent, "factory");
    await mkdir(path.join(factory, ".github/workflows"), { recursive: true });
    await execFileAsync("git", ["init", "-q", factory]);
    await copyFile(path.join(root, "factory.defaults.json"), path.join(factory, "factory.defaults.json"));
    await copyFile(path.join(root, ".github/workflows/rust.yml"), path.join(factory, ".github/workflows/rust.yml"));
    const git = async (...args) => (await execFileAsync("git", ["-C", factory, ...args])).stdout.trim();
    await git("add", "factory.defaults.json", ".github/workflows/rust.yml");
    await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "local fixture");
    await git("tag", "v1");
    const sha = await git("rev-parse", "HEAD");
    assert.match(sha, /^[0-9a-f]{40}$/u);
    assert.equal(await git("rev-parse", "refs/tags/v1^{commit}"), sha);
    assert.equal(await git("status", "--porcelain", "--untracked-files=all"), "");

    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1", CI_STACKS: "rust" });
    const target = path.join(parent, "project");
    const args = ["--target", target, "--config", config, "--factory-root", factory, "--factory-sha", sha, "--non-interactive"];
    const first = await run(["plan", ...args]);
    assert.equal(first.code, 0, first.stdout);
    assert.equal((await run(["plan", ...args])).stdout, first.stdout);
    await assert.rejects(stat(target));
    const applied = await run(["apply", ...args]);
    assert.equal(applied.code, 0, applied.stdout);
    assert.equal(json(applied).verification, "verified");
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    assert.equal(await readFile(path.join(target, ".github/workflows/ci.yml"), "utf8"),
      "name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n  rust:\n    uses: eff3ct0/factory/.github/workflows/rust.yml@v1\n");
    assert.match(await readFile(path.join(target, "AGENT.md"), "utf8"), /eff3ct0\/factory@v1/u);
    assert.equal((await execFileAsync(process.execPath,
      [path.join(target, ".factory/scripts/check-factory-layout.mjs"), "--target", target], { cwd: target })).stdout.trim(), "factory layout OK");
    for (const entry of ["factory.defaults.json", ".github/workflows/rust.yml", "factory-seed"]) {
      await assert.rejects(stat(path.join(root, "dist/payload", entry)));
      await assert.rejects(stat(path.join(target, entry)));
    }

    const sample = path.join(root, "factory-seed/rust-sample");
    await mkdir(path.join(target, "src"));
    await copyFile(path.join(sample, "Cargo.toml"), path.join(target, "Cargo.toml"));
    await copyFile(path.join(sample, "src/lib.rs"), path.join(target, "src/lib.rs"));
    const env = { ...process.env, CARGO_NET_OFFLINE: "true", CARGO_TARGET_DIR: path.join(parent, "cargo-target") };
    for (const command of [
      ["fmt", "--all", "--", "--check"],
      ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"],
      ["test", "--all"],
      ["build", "--release"],
    ]) await execFileAsync("cargo", command, { cwd: target, env });
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("pinned factory CI emits selected versioned callers and protects creator ownership", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-ci-"));
  try {
    const fixture = await factoryFixture(parent, { CI_SYSTEM: "GitHub Actions", CI_STACKS: "rust,typescript" }, { rust: callableWorkflow, typescript: callableWorkflow });
    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1" });
    const target = path.join(parent, "project");
    const args = ["--target", target, "--config", config, "--factory-root", fixture.factory, "--factory-sha", fixture.sha, "--non-interactive"];
    const first = await run(["plan", ...args]);
    assert.equal(first.code, 0, first.stdout);
    assert.equal((await run(["plan", ...args])).stdout, first.stdout);
    await assert.rejects(stat(target));
    const applied = await run(["apply", ...args]);
    assert.equal(applied.code, 0, applied.stdout);
    assert.equal(json(applied).verification, "verified");
    const ciPath = path.join(target, ".github/workflows/ci.yml");
    assert.equal(await readFile(ciPath, "utf8"), "name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n  rust:\n    uses: eff3ct0/factory/.github/workflows/rust.yml@v1\n  typescript:\n    uses: eff3ct0/factory/.github/workflows/typescript.yml@v1\n");
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    const state = JSON.parse(await readFile(path.join(target, ".factory/creator/state.json"), "utf8"));
    assert.ok(state.owned_files.some(({ path: entry }) => entry === ".github/workflows/ci.yml"));
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Example project", TASK_TRACKER: "github-issues", FACTORY_SPEC: "eff3ct0/factory@v1", CI_STACKS: "typescript" } }));
    assert.ok(json(await run(["plan", ...args])).operations.some(({ path: entry, action }) => entry === ".github/workflows/ci.yml" && action === "update"));
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    assert.doesNotMatch(await readFile(ciPath, "utf8"), /rust\.yml/u);
    await writeFile(ciPath, "user-managed\n");
    const drift = await run(["apply", ...args]);
    assert.notEqual(drift.code, 0);
    assert.ok(json(drift).diagnostics.some(({ code }) => code === "owned_file_drift"));
    assert.equal(await readFile(ciPath, "utf8"), "user-managed\n");
    const unknown = path.join(parent, "unknown");
    await mkdir(path.join(unknown, ".github/workflows"), { recursive: true });
    await writeFile(path.join(unknown, ".github/workflows/ci.yml"), "user-managed\n");
    const conflict = await run(["apply", ...args.map((part) => part === target ? unknown : part)]);
    assert.notEqual(conflict.code, 0);
    assert.ok(json(conflict).diagnostics.some(({ code }) => code === "unknown_file_conflict"));
    assert.equal(await readFile(path.join(unknown, ".github/workflows/ci.yml"), "utf8"), "user-managed\n");
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("pinned factory CI accepts run-only and uses-only steps and reusable jobs", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-ci-steps-"));
  try {
    const workflow = `${callableWorkflow}      - uses: actions/checkout@v4\n  delegate:\n    uses: example/factory/.github/workflows/check.yml@v1\n`;
    const fixture = await factoryFixture(parent, { CI_SYSTEM: "GitHub Actions", CI_STACKS: "rust" }, { rust: workflow });
    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1" });
    const target = path.join(parent, "project");
    const args = ["--target", target, "--config", config, "--factory-root", fixture.factory, "--factory-sha", fixture.sha, "--non-interactive"];
    const plan = await run(["plan", ...args]);
    assert.equal(plan.code, 0, plan.stdout);
    assert.equal(json(plan).status, "planned");
    await assert.rejects(stat(target));
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("pinned factory CI requires supported runners on step jobs but not reusable jobs", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-ci-runners-"));
  try {
    const fixture = await factoryFixture(parent, { CI_SYSTEM: "GitHub Actions", CI_STACKS: "rust" }, { rust: callableWorkflow });
    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1" });
    const target = path.join(parent, "project");
    const workflowPath = path.join(fixture.factory, ".github/workflows/rust.yml");
    const args = (sha) => ["--target", target, "--config", config, "--factory-root", fixture.factory, "--factory-sha", sha, "--non-interactive"];
    const workflow = (runner) => `on:\n  workflow_call:\njobs:\n  check:\n${runner}    steps:\n      - run: echo ok\n  delegate:\n    uses: example/factory/.github/workflows/check.yml@v1\n`;
    const commitWorkflow = async (text) => {
      await writeFile(workflowPath, text);
      await fixture.git("add", ".github/workflows/rust.yml");
      await fixture.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "runner fixture");
      await fixture.git("tag", "-f", "v1");
      return fixture.git("rev-parse", "HEAD");
    };
    for (const runner of ["", "    runs-on: ''\n", "    runs-on: []\n", "    runs-on: [ubuntu-latest, '']\n", "    runs-on: {}\n", "    runs-on:\n      group: ''\n", "    runs-on:\n      labels: []\n", "    runs-on: 42\n", "    runs-on:\n      unsupported: ubuntu-latest\n"]) {
      const sha = await commitWorkflow(workflow(runner));
      for (const command of ["plan", "apply"]) {
        const result = await run([command, ...args(sha)]);
        assert.notEqual(result.code, 0, `${runner || "missing runs-on"}: ${result.stdout}`);
        assert.ok(json(result).diagnostics.some(({ code }) => code === "ci_invalid"), result.stdout);
        await assert.rejects(stat(target));
      }
    }
    for (const runner of ["    runs-on: ubuntu-latest\n", "    runs-on: [self-hosted, linux]\n", "    runs-on:\n      group: ci\n      labels: [linux]\n"]) {
      const sha = await commitWorkflow(workflow(runner));
      const plan = await run(["plan", ...args(sha)]);
      assert.equal(plan.code, 0, plan.stdout);
      assert.equal(json(plan).status, "planned");
      await assert.rejects(stat(target));
    }
    const reuseOnly = await commitWorkflow("on:\n  workflow_call:\njobs:\n  delegate:\n    uses: example/factory/.github/workflows/check.yml@v1\n");
    const plan = await run(["plan", ...args(reuseOnly)]);
    assert.equal(plan.code, 0, plan.stdout);
    assert.equal(json(plan).status, "planned");
    await assert.rejects(stat(target));
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("pinned factory CI rejects missing, symlinked and invalid YAML before writes", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-ci-invalid-"));
  try {
    const fixture = await factoryFixture(parent, { CI_SYSTEM: "GitHub Actions", CI_STACKS: "rust" });
    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1" });
    const target = path.join(parent, "project");
    const args = (command, sha) => [command, "--target", target, "--config", config, "--factory-root", fixture.factory, "--factory-sha", sha, "--non-interactive"];
    const rejected = async (sha) => {
      for (const command of ["plan", "apply"]) {
        const result = await run(args(command, sha));
        assert.notEqual(result.code, 0, result.stdout);
        assert.ok(json(result).diagnostics.some(({ code }) => code === "ci_invalid"), result.stdout);
        await assert.rejects(stat(target));
      }
    };
    await rejected(fixture.sha);
    const workflowPath = path.join(fixture.factory, ".github/workflows/rust.yml");
    await mkdir(path.dirname(workflowPath), { recursive: true });
    await symlink("../../../factory.defaults.json", workflowPath);
    await fixture.git("add", ".github/workflows/rust.yml");
    await fixture.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "symlink workflow");
    await fixture.git("tag", "-f", "v1");
    await rejected(await fixture.git("rev-parse", "HEAD"));
    await rm(workflowPath);
    for (const workflow of [
      "on:\n  workflow_call:\njobs:\n  check: [\n",
      `${callableWorkflow}---\non:\n  workflow_call:\n`,
      `${callableWorkflow}jobs: {}\n`,
      "on:\n  workflow_call: true\njobs:\n  check:\n    steps:\n      - run: echo ok\n",
      "on:\n  workflow_call:\njobs: []\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps: []\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    uses: example/action@v1\n    steps:\n      - run: echo ok\n",
      "on:\n  push:\njobs:\n  check:\n    steps:\n      - run: echo ok\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - run: true\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - run: echo ok\n        uses: actions/checkout@v4\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - run: ''\n        uses: actions/checkout@v4\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - name: missing command\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - {}\n",
      "on:\n  workflow_call:\njobs:\n  __proto__:\n    steps:\n      - run: echo ok\n",
      "on:\n  workflow_call:\njobs:\n  check:\n    steps:\n      - run: &cmd echo ok\n      - run: *cmd\n",
      `${callableWorkflow}${"#".repeat(65 * 1024)}\n`,
    ]) {
      await writeFile(workflowPath, workflow);
      await fixture.git("add", ".github/workflows/rust.yml");
      await fixture.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "invalid YAML");
      await fixture.git("tag", "-f", "v1");
      await rejected(await fixture.git("rev-parse", "HEAD"));
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("owned inline CI migrates with unchanged answers and follows pinned workflow revisions", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-factory-ci-migration-"));
  try {
    const fixture = await factoryFixture(parent, {}, { rust: callableWorkflow });
    const config = await configFile(parent, { FACTORY_SPEC: "eff3ct0/factory@v1", CI_SYSTEM: "GitHub Actions", CI_STACKS: "rust" });
    const target = path.join(parent, "project");
    const legacy = ["--target", target, "--config", config, "--non-interactive"];
    const pinned = (sha) => [...legacy, "--factory-root", fixture.factory, "--factory-sha", sha];
    const applied = await run(["apply", ...legacy]);
    assert.equal(applied.code, 0, applied.stdout);
    const legacyDigest = json(applied).config_digest;
    const ciPath = path.join(target, ".github/workflows/ci.yml");
    assert.match(await readFile(ciPath, "utf8"), /runs-on: ubuntu-latest/u);
    const plan = await run(["plan", ...pinned(fixture.sha)]);
    assert.equal(plan.code, 0, plan.stdout);
    assert.notEqual(json(plan).config_digest, legacyDigest);
    assert.ok(json(plan).operations.some(({ path: entry, action }) => entry === ".github/workflows/ci.yml" && action === "update"));
    assert.equal(json(await run(["apply", ...pinned(fixture.sha)])).verification, "verified");
    assert.match(await readFile(ciPath, "utf8"), /uses: eff3ct0\/factory\/\.github\/workflows\/rust\.yml@v1/u);
    assert.equal(json(await run(["verify", ...pinned(fixture.sha)])).status, "verified");
    assert.equal(json(await run(["apply", ...pinned(fixture.sha)])).status, "noop");
    await writeFile(path.join(fixture.factory, ".github/workflows/rust.yml"), callableWorkflow.replace("echo ok", "echo revised"));
    await fixture.git("add", ".github/workflows/rust.yml");
    await fixture.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "new workflow");
    await fixture.git("tag", "-f", "v1");
    const next = await fixture.git("rev-parse", "HEAD");
    const revision = await run(["plan", ...pinned(next)]);
    assert.equal(revision.code, 0, revision.stdout);
    assert.notEqual(json(revision).config_digest, json(plan).config_digest);
    assert.ok(json(revision).operations.some(({ path: entry, action }) => entry === ".factory/creator/state.json" && action === "update"));
    assert.equal(json(await run(["apply", ...pinned(next)])).verification, "verified");
    assert.equal(json(await run(["apply", ...pinned(next)])).status, "noop");
    await writeFile(ciPath, "user-managed\n");
    const drift = await run(["apply", ...pinned(next)]);
    assert.notEqual(drift.code, 0);
    assert.ok(json(drift).diagnostics.some(({ code }) => code === "owned_file_drift"));
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("interactive configuration prompts for missing required values through the shared validator", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-prompt-"));
  const target = path.join(parent, "project");
  const prompted = [];
  let agentsPlaceholder;
  const prepared = await preparePlan({
    command: "plan",
    target,
    prompt: async (placeholder) => {
      prompted.push(placeholder.key);
      if (placeholder.key === "PROJECT_NAME") return "Prompted project";
      if (placeholder.key === "TASK_TRACKER") return "github-issues";
      if (placeholder.key === "AGENTS") agentsPlaceholder = placeholder;
      return "none";
    },
  });
  assert.deepEqual(prompted, ["PROJECT_NAME", "TASK_TRACKER", "AGENTS"]);
  // The AGENTS prompt offers the provider catalog ids as a navigable multi-select.
  assert.equal(agentsPlaceholder.multi, true);
  assert.deepEqual(agentsPlaceholder.enum, ["claude-code", "opencode", "codex", "pi"]);
  assert.equal(prepared.envelope.status, "planned");
  assert.ok(prepared.envelope.config_digest);

  const invalid = await configFile(parent, { TASK_TRACKER: "not-a-task-provider" });
  const rejected = await run(["plan", "--target", path.join(parent, "invalid"), "--config", invalid, "--non-interactive"]);
  assert.notEqual(rejected.code, 0);
  assert.ok(json(rejected).diagnostics.some((item) => item.code === "configuration_invalid"));
});

test("real stdin prompts share one readline session and emit the JSON envelope", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-terminal-"));
  const result = await runInteractive(
    ["plan", "--json", "--target", path.join(parent, "project")],
    "Terminal project\ngithub-issues\n",
  );
  assert.equal(result.code, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.status, "planned");
  assert.match(result.stderr, /PROJECT_NAME/);
  assert.match(result.stderr, /TASK_TRACKER/);
});

test("interactive apply reviews the plan and requires confirmation before mutation", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-review-"));
  const target = path.join(parent, "project");
  const result = await runInteractive(
    ["apply", "--target", target],
    "Reviewed project\ngithub-issues\nnone\ny\n",
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "applied");
  assert.match(result.stderr, /Review/);
  assert.match(result.stderr, /Applying and verifying staged changes/);
  assert.match(result.stderr, /Installation complete/);
  assert.equal(result.stdout.includes("\u001b"), false);
  assert.equal(await stat(path.join(target, "README.md")).then(Boolean), true);
});

test("interactive cancellation is explicit and does not create a target", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-cancel-"));
  const target = path.join(parent, "project");
  const result = await runInteractive(
    ["apply", "--target", target],
    "Cancelled project\ngithub-issues\nnone\nn\n",
  );
  assert.notEqual(result.code, 0);
  assert.equal(JSON.parse(result.stdout).status, "cancelled");
  assert.match(result.stderr, /Installation cancelled/);
  await assert.rejects(stat(target));
});

test("provider selection supports none, one, and multiple providers with stable manifests", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-providers-"));
  const bin = await providerExecutables(parent, ["claude", "opencode", "codex", "pi"]);
  const baseEnvironment = { ...process.env, PATH: bin };
  const noneTarget = path.join(parent, "none");
  const noneConfig = await configFile(parent);
  const none = await run(["apply", "--target", noneTarget, "--config", noneConfig, "--non-interactive"], { env: baseEnvironment });
  assert.equal(none.code, 0, none.stderr);
  assert.deepEqual(json(none).providers.selected, []);
  await assert.rejects(stat(path.join(noneTarget, ".factory", "provider-manifest.json")));

  const oneTarget = path.join(parent, "one");
  const one = await run(["apply", "--target", oneTarget, "--config", noneConfig, "--agent", "codex", "--non-interactive"], { env: baseEnvironment });
  assert.equal(one.code, 0, one.stderr);
  assert.equal(json(one).verification, "verified");
  assert.deepEqual(json(one).providers.selected.map(({ id }) => id), ["codex"]);
  const manifest = await readFile(path.join(oneTarget, ".factory", "provider-manifest.json"), "utf8");
  assert.match(manifest, /"catalog_version": "1\.0\.0"/);
  const codexShim = await readFile(path.join(oneTarget, ".codex", "AGENTS.md"), "utf8");
  assert.match(codexShim, /Codex workspace instructions/);
  assert.match(codexShim, /First run `node start\.mjs`.*`AGENT\.md` and `docs\/bindings\.md`/u);
  assert.match(codexShim, /required mode\/task topic.*Links do not load content/u);
  assert.match(codexShim, /confirmation and fresh readback.*protected approval actions/u);
  const rerun = await run(["apply", "--target", oneTarget, "--config", noneConfig, "--agent", "codex", "--non-interactive"], { env: baseEnvironment });
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.equal(json(rerun).status, "noop");
  assert.equal(await readFile(path.join(oneTarget, ".factory", "provider-manifest.json"), "utf8"), manifest);

  const multipleTarget = path.join(parent, "multiple");
  const multiple = await run(["apply", "--target", multipleTarget, "--config", noneConfig, "--agents", "opencode,claude-code", "--non-interactive"], { env: baseEnvironment });
  assert.equal(multiple.code, 0, multiple.stderr);
  assert.deepEqual(json(multiple).providers.selected.map(({ id }) => id), ["claude-code", "opencode"]);
  for (const shimPath of [
    path.join(multipleTarget, ".opencode", "agents", "factory-template.md"),
    path.join(multipleTarget, ".claude", "factory-template.md"),
  ]) {
    assert.match(await readFile(shimPath, "utf8"), /First run `node start\.mjs`.*required mode\/task topic/u);
  }
});

test("interactive provider selection accepts a single provider", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-provider-interactive-"));
  const bin = await providerExecutables(parent, ["pi"]);
  const result = await runInteractive(
    ["apply", "--target", path.join(parent, "project")],
    "Interactive project\ngithub-issues\npi\ny\n",
    { env: { ...process.env, PATH: bin } },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).providers.selected.map(({ id }) => id), ["pi"]);
});

test("provider availability and selection fail closed before target mutation", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-provider-validation-"));
  const config = await configFile(parent);
  const missingTarget = path.join(parent, "missing");
  const missing = await run(["apply", "--target", missingTarget, "--config", config, "--agent", "codex", "--non-interactive"], { env: { ...process.env, PATH: path.join(parent, "missing-bin") } });
  assert.notEqual(missing.code, 0);
  assert.match(json(missing).diagnostics.map((item) => item.code).join(" "), /provider_unavailable/);
  await assert.rejects(stat(missingTarget));

  const invalidTarget = path.join(parent, "invalid");
  const invalid = await run(["apply", "--target", invalidTarget, "--config", config, "--agent", "unknown", "--non-interactive"]);
  assert.notEqual(invalid.code, 0);
  assert.match(json(invalid).diagnostics.map((item) => item.code).join(" "), /provider_invalid/);
  await assert.rejects(stat(invalidTarget));

  const launchWithoutSelection = await run(["apply", "--target", path.join(parent, "launch-without-selection"), "--config", config, "--launch-agent", "--non-interactive"]);
  assert.notEqual(launchWithoutSelection.code, 0);
  assert.match(json(launchWithoutSelection).diagnostics.map((item) => item.code).join(" "), /provider_invalid/);
});

test("provider setup protects unknown and drifted workspace files", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-provider-conflict-"));
  const bin = await providerExecutables(parent, ["codex"]);
  const environment = { ...process.env, PATH: bin };
  const config = await configFile(parent);
  const unknownTarget = path.join(parent, "unknown");
  await mkdir(path.join(unknownTarget, ".codex"), { recursive: true });
  await writeFile(path.join(unknownTarget, "custom.md"), "keep me\n");
  const unknown = await run(["apply", "--target", unknownTarget, "--config", config, "--agent", "codex", "--non-interactive"], { env: environment });
  assert.notEqual(unknown.code, 0);
  assert.equal(await readFile(path.join(unknownTarget, "custom.md"), "utf8"), "keep me\n");

  const driftTarget = path.join(parent, "drift");
  const initial = await run(["apply", "--target", driftTarget, "--config", config, "--agent", "codex", "--non-interactive"], { env: environment });
  assert.equal(initial.code, 0, initial.stderr);
  await writeFile(path.join(driftTarget, ".codex", "AGENTS.md"), "user-managed\n");
  const drift = await run(["apply", "--target", driftTarget, "--config", config, "--agent", "codex", "--non-interactive"], { env: environment });
  assert.notEqual(drift.code, 0);
  assert.match(json(drift).diagnostics.map((item) => item.code).join(" "), /owned_file_drift/);
  assert.equal(await readFile(path.join(driftTarget, ".codex", "AGENTS.md"), "utf8"), "user-managed\n");
});

test("explicit agent handoff uses argv execution and reports a failed agent separately", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-provider-handoff-"));
  const argsFile = path.join(parent, "handoff-args.txt");
  process.env.FACTORY_HANDOFF_ARGS = argsFile;
  try {
    const bin = await providerExecutables(parent, ["codex"], 7);
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    const result = await run(["apply", "--target", target, "--config", config, "--agent", "codex", "--launch-agent", "--non-interactive"], { env: { ...process.env, PATH: bin, FACTORY_HANDOFF_ARGS: argsFile } });
    assert.notEqual(result.code, 0);
    const envelope = json(result);
    assert.equal(envelope.verification, "verified");
    assert.equal(envelope.status, "handoff-failed");
    assert.equal(envelope.handoff.provider, "codex");
    assert.equal(envelope.handoff.exit_code, 7);
    assert.deepEqual((await readFile(argsFile, "utf8")).trim().split("\n"), ["--cd", target]);
  } finally {
    delete process.env.FACTORY_HANDOFF_ARGS;
  }
});

test("agent stdout is redirected to bounded stderr diagnostics instead of corrupting JSON", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-provider-stdout-"));
  const bin = await providerExecutables(parent, ["codex"]);
  const config = await configFile(parent);
  const result = await run(["apply", "--target", path.join(parent, "project"), "--config", config, "--agent", "codex", "--launch-agent", "--non-interactive"], {
    env: { ...process.env, PATH: bin, FACTORY_HANDOFF_STDOUT: "AGENT_STDOUT_NOISE\n" },
  });
  assert.equal(result.code, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.status, "applied");
  assert.equal(envelope.handoff.status, "launched");
  assert.match(result.stderr, /AGENT_STDOUT_NOISE/);
});

test("apply, verify, and rerun are idempotent", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-apply-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(verified.code, 0, verified.stderr);
  assert.equal(json(verified).status, "verified");
  const rerun = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.equal(json(rerun).status, "noop");
  assert.ok(json(rerun).operations.every((operation) => operation.action === "noop"));
});

test("generated layout checker accepts optional absence and creator enforces selected CI", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-layout-"));
  const layout = async (target) => {
    try {
      const result = await execFileAsync(process.execPath, [path.join(target, ".factory/scripts/check-factory-layout.mjs"), "--target", target], { cwd: target });
      return { code: 0, output: result.stdout };
    } catch (error) {
      return { code: error.code, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };
  try {
    const config = await configFile(parent, { TRACKER_KEY: "eff3ct0/factory", CI_STACKS: "" });
    const target = path.join(parent, "without-ci");
    const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(applied.code, 0, applied.stderr);
    await assert.rejects(stat(path.join(target, ".github/workflows/ci.yml")));
    await assert.rejects(stat(path.join(target, ".factory/checks")));
    assert.deepEqual(await layout(target), { code: 0, output: "factory layout OK\n" });

    const required = path.join(target, ".factory/templates/agent-runbook.md");
    const original = await readFile(required);
    await rm(required);
    assert.match((await layout(target)).output, /inherited support file missing.*agent-runbook\.md/u);
    await writeFile(required, original);
    const checks = path.join(target, ".factory/checks");
    await writeFile(checks, "invalid reserved path\n");
    assert.match((await layout(target)).output, /invalid .factory directory: .factory\/checks/u);
    await rm(checks);

    const selectedConfig = await configFile(parent, { TRACKER_KEY: "eff3ct0/factory", CI_SYSTEM: "GitHub Actions", CI_STACKS: "typescript" });
    const selected = path.join(parent, "with-ci");
    const selectedApply = await run(["apply", "--target", selected, "--config", selectedConfig, "--non-interactive"]);
    assert.equal(selectedApply.code, 0, selectedApply.stderr);
    assert.deepEqual(await layout(selected), { code: 0, output: "factory layout OK\n" });
    await rm(path.join(selected, ".github/workflows/ci.yml"));
    assert.equal((await layout(selected)).code, 0, "standalone layout has no CI-selection context");
    const verify = await run(["verify", "--target", selected, "--config", selectedConfig, "--non-interactive"]);
    assert.notEqual(verify.code, 0);
    assert.equal(json(verify).status, "not-created");
    assert.ok(json(verify).operations.some(({ path: file, action }) => file === ".github/workflows/ci.yml" && action !== "noop"));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("unknown files and symlink escapes fail without overwriting", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-conflict-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  await mkdir(target);
  await writeFile(path.join(target, "unknown.txt"), "keep me");
  const conflict = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.notEqual(conflict.code, 0);
  assert.match(json(conflict).diagnostics.map((item) => item.code).join(" "), /unknown_file_conflict/);
  assert.equal(await readFile(path.join(target, "unknown.txt"), "utf8"), "keep me");

  const outside = path.join(parent, "outside");
  await mkdir(outside);
  const linked = path.join(parent, "linked");
  await symlink(outside, linked);
  const escaped = await run(["plan", "--target", linked, "--config", config, "--non-interactive"]);
  assert.notEqual(escaped.code, 0);
  assert.match(json(escaped).diagnostics[0].code, /target_symlink/);

  const unwritable = path.join(parent, "unwritable");
  await mkdir(unwritable);
  await chmod(unwritable, 0o555);
  const blocked = await run(["plan", "--target", unwritable, "--config", config, "--non-interactive"]);
  assert.notEqual(blocked.code, 0);
  assert.match(json(blocked).diagnostics[0].code, /target_unwritable/);
  await chmod(unwritable, 0o755);
});

test("apply ignores a pre-existing .git directory in the target but still rejects a stray .gitignore (#379)", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-git-target-"));
  try {
    // A VCS-initialized checkout is the documented primary apply target (README Quickstart),
    // so a pre-existing .git directory must be ignored by the conflict walk.
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    await mkdir(path.join(target, ".git", "refs", "heads"), { recursive: true });
    await writeFile(path.join(target, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(path.join(target, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");

    const planned = await run(["plan", "--target", target, "--config", config, "--non-interactive", "--yes"]);
    assert.equal(planned.code, 0, planned.stderr);
    const planDiagnostics = json(planned).diagnostics.map((item) => `${item.code} ${item.path ?? ""}`).join(" ");
    assert.doesNotMatch(planDiagnostics, /unknown_file_conflict[^|]*\.git\b/u, planDiagnostics);

    const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive", "--yes"]);
    assert.equal(applied.code, 0, applied.stderr);
    assert.ok(!json(applied).diagnostics.some((item) => item.code === "unknown_file_conflict"), applied.stdout);
    assert.equal(json(applied).status, "applied", applied.stdout);
    assert.equal(json(applied).verification, "verified", applied.stdout);

    // The target's own .git is never creator-owned and must be left byte-for-byte untouched.
    assert.equal(await readFile(path.join(target, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");
    assert.equal(await readFile(path.join(target, ".git", "config"), "utf8"), "[core]\n\trepositoryformatversion = 0\n");
    const state = JSON.parse(await readFile(path.join(target, ".factory/creator/state.json"), "utf8"));
    assert.ok(!state.owned_files.some(({ path: entry }) => entry === ".git" || entry.startsWith(".git/")), "state must not claim .git");

    // Segment-safe match: a stray .gitignore (not the .git VCS dir) is NOT swallowed; it is still rejected.
    const strayTarget = path.join(parent, "stray");
    await mkdir(strayTarget, { recursive: true });
    await writeFile(path.join(strayTarget, ".gitignore"), "node_modules\n");
    const stray = await run(["apply", "--target", strayTarget, "--config", config, "--non-interactive", "--yes"]);
    assert.notEqual(stray.code, 0);
    assert.ok(json(stray).diagnostics.some((item) => item.code === "unknown_file_conflict"), stray.stdout);
    assert.equal(await readFile(path.join(strayTarget, ".gitignore"), "utf8"), "node_modules\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("rejects a symlinked creator state directory without writing outside the target", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-state-link-"));
  const target = path.join(parent, "project");
  const outside = path.join(parent, "outside");
  const config = await configFile(parent);
  await mkdir(target);
  await mkdir(outside);
  await symlink(outside, path.join(target, ".factory"));
  const result = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.notEqual(result.code, 0);
  assert.ok(json(result).diagnostics.some((item) => item.code === "symlink_escape"));
  await assert.rejects(readFile(path.join(outside, "state.json")));
});

test("rollback restores creator-owned files after an injected commit failure", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-rollback-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const initial = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(initial.code, 0, initial.stderr);
  const before = await readFile(path.join(target, "README.md"));
  const changedConfig = await configFile(parent, { PROJECT_NAME: "Changed project" });
  const failed = await run(["apply", "--target", target, "--config", changedConfig, "--non-interactive", "--failure-after", "1"]);
  assert.notEqual(failed.code, 0);
  assert.match(json(failed).rollback.message, /rolled back/);
  assert.deepEqual(await readFile(path.join(target, "README.md")), before);
});

test("legacy creator state migrates transactionally and remains updatable", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-legacy-migration-"));
  try {
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    const args = ["--target", target, "--config", config, "--non-interactive"];
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    const relocated = path.join(target, ".factory/creator/state.json");
    const legacy = path.join(target, ".factory-template-creator/state.json");
    await mkdir(path.dirname(legacy));
    await rename(relocated, legacy);
    await rm(path.dirname(relocated), { recursive: true });
    const prior = JSON.parse(await readFile(legacy, "utf8"));
    prior.payload_digest = `sha256:${"b".repeat(64)}`;
    const readme = path.join(target, "README.md");
    const expectedReadme = await readFile(readme);
    const oldReadme = Buffer.from("# Previous creator output\n");
    await writeFile(readme, oldReadme);
    const ownedReadme = prior.owned_files.find(({ path: relative }) => relative === "README.md");
    ownedReadme.size = oldReadme.length;
    ownedReadme.sha256 = createHash("sha256").update(oldReadme).digest("hex");
    await writeFile(legacy, `${JSON.stringify(prior, null, 2)}\n`);
    const legacyBytes = await readFile(legacy);
    assert.equal(json(await run(["verify", ...args])).status, "not-created");
    assert.ok(json(await run(["verify", ...args])).diagnostics.some(({ code }) => code === "migration_pending"));
    assert.ok(json(await run(["doctor", ...args])).diagnostics.some(({ code }) => code === "migration_pending"));
    await assert.rejects(checkGeneratedModulePolicy({ target, configPath: config }), /does not match the composed creator plan/u);
    for (const count of [1, 2, 3]) {
      const failed = await run(["apply", ...args, "--failure-after", String(count)]);
      assert.notEqual(failed.code, 0);
      assert.equal(json(failed).rollback.restored, true);
      assert.deepEqual(await readFile(legacy), legacyBytes);
      assert.deepEqual(await readFile(readme), oldReadme);
      await assert.rejects(stat(relocated));
      await assert.rejects(stat(path.dirname(relocated)));
    }
    const applied = await run(["apply", ...args]);
    assert.equal(applied.code, 0, applied.stdout);
    assert.equal(json(applied).verification, "verified");
    assert.deepEqual(await readFile(readme), expectedReadme);
    assert.notDeepEqual(JSON.parse(await readFile(relocated, "utf8")).owned_files, prior.owned_files);
    await assert.rejects(stat(path.dirname(legacy)));
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    assert.equal(json(await run(["verify", ...args])).status, "verified");
    assert.equal(json(await run(["doctor", ...args])).status, "healthy");
    assert.ok(Array.isArray(await checkGeneratedModulePolicy({ target, configPath: config })));
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Updated", TASK_TRACKER: "github-issues" } }));
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("legacy ambiguity, drift, config changes, symlinks, and unknown state paths fail closed", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-legacy-reject-"));
  try {
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    const args = ["--target", target, "--config", config, "--non-interactive"];
    assert.equal(json(await run(["apply", ...args])).verification, "verified");
    const relocated = path.join(target, ".factory/creator/state.json");
    const legacy = path.join(target, ".factory-template-creator/state.json");
    const agent = path.join(target, "AGENT.md");
    const originalAgent = await readFile(agent);
    await mkdir(path.dirname(legacy));
    await copyFile(relocated, legacy);
    assert.ok(json(await run(["plan", ...args])).diagnostics.some(({ code }) => code === "state_conflict"));
    await rm(relocated);
    const changed = await configFile(parent, { PROJECT_NAME: "Changed" });
    assert.ok(json(await run(["apply", "--target", target, "--config", changed, "--non-interactive"])).diagnostics.some(({ code }) => code === "state_conflict"));
    await writeFile(agent, "drift\n");
    assert.ok(json(await run(["plan", ...args])).diagnostics.some(({ code }) => code === "owned_file_drift"));
    await rm(agent);
    await symlink(path.join(parent, "missing"), agent);
    assert.ok(json(await run(["plan", ...args])).diagnostics.some(({ code }) => code === "owned_file_drift"));
    await rm(agent);
    await writeFile(agent, originalAgent);
    await writeFile(path.join(target, ".factory-template-creator/extra"), "unknown\n");
    assert.ok(json(await run(["plan", ...args])).diagnostics.some(({ code }) => code === "state_conflict"));
    await rm(path.join(target, ".factory-template-creator/extra"));
    await writeFile(path.join(target, ".factory/creator/extra"), "unknown\n");
    assert.ok(json(await run(["plan", ...args])).diagnostics.some(({ code }) => code === "unknown_file_conflict"));
    await rm(path.join(target, ".factory/creator/extra"));
    await rm(legacy);
    await symlink(path.join(parent, "missing"), legacy);
    assert.ok(json(await run(["apply", ...args])).diagnostics.some(({ code }) => code === "state_invalid"));
    assert.equal((await lstat(legacy)).isSymbolicLink(), true);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("doctor reports owned drift and payload identity mismatch", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-drift-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  await writeFile(path.join(target, "README.md"), "external change\n");
  const drift = await run(["doctor", "--target", target, "--config", config, "--non-interactive"]);
  assert.notEqual(drift.code, 0);
  assert.ok(json(drift).diagnostics.some((item) => item.code === "owned_file_drift"));

  const statePath = path.join(target, ".factory", "creator", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.payload_digest = `sha256:${"a".repeat(64)}`;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const mismatch = await run(["doctor", "--target", target, "--config", config, "--non-interactive"]);
  assert.notEqual(mismatch.code, 0);
  assert.ok(json(mismatch).diagnostics.some((item) => item.code === "payload_mismatch"));
});

test("doctor reports interrupted staging and incomplete configuration", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-doctor-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const interrupted = await run(["apply", "--target", target, "--config", config, "--non-interactive", "--interrupt-after", "1"]);
  assert.notEqual(interrupted.code, 0);
  const doctor = await run(["doctor", "--target", target, "--non-interactive"]);
  assert.notEqual(doctor.code, 0);
  const codes = json(doctor).diagnostics.map((item) => item.code);
  assert.ok(codes.includes("staging_interrupted"));
  assert.ok(codes.includes("incomplete_configuration"));
});

test("composes bindings and CI recipes, then removes creator-only inputs", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-composition-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent, {
    PROJECT_NAME: "Composed project",
    TASK_TRACKER: "jira",
    SECRETS_PROVIDER: "vault",
    CODE_INTELLIGENCE: "codegraph",
    CI_SYSTEM: "GitHub Actions",
    CI_STACKS: "rust,typescript,python,go",
  });
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  const bindings = await readFile(path.join(target, "docs", "bindings.md"), "utf8");
  const workflow = await readFile(path.join(target, ".github", "workflows", "ci.yml"), "utf8");
  const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
  assert.match(agent, /documentation authority map/u);
  for (const family of ["Architecture", "Constraints", "Business", "Technical"]) {
    assert.match(bindings, new RegExp(`\\| ${family} \\|`, "u"));
  }
  assert.match(bindings, /local Git-only default, not evidence that an external service is configured/u);
  assert.match(bindings, /exact canonical URL or stable identifier and the access/u);
  assert.match(bindings, /Derived - not authoritative/u);
  assert.match(bindings, /report the exact unavailable[\s\S]*?do not invent current context/u);
  assert.match(bindings, /verify the replacement and access first/u);
  assert.match(bindings, /does not change task-provider confirmation\/readback/u);
  assert.match(bindings, /## Jira/);
  assert.match(bindings, /## Vault/);
  assert.match(bindings, /## CodeGraph/);
  assert.doesNotMatch(bindings, /\]\(\.\.\/providers\//);
  assert.match(workflow, /  python:/);
  assert.match(workflow, /  typescript:/);
  assert.match(workflow, /  rust:/);
  assert.match(workflow, /  go:/);
  assert.equal(await readFile(path.join(target, ".factory", "docs", "workflow.md"), "utf8").then(Boolean), true);
  for (const creatorOnly of ["placeholders.json", "archetype-ownership.json", "providers", "ci"]) {
    await assert.rejects(stat(path.join(target, creatorOnly)));
  }
  const manifest = JSON.parse(await readFile(path.join(root, "dist", "payload", "placeholders.json"), "utf8"));
  const manifestTokens = manifest.placeholders.map(({ key }) => `<${key}>`);
  for (const file of await walkFiles(target)) {
    const bytes = await readFile(file);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) continue;
    for (const token of manifestTokens) assert.doesNotMatch(text, new RegExp(token.replace(/[<>]/g, "\\$&")), file);
    if (!file.endsWith(".md")) continue;
    for (const match of text.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
      const targetPath = match[1].split("#", 1)[0];
      if (!targetPath || targetPath.startsWith("#") || targetPath.startsWith("/") || targetPath.includes("://")) continue;
      await stat(path.resolve(path.dirname(file), targetPath));
    }
  }
  const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(verified.code, 0, verified.stderr);
  assert.equal(json(verified).status, "verified");
  const rerun = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.equal(json(rerun).status, "noop");
});

test("Git-only documentation authority is self-contained in a fresh project", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-doc-authority-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  const bindings = await readFile(path.join(target, "docs", "bindings.md"), "utf8");
  const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
  assert.match(agent, /family map in `docs\/bindings\.md`/u);
  assert.match(agent, /Task-triggered context routes/u);
  for (const [trigger, destination] of [
    ["Bug fix or implementation", ".factory/docs/engineering-handbook.md"],
    ["Provider setup or binding failure", ".factory/docs/agent-init.md"],
    ["Release or deployment", ".factory/docs/workflow.md"],
  ]) {
    const row = agent.split("\n").find((line) => line.startsWith(`| ${trigger} (`));
    assert.ok(row?.includes(`\`${destination}\``), `${trigger} route is not navigable`);
    assert.doesNotMatch(row, / → /u);
    await stat(path.join(target, destination));
  }
  assert.match(agent, /configured external canonical source/u);
  assert.match(agent, /required local content is missing/u);
  assert.match(await readFile(path.join(target, "CLAUDE.md"), "utf8"), /mode\/task route/u);
  assert.match(bindings, /\| Business \|[^\n]*No detailed business source is assumed/u);
  assert.match(bindings, /external destination is not selected by this/u);
  assert.doesNotMatch(bindings, /confluence\.example|<DOCUMENTATION_/iu);
  for (const [label, href] of [
    ["AGENT.md", "../AGENT.md"],
    ["engineering handbook", "../.factory/docs/engineering-handbook.md"],
    ["workflow", "../.factory/docs/workflow.md"],
  ]) {
    assert.ok(bindings.includes(`[${label}](${href})`), `${label} must retain a navigable link`);
    await stat(path.resolve(target, "docs", href));
  }
  const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(verified.code, 0, verified.stderr);
  const rerun = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(json(rerun).status, "noop");
  const sourceAgent = await readFile(path.join(root, "AGENT.md"), "utf8");
  const sourceBindings = await readFile(path.join(root, "docs", "bindings.md"), "utf8");
  assert.match(sourceAgent, /Documentation authority is separate/u);
  assert.match(sourceBindings, /source-template guide/u);
});

test("fresh generated context routes use retained paths and reject stale or missing required topics", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-context-routes-"));
  try {
    const target = path.join(parent, "project");
    const config = await configFile(parent);
    const args = ["--target", target, "--config", config, "--non-interactive"];
    assert.equal((await run(["apply", ...args])).code, 0);
    const startup = async () => json(await run(["verify", ...args]));
    const work = await execFileAsync(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target });
    assert.equal(JSON.parse(work.stdout).mode, "ONBOARDING");
    const context = await Promise.all(["CLAUDE.md", "AGENT.md", "docs/bindings.md", ".factory/docs/workflow.md", ".factory/docs/engineering-handbook.md", ".factory/templates/agent-runbook.md"]
      .map(async (relative) => [relative, await readFile(path.join(target, relative), "utf8")]));
    const files = new Map(context);
    for (const [trigger, expected, unrelated] of [
      ["Bug fix or implementation", ".factory/docs/engineering-handbook.md", ".factory/docs/agent-init.md"],
      ["Provider setup or binding failure", ".factory/docs/agent-init.md", ".factory/docs/workflow.md"],
      ["Release or deployment", ".factory/docs/workflow.md", ".factory/docs/engineering-handbook.md"],
    ]) {
      const row = files.get("AGENT.md").split("\n").find((line) => line.startsWith(`| ${trigger} (`));
      assert.ok(row, `${trigger} must be discoverable after cold WORK startup`);
      const required = row.split("|")[2];
      const loaded = [...required.matchAll(/`([^`]+\.md)`/gu)].map((match) => match[1]);
      assert.ok(loaded.includes(expected), `${trigger} must load ${expected}`);
      assert.ok(!loaded.includes(unrelated), `${trigger} must not load ${unrelated}`);
      for (const relative of loaded) assert.ok((await readFile(path.join(target, relative), "utf8")).trim(), relative);
    }
    const requiredPaths = ["CLAUDE.md", "AGENT.md", "start.mjs", "docs/bindings.md", ".factory/docs/workflow.md", ".factory/docs/engineering-handbook.md", ".factory/templates/agent-runbook.md"];
    for (const relative of requiredPaths) await stat(path.join(target, relative));
    assert.match(files.get("AGENT.md"), /Required topic \(generated path\)/u);
    assert.doesNotMatch(files.get("AGENT.md"), /\| Archetype maintenance \(`SELF`\)/u);
    assert.doesNotMatch(files.get("AGENT.md"), /\(`SELF` or `WORK`\)/u);
    assert.doesNotMatch(files.get("AGENT.md"), /source-only; not a generated-project action/u);
    assert.match(files.get("AGENT.md").split("\n").find((line) => line.startsWith("| Release or deployment")), /`\.factory\/docs\/workflow\.md`/u);
    assert.match(files.get("AGENT.md"), /`\.factory\/templates\/agent-runbook\.md`/u);
    assert.match(files.get(".factory/docs/workflow.md"), /\[`\.factory\/templates\/agent-runbook\.md`\]\(\.\.\/templates\/agent-runbook\.md\)/u);
    assert.match(files.get(".factory/docs/engineering-handbook.md"), /\[`\.factory\/templates\/adr\.md`\]\(\.\.\/templates\/adr\.md\)/u);
    assert.match(files.get("CLAUDE.md"), /\[`AGENT\.md`\]\(AGENT\.md\)/u);
    assert.match(files.get("docs/bindings.md"), /\[workflow\]\(\.\.\/\.factory\/docs\/workflow\.md\)/u);
    const checkInlineRoute = (content) => {
      assert.doesNotMatch(content, /`(?:docs\/(?:workflow|engineering-handbook)\.md|templates\/agent-runbook\.md)`(?! →)/u);
    };
    for (const [, content] of context) checkInlineRoute(content);
    assert.equal((await startup()).status, "verified");
    assert.equal(json(await run(["apply", ...args])).status, "noop");
    const agentPath = path.join(target, "AGENT.md");
    assert.deepEqual(await checkDeliveryContract(undefined, target), []);
    const bindingPath = path.join(target, "docs/bindings.md");
    await writeFile(bindingPath, files.get("docs/bindings.md").replace(/Project\/board \(TRACKER_KEY\): [^\n]+/u, "Project/board (TRACKER_KEY): not configured; resolve before durable task operations"));
    assert.deepEqual(await checkDeliveryContract([bindingPath], target), []);
    await writeFile(bindingPath, files.get("docs/bindings.md").replace("> **Provider:** `github-issues`", "> **Provider:** `jira`"));
    assert.ok((await checkDeliveryContract([bindingPath], target)).some((error) => error.includes("selected task provider fragment must match TASK_TRACKER")));
    await writeFile(bindingPath, files.get("docs/bindings.md").replace("Task provider (TASK_TRACKER): github-issues", "Task provider (TASK_TRACKER): <UNKNOWN>"));
    assert.ok((await checkDeliveryContract([bindingPath], target)).some((error) => error.includes("## Bound task identity missing critical rule: selected task provider and tracker identity")));
    await writeFile(bindingPath, files.get("docs/bindings.md").replace("Confirm each native operation and read back the intended task identity, state, and handoff", "Trust the local task file"));
    assert.ok((await checkDeliveryContract([bindingPath], target)).some((error) => error.includes("## Bound task identity missing critical rule: native confirmation and matching task readback")));
    await writeFile(bindingPath, files.get("docs/bindings.md"));
    const originalAgent = files.get("AGENT.md");
    await writeFile(agentPath, originalAgent.split("\n").filter((line) => /^#{1,6} /u.test(line)).join("\n"));
    assert.ok((await checkDeliveryContract([agentPath], target)).some((error) => error.includes("missing critical rule: single add and immediate target-host readback")));
    await writeFile(agentPath, originalAgent.replace("The authenticated actor has target-host capability `MAINTAIN` or `ADMIN`.", "The actor may proceed."));
    assert.ok((await checkDeliveryContract([agentPath], target)).some((error) => error.includes("missing critical rule: actor MAINTAIN or ADMIN capability")));
    await writeFile(agentPath, originalAgent.replace("`.factory/docs/workflow.md` for project delivery gates", "`.factory/docs/missing/workflow.md` for project delivery gates"));
    assert.ok((await checkDeliveryContract([agentPath], target)).some((error) => error.includes("Release or deployment required route missing destination: .factory/docs/missing/workflow.md")));
    await writeFile(agentPath, originalAgent);
    const shim = path.join(target, "CLAUDE.md");
    await writeFile(shim, `${files.get("CLAUDE.md")}\nFollow \`docs/workflow.md\`.\n`);
    const staleContent = await readFile(shim, "utf8");
    assert.throws(() => checkInlineRoute(staleContent), /expected to not match/u);
    const stale = await run(["verify", ...args]);
    assert.notEqual(stale.code, 0);
    assert.ok(json(stale).operations.some(({ path: file }) => file === "CLAUDE.md"));
    await writeFile(shim, files.get("CLAUDE.md"));
    const required = path.join(target, ".factory/templates/agent-runbook.md");
    const original = await readFile(required);
    await rm(required);
    const missing = await run(["verify", ...args]);
    assert.notEqual(missing.code, 0);
    assert.ok(json(missing).operations.some(({ path: file }) => file === ".factory/templates/agent-runbook.md"));
    const failedStart = await execFileAsync(process.execPath, [path.join(target, "start.mjs"), "--json"], { cwd: target }).catch((error) => error);
    assert.equal(JSON.parse(failedStart.stdout).diagnostics[0].path, ".factory/templates/agent-runbook.md");
    assert.match(JSON.parse(failedStart.stdout).diagnostics[0].message, /restore the creator-owned file and run foundry verify/u);
    await writeFile(required, original);
    assert.equal((await startup()).status, "verified");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("documentation profiles compose exact authority and independent capabilities without remote transfer", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-doc-profiles-"));
  const base = "https://docs.example.invalid/project";
  const familySources = Object.fromEntries(["ARCHITECTURE", "CONSTRAINTS", "BUSINESS", "TECHNICAL"]
    .map((family) => [`DOCS_${family}_SOURCE`, `${base}/${family.toLowerCase()}`]));
  const profiles = [
    ["local", {}, [/Profile: local/u, /Write: local Git content/u, /Publish: not configured/u]],
    ["github-pages", { DOCS_DESTINATION_ID: "https://example.invalid/project/", DOCS_GIT_SOURCE: "https://github.com/example/project/tree/main/docs" },
      [/canonical source for every family remains local Git/u, /direct Pages document write: unsupported/u, /deployment status, and published source commit/u]],
    ["external-contract", { DOCS_DESTINATION_ID: base, ...familySources, DOCS_INTEGRATION: "Approved docs client v1",
      DOCS_ACCESS_MECHANISM: "operator-supplied-token", DOCS_READ_CONTRACT: `${base}/integration/read`,
      DOCS_WRITE_CONTRACT: `${base}/integration/write`, DOCS_READBACK_CONTRACT: `${base}/integration/readback` },
    [/contract-declared, only through the verified integration/u, /readback\/revision/u, /These are declarations, not an installed adapter/u]],
    ["website-readonly", { DOCS_DESTINATION_ID: base, ...familySources },
      [/Read: public HTTPS/u, /Write: unsupported/u, /Publish: unsupported/u]],
  ];
  for (const [profile, answers, patterns] of profiles) {
    const directory = path.join(parent, profile);
    await mkdir(directory);
    const target = path.join(directory, "project");
    const config = await configFile(directory, { DOCS_DESTINATION: profile, ...answers });
    const plan = await run(["plan", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(plan.code, 0, `${profile}: ${plan.stderr}`);
    await assert.rejects(stat(target));
    const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(applied.code, 0, `${profile}: ${applied.stderr}`);
    const bindings = await readFile(path.join(target, "docs", "bindings.md"), "utf8");
    const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
    const handbook = await readFile(path.join(target, ".factory", "docs", "engineering-handbook.md"), "utf8");
    assert.match(agent, /family map in `docs\/bindings\.md`/u);
    for (const pattern of patterns) assert.match(bindings, pattern, profile);
    assert.match(bindings, /assess which canonical families changed or record a concise unaffected reason/u);
    assert.match(bindings, /declared external contract does not prove conditional-write support or a successful sync/u);
    assert.match(agent, /pending propagation or publication is not a confirmed revision/u);
    assert.match(bindings, /\[Documentation evidence procedure\]\(\.\.\/\.factory\/docs\/engineering-handbook\.md#documentation-evidence-for-affected-families\)/u);
    assert.match(agent, /\[destination-specific evidence procedure\]\(\.factory\/docs\/engineering-handbook\.md#documentation-evidence-for-affected-families\)/u);
    for (const scenario of [
      /No affected family \| Record why; no write and no new gate/u,
      /Local changed Git doc, committed SHA \| Record path\/SHA/u,
      /External prior revision stale, destination ambiguous, or conditional write unsupported \| `BLOCKED`/u,
      /External acknowledged write but readback unavailable or mismatched \| `PENDING`/u,
      /Offline\/unauthorized external update \| `PENDING`\/`BLOCKED`/u,
      /Pages Git source updated but deployment delayed or publication evidence absent \| Source revision recorded; publication `PENDING`/u,
      /Interrupted external attempt \| `PENDING`/u,
    ]) assert.match(handbook, scenario, profile);
    assert.match(handbook, /provider acknowledgment for that exact document and operation; then a fresh independent read/u);
    assert.match(handbook, /do not blindly retry/u);
    for (const family of ["Architecture", "Constraints", "Business", "Technical"]) assert.match(bindings, new RegExp(`\\| ${family} \\|`, "u"));
    assert.match(bindings, /explicit user authorization for its exact destination, action, and credential\/session/u);
    assert.match(bindings, /Selection and creator plan\/apply\/verify perform no remote operation/u);
    assert.doesNotMatch(bindings, /password=|Authorization: Bearer/u);
    const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(verified.code, 0, `${profile}: ${verified.stderr}`);
    const rerun = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(json(rerun).status, "noop", profile);
    if (profile === "external-contract" || profile === "website-readonly") {
      for (const url of Object.values(familySources)) assert.ok(bindings.includes(url));
      await assert.rejects(stat(path.join(target, "docs/business.md")));
      assert.match(bindings, /unavailable source is not replaced by a local export/u);
      assert.doesNotMatch(agent, /`docs\/business\.md`/u);
    }
  }
});

test("documentation setup rejects unsupported, ambiguous, or factory-inherited remote authority before writing", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-doc-reject-"));
  const base = "https://docs.example.invalid/project";
  const sources = Object.fromEntries(["ARCHITECTURE", "CONSTRAINTS", "BUSINESS", "TECHNICAL"]
    .map((family) => [`DOCS_${family}_SOURCE`, `${base}/${family.toLowerCase()}`]));
  const external = { DOCS_DESTINATION: "external-contract", DOCS_DESTINATION_ID: base, ...sources,
    DOCS_INTEGRATION: "Approved docs client v1", DOCS_ACCESS_MECHANISM: "operator-supplied-oauth",
    DOCS_READ_CONTRACT: `${base}/read`, DOCS_WRITE_CONTRACT: `${base}/write`, DOCS_READBACK_CONTRACT: `${base}/readback` };
  const invalid = [
    [{ DOCS_DESTINATION: "website" }, /DOCS_DESTINATION must be one of/u],
    [{ DOCS_DESTINATION: "website-readonly", DOCS_DESTINATION_ID: base, ...sources, DOCS_WRITE_CONTRACT: `${base}/write` }, /DOCS_WRITE_CONTRACT is not applicable/u],
    [{ ...external, DOCS_DESTINATION_ID: "" }, /DOCS_DESTINATION_ID requires an explicit project answer/u],
    [{ ...external, DOCS_ACCESS_MECHANISM: "" }, /DOCS_ACCESS_MECHANISM requires an explicit project answer/u],
    [{ ...external, DOCS_READ_CONTRACT: "" }, /DOCS_READ_CONTRACT requires an explicit project answer/u],
    [{ ...external, DOCS_WRITE_CONTRACT: "" }, /DOCS_WRITE_CONTRACT requires an explicit project answer/u],
    [{ ...external, DOCS_READBACK_CONTRACT: "" }, /DOCS_READBACK_CONTRACT requires an explicit project answer/u],
    [{ ...external, DOCS_TECHNICAL_SOURCE: "" }, /DOCS_TECHNICAL_SOURCE requires an explicit project answer/u],
    [{ ...external, DOCS_BUSINESS_SOURCE: "https://other.example.invalid/business" }, /must be inside DOCS_DESTINATION_ID/u],
    [{ ...external, DOCS_ARCHITECTURE_SOURCE: `${base}/a\n| Forged |` }, /exact HTTPS URL/u],
    [{ DOCS_DESTINATION: "github-pages", DOCS_DESTINATION_ID: "https://example.invalid/project/" }, /DOCS_GIT_SOURCE requires an explicit project answer/u],
    [{ DOCS_DESTINATION: "github-pages", DOCS_DESTINATION_ID: "https://user:secret@example.invalid/", DOCS_GIT_SOURCE: "https://github.com/example/project/tree/main/docs" }, /without credentials/u],
  ];
  for (const [index, [answers, message]] of invalid.entries()) {
    const directory = path.join(parent, `case-${index}`);
    await mkdir(directory);
    const target = path.join(directory, "project");
    const config = await configFile(directory, answers);
    const result = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, message);
    await assert.rejects(stat(target));
  }
  const { factory, sha } = await factoryFixture(parent, external);
  const target = path.join(parent, "factory-project");
  const config = await configFile(parent, { FACTORY_SPEC: "example/factory@v1" });
  const args = ["--target", target, "--config", config, "--factory-root", factory, "--factory-sha", sha, "--non-interactive"];
  const suggested = await run(["apply", ...args]);
  assert.notEqual(suggested.code, 0);
  assert.match(suggested.stdout, /project answers must explicitly select DOCS_DESTINATION/u);
  await assert.rejects(stat(target));
  const local = await configFile(parent, { FACTORY_SPEC: "example/factory@v1", DOCS_DESTINATION: "local" });
  const applied = await run(["apply", ...args.map((part) => part === config ? local : part)]);
  assert.equal(applied.code, 0, applied.stderr);
  assert.match(await readFile(path.join(target, "docs", "bindings.md"), "utf8"), /Profile: local/u);
});

test("all task selections generate exclusive, readable provider-native bindings", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-task-bindings-"));
  const selections = [
    ["jira", "Jira workspace", "JRA"],
    ["github-issues", "GitHub repository", "owner/repo"],
    ["github-projects", "GitHub project", "board-42"],
    ["linear", "Linear workspace", "LIN"],
    ["custom", "Team tracker", "team-board"],
  ];
  for (const [provider, tracker, key] of selections) {
    const directory = path.join(parent, provider);
    await mkdir(directory);
    const target = path.join(directory, "project");
    const config = await configFile(directory, { TASK_TRACKER: provider, TRACKER: tracker, TRACKER_KEY: key });
    const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(applied.code, 0, `${provider}: ${applied.stderr}`);
    const bindings = await readFile(path.join(target, "docs", "bindings.md"), "utf8");
    const labels = new Set(JSON.parse(await readFile(path.join(target, ".github", "labels.json"), "utf8")).labels.map(({ name }) => name));
    const checkExamples = (text) => {
      for (const [, label] of text.matchAll(/--label "([^"]+)"/gu)) {
        assert.ok(labels.has(label), `${provider}: unknown example label ${label}`);
      }
      assert.doesNotMatch(text, /type:task|\[`templates\/handoff\.md`\]/u, provider);
      if (provider === "custom") return;
      const link = text.match(/\[handoff template\]\(([^)]+)\)/u);
      assert.ok(link, `${provider}: expected a handoff template link`);
      const destination = path.resolve(target, "docs", link[1]);
      assert.equal(destination, path.join(target, ".factory", "templates", "handoff.md"), provider);
      return destination;
    };
    const handoffExample = checkExamples(bindings);
    if (handoffExample) await stat(handoffExample);
    if (provider === "github-issues") {
      assert.match(bindings, /--label "type:product"/u);
      assert.match(bindings, /--label "type:bug"/u);
      assert.throws(() => checkExamples(bindings.replace('--label "type:product"', '--label "type:task"')), /unknown example label type:task/u);
      assert.throws(() => checkExamples(bindings.replace("../.factory/templates/handoff.md", "../templates/handoff.md")), /github-issues/u);
    }
    assert.ok(bindings.includes(`Task provider (TASK_TRACKER): ${provider}`), provider);
    assert.ok(bindings.includes(`Tracker (TRACKER): ${tracker}`), provider);
    assert.ok(bindings.includes(`Project/board (TRACKER_KEY): ${key}`), provider);
    assert.ok(bindings.includes(`**Provider:** \`${provider}\``), provider);
    assert.match(bindings, /Every durable harness task\/TODO\s+uses/iu, provider);
    assert.match(bindings, /cold\s+resume/u, provider);
    assert.match(bindings, /confirmation and fresh readback/u, provider);
    assert.match(bindings, /comment\/handoff/u, provider);
    assert.match(bindings, /optional derived projections/u, provider);
    assert.match(bindings, /unavailable(?:\s+or\s+|,\s*|\/)malformed(?:\s+or\s+|,\s*or\s+|\/)mismatched/u, provider);
    assert.match(bindings, /exact .*operation/u, provider);
    assert.match(bindings, /Use only this provider and tracker for every durable harness task\/TODO/u, provider);
    assert.match(bindings, /read back the intended task identity, state, and handoff/u, provider);
    assert.match(bindings, /local files and task UIs are not fallback stores/u, provider);
    assert.match(bindings, /(?:unsupported|unavailable)[\s\S]*?ambiguous[\s\S]*?readback/u, provider);
    assert.match(bindings, /malformed[\s\S]*?(?:stop|blocks)/u, provider);
    assert.match(bindings, /evidence\s+needed to\s+resume/u, provider);
    assert.doesNotMatch(bindings, /Do not leave state only in Jira/u, provider);
    if (provider === "github-projects") {
      assert.match(bindings, /draft\s+or project-only item without a linked issue/u);
      assert.match(bindings, /without a confirmed link and approval, block PR/u);
    }
    if (provider === "custom") assert.match(bindings, /no supported native comment or/u);
    if (provider === "jira" || provider === "linear" || provider === "custom") {
      assert.match(bindings, /(?:Do not|Never) substitute GitHub/u, provider);
    }
    const agent = await readFile(path.join(target, "AGENT.md"), "utf8");
    assert.ok(agent.includes(`- Task tracker: \`${tracker}\` (project/board \`${key}\`)`), provider);
    assert.match(agent, /optional derived projection, never a fallback tracker/u, provider);
    assert.match(agent, /unsupported, failed, ambiguous, unavailable, malformed, or mismatched readback, stop/u, provider);
    const runbook = await readFile(path.join(target, ".factory", "templates", "agent-runbook.md"), "utf8");
    assert.ok(runbook.includes(`${provider}`) && runbook.includes(key), provider);
    assert.match(runbook, /Local projections are optional and\s+non-authoritative/u, provider);
    assert.match(runbook, /confirm\/read back each operation/u, provider);
    assert.match(runbook, /follow `AGENT\.md`'s fail-closed confirmation\/readback rule/u, provider);
    const handoff = await readFile(path.join(target, ".factory", "templates", "handoff.md"), "utf8");
    assert.match(handoff, /Confirm the comment or native handoff operation[\s\S]*?read back its intended content/u, provider);
    assert.match(handoff, /unsupported, fails, identifies an ambiguous task, or cannot be read back/u, provider);
    assert.match(handoff, /returns malformed data, stop without claiming success/u, provider);
    const agentInit = await readFile(path.join(target, ".factory", "docs", "agent-init.md"), "utf8");
    assert.match(agentInit, /Verify provider confirmation and readback of the intended task identity and state/u, provider);
    assert.match(agentInit, /neither required nor fallback stores/u, provider);
    assert.match(agentInit, /returns malformed readback, stop/u, provider);
    await assert.rejects(stat(path.join(target, "odd")), undefined, provider);
    if (provider === "jira" || provider === "linear" || provider === "custom") {
      assert.doesNotMatch(bindings, /Task provider \(TASK_TRACKER\): github-(?:issues|projects)/u, provider);
      assert.match(bindings, /(?:Do not|Never) substitute GitHub/u, provider);
      const reference = provider === "custom" ? "Task:" : `${provider === "jira" ? "Jira" : "Linear"}:`;
      for (const template of [".github/pull_request_template.md", ".factory/templates/pull-request.md"]) {
        const pr = await readFile(path.join(target, template), "utf8");
        assert.ok(pr.includes(reference), `${provider}: ${template} must use native task reference`);
        assert.doesNotMatch(pr, /Closes #|linked GitHub issue must have status:approved/u, `${provider}: ${template}`);
      }
    } else {
      for (const template of [".github/pull_request_template.md", ".factory/templates/pull-request.md"]) {
        const pr = await readFile(path.join(target, template), "utf8");
        assert.match(pr, /Closes #<TICKET_ID>/u, `${provider}: ${template}`);
      }
    }
    const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(verified.code, 0, `${provider}: ${verified.stderr}`);
  }
  const missing = path.join(parent, "missing-board");
  await mkdir(missing);
  const config = await configFile(missing, { TASK_TRACKER: "linear" });
  const target = path.join(missing, "project");
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  const bindings = await readFile(path.join(target, "docs", "bindings.md"), "utf8");
  assert.match(bindings, /Project\/board \(TRACKER_KEY\): not configured; resolve before durable task operations/u);
});

test("compatibility fixtures produce stable plans for task, secrets, and code-intelligence bindings", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-fixtures-"));
  const fixtures = [
    ["github-issues", "none", "none"],
    ["github-issues", "infisical", "codegraph"],
    ["jira", "vault", "none"],
    ["jira", "doppler", "codegraph"],
  ];
  for (const [task, secrets, codeIntelligence] of fixtures) {
    const target = path.join(parent, `${task}-${secrets}-${codeIntelligence}`);
    const config = await configFile(parent, {
      TASK_TRACKER: task,
      SECRETS_PROVIDER: secrets,
      CODE_INTELLIGENCE: codeIntelligence,
      CI_SYSTEM: "GitHub Actions",
      CI_STACKS: "rust,typescript,python,go",
    });
    const first = await run(["plan", "--target", target, "--config", config, "--non-interactive"]);
    const second = await run(["plan", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(applied.code, 0, applied.stderr);
    const verified = await run(["verify", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(verified.code, 0, verified.stderr);
    assert.equal(json(verified).status, "verified");
    const rerun = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
    assert.equal(rerun.code, 0, rerun.stderr);
    assert.equal(json(rerun).status, "noop");
  }
});

test("unknown keys, duplicate keys, and CI selections fail before target mutation", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-validation-"));
  const target = path.join(parent, "project");
  const unknown = await configFile(parent, { UNKNOWN_INPUT: "blocked" });
  const unknownResult = await run(["apply", "--target", target, "--config", unknown, "--non-interactive"]);
  assert.notEqual(unknownResult.code, 0);
  assert.match(json(unknownResult).diagnostics.map((item) => item.code).join(" "), /configuration_invalid/);
  await assert.rejects(stat(target));

  const duplicate = path.join(parent, "duplicate.json");
  await writeFile(duplicate, '{"PROJECT_NAME":"one","PROJECT_NAME":"two"}');
  const duplicateResult = await run(["apply", "--target", path.join(parent, "duplicate-target"), "--config", duplicate, "--non-interactive"]);
  assert.notEqual(duplicateResult.code, 0);
  assert.match(json(duplicateResult).diagnostics.map((item) => item.code).join(" "), /invalid_json/);

  const invalidCi = await configFile(parent, { CI_SYSTEM: "GitHub Actions", CI_STACKS: "typescript,unknown" });
  const invalidCiResult = await run(["apply", "--target", path.join(parent, "ci-target"), "--config", invalidCi, "--non-interactive"]);
  assert.notEqual(invalidCiResult.code, 0);
  assert.match(json(invalidCiResult).diagnostics.map((item) => item.code).join(" "), /ci_invalid/);
  await assert.rejects(stat(path.join(parent, "ci-target")));
});

test("ownership cleanup removes unchanged source inputs and preserves changed application files", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-cleanup-"));
  const target = path.join(parent, "project");
  const config = await configFile(parent);
  await mkdir(target);
  await writeFile(path.join(target, "placeholders.json"), await readFile(path.join(root, "dist", "payload", "placeholders.json")));
  const applied = await run(["apply", "--target", target, "--config", config, "--non-interactive"]);
  assert.equal(applied.code, 0, applied.stderr);
  await assert.rejects(stat(path.join(target, "placeholders.json")));

  const protectedTarget = path.join(parent, "protected");
  await mkdir(protectedTarget);
  await writeFile(path.join(protectedTarget, "placeholders.json"), "application-owned\n");
  const protectedResult = await run(["apply", "--target", protectedTarget, "--config", config, "--non-interactive"]);
  assert.notEqual(protectedResult.code, 0);
  assert.equal(await readFile(path.join(protectedTarget, "placeholders.json"), "utf8"), "application-owned\n");
});

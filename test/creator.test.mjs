import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "index.js");
const { preparePlan } = await import("../dist/creator.js");

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

test("interactive configuration prompts for missing required values through the shared validator", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-prompt-"));
  const target = path.join(parent, "project");
  const prompted = [];
  const prepared = await preparePlan({
    command: "plan",
    target,
    prompt: async (placeholder) => {
      prompted.push(placeholder.key);
      if (placeholder.key === "PROJECT_NAME") return "Prompted project";
      if (placeholder.key === "TASK_TRACKER") return "github-issues";
      return "none";
    },
  });
  assert.deepEqual(prompted, ["PROJECT_NAME", "TASK_TRACKER", "AGENTS"]);
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
  assert.match(await readFile(path.join(oneTarget, ".codex", "AGENTS.md"), "utf8"), /Codex workspace instructions/);
  const rerun = await run(["apply", "--target", oneTarget, "--config", noneConfig, "--agent", "codex", "--non-interactive"], { env: baseEnvironment });
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.equal(json(rerun).status, "noop");
  assert.equal(await readFile(path.join(oneTarget, ".factory", "provider-manifest.json"), "utf8"), manifest);

  const multipleTarget = path.join(parent, "multiple");
  const multiple = await run(["apply", "--target", multipleTarget, "--config", noneConfig, "--agents", "opencode,claude-code", "--non-interactive"], { env: baseEnvironment });
  assert.equal(multiple.code, 0, multiple.stderr);
  assert.deepEqual(json(multiple).providers.selected.map(({ id }) => id), ["claude-code", "opencode"]);
  assert.ok(await readFile(path.join(multipleTarget, ".opencode", "agents", "factory-template.md"), "utf8"));
  assert.ok(await readFile(path.join(multipleTarget, ".claude", "factory-template.md"), "utf8"));
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

test("rejects a symlinked creator state directory without writing outside the target", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-state-link-"));
  const target = path.join(parent, "project");
  const outside = path.join(parent, "outside");
  const config = await configFile(parent);
  await mkdir(target);
  await mkdir(outside);
  await symlink(outside, path.join(target, ".factory-template-creator"));
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

  const statePath = path.join(target, ".factory-template-creator", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.payload_digest = "sha256:changed";
  await writeFile(statePath, JSON.stringify(state));
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
    assert.ok(bindings.includes(`Task provider (TASK_TRACKER): ${provider}`), provider);
    assert.ok(bindings.includes(`Tracker (TRACKER): ${tracker}`), provider);
    assert.ok(bindings.includes(`Project/board (TRACKER_KEY): ${key}`), provider);
    assert.ok(bindings.includes(`**Provider:** \`${provider}\``), provider);
    assert.match(bindings, /Every durable harness task\/TODO\s+uses/iu, provider);
    assert.match(bindings, /cold\s+resume/u, provider);
    assert.match(bindings, /confirmation and fresh readback/u, provider);
    assert.match(bindings, /comment\/handoff/u, provider);
    assert.match(bindings, /optional derived projections/u, provider);
    assert.match(bindings, /unavailable\s+or\s+mismatched|unavailable\/mismatched/u, provider);
    assert.match(bindings, /exact .*operation/u, provider);
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
    assert.ok(agent.includes(tracker) && agent.includes(key), provider);
    const runbook = await readFile(path.join(target, ".factory", "templates", "agent-runbook.md"), "utf8");
    assert.ok(runbook.includes(`${provider}`) && runbook.includes(key), provider);
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

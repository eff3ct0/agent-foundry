import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  cliInvocation,
  deterministicConfiguration,
  verifyPackageConsumers,
} from "../scripts/package-consumer-verify.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha = "a".repeat(40);

test("registry invocations retain apply, verify, and noop command arguments for both consumers", () => {
  const spec = "@eff3ct/agent-foundry@0.1.0";
  const target = path.join(os.tmpdir(), "consumer-project");
  const configPath = path.join(os.tmpdir(), "consumer-answers.json");
  for (const [consumer, name, prefix] of [
    ["pnpm-dlx", "pnpm", ["dlx", "--package", spec, "foundry"]],
    ["npx", "npx", ["--yes", "--package", spec, "foundry"]],
  ]) {
    for (const [command, launchAgent, expectedStatus] of [
      ["apply", true, "applied"],
      ["verify", false, "verified"],
      ["apply", false, "noop"],
    ]) {
      const invocation = cliInvocation({ consumer, spec, command, target, configPath, selectedAgent: true, launchAgent });
      assert.equal(invocation.name, name);
      assert.deepEqual(invocation.args, [...prefix, command, "--target", target, "--config", configPath, "--non-interactive", "--agent", "codex", ...(launchAgent ? ["--launch-agent"] : [])], `${consumer} ${expectedStatus}`);
    }
  }
});

test("offline package consumers verify exact identity, apply/verify, noop, startup, and tree equality", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-package-consumer-"));
  try {
    const packages = path.join(parent, "packages");
    await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packages], { cwd: root });
    const tarball = path.join(packages, (await readdir(packages)).find((entry) => entry.endsWith(".tgz")) ?? "");
    const result = await verifyPackageConsumers({
      packageName: "@eff3ct/agent-foundry",
      packageVersion: "0.1.0",
      tarballPath: tarball,
      sourceSha,
      release: { status: "verified", tag: "v0.1.0", sha: sourceSha },
      outputDirectory: path.join(parent, "evidence"),
    });

    assert.equal(result.status, "passed");
    assert.deepEqual(result.package, { name: "@eff3ct/agent-foundry", version: "0.1.0" });
    assert.deepEqual(result.release, { status: "verified", tag: "v0.1.0", sha: sourceSha });
    assert.deepEqual(result.consumers.map(({ consumer }) => consumer), ["pnpm-dlx", "npx"]);
    for (const consumer of result.consumers) {
      assert.equal(consumer.mode, "local-tarball");
      assert.equal(consumer.package_spec, "@eff3ct/agent-foundry@0.1.0");
      assert.equal(consumer.apply.status, "applied");
      assert.equal(consumer.verify.status, "verified");
      assert.equal(consumer.rerun.status, "noop");
      assert.equal(consumer.generated_tree_digest, consumer.rerun_tree_digest);
      assert.deepEqual(consumer.identity.release, result.release);
      assert.match(consumer.identity.tarball_digest, /^sha256:[0-9a-f]{64}$/u);
      assert.match(consumer.identity.payload.digest, /^sha256:[0-9a-f]{64}$/u);
      assert.match(consumer.identity.tree_digest, /^sha256:[0-9a-f]{64}$/u);
      const startup = await readFile(path.join(parent, "evidence", consumer.consumer, "agent-startup.txt"), "utf8");
      assert.equal(startup, `--cd\n${path.join(parent, "evidence", consumer.consumer, "project")}\n`);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("unavailable registry execution is a precise blocked result, not a published success", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-package-registry-"));
  const calls = [];
  try {
    const result = await verifyPackageConsumers({
      packageName: "@eff3ct/agent-foundry",
      packageVersion: "0.1.0",
      sourceSha,
      outputDirectory: parent,
      configuration: deterministicConfiguration,
      executeCommand: async (name, args) => {
        calls.push([name, args]);
        throw new Error("npm ERR! code E404 package is not in the registry");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "registry_unavailable");
    assert.deepEqual(result.package, { name: "@eff3ct/agent-foundry", version: "0.1.0" });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], "npm");
    assert.deepEqual(calls[0][1].at(-1), "@eff3ct/agent-foundry@0.1.0");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("invalid exact versions and release identities fail closed", async () => {
  await assert.rejects(
    verifyPackageConsumers({ packageName: "@eff3ct/agent-foundry", packageVersion: "^0.1.0", sourceSha, outputDirectory: os.tmpdir() }),
    /exact semver/u,
  );
  await assert.rejects(
    verifyPackageConsumers({ packageName: "@eff3ct/agent-foundry", packageVersion: "0.1.0", sourceSha, release: { status: "declared", tag: "v0.1.0", sha: sourceSha }, outputDirectory: os.tmpdir() }),
    /verified tag/u,
  );
});

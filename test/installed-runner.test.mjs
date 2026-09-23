import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { allowlistedEnvironment } from "../scripts/installed-runner.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installed runner executes an exact offline tarball through its installed CLI", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-installed-runner-"));
  try {
    const packages = path.join(parent, "packages");
    const target = path.join(parent, "project");
    const config = path.join(parent, "answers.json");
    await mkdir(packages);
    await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packages], { cwd: root });
    const tarball = path.join(packages, (await readdir(packages)).find((entry) => entry.endsWith(".tgz")) ?? "");
    assert.ok(tarball.endsWith(".tgz"), "pnpm pack did not produce a tarball");
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "installed runner", TASK_TRACKER: "github-issues" } }));
    const environment = allowlistedEnvironment({ PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), FACTORY_SECRET: "must-not-pass" });
    assert.deepEqual(Object.keys(environment).sort(), ["HOME", "PATH", "TMPDIR"]);

    const execution = await execFileAsync(process.execPath, ["scripts/installed-runner.mjs", "--tarball", tarball, "--target", target, "--config", config], { cwd: root, env: environment });
    const result = JSON.parse(execution.stdout);

    assert.equal(result.creator.status, "applied");
    assert.equal(result.creator.verification, "verified");
    assert.deepEqual(result.identity.package, { name: "@eff3ct/agent-foundry", version: "0.1.0" });
    for (const digest of [result.identity.tarball_digest, result.identity.payload_digest, result.identity.tree_digest]) assert.match(digest, /^sha256:[0-9a-f]{64}$/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

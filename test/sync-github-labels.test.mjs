import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { loadLabels, syncLabels } from "../scripts/sync-github-labels.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "sync-github-labels.mjs");
const workflow = path.join(root, ".github", "workflows", "sync-labels.yml");
const label = { name: "type:product", color: "1D76DB", description: "Template or product improvement" };

test("label catalog validation rejects malformed catalog entries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "label-catalog-"));
  try {
    const catalog = path.join(directory, "labels.json");
    await writeFile(catalog, JSON.stringify({ labels: [{ ...label }, { ...label }] }));
    await assert.rejects(() => loadLabels(catalog), /unique non-empty/);
    await writeFile(catalog, JSON.stringify({ labels: [{ ...label, description: "" }] }));
    await assert.rejects(() => loadLabels(catalog), /color and description/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("synchronization uses an argument array and stops on the first rejected command", () => {
  const calls = [];
  syncLabels([label], {
    repo: "acme/example",
    runner: (file, args, options) => {
      calls.push({ file, args, options });
      return { status: 0 };
    },
  });
  assert.deepEqual(calls, [{
    file: "gh",
    args: ["label", "create", "type:product", "--color", "1D76DB", "--description", "Template or product improvement", "--force", "--repo", "acme/example"],
    options: { cwd: root, encoding: "utf8", shell: false },
  }]);
  assert.throws(() => syncLabels([label], { runner: () => ({ status: 1, stderr: "rejected" }) }), /rejected/);
});

test("CLI retains deterministic self-check and dry-run output", async () => {
  const selfCheck = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.match(selfCheck.stdout, /^Would run: gh label create type:product /);
  assert.match(selfCheck.stdout, /self-check OK\n$/);
  const dryRun = await execFileAsync(process.execPath, [script, "--dry-run", "--repo", "acme/example"], { cwd: root });
  assert.equal(dryRun.stdout.trim().split("\n").length, 10);
  assert.match(dryRun.stdout, /--repo acme\/example/);
});

test("CLI reads the catalog from the initialized factory layout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-label-sync-"));
  try {
    const relocatedScript = path.join(directory, ".factory", "scripts", "sync-github-labels.mjs");
    await mkdir(path.dirname(relocatedScript), { recursive: true });
    await mkdir(path.join(directory, ".github"));
    await copyFile(script, relocatedScript);
    await writeFile(path.join(directory, ".github", "labels.json"), JSON.stringify({ labels: [label] }));

    const result = await execFileAsync(process.execPath, [relocatedScript, "--self-check"], { cwd: directory });
    assert.match(result.stdout, /^Would run: gh label create type:product /);
    assert.match(result.stdout, /self-check OK\n$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("label workflow pins the Node runtime required by the package", async () => {
  const text = await readFile(workflow, "utf8");
  assert.match(text, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(text, /node-version: 20\.19\.0/);
});

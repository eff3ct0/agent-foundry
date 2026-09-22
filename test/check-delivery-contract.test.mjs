import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { check } from "../scripts/check-delivery-contract.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-delivery-contract.mjs");
const providerContract = "# Abstract contract\n\n## Identity\n## Binding\n## How the agent interacts\n## Rules and limitations\n## Prohibitions\n";
const provider = "## Valid provider\n\n> **Contract instance:** [`_contract.md`](./_contract.md)\n> **Capability:** `code-intelligence`\n> **Provider:** `valid`\n\n## Identity\n## Binding\nA provider.\n## How the agent interacts\nUse it.\n## Rules and limitations\nUse native tools.\n## Prohibitions\nDo not bypass policy.\n";

const fixture = async (callback) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "delivery-contract-test-"));
  try { return await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
};

test("the repository delivery contract remains structurally valid", async () => {
  assert.deepEqual(await check(), []);
});

test("a missing selected file reports a root-relative deterministic error", async () => {
  await fixture(async (directory) => {
    assert.deepEqual(await check([path.join(directory, "missing.md")], directory), ["required file missing: missing.md"]);
  });
});

test("provider fixtures reject broken contract links and missing required sections", async () => {
  await fixture(async (directory) => {
    const providerDirectory = path.join(directory, "providers", "code-intel");
    await mkdir(providerDirectory, { recursive: true });
    const contractPath = path.join(providerDirectory, "_contract.md");
    const providerPath = path.join(providerDirectory, "valid.md");
    await writeFile(contractPath, providerContract, "utf8");
    await writeFile(providerPath, provider.replace("./_contract.md", "./missing-contract.md"), "utf8");
    const broken = await check([contractPath, providerPath], directory);
    assert.ok(broken.some((error) => error === "providers/code-intel/valid.md broken link: ./missing-contract.md"), broken.join("\n"));
    await writeFile(providerPath, "## Valid provider\n", "utf8");
    const incomplete = await check([contractPath, providerPath], directory);
    assert.ok(incomplete.some((error) => error.includes("missing contract section")), incomplete.join("\n"));
  });
});

test("valid explicit provider fixtures pass without leaking temporary paths", async () => {
  await fixture(async (directory) => {
    const providerDirectory = path.join(directory, "providers", "code-intel");
    await mkdir(providerDirectory, { recursive: true });
    const contractPath = path.join(providerDirectory, "_contract.md");
    const providerPath = path.join(providerDirectory, "valid.md");
    await writeFile(contractPath, providerContract, "utf8");
    await writeFile(providerPath, provider, "utf8");
    assert.deepEqual(await check([contractPath, providerPath], directory), []);
  });
});

test("the Node CLI self-check is the structural delivery-contract command", async () => {
  const result = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.equal(result.stdout, "self-check OK\n");
  await assert.rejects(execFileAsync(process.execPath, [script], { cwd: root }), /usage: check-delivery-contract\.mjs --self-check/u);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertManifestMatchesLock,
  manifestDigest,
  validateDeclaredPaths,
} from "../scripts/build-payload.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist/payload-manifest.json"), "utf8"));

const walk = async (directory, relative = "") => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), entryRelative));
    else result.push(entryRelative);
  }
  return result.sort();
};

test("manifest covers the bundled payload exactly once", async () => {
  const payloadPaths = await walk(path.join(root, "dist/payload"));
  assert.deepEqual(payloadPaths, manifest.files.map((file) => file.path));
  assert.equal(new Set(payloadPaths).size, payloadPaths.length);
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(root, "dist/payload", file.path));
    assert.equal(bytes.byteLength, file.size, file.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
  assert.equal(manifest.payload_digest, manifestDigest(manifest.payload_version, manifest.files));
});

test("version output exposes the package and payload identity", async () => {
  const human = await execFileAsync(process.execPath, ["dist/index.js", "--version"], { cwd: root });
  assert.match(human.stdout, /factory-template-creator 0\.1\.0/);
  assert.match(human.stdout, new RegExp(manifest.payload_digest));

  const json = await execFileAsync(process.execPath, ["dist/index.js", "--version", "--json"], { cwd: root });
  assert.deepEqual(JSON.parse(json.stdout), {
    name: manifest.package_name,
    version: manifest.package_version,
    payloadVersion: manifest.payload_version,
    payloadDigest: manifest.payload_digest,
  });
});

test("compiled CLI is executable without an explicit Node interpreter", async (context) => {
  if (process.platform === "win32") {
    context.skip("POSIX executable mode is not applicable on Windows");
    return;
  }
  const cliPath = path.join(root, "dist/index.js");
  assert.equal((await stat(cliPath)).mode & 0o777, 0o755);
  const result = await execFileAsync(cliPath, ["--version", "--json"]);
  assert.deepEqual(JSON.parse(result.stdout).payloadDigest, manifest.payload_digest);
});

test("packaging rejects missing, undeclared, and changed integrity inputs", () => {
  assert.throws(
    () => validateDeclaredPaths(["known.txt"], ["known.txt", "new.txt"]),
    /undeclared payload file is present/,
  );
  assert.throws(
    () => validateDeclaredPaths(["known.txt", "missing.txt"], ["known.txt"]),
    /expected payload file is missing/,
  );
  assert.throws(
    () => validateDeclaredPaths(["../outside.txt"], []),
    /escapes the repository root/,
  );
  assert.throws(
    () => assertManifestMatchesLock(manifest, { ...manifest, payload_digest: "sha256:changed" }),
    /integrity contract/,
  );
});
test("npm-installed packages restore the manifest .gitignore from npm transport", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-npm-package-"));
  const config = path.join(parent, "answers.json");
  await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Npm package smoke", TASK_TRACKER: "github-issues" } }));
  await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", parent], { cwd: root });
  const tarball = path.join(parent, "factory-template-creator-0.1.0.tgz");
  const installRoot = path.join(parent, "consumer");
  await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--prefix", installRoot, tarball], { cwd: root });
  const installedCli = path.join(installRoot, "node_modules", "factory-template-creator", "dist", "index.js");
  const target = path.join(parent, "generated");
  const result = await execFileAsync(process.execPath, [installedCli, "apply", "--target", target, "--config", config, "--non-interactive", "--json"], { cwd: root });
  assert.equal(JSON.parse(result.stdout).status, "applied");
  assert.equal((await stat(path.join(target, ".gitignore"))).isFile(), true);
});

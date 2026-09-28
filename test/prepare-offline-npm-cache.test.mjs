import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assertInstalledLock, expectedDependencies, prepareOfflineNpmCache } from "../scripts/prepare-offline-npm-cache.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executeDefault = promisify(execFile);
const locked = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
const manifest = { name: "@eff3ct/agent-foundry", version: "0.1.0", dependencies: { yaml: "2.9.1" } };
const yaml = expectedDependencies(manifest, locked).get("yaml");
const installed = (name = "yaml", entry = yaml) => ({
  lockfileVersion: 3,
  packages: {
    "": {},
    [`node_modules/${manifest.name}`]: { version: manifest.version },
    [`node_modules/${name}`]: {
      version: entry.version,
      integrity: entry.integrity,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${entry.version}.tgz`,
    },
  },
});

test("empty npm cache rejects offline install, then packed preparation permits it without fetching in verifier", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "offline-cache-test-"));
  let cached = false;
  const offlineConsumer = () => { if (!cached) throw new Error("ENOTCACHED"); };
  try {
    await writeFile(path.join(workspace, "pnpm-lock.yaml"), locked);
    assert.throws(offlineConsumer, /ENOTCACHED/u);
    const execute = async (command, args, options) => {
      if (command === "tar") return { stdout: JSON.stringify(manifest) };
      assert.equal(command, "npm");
      assert.equal(options.env.npm_config_registry, "https://registry.npmjs.org/");
      assert.notEqual(options.env.npm_config_userconfig, options.env.npm_config_globalconfig);
      assert.equal(await readFile(options.env.npm_config_userconfig, "utf8"), "");
      assert.equal(await readFile(options.env.npm_config_globalconfig, "utf8"), "");
      assert.ok(args.includes("--ignore-scripts"));
      if (args[0] === "pack") {
        assert.ok(args.includes("--offline"));
        await writeFile(path.join(args[args.indexOf("--pack-destination") + 1], "candidate.tgz"), "fixture");
      } else {
        assert.equal(args[0], "install");
        assert.ok(options.cwd.startsWith(os.tmpdir()));
        await mkdir(args[args.indexOf("--prefix") + 1]);
        await writeFile(path.join(args[args.indexOf("--prefix") + 1], "package-lock.json"), JSON.stringify(installed()));
        cached = true;
      }
      return { stdout: "" };
    };
    await prepareOfflineNpmCache({ root: workspace, execute, environment: { HOME: workspace, PATH: process.env.PATH } });
    assert.doesNotThrow(offlineConsumer);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("real offline npm pack exposes the candidate manifest with isolated npm configuration", async () => {
  let installCalled = false;
  await prepareOfflineNpmCache({ root, execute: async (command, args, options) => {
    if (command === "npm" && args[0] === "install") {
      installCalled = true;
      const prefix = args[args.indexOf("--prefix") + 1];
      await mkdir(prefix);
      await writeFile(path.join(prefix, "package-lock.json"), JSON.stringify(installed()));
      return { stdout: "" };
    }
    return executeDefault(command, args, options);
  } });
  assert.equal(installCalled, true);
});

test("packed dependencies must match the workspace importer and exact integrity", () => {
  assert.equal(yaml.version, "2.9.1");
  assert.throws(() => expectedDependencies({ ...manifest, dependencies: { yaml: "2.9.2" } }, locked), /differs from lock/u);
  assert.throws(() => expectedDependencies({ ...manifest, dependencies: { other: "1.0.0" } }, locked), /differ from workspace importer/u);
  assert.throws(() => expectedDependencies(manifest, locked.replace(yaml.integrity, "bad")), /invalid locked integrity/u);
  assert.throws(() => expectedDependencies(manifest, locked.replace("specifier: 2.9.1", "specifier: 2.9.2")), /differs from lock/u);
  assert.throws(() => expectedDependencies(manifest, locked.replace("yaml@2.9.1: {}", "yaml@2.9.1: [bad]")), /invalid locked integrity/u);
  assert.throws(() => expectedDependencies(manifest, `${locked}\n---\nother: true\n`), /two valid YAML documents/u);
  assert.throws(() => expectedDependencies({ ...manifest, optionalDependencies: { other: "1.0.0" } }, locked), /unsupported packed dependency type/u);
});

test("npm's installed closure must have only locked versions, integrity and public registry paths", () => {
  const expected = expectedDependencies(manifest, locked);
  assert.doesNotThrow(() => assertInstalledLock(installed(), expected, manifest));
  assert.throws(() => assertInstalledLock(installed("yaml", { ...yaml, integrity: "sha512-fake" }), expected, manifest), /integrity/u);
  assert.throws(() => assertInstalledLock(installed("yaml", { ...yaml, version: "2.9.2" }), expected, manifest), /version/u);
  const foreign = installed();
  foreign.packages["node_modules/yaml"].resolved = "https://example.com/yaml/-/yaml-2.9.1.tgz";
  assert.throws(() => assertInstalledLock(foreign, expected, manifest), /registry/u);
  foreign.packages["node_modules/yaml"].resolved = "https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz";
  foreign.packages["node_modules/unexpected"] = {};
  assert.throws(() => assertInstalledLock(foreign, expected, manifest), /unexpected installed package/u);
});

test("scoped dependencies resolve by full name and dependency-free candidates skip online install", async () => {
  const scoped = "@example/tool";
  const digest = `sha512-${"A".repeat(86)}==`;
  const source = `---\nlockfileVersion: '9.0'\n---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '${scoped}':\n        specifier: 1.2.3\n        version: 1.2.3\npackages:\n  '${scoped}@1.2.3':\n    resolution: {integrity: ${digest}}\nsnapshots:\n  '${scoped}@1.2.3': {}\n`;
  const dependency = { ...manifest, dependencies: { [scoped]: "1.2.3" } };
  assertInstalledLock(installed(scoped, { version: "1.2.3", integrity: digest }), expectedDependencies(dependency, source), manifest);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "offline-empty-test-"));
  try {
    await writeFile(path.join(workspace, "pnpm-lock.yaml"), source.replace(`dependencies:\n      '${scoped}':\n        specifier: 1.2.3\n        version: 1.2.3`, "dependencies: {}"));
    let installs = 0;
    await prepareOfflineNpmCache({ root: workspace, execute: async (command, args) => {
      if (command === "tar") return { stdout: JSON.stringify({ ...manifest, dependencies: {} }) };
      if (args[0] === "install") installs++;
      else await writeFile(path.join(args[args.indexOf("--pack-destination") + 1], "candidate.tgz"), "fixture");
      return { stdout: "" };
    } });
    assert.equal(installs, 0);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { readPackageIdentity, validateRegistryReadback, validateReleaseIdentity } from "../scripts/npm-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha = "a".repeat(40);

test("release identity requires the exact v<package-version> tag and source revision", () => {
  assert.deepEqual(validateReleaseIdentity("v0.1.0", "0.1.0", sourceSha), { tag: "v0.1.0", sha: sourceSha });
  assert.throws(() => validateReleaseIdentity("v0.1.1", "0.1.0", sourceSha), /release tag/u);
  assert.throws(() => validateReleaseIdentity("v0.1.0", "0.1.0", "not-a-sha"), /source revision/u);
});

test("local and registry identities require matching package, payload, and tarball bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-release-contract-"));
  try {
    await cp(path.join(root, "package.json"), path.join(directory, "package.json"));
    await cp(path.join(root, "dist"), path.join(directory, "dist"), { recursive: true });
    const tarball = path.join(directory, "package.tgz");
    await writeFile(tarball, "exact-package-bytes\n");
    const expected = await readPackageIdentity({ packageRoot: directory, tarballPath: tarball, tag: "v0.1.0", sourceSha });
    const registry = structuredClone(expected);
    const verified = validateRegistryReadback({ metadata: { name: "factory-template-creator", version: "0.1.0" }, registryIdentity: registry, expected });
    assert.equal(verified.status, "verified");
    assert.throws(() => validateRegistryReadback({ metadata: { name: "factory-template-creator", version: "0.1.0" }, registryIdentity: { ...registry, tarball_digest: "sha256:" + "0".repeat(64) }, expected }), /tarball identity/u);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")).name, "factory-template-creator");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

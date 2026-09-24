import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { probeExactVersion, readPackageIdentity, validateRegistryReadback, validateReleaseIdentity } from "../scripts/npm-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha = "a".repeat(40);
const packageName = "@eff3ct/agent-foundry";
const version = "0.1.0";
const packageUrl = "https://registry.npmjs.org/@eff3ct%2fagent-foundry";
const exactUrl = `${packageUrl}/${version}`;
const identity = { name: packageName, version };
const response = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const fakeTransport = (exact, document, requests) => async (request) => {
  requests.push(request);
  assert.equal(request.headers.Accept, "application/json");
  assert.equal(request.redirect, "error");
  return request.url === exactUrl ? exact : request.url === packageUrl ? document : assert.fail("unexpected registry URL");
};

test("exact npm version probe observes only two fixed-origin read endpoints", async () => {
  const cases = [
    ["both missing", response(404), response(404), "absent"],
    ["package without version", response(404), response(200, { name: packageName, versions: {} }), "absent"],
    ["both agree", response(200, identity), response(200, { name: packageName, versions: { [version]: identity } }), "present"],
    ["exact version appears between reads", response(404), response(200, { name: packageName, versions: { [version]: identity } }), "unknown"],
    ["exact version disappears between reads", response(200, identity), response(404), "unknown"],
    ["package document omits exact version", response(200, identity), response(200, { name: packageName, versions: {} }), "unknown"],
    ["malformed document", response(404), response(200, { name: packageName }), "unknown"],
    ["malformed JSON", new Response("{invalid", { status: 200 }), response(404), "unknown"],
    ["wrong document package", response(404), response(200, { name: "other", versions: {} }), "unknown"],
    ["wrong exact package", response(200, { name: "other", version }), response(200, { name: packageName, versions: { [version]: identity } }), "unknown"],
    ["wrong document version", response(200, identity), response(200, { name: packageName, versions: { [version]: { name: packageName, version: "0.2.0" } } }), "unknown"],
    ["unauthorized", response(401), response(404), "unknown"],
    ["forbidden", response(403), response(404), "unknown"],
    ["server failure", response(503), response(404), "unknown"],
    ["package document failure", response(404), response(500), "unknown"],
  ];
  for (const [label, exact, document, status] of cases) {
    const requests = [];
    assert.deepEqual(await probeExactVersion({ packageName, version, transport: fakeTransport(exact, document, requests) }), { status }, label);
    assert.deepEqual(requests.map(({ url }) => url), [401, 403, 503].includes(exact.status) || label === "malformed JSON" ? [exactUrl] : [exactUrl, packageUrl], label);
  }
});

test("exact npm version probe rejects target mismatch without network and fails closed on transport failures", async () => {
  let calls = 0;
  const transport = async () => { calls += 1; throw new Error("private credential must not be printed"); };
  assert.deepEqual(await probeExactVersion({ packageName: "@other/package", version, transport }), { status: "unknown" });
  assert.deepEqual(await probeExactVersion({ packageName, version: "latest", transport }), { status: "unknown" });
  assert.equal(calls, 0);
  assert.deepEqual(await probeExactVersion({ packageName, version, transport }), { status: "unknown" });
  assert.equal(calls, 1);
  assert.deepEqual(await probeExactVersion({ packageName, version, timeoutMs: 10, transport: () => new Promise(() => {}) }), { status: "unknown" });
  const requests = [];
  const oversized = response(200, { name: packageName, version, extra: "x".repeat(65 * 1024) });
  assert.deepEqual(await probeExactVersion({ packageName, version, transport: fakeTransport(oversized, response(404), requests) }), { status: "unknown" });
  assert.equal(requests.length, 1);
});

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
    const verified = validateRegistryReadback({ metadata: { name: "@eff3ct/agent-foundry", version: "0.1.0" }, registryIdentity: registry, expected });
    assert.equal(verified.status, "verified");
    assert.throws(() => validateRegistryReadback({ metadata: { name: "@eff3ct/agent-foundry", version: "0.1.0" }, registryIdentity: { ...registry, release: { ...registry.release, sha: "b".repeat(40) } }, expected }), /registry release SHA/u);
    assert.throws(() => validateRegistryReadback({ metadata: { name: "@eff3ct/agent-foundry", version: "0.1.0" }, registryIdentity: { ...registry, release: undefined }, expected }), /registry release SHA/u);
    assert.throws(() => validateRegistryReadback({ metadata: { name: "@eff3ct/agent-foundry", version: "0.1.0" }, registryIdentity: { ...registry, tarball_digest: "sha256:" + "0".repeat(64) }, expected }), /tarball identity/u);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")).name, "@eff3ct/agent-foundry");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

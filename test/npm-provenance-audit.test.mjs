import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditPublishedProvenance, auditPublishedProvenanceWithFixtures } from "../scripts/npm-provenance-audit.mjs";

const name = "@eff3ct/agent-foundry";
const registry = "https://registry.npmjs.org/";
const repo = "https://github.com/eff3ct0/agent-foundry";
const ref = "refs/tags/v0.1.0";
const workflow = ".github/workflows/npm-release.yml";
const identity = `${repo}/${workflow}@${ref}`;
const tarball = Buffer.from("offline raw registry bytes");
const digest = (algorithm, bytes, encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);
const integrity = `sha512-${digest("sha512", tarball, "base64")}`;
const tarballUrl = `${registry}@eff3ct/agent-foundry/-/agent-foundry-0.1.0.tgz`;
const versionUrl = `${registry}@eff3ct%2fagent-foundry/0.1.0`;
const location = "node_modules/@eff3ct/agent-foundry";
const expected = { packageName: name, version: "0.1.0", registry, repository: repo, ref,
  commit: "a".repeat(40), location, workflowIdentity: identity,
  sha256: `sha256:${digest("sha256", tarball)}` };

const certificate = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "audit-fixture-cert-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-batch",
      "-subj", "/CN=offline-test", "-addext", `subjectAltName=URI:${identity}`,
      "-days", "1", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")], { stdio: "ignore" });
    execFileSync("openssl", ["x509", "-in", path.join(dir, "cert.pem"), "-outform", "DER", "-out", path.join(dir, "cert.der")]);
    return readFileSync(path.join(dir, "cert.der")).toString("base64");
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
  subject: [{ name: "pkg:npm/%40eff3ct/agent-foundry@0.1.0", digest: { sha512: digest("sha512", tarball) } }],
  predicate: { buildDefinition: { buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
    externalParameters: { workflow: { repository: repo, ref, path: workflow } },
    resolvedDependencies: [{ uri: `git+${repo}@${ref}`, digest: { gitCommit: expected.commit } }] },
  runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } } } };
const auditFixture = () => ({ invalid: [], missing: [], verified: [{ name, version: "0.1.0", registry, location,
  attestationBundles: [{ predicateType: statement.predicateType, bundle: {
    dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      signatures: [{ sig: "offline fixture, NOT verified" }] },
    verificationMaterial: { certificate: { rawBytes: certificate() } },
  } }] }] });

const fixture = (t, change = () => {}) => {
  const cliRoot = mkdtempSync(path.join(os.tmpdir(), "audit-fixture-npm-"));
  t.after(() => rmSync(cliRoot, { recursive: true, force: true }));
  const npmCli = path.join(cliRoot, "bin", "npm-cli.js");
  mkdirSync(path.dirname(npmCli));
  // The fake CLI is never executed: every fixture injects run and fetcher.
  writeFileSync(npmCli, "");
  writeFileSync(path.join(cliRoot, "package.json"), JSON.stringify({ name: "npm", version: "11.19.1" }));
  const metadata = { name, version: "0.1.0", dist: { integrity, tarball: tarballUrl } };
  const lock = { packages: { "": { dependencies: { [name]: "0.1.0" } },
    [location]: { version: "0.1.0", resolved: tarballUrl, integrity } } };
  const installed = { name, version: "0.1.0" };
  const audit = auditFixture();
  const outputs = [{ code: 0, stdout: "11.19.1\n" }, { code: 0, stdout: "installed" },
    { code: 0, stdout: JSON.stringify(audit) }];
  let requests = 0;
  const calls = [];
  const run = async (args, root) => {
    calls.push(args);
    if (calls.length === 2) {
      await mkdir(path.join(root, location), { recursive: true });
      await writeFile(path.join(root, location, "package.json"), JSON.stringify(installed));
      await writeFile(path.join(root, "package-lock.json"), JSON.stringify(lock));
    }
    return outputs.shift();
  };
  const fetcher = async (url, options) => {
    requests++;
    assert.equal(options.redirect, "manual");
    const bytes = url === versionUrl ? Buffer.from(JSON.stringify(metadata)) : tarball;
    const response = new Response(bytes, { status: 200 });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  const state = { metadata, lock, installed, audit, outputs, run, fetcher, calls,
    get requests() { return requests; }, expected: { ...expected }, npmCli };
  change(state);
  return state;
};
const execute = (f) => auditPublishedProvenanceWithFixtures(f);

test("offline subprocess/HTTP boundary requires isolated install, independent bytes and audit", async (t) => {
  const f = fixture(t);
  const result = await execute(f);
  assert.equal(result.status, "policy_matched");
  assert.equal(result.source_commit, expected.commit);
  assert.equal(result.registry_integrity, integrity);
  assert.equal(f.requests, 2);
  assert.deepEqual(f.calls.map((args) => args[0]), ["--version", "install", "audit"]);
  assert.ok(f.calls[1].includes("--ignore-scripts"));
  assert.ok(f.calls[2].includes("--include-attestations"));
});

test("rejects invalid CLI metadata or path before injected subprocess and HTTP calls", async (t) => {
  for (const change of [
    (f) => writeFileSync(path.join(path.dirname(f.npmCli), "../package.json"),
      JSON.stringify({ name: "npm", version: "10.9.8" })),
    (f) => { f.npmCli = path.join(path.dirname(f.npmCli), "missing-cli.js"); },
  ]) {
    const f = fixture(t, change);
    await assert.rejects(execute(f), /could not establish trusted evidence/u);
    assert.deepEqual(f.calls, []);
    assert.equal(f.requests, 0);
  }
});

test("rejects failed, wrong-version, malformed, ambiguous and forged audit results", async (t) => {
  const changes = [
    (f) => { f.outputs[0].stdout = "11.19.2"; },
    (f) => { f.outputs[0].code = 1; },
    (f) => { f.outputs[1].code = 1; },
    (f) => { f.outputs[2].code = 1; },
    (f) => { f.outputs[2].stdout = "not json"; },
    (f) => { f.outputs[2].stdout = "{}"; },
    (f) => { f.audit.verified.push(f.audit.verified[0]); f.outputs[2].stdout = JSON.stringify(f.audit); },
    (f) => { f.audit.verified[0].location = "node_modules/other"; f.outputs[2].stdout = JSON.stringify(f.audit); },
    (f) => { f.audit.verified[0].attestationBundles = []; f.outputs[2].stdout = JSON.stringify(f.audit); },
    (f) => { f.audit.invalid.push({ name }); f.outputs[2].stdout = JSON.stringify(f.audit); },
    (f) => { f.audit.verified[0].registry = "https://other.example/"; f.outputs[2].stdout = JSON.stringify(f.audit); },
    (f) => { f.expected.commit = "b".repeat(40); },
  ];
  for (const [index, change] of changes.entries()) {
    await assert.rejects(execute(fixture(t, change)), /could not establish trusted evidence/u, `case ${index}`);
  }
});

test("rejects wrong installed dependency, lock identity and registry tarball independently", async (t) => {
  const changes = [
    (f) => { f.installed.version = "0.2.0"; },
    (f) => { f.lock.packages[location].version = "0.2.0"; },
    (f) => { f.lock.packages[""].dependencies[name] = "*"; },
    (f) => { f.lock.packages[location].resolved = "https://other.example/forged.tgz"; },
    (f) => { f.lock.packages[location].integrity = "sha512-forged"; },
    (f) => { f.metadata.version = "0.2.0"; },
    (f) => { f.metadata.dist.tarball = "https://other.example/forged.tgz"; },
    (f) => { f.metadata.dist.integrity = "sha512-forged"; },
    (f) => { f.expected.sha256 = `sha256:${"b".repeat(64)}`; },
    (f) => { const get = f.fetcher; f.fetcher = async (url, options) => {
      if (url !== tarballUrl) return get(url, options);
      const response = new Response("corrupt raw registry tarball");
      Object.defineProperty(response, "url", { value: url });
      return response;
    }; },
    (f) => { f.fetcher = async (url) => {
      const response = new Response(Buffer.alloc(32 * 1024 * 1024 + 1));
      Object.defineProperty(response, "url", { value: url });
      return response;
    }; },
    (f) => { f.fetcher = async () => new Response(null, { status: 302, headers: { location: tarballUrl } }); },
    (f) => { f.fetcher = async () => new Response(Buffer.from("untrusted response URL")); },
    (f) => { f.fetcher = async () => { throw new DOMException("deadline expired", "TimeoutError"); }; },
    (f) => { f.fetcher = async () => { throw new Error("offline transport failure"); }; },
  ];
  for (const [index, change] of changes.entries()) {
    await assert.rejects(execute(fixture(t, change)), /could not establish trusted evidence/u, `case ${index}`);
  }
});

test("production entrypoint rejects malformed release identity before accepting injected evidence", async (t) => {
  let called = false;
  const forged = { ...fixture(t), expected: { ...expected, version: "not a version" }, npmCli: "/missing/npm-cli.js",
    run: async () => { called = true; return { code: 0, stdout: "11.19.1" }; },
    fetcher: async () => { called = true; return new Response("{}"); } };
  await assert.rejects(auditPublishedProvenance(forged), /could not establish trusted evidence/u);
  assert.equal(called, false);
});

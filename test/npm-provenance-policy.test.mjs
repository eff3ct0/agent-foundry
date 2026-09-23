import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateNpmProvenancePolicy } from "../scripts/npm-provenance-policy.mjs";

const repo = "https://github.com/eff3ct0/agent-foundry";
const ref = "refs/tags/v0.1.0";
const identity = `${repo}/.github/workflows/npm-release.yml@${ref}`;
const tarball = Buffer.from("offline registry tarball fixture");
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");
const expected = {
  packageName: "@eff3ct/agent-foundry", version: "0.1.0",
  registry: "https://registry.npmjs.org/", location: "node_modules/@eff3ct/agent-foundry",
  sha256: `sha256:${hash("sha256", tarball)}`, repository: repo, ref,
  commit: "a".repeat(40), workflowIdentity: identity,
};

// A local self-signed certificate tests policy parsing, NOT npm/Sigstore verification.
const certificate = (uri) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "npm-provenance-policy-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-batch",
      "-subj", "/CN=offline-test", "-addext", `subjectAltName=URI:${uri}`,
      "-days", "1", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")],
    { stdio: "ignore" });
    execFileSync("openssl", ["x509", "-in", path.join(dir, "cert.pem"), "-outform", "DER", "-out", path.join(dir, "cert.der")]);
    return readFileSync(path.join(dir, "cert.der")).toString("base64");
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

const cert = certificate(identity);
const otherCert = certificate(`${repo}/.github/workflows/other.yml@${ref}`);
const fixture = () => {
  const statement = {
    _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: "pkg:npm/%40eff3ct/agent-foundry@0.1.0", digest: { sha512: hash("sha512", tarball) } }],
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: { workflow: { repository: repo, ref, path: ".github/workflows/npm-release.yml" } },
        resolvedDependencies: [{ uri: `git+${repo}@${ref}`, digest: { gitCommit: expected.commit } }],
      },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } },
    },
  };
  const bundle = { dsseEnvelope: { payloadType: "application/vnd.in-toto+json",
    payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [{ sig: "offline-only" }] },
  verificationMaterial: { x509CertificateChain: { certificates: [{ rawBytes: cert }] } } };
  return { audit: { invalid: [], missing: [], verified: [{ name: expected.packageName,
    version: expected.version, registry: expected.registry, location: expected.location,
    attestationBundles: [{ predicateType: statement.predicateType, bundle }] }] },
  tarball, expected: { ...expected }, npmVersion: "11.19.1" };
};
const check = (input) => validateNpmProvenancePolicy(input);
const mutateStatement = (input, change) => {
  const envelope = input.audit.verified[0].attestationBundles[0].bundle.dsseEnvelope;
  const statement = JSON.parse(Buffer.from(envelope.payload, "base64"));
  change(statement);
  envelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
};

test("policy matches only explicitly scoped offline fixture; no signature verification", () => {
  const result = check(fixture());
  assert.equal(result.status, "policy_matched");
  assert.equal(result.source_commit, expected.commit);
  assert.equal(result.signer_identity, identity);
});

test("rejects untrusted or ambiguous npm audit evidence", () => {
  const cases = [
    (v) => { v.npmVersion = "11.19.2"; },
    (v) => { v.audit.invalid.push({ code: "EATTESTATIONVERIFY" }); },
    (v) => { v.audit.missing.push({ name: expected.packageName }); },
    (v) => { v.audit.verified = []; },
    (v) => { v.audit.verified.push(structuredClone(v.audit.verified[0])); },
    (v) => { v.audit.verified[0].attestationBundles.push(structuredClone(v.audit.verified[0].attestationBundles[0])); },
    (v) => { v.audit.verified[0].registry = "https://other.example/"; },
    (v) => { v.audit.verified[0].version = "0.2.0"; },
    (v) => { v.audit.verified[0].location = "node_modules/other"; },
    (v) => { v.audit.verified[0].attestationBundles[0].predicateType = "other"; },
    (v) => { v.audit.verified[0].attestationBundles[0].bundle.verificationMaterial = {}; },
    (v) => { v.audit.verified[0].attestationBundles[0].bundle.verificationMaterial.x509CertificateChain.certificates[0].rawBytes = otherCert; },
    (v) => { v.expected.workflowIdentity = `${repo}/.github/workflows/other.yml@${ref}`; },
    (v) => { v.expected.sha256 = `sha256:${"b".repeat(64)}`; },
    (v) => { v.tarball = Buffer.from("different raw download"); },
    (v) => { v.expected.commit = "b".repeat(40); },
    (v) => { v.expected.ref = "refs/heads/main"; },
    (v) => { mutateStatement(v, (s) => { s.subject.push(s.subject[0]); }); },
    (v) => { mutateStatement(v, (s) => { s.subject[0].name = "pkg:npm/other@0.1.0"; }); },
    (v) => { mutateStatement(v, (s) => { s.subject[0].digest.sha512 = "0".repeat(128); }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40); }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.buildDefinition.resolvedDependencies.push(s.predicate.buildDefinition.resolvedDependencies[0]); }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.buildDefinition.resolvedDependencies[0].uri = `git+${repo}@refs/heads/main`; }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = "other.yml"; }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.buildDefinition.buildType = "unsupported"; }); },
    (v) => { mutateStatement(v, (s) => { s.predicate.runDetails.builder.id = "other"; }); },
    (v) => { v.audit.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload = "not base64"; },
  ];
  for (const [index, change] of cases.entries()) {
    const input = fixture();
    change(input);
    assert.throws(() => check(input), /npm provenance policy did not match/u, `case ${index}`);
  }
});

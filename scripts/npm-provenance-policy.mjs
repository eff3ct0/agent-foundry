import { createHash, X509Certificate } from "node:crypto";
import { TextDecoder } from "node:util";

const PACKAGE = "@eff3ct/agent-foundry";
const REGISTRY = "https://registry.npmjs.org/";
const REPOSITORY = "https://github.com/eff3ct0/agent-foundry";
const WORKFLOW = ".github/workflows/npm-release.yml";
const PROVENANCE = "https://slsa.dev/provenance/v1";
const BUILD_TYPE = "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const reject = () => { throw new Error("npm provenance policy did not match"); };
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");

const decode = (value, maxBytes) => {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes * 4 / 3) + 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) reject();
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== value) reject();
  return bytes;
};

// Policy ONLY: the caller must first run pinned npm 11.19.1 audit signatures
// --json --include-attestations successfully against the exact installed registry dependency.
// Neither this function nor a caller-supplied JSON object verifies a signature.
export const validateNpmProvenancePolicy = ({ audit, tarball, expected, npmVersion } = {}) => {
  if (npmVersion !== "11.19.1" || !object(expected) || !Buffer.isBuffer(tarball)
      || !tarball.length || expected.packageName !== PACKAGE || !VERSION.test(expected.version ?? "")
      || expected.registry !== REGISTRY || expected.repository !== REPOSITORY
      || expected.ref !== `refs/tags/v${expected.version}` || !SHA.test(expected.commit ?? "")
      || !SHA256.test(expected.sha256 ?? "")
      || expected.workflowIdentity !== `${REPOSITORY}/${WORKFLOW}@${expected.ref}`
      || expected.location !== "node_modules/@eff3ct/agent-foundry") reject();
  if (!object(audit) || !Array.isArray(audit.invalid) || audit.invalid.length
      || !Array.isArray(audit.missing) || audit.missing.length || !Array.isArray(audit.verified)) reject();
  const matches = audit.verified.filter((entry) => entry?.name === PACKAGE && entry.version === expected.version);
  if (matches.length !== 1) reject();
  const entry = matches[0];
  if (entry.location !== expected.location || entry.registry !== REGISTRY
      || !Array.isArray(entry.attestationBundles) || entry.attestationBundles.length !== 1) reject();
  const attestation = entry.attestationBundles[0];
  if (attestation?.predicateType !== PROVENANCE || !object(attestation.bundle)
      || attestation.bundle.dsseEnvelope?.payloadType !== "application/vnd.in-toto+json"
      || !Array.isArray(attestation.bundle.dsseEnvelope.signatures)
      || attestation.bundle.dsseEnvelope.signatures.length !== 1) reject();
  const payload = decode(attestation.bundle.dsseEnvelope.payload, 64 * 1024);
  let statement;
  let certificate;
  try {
    statement = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
    const certificates = attestation.bundle.verificationMaterial?.x509CertificateChain?.certificates;
    if (!Array.isArray(certificates) || certificates.length !== 1) reject();
    certificate = new X509Certificate(decode(certificates[0]?.rawBytes, 8 * 1024));
  } catch { reject(); }
  const purl = `pkg:npm/%40eff3ct/agent-foundry@${expected.version}`;
  if (!object(statement) || statement._type !== "https://in-toto.io/Statement/v1"
      || statement.predicateType !== PROVENANCE || !Array.isArray(statement.subject)
      || statement.subject.length !== 1 || statement.subject[0]?.name !== purl
      || statement.subject[0]?.digest?.sha512 !== digest("sha512", tarball)
      || `sha256:${digest("sha256", tarball)}` !== expected.sha256) reject();
  const build = statement.predicate?.buildDefinition;
  const workflow = build?.externalParameters?.workflow;
  const deps = build?.resolvedDependencies;
  if (build?.buildType !== BUILD_TYPE || workflow?.repository !== REPOSITORY
      || workflow?.path !== WORKFLOW || workflow?.ref !== expected.ref
      || !Array.isArray(deps) || deps.length !== 1
      || deps[0]?.uri !== `git+${REPOSITORY}@${expected.ref}`
      || deps[0]?.digest?.gitCommit !== expected.commit
      || statement.predicate?.runDetails?.builder?.id !== "https://github.com/actions/runner/github-hosted"
      || certificate.subjectAltName !== `URI:${expected.workflowIdentity}`) reject();
  return {
    status: "policy_matched",
    package: `${PACKAGE}@${expected.version}`,
    tarball_sha256: expected.sha256,
    source_commit: expected.commit,
    statement_sha256: `sha256:${digest("sha256", payload)}`,
    signer_identity: expected.workflowIdentity,
  };
};

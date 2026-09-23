#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "@eff3ct/agent-foundry";
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class NpmReleaseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message = code) => { throw new NpmReleaseError(code, message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const required = (value, name) => {
  if (typeof value !== "string" || !value) fail("identity_malformed", `${name} is absent or malformed`);
  return value;
};
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const validateSourceSha = (value) => {
  const sourceSha = String(value ?? "").trim().toLowerCase();
  if (!SHA.test(sourceSha)) fail("source_identity_mismatch", "source revision must be a full lowercase commit SHA");
  return sourceSha;
};

export const validateVersion = (value) => {
  const version = String(value ?? "").trim();
  if (!VERSION.test(version)) fail("version_malformed", "package version must be an exact semver version");
  return version;
};

export const validateReleaseIdentity = (tag, version, sourceSha) => {
  const releaseTag = required(tag, "release tag");
  version = validateVersion(version);
  sourceSha = validateSourceSha(sourceSha);
  if (releaseTag !== `v${version}`) fail("release_version_mismatch", "release tag must be v<package-version>");
  return { tag: releaseTag, sha: sourceSha };
};

const packageMetadata = (value) => {
  if (!object(value) || value.name !== PACKAGE_NAME || typeof value.version !== "string") {
    fail("package_identity_mismatch", "package metadata does not identify the exact creator package");
  }
  return { name: value.name, version: validateVersion(value.version) };
};

const payloadMetadata = (value, packageIdentity) => {
  if (!object(value) || value.package_name !== packageIdentity.name || value.package_version !== packageIdentity.version
      || typeof value.payload_version !== "string" || !DIGEST.test(value.payload_digest ?? "")) {
    fail("payload_identity_mismatch", "payload manifest does not match the exact package identity");
  }
  return { version: value.payload_version, digest: value.payload_digest };
};

export const readPackageIdentity = async ({ packageRoot, tarballPath, tag, sourceSha }) => {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const packageIdentity = packageMetadata(packageJson);
  const release = validateReleaseIdentity(tag, packageIdentity.version, sourceSha);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "dist", "payload-manifest.json"), "utf8"));
  const payload = payloadMetadata(manifest, packageIdentity);
  const tarball = await readFile(tarballPath);
  return {
    schema_version: 1,
    package: packageIdentity,
    payload,
    tarball_digest: sha256(tarball),
    release,
  };
};

export const validateRegistryMetadata = (metadata, expected) => {
  const identity = packageMetadata(metadata);
  if (identity.name !== expected.package.name || identity.version !== expected.package.version) {
    fail("registry_metadata_mismatch", "npm metadata does not match the published exact package");
  }
  return identity;
};

export const validateRegistryReadback = ({ metadata, registryIdentity, expected }) => {
  validateRegistryMetadata(metadata, expected);
  for (const field of ["name", "version"]) {
    if (registryIdentity.package[field] !== expected.package[field]) fail("registry_identity_mismatch", `registry package ${field} differs from the published package`);
  }
  if (registryIdentity.payload.digest !== expected.payload.digest || registryIdentity.payload.version !== expected.payload.version) {
    fail("registry_payload_mismatch", "registry payload identity differs from the published package");
  }
  if (registryIdentity.tarball_digest !== expected.tarball_digest) fail("registry_tarball_mismatch", "registry tarball identity differs from the published package");
  return { metadata: { name: metadata.name, version: metadata.version }, identity: registryIdentity, status: "verified" };
};

const parseArgs = (values) => {
  const options = {};
  const fields = new Map([["--command", "command"], ["--package-root", "packageRoot"], ["--tarball", "tarballPath"], ["--tag", "tag"], ["--source-sha", "sourceSha"], ["--metadata", "metadataPath"], ["--identity", "identityPath"], ["--output", "outputPath"]]);
  for (let index = 0; index < values.length; index += 2) {
    const key = fields.get(values[index]);
    const value = values[index + 1];
    if (!key || !value || options[key]) fail("invalid_arguments", "invalid npm release arguments");
    options[key] = value;
  }
  return options;
};

export const main = async (values = process.argv.slice(2)) => {
  if (values.length === 1 && values[0] === "--self-check") {
    validateReleaseIdentity("v1.2.3", "1.2.3", "a".repeat(40));
    process.stdout.write("npm release contract self-check OK\n");
    return;
  }
  const options = parseArgs(values);
  if (options.command === "verify-local") {
    const identity = await readPackageIdentity(options);
    await writeFile(options.outputPath, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(identity)}\n`);
    return;
  }
  if (options.command === "verify-registry") {
    const expected = JSON.parse(await readFile(options.identityPath, "utf8"));
    const metadata = JSON.parse(await readFile(options.metadataPath, "utf8"));
    const registryIdentity = await readPackageIdentity({ packageRoot: options.packageRoot, tarballPath: options.tarballPath, tag: expected.release.tag, sourceSha: expected.release.sha });
    const result = validateRegistryReadback({ metadata, registryIdentity, expected });
    await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail("invalid_arguments", "command must be verify-local or verify-registry");
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

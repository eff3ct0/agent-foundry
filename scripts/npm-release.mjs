#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { claimPublishAttempt } from "./release-readback.mjs";
import { createHostedLifecycleReadClient } from "./hosted-lifecycle-read-client.mjs";

const PACKAGE_NAME = "@eff3ct/agent-foundry";
export const INITIALIZER_NAME = "@eff3ct/create-agent-foundry";
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REGISTRY_ORIGIN = "https://registry.npmjs.org";
const PROBE_MAX_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 5000;
const execFile = promisify(execFileCallback);

const RELEASE_ERROR_CODES = new Set([
  "identity_malformed", "source_identity_mismatch", "version_malformed", "release_version_mismatch",
  "package_identity_mismatch", "payload_identity_mismatch", "initializer_dependency_mismatch",
  "registry_metadata_mismatch", "registry_dependency_mismatch", "registry_release_mismatch",
  "registry_identity_mismatch", "registry_payload_mismatch", "registry_tarball_mismatch",
  "pair_identity_mismatch", "probe_inconclusive", "partial_publication_manual_recovery",
  "claim_not_granted", "token_missing", "publish_outcome_uncertain", "registry_read_unavailable",
  "registry_tarball_ambiguous", "pair_source_mismatch", "staged_bytes_changed",
  "release_id_unavailable", "release_outcome_uncertain", "invalid_arguments",
]);
const SYSTEM_ERROR_CODES = new Set([
  "ENOENT", "EACCES", "EPERM", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED",
  "ETIMEDOUT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
]);
const NPM_ERROR_CODES = new Set([
  "E401", "E403", "E404", "E429", "E500", "E502", "E503", "E504", "ENEEDAUTH",
  "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EACCES",
  "EPERM", "ENOENT", "EJSONPARSE", "EINTEGRITY", "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN",
]);
const SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGQUIT"]);

// Rebuild fixed fields at both error construction and persistence; never copy error objects.
const safeDiagnostic = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = { operation: ["view", "pack", "publish"].includes(value.operation) ? value.operation : "unknown" };
  if (Number.isInteger(value.exit_code) && value.exit_code >= 0 && value.exit_code <= 255) result.exit_code = value.exit_code;
  if (SYSTEM_ERROR_CODES.has(value.system_code)) result.system_code = value.system_code;
  if (NPM_ERROR_CODES.has(value.npm_code)) result.npm_code = value.npm_code;
  if (SIGNALS.has(value.signal)) result.signal = value.signal;
  if (typeof value.killed === "boolean") result.killed = value.killed;
  return result;
};

const npmErrorCode = (stderr) => {
  if (typeof stderr !== "string") return undefined;
  const lines = stderr.slice(0, 64 * 1024).matchAll(/(?:^|\n)npm (?:ERR!|error) code ([A-Z0-9_]{1,40})(?=\r?\n|$)/gu);
  for (const [, code] of lines) if (NPM_ERROR_CODES.has(code)) return code;
  return undefined;
};

export class NpmReleaseError extends Error {
  constructor(code, message, diagnostic) {
    super(message);
    this.code = code;
    const safe = safeDiagnostic(diagnostic);
    if (safe) this.diagnostic = safe;
  }
}

const safeReleaseCode = (error) => error instanceof NpmReleaseError && RELEASE_ERROR_CODES.has(error.code)
  ? error.code : "release_outcome_uncertain";
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

const packageMetadata = (value, name = PACKAGE_NAME) => {
  if (!object(value) || value.name !== name || typeof value.version !== "string") {
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

export const readPackageIdentity = async ({ packageRoot, tarballPath, tag, sourceSha, packageName = PACKAGE_NAME }) => {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const packageIdentity = packageMetadata(packageJson, packageName);
  const release = validateReleaseIdentity(tag, packageIdentity.version, sourceSha);
  const payload = packageName === PACKAGE_NAME
    ? payloadMetadata(JSON.parse(await readFile(path.join(packageRoot, "dist", "payload-manifest.json"), "utf8")), packageIdentity)
    : undefined;
  if (packageName === INITIALIZER_NAME && (!object(packageJson.dependencies)
    || packageJson.dependencies[PACKAGE_NAME] !== packageIdentity.version
    || !object(packageJson.bin) || packageJson.bin["create-agent-foundry"] !== "bin/create-agent-foundry.cjs")) {
    fail("initializer_dependency_mismatch", "initializer must depend on the exact creator version and expose its bin");
  }
  if (packageName === INITIALIZER_NAME) await readFile(path.join(packageRoot, "bin", "create-agent-foundry.cjs"));
  if (packageName !== PACKAGE_NAME && packageName !== INITIALIZER_NAME) fail("package_identity_mismatch");
  const tarball = await readFile(tarballPath);
  return {
    schema_version: 1,
    package: packageIdentity,
    ...(payload ? { payload } : { dependency: { [PACKAGE_NAME]: packageIdentity.version } }),
    tarball_digest: sha256(tarball),
    release,
  };
};

export const validateRegistryMetadata = (metadata, expected) => {
  const identity = packageMetadata(metadata, expected.package.name);
  if (identity.name !== expected.package.name || identity.version !== expected.package.version) {
    fail("registry_metadata_mismatch", "npm metadata does not match the published exact package");
  }
  if (expected.package.name === INITIALIZER_NAME && metadata.dependencies?.[PACKAGE_NAME] !== expected.package.version) {
    fail("registry_dependency_mismatch", "npm metadata initializer dependency differs from the exact creator version");
  }
  return identity;
};

export const validateRegistryReadback = ({ metadata, registryIdentity, expected }) => {
  validateRegistryMetadata(metadata, expected);
  if (registryIdentity.release?.sha !== expected.release.sha) fail("registry_release_mismatch", "registry release SHA differs from the published source revision");
  for (const field of ["name", "version"]) {
    if (registryIdentity.package[field] !== expected.package[field]) fail("registry_identity_mismatch", `registry package ${field} differs from the published package`);
  }
  if (expected.package.name === PACKAGE_NAME) {
    if (registryIdentity.payload?.digest !== expected.payload.digest || registryIdentity.payload?.version !== expected.payload.version) {
      fail("registry_payload_mismatch", "registry payload identity differs from the published package");
    }
  } else if (registryIdentity.dependency?.[PACKAGE_NAME] !== expected.package.version) {
    fail("registry_dependency_mismatch", "registry initializer dependency differs from the exact creator version");
  }
  if (registryIdentity.tarball_digest !== expected.tarball_digest) fail("registry_tarball_mismatch", "registry tarball identity differs from the published package");
  return { metadata: { name: metadata.name, version: metadata.version }, identity: registryIdentity, status: "verified" };
};

// Observation only: absence is not an exclusive publish-attempt claim.
export const probeExactVersion = async ({ packageName, version, transport, timeoutMs = PROBE_TIMEOUT_MS } = {}) => {
  if (![PACKAGE_NAME, INITIALIZER_NAME].includes(packageName) || typeof version !== "string" || !VERSION.test(version)
      || typeof transport !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PROBE_TIMEOUT_MS) {
    return { status: "unknown" };
  }
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ status: "unknown" }); }, timeoutMs);
  });
  const read = async (url) => {
    const response = await transport({ url, signal: controller.signal, headers: { Accept: "application/json" }, redirect: "error" });
    if (!response || !Number.isInteger(response.status) || response.url && response.url !== url) throw new Error("invalid registry response");
    if (response.status === 404) return { status: 404 };
    if (response.status !== 200 || !response.body || typeof response.body.getReader !== "function") throw new Error("registry response unavailable");
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array) || (length += value.byteLength) > PROBE_MAX_BYTES) throw new Error("registry response oversized");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return { status: 200, data: JSON.parse(Buffer.concat(chunks, length).toString("utf8")) };
  };
  const observe = async () => {
    const packageUrl = `${REGISTRY_ORIGIN}/${packageName.replace("/", "%2f")}`;
    const exact = await read(`${packageUrl}/${encodeURIComponent(version)}`);
    const document = await read(packageUrl);
    if (document.status === 404) return { status: exact.status === 404 ? "absent" : "unknown" };
    if (!object(document.data) || document.data.name !== packageName || !object(document.data.versions)) return { status: "unknown" };
    const hasVersion = Object.hasOwn(document.data.versions, version);
    const entry = document.data.versions[version];
    if (exact.status === 404) return { status: hasVersion ? "unknown" : "absent" };
    if (!object(exact.data) || exact.data.name !== packageName || exact.data.version !== version
        || !object(entry) || entry.name !== packageName || entry.version !== version) return { status: "unknown" };
    return { status: "present" };
  };
  try {
    return await Promise.race([observe().catch(() => ({ status: "unknown" })), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
};

// A publish acceptance cannot be rolled back. Never resume a partially published pair automatically.
export const releasePair = async ({ identities, probe, claim, publish, readback, record }) => {
  if (!Array.isArray(identities) || identities.length !== 2
    || identities[0]?.package?.name !== PACKAGE_NAME || identities[1]?.package?.name !== INITIALIZER_NAME
    || identities.some((item) => item.release?.sha !== identities[0].release.sha
      || item.release?.tag !== identities[0].release.tag || item.package.version !== identities[0].package.version
      || !DIGEST.test(item.tarball_digest))
    || identities[1].dependency?.[PACKAGE_NAME] !== identities[0].package.version) fail("pair_identity_mismatch");
  await record("staged");
  const states = [];
  for (const identity of identities) {
    const result = await probe(identity);
    states.push(result.status);
    await record(`probe_${identity.package.name === PACKAGE_NAME ? "creator" : "initializer"}_${result.status}`);
    if (!["absent", "present"].includes(result.status)) fail("probe_inconclusive");
  }
  if (states.includes("present")) {
    for (let index = 0; index < 2; index += 1) {
      if (states[index] === "present") {
        await readback(identities[index]);
        await record(`verified_${index}`);
      }
    }
    if (states.includes("absent")) fail("partial_publication_manual_recovery");
    return "verified_existing_pair";
  }
  const result = await claim(identities);
  await record(result.status === "claimed" ? "claim_verified" : "claim_blocked");
  if (result.status !== "claimed") fail("claim_not_granted");
  for (let index = 0; index < 2; index += 1) {
    await record(`publish_${index}_started`);
    await publish(identities[index]);
    await record(`publish_${index}_returned`);
    await readback(identities[index]);
    await record(`verified_${index}`);
  }
  return "verified_new_pair";
};

export const npmCommand = async (args, cwd, publish = false, { execute = execFile } = {}) => {
  const { NODE_AUTH_TOKEN, ...anonymous } = process.env;
  if (publish && !NODE_AUTH_TOKEN) fail("token_missing");
  try {
    return (await execute("npm", args, { cwd, env: publish ? process.env : anonymous, timeout: 30000, maxBuffer: 64 * 1024 })).stdout;
  } catch (error) {
    const code = publish ? "publish_outcome_uncertain" : "registry_read_unavailable";
    throw new NpmReleaseError(code, code, {
      operation: args[0], exit_code: error?.code, system_code: error?.code,
      npm_code: npmErrorCode(error?.stderr), signal: error?.signal, killed: error?.killed,
    });
  }
};

export const registryReadback = async (identity, root, paths, { npm = npmCommand, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) => {
  const spec = `${identity.package.name}@${identity.package.version}`;
  const directory = path.join(root, "registry-package", identity.package.name === PACKAGE_NAME ? "creator" : "initializer");
  let metadata;
  let tarball;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      metadata = JSON.parse(await npm(["view", spec, "--json"], root));
      await mkdir(directory, { recursive: true });
      await npm(["pack", spec, "--ignore-scripts", "--pack-destination", directory], root);
      const files = (await readdir(directory)).filter((name) => name.endsWith(".tgz"));
      if (files.length !== 1) fail("registry_tarball_ambiguous");
      tarball = path.join(directory, files[0]);
      break;
    } catch (error) {
      if (error?.code !== "registry_read_unavailable" || attempt === 5) throw error;
      await wait(attempt * 5000);
    }
  }
  const extracted = path.join(directory, "extracted");
  await mkdir(extracted, { recursive: true });
  await execFile("tar", ["-xzf", tarball, "--strip-components=1", "-C", extracted], { timeout: 30000, maxBuffer: 4096 });
  const registryIdentity = await readPackageIdentity({ packageRoot: extracted, tarballPath: tarball,
    tag: identity.release.tag, sourceSha: identity.release.sha, packageName: identity.package.name });
  const verified = validateRegistryReadback({ metadata, registryIdentity, expected: identity });
  await writeFile(path.join(paths, `registry-${identity.package.name === PACKAGE_NAME ? "creator" : "initializer"}.json`), `${JSON.stringify(verified, null, 2)}\n`);
};

export const publishPair = async (root = process.cwd(), { probe, claim, publish, readback } = {}) => {
  const evidence = path.join(root, "identity");
  const identities = await Promise.all(["local", "initializer"].map(async (name) => JSON.parse(await readFile(path.join(evidence, `${name}.json`), "utf8"))));
  const [creator, initializer] = identities;
  const tag = process.env.RELEASE_TAG;
  const sha = process.env.RELEASE_SHA;
  if (identities.some((item) => item.release?.tag !== tag || item.release?.sha !== sha)) fail("pair_source_mismatch");
  const runId = process.env.RUN_ID;
  const repository = process.env.REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const version = creator.package.version;
  validateReleaseIdentity(tag, version, sha);
  if (version !== process.env.VERSION || !process.env.TARBALL?.startsWith("./package/")
    || !process.env.INITIALIZER_TARBALL?.startsWith("./package/")) fail("pair_source_mismatch");
  for (const [index, packageRoot, tarballPath, packageName] of [
    [0, "local-package", process.env.TARBALL, PACKAGE_NAME],
    [1, "local-initializer", process.env.INITIALIZER_TARBALL, INITIALIZER_NAME],
  ]) {
    const fresh = await readPackageIdentity({ packageRoot: path.join(root, packageRoot), tarballPath: path.join(root, tarballPath), tag, sourceSha: sha, packageName });
    if (JSON.stringify(fresh) !== JSON.stringify(identities[index])) fail("staged_bytes_changed");
  }
  let phase = "preflight";
  const record = async (next, failure) => {
    phase = next;
    await writeFile(path.join(evidence, "pair-state.json"), `${JSON.stringify({ tag, sha, version, packages: identities.map((item) => ({ ...item.package, tarball_digest: item.tarball_digest })), phase,
      ...(failure ? { diagnostic: { code: safeReleaseCode(failure), ...safeDiagnostic(failure.diagnostic) } } : {}),
    }, null, 2)}\n`);
  };
  try {
    const result = await releasePair({ identities,
      record,
      probe: probe ?? ((identity) => probeExactVersion({ packageName: identity.package.name, version,
        transport: (options) => fetch(options.url, { signal: options.signal, headers: options.headers, redirect: options.redirect }) })),
      claim: claim ?? (async () => {
        if (!process.env.NODE_AUTH_TOKEN) fail("token_missing");
        let releaseId = Number(process.env.RELEASE_ID);
        if (!Number.isSafeInteger(releaseId) || releaseId <= 0) {
          const client = createHostedLifecycleReadClient({ token, transport: ({ url, headers, signal }) => fetch(url, { headers, signal }) });
          const result = await client.get(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
          if (result.status !== "ok" || !Number.isSafeInteger(result.payload?.id)) fail("release_id_unavailable");
          releaseId = result.payload.id;
        }
        return claimPublishAttempt({ repository, releaseId, tag, sourceSha: sha, packageName: PACKAGE_NAME, version, runId,
          pair: identities.map((item) => ({ name: item.package.name, version, tarball_digest: item.tarball_digest })),
          transport: (options) => fetch(options.url, { method: options.method, headers: { ...options.headers, Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }, body: options.body, redirect: options.redirect, signal: options.signal }),
          downloadTransport: (options) => fetch(options.url, { method: options.method, headers: options.headers, redirect: options.redirect, credentials: "omit", signal: options.signal }),
        });
      }),
      publish: publish ?? ((identity) => npmCommand(["publish", identity.package.name === PACKAGE_NAME ? process.env.TARBALL : process.env.INITIALIZER_TARBALL,
        "--provenance", "--access", "public"], root, true)),
      readback: readback ?? ((identity) => registryReadback(identity, root, evidence)),
    });
    await record(result);
  } catch (error) {
    const code = safeReleaseCode(error);
    const failure = new NpmReleaseError(code, code, error instanceof NpmReleaseError ? error.diagnostic : undefined);
    await record(`stopped_after_${phase}`, failure);
    throw failure;
  }
};

const parseArgs = (values) => {
  const options = {};
  const fields = new Map([["--command", "command"], ["--package-name", "packageName"], ["--package-root", "packageRoot"], ["--tarball", "tarballPath"], ["--tag", "tag"], ["--source-sha", "sourceSha"], ["--metadata", "metadataPath"], ["--identity", "identityPath"], ["--output", "outputPath"]]);
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
    const registryIdentity = await readPackageIdentity({ packageRoot: options.packageRoot, tarballPath: options.tarballPath, tag: expected.release.tag, sourceSha: expected.release.sha, packageName: expected.package.name });
    const result = validateRegistryReadback({ metadata, registryIdentity, expected });
    await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (options.command === "publish-pair") {
    await publishPair();
    return;
  }
  fail("invalid_arguments", "command must be verify-local or verify-registry");
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${safeReleaseCode(error)}\n`);
    process.exitCode = 1;
  });
}

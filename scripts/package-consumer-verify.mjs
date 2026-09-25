import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { allowlistedEnvironment } from "./installed-runner.mjs";
import { consumerArtifactIdentity } from "./typed-runtime/artifact-identity.js";
import { sanitizeEvidenceText } from "./local-matrix.mjs";

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const CONSUMERS = ["pnpm-dlx", "npx"];

export class PackageConsumerVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message = code) => { throw new PackageConsumerVerificationError(code, message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value, name) => {
  if (typeof value !== "string" || !value) fail("invalid_arguments", `${name} is absent or malformed`);
  return value;
};
const exactPackage = (value) => {
  if (!PACKAGE_NAME.test(value)) fail("invalid_arguments", "package name is not an exact package identifier");
  return value;
};
const exactVersion = (value) => {
  if (!VERSION.test(value)) fail("invalid_arguments", "package version must be an exact semver version");
  return value;
};
const packageSpec = (name, version) => `${name}@${version}`;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
const outputText = (result) => `${result?.stdout ?? ""}${result?.stderr ?? ""}`;
const commandLine = (name, args) => [name, ...args].join(" ");
const registryFailure = (value) => /(?:E404|ENEEDAUTH|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|ECONN|not in the registry|not found|registry|network|offline)/iu.test(value);

export const deterministicConfiguration = Object.freeze({
  values: Object.freeze({
    CI_STACKS: "typescript",
    CODE_INTELLIGENCE: "none",
    PROJECT_NAME: "package consumer verification",
    SECRETS_PROVIDER: "none",
    TASK_TRACKER: "github-issues",
  }),
});

const validateConfiguration = (value) => {
  if (!object(value) || !object(value.values) || Object.keys(value).some((key) => key !== "values")
      || Object.keys(value.values).some((key) => typeof key !== "string" || typeof value.values[key] !== "string")) {
    fail("invalid_configuration", "deterministic configuration is absent or malformed");
  }
  return value;
};

const validateRelease = (value) => {
  if (value === undefined) return undefined;
  if (!object(value) || value.status !== "verified" || typeof value.tag !== "string" || !value.tag || !SHA.test(value.sha ?? "")) {
    fail("invalid_release_identity", "release identity must be a verified tag and full commit SHA");
  }
  return { status: "verified", tag: value.tag, sha: value.sha };
};

const validateTarball = async (file) => {
  const resolved = path.resolve(text(file, "tarball path"));
  if (!resolved.endsWith(".tgz")) fail("invalid_tarball", "tarball must have a .tgz extension");
  const entry = await lstat(resolved).catch(() => undefined);
  if (!entry?.isFile()) fail("invalid_tarball", "tarball is absent or not a regular file");
  return resolved;
};

const execute = async (name, args, options) => execFileAsync(name, args, options);

const run = async ({ name, args, cwd, environment, executeCommand }) => {
  try {
    const result = await executeCommand(name, args, { cwd, env: environment });
    return { ok: true, stdout: result?.stdout ?? "", stderr: result?.stderr ?? "", command: commandLine(name, args) };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? "",
      command: commandLine(name, args),
      error: sanitizeEvidenceText(outputText(error) || "command failed", 256),
    };
  }
};

const parseEnvelope = (result, expectedStatus, label, requireVerification = true) => {
  if (!result.ok) fail(registryFailure(result.error) ? "registry_unavailable" : "consumer_failed", `${label} failed: ${result.error}`);
  let envelope;
  try { envelope = JSON.parse(result.stdout); } catch { fail("consumer_failed", `${label} did not emit JSON`); }
  if (!object(envelope) || envelope.status !== expectedStatus || requireVerification && envelope.verification !== "verified") {
    fail("consumer_failed", `${label} returned an unverified ${envelope?.status ?? "unknown"} result`);
  }
  return envelope;
};

const packagePathFor = async (installation, name, version) => {
  const packagePath = path.join(installation, "node_modules", name);
  const metadata = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf8").catch(() => "{}"));
  if (metadata.name !== name || metadata.version !== version || !object(metadata.bin)) {
    fail("package_identity_mismatch", "installed package identity does not match the requested exact version");
  }
  const entry = metadata.bin.foundry;
  if (typeof entry !== "string" || !entry || path.isAbsolute(entry) || entry.split(/[\\/]/u).includes("..")) {
    fail("package_identity_mismatch", "installed package CLI entry is unsafe or absent");
  }
  const cliPath = path.join(packagePath, entry);
  if (!(await lstat(cliPath).catch(() => undefined))?.isFile()) fail("package_identity_mismatch", "installed package CLI is absent");
  return { packagePath, cliPath };
};

const installTarball = async ({ tarballPath, directory, packageName, packageVersion, environment, executeCommand }) => {
  const installation = path.join(directory, "install");
  await mkdir(installation, { recursive: true });
  const result = await run({
    name: "npm",
    args: ["install", "--offline", "--ignore-scripts", "--prefix", installation, tarballPath],
    cwd: directory,
    environment,
    executeCommand,
  });
  if (!result.ok) fail("local_package_unavailable", `local package installation failed: ${result.error}`);
  return packagePathFor(installation, packageName, packageVersion);
};

const fetchRegistryTarball = async ({ spec, directory, environment, executeCommand }) => {
  const result = await run({
    name: "npm",
    args: ["pack", "--ignore-scripts", "--pack-destination", directory, spec],
    cwd: directory,
    environment,
    executeCommand,
  });
  if (!result.ok) fail("registry_unavailable", `registry package readback is unavailable: ${result.error}`);
  const tarballs = (await readdir(directory)).filter((entry) => entry.endsWith(".tgz")).sort();
  if (tarballs.length !== 1) fail("registry_unavailable", "registry package readback did not produce exactly one tarball");
  return path.join(directory, tarballs[0]);
};

const createAgentFixture = async (directory) => {
  const bin = path.join(directory, "agent-bin");
  const log = path.join(directory, "agent-startup.txt");
  await mkdir(bin, { recursive: true });
  const quoted = `'${log.replaceAll("'", "'\\''")}'`;
  await writeFile(path.join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${quoted}\n`, "utf8");
  await chmod(path.join(bin, "codex"), 0o755);
  return { bin, log };
};

export const cliInvocation = ({ consumer, spec, cliPath, command, target, configPath, selectedAgent, launchAgent }) => {
  const suffix = [command, "--target", target, "--config", configPath, "--non-interactive"];
  if (selectedAgent) suffix.push("--agent", "codex");
  if (command === "apply" && launchAgent) suffix.push("--launch-agent");
  if (cliPath) return { name: process.execPath, args: [cliPath, ...suffix] };
  if (consumer === "pnpm-dlx") return { name: "pnpm", args: ["dlx", "--package", spec, "foundry", ...suffix] };
  return { name: "npx", args: ["--yes", "--package", spec, "foundry", ...suffix] };
};

const runConsumer = async ({ consumer, spec, tarballPath, localTarballPath, packageName, packageVersion, outputDirectory, configuration, sourceSha, release, environment, executeCommand }) => {
  const directory = path.join(outputDirectory, consumer);
  if ((await readdir(directory).catch(() => [])).length > 0) fail("output_not_fresh", `${consumer} output directory is not empty`);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "project");
  const configPath = path.join(directory, "answers.json");
  await writeJson(configPath, configuration);
  const agent = await createAgentFixture(directory);
  const consumerEnvironment = allowlistedEnvironment({ ...environment, PATH: `${agent.bin}${path.delimiter}${environment.PATH ?? process.env.PATH ?? ""}` });
  let packagePath;
  let cliPath;
  ({ packagePath } = await installTarball({ tarballPath, directory: path.join(directory, "identity"), packageName, packageVersion, environment: consumerEnvironment, executeCommand }));
  if (localTarballPath) ({ cliPath } = await installTarball({ tarballPath: localTarballPath, directory, packageName, packageVersion, environment: consumerEnvironment, executeCommand }));

  const invoke = async (command, launchAgent) => {
    const invocation = cliInvocation({ consumer, spec, cliPath, command, target, configPath, selectedAgent: true, launchAgent });
    const result = await run({ ...invocation, cwd: directory, environment: consumerEnvironment, executeCommand });
    return { result, envelope: parseEnvelope(result, command === "verify" ? "verified" : command === "apply" && launchAgent ? "applied" : command === "apply" ? "noop" : "verified", `${consumer} ${command}`, command !== "verify") };
  };

  const applied = await invoke("apply", true);
  const agentArgs = (await readFile(agent.log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
  if (agentArgs.length !== 2 || agentArgs[0] !== "--cd" || agentArgs[1] !== target) fail("consumer_failed", `${consumer} did not start the selected agent in the generated project`);
  const identity = packagePath ? await consumerArtifactIdentity({ tarballPath, packagePath, projectPath: target, sourceSha, release }) : undefined;
  const verified = await invoke("verify", false);
  const rerun = await invoke("apply", false);
  const rerunIdentity = packagePath ? await consumerArtifactIdentity({ tarballPath, packagePath, projectPath: target, sourceSha, release }) : undefined;
  if (!identity || !rerunIdentity || identity.tree_digest !== rerunIdentity.tree_digest) fail("tree_digest_mismatch", `${consumer} generated-tree digest changed on rerun`);
  return {
    consumer,
    mode: localTarballPath ? "local-tarball" : "registry",
    package_spec: spec,
    status: "passed",
    identity,
    apply: applied.envelope,
    verify: verified.envelope,
    rerun: rerun.envelope,
    generated_tree_digest: identity.tree_digest,
    rerun_tree_digest: rerunIdentity.tree_digest,
    commands: [applied.result.command, verified.result.command, rerun.result.command],
  };
};

const unavailableResult = (error, packageName, packageVersion, sourceSha, release) => ({
  schema_version: 1,
  status: error.code === "registry_unavailable" ? "blocked" : "failed",
  code: error.code,
  package: { name: packageName, version: packageVersion },
  source_sha: sourceSha,
  release: release ?? { status: "unavailable", code: "release_identity_unavailable" },
  reason: sanitizeEvidenceText(error.message, 256),
});

export const verifyPackageConsumers = async ({
  packageName,
  packageVersion,
  tarballPath,
  outputDirectory,
  configuration = deterministicConfiguration,
  sourceSha,
  release,
  consumers = CONSUMERS,
  environment = process.env,
  executeCommand = execute,
} = {}) => {
  packageName = exactPackage(text(packageName, "package name"));
  packageVersion = exactVersion(text(packageVersion, "package version"));
  sourceSha = text(sourceSha, "source SHA").toLowerCase();
  if (!SHA.test(sourceSha)) fail("invalid_source_identity", "source SHA must be a full immutable commit");
  release = validateRelease(release);
  validateConfiguration(configuration);
  if (!Array.isArray(consumers) || consumers.length === 0 || consumers.some((value) => !CONSUMERS.includes(value)) || new Set(consumers).size !== consumers.length) {
    fail("invalid_arguments", "consumers must be a unique subset of pnpm-dlx and npx");
  }
  const output = path.resolve(text(outputDirectory, "output directory"));
  await mkdir(output, { recursive: true });
  const spec = packageSpec(packageName, packageVersion);
  const localTarball = tarballPath ? await validateTarball(tarballPath) : undefined;
  let artifact = localTarball;
  const artifactDirectory = await mkdtemp(path.join(output, "registry-artifact-"));
  try {
    if (!artifact) artifact = await fetchRegistryTarball({ spec, directory: artifactDirectory, environment: allowlistedEnvironment(environment), executeCommand });
    const results = [];
    for (const consumer of consumers) results.push(await runConsumer({ consumer, spec, tarballPath: artifact, localTarballPath: localTarball, packageName, packageVersion, outputDirectory: output, configuration, sourceSha, release, environment, executeCommand }));
    return {
      schema_version: 1,
      status: "passed",
      package: { name: packageName, version: packageVersion },
      source_sha: sourceSha,
      release: release ?? { status: "unavailable", code: "release_identity_unavailable" },
      consumers: results,
    };
  } catch (error) {
    return unavailableResult(error instanceof PackageConsumerVerificationError ? error : new PackageConsumerVerificationError("consumer_failed", "consumer verification failed"), packageName, packageVersion, sourceSha, release);
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
};

const parseArgs = (values) => {
  const options = {};
  const fields = new Map([["--package", "packageName"], ["--version", "packageVersion"], ["--tarball", "tarballPath"], ["--output", "outputDirectory"], ["--source-sha", "sourceSha"], ["--release-file", "releaseFile"]]);
  for (let index = 0; index < values.length; index += 1) {
    const key = fields.get(values[index]);
    const value = values[index + 1];
    if (!key || !value || options[key]) fail("invalid_arguments", "usage: package-consumer-verify --package <name> --version <exact> --source-sha <sha> --output <directory> [--tarball <file>] [--release-file <file>]");
    options[key] = value;
    index += 1;
  }
  if (!["packageName", "packageVersion", "outputDirectory", "sourceSha"].every((key) => options[key])) fail("invalid_arguments", "package, exact version, source SHA, and output directory are required");
  return options;
};

export const main = async (values = process.argv.slice(2), read = readFile) => {
  try {
    const options = parseArgs(values);
    const release = options.releaseFile ? JSON.parse(await read(path.resolve(options.releaseFile), "utf8")) : undefined;
    const trustedRelease = release?.status === "ok" ? release.release : undefined;
    const result = await verifyPackageConsumers({ ...options, release: trustedRelease });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "passed") process.exitCode = 2;
    return result;
  } catch (error) {
    const result = unavailableResult(error instanceof PackageConsumerVerificationError ? error : new PackageConsumerVerificationError("invalid_arguments", "invalid verifier configuration"), "", "", "", undefined);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 2;
    return result;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

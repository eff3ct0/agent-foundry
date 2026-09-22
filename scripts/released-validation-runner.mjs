import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { allowlistedEnvironment, runInstalledCreator } from "./installed-runner.mjs";
import { captureCommandResult, matrixCaseId, sanitizeEvidenceText } from "./local-matrix.mjs";

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const PACKAGE_NAME = "factory-template-creator";

export class ReleasedValidationRunnerError extends Error {}

const fail = (message) => { throw new ReleasedValidationRunnerError(message); };
const text = (value, name) => {
  if (typeof value !== "string" || !value) fail(`${name} is absent or malformed`);
  return value;
};
const sha = (value) => {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SHA.test(result)) fail("release SHA must be a full immutable commit");
  return result;
};
const command = (name, arguments_, environment, cwd, execute) => execute(name, arguments_, { cwd, env: allowlistedEnvironment(environment) });
const resultText = (result) => typeof result?.stdout === "string" ? result.stdout.trim() : "";

export const verifyReleaseSource = async ({ sourcePath, releaseSha, environment = process.env, execute = execFileAsync }) => {
  const source = path.resolve(text(sourcePath, "release source path"));
  const expected = sha(releaseSha);
  const head = resultText(await command("git", ["rev-parse", "HEAD"], environment, source, execute)).toLowerCase();
  if (head !== expected) fail("release source HEAD does not match the requested SHA");
  if (resultText(await command("git", ["status", "--porcelain"], environment, source, execute))) fail("release source is not immutable");
  return { source_path: source, release_sha: expected };
};

export const buildReleasePackage = async ({ sourcePath, releaseSha, outputDirectory, environment = process.env, execute = execFileAsync }) => {
  const source = await verifyReleaseSource({ sourcePath, releaseSha, environment, execute });
  const output = path.resolve(text(outputDirectory, "release output directory"));
  const packages = path.join(output, "release-package");
  await mkdir(packages, { recursive: true });
  await command("pnpm", ["install", "--frozen-lockfile"], environment, source.source_path, execute);
  await command("pnpm", ["build"], environment, source.source_path, execute);
  await command("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packages], environment, source.source_path, execute);
  const tarballs = (await readdir(packages)).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1) fail("release package build did not produce exactly one tarball");
  return { ...source, tarball_path: path.join(packages, tarballs[0]) };
};

const validateIdentity = (identity) => {
  if (!identity || identity.schema_version !== 1 || identity.package?.name !== PACKAGE_NAME || typeof identity.package.version !== "string"
      || ![identity.tarball_digest, identity.payload_digest, identity.tree_digest].every((value) => DIGEST.test(value ?? ""))) {
    fail("installed release package identity is absent or malformed");
  }
  return {
    schema_version: 1,
    package: { name: identity.package.name, version: identity.package.version },
    tarball_digest: identity.tarball_digest,
    payload_digest: identity.payload_digest,
    tree_digest: identity.tree_digest,
  };
};

const evidencePath = (outputDirectory, id) => {
  const directory = path.resolve(text(outputDirectory, "evidence output directory"), id);
  const root = `${path.resolve(outputDirectory)}${path.sep}`;
  if (!directory.startsWith(root)) fail("evidence output path is unsafe");
  return path.join(directory, "release-evidence.json");
};

export const runReleasedValidationCase = async ({ releasePackage, matrixCase, configuration, outputDirectory, environment = process.env, runCreator = runInstalledCreator }) => {
  if (!releasePackage || typeof runCreator !== "function" || !configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    fail("released validation configuration is absent or malformed");
  }
  const id = matrixCaseId(matrixCase);
  const releaseSha = sha(releasePackage.release_sha);
  const targetPath = path.join(path.resolve(outputDirectory), id, "project");
  const configPath = path.join(path.resolve(outputDirectory), id, "answers.json");
  const commandResult = { name: "installed factory-template apply", command: "factory-template apply --non-interactive", status: "failed", exit_code: null, output: "" };
  const evidence = { schema_version: 1, release_sha: releaseSha, matrix_case: id, command_results: [commandResult] };
  try {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(configuration), "utf8");
    const result = await runCreator({ tarballPath: text(releasePackage.tarball_path, "release tarball path"), targetPath, configPath, environment: allowlistedEnvironment(environment) });
    evidence.identity = validateIdentity(result?.identity);
    if (result?.creator?.status !== "applied" || result.creator.verification !== "verified") fail("installed creator did not verify the release package");
    commandResult.status = "passed";
    commandResult.exit_code = 0;
    commandResult.output = "creator applied and verified";
  } catch (error) {
    evidence.failure = sanitizeEvidenceText(error instanceof Error ? error.message : "released validation failed", 256);
    commandResult.output = evidence.failure;
  }
  evidence.command_results = evidence.command_results.map(captureCommandResult);
  const destination = evidencePath(outputDirectory, id);
  await mkdir(path.dirname(destination), { recursive: true });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > 4096) fail("released validation evidence exceeds its size limit");
  await writeFile(destination, serialized, "utf8");
  if (evidence.failure) fail("released validation case failed");
  return evidence;
};

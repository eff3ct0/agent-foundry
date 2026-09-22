import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { packedArtifactIdentity } from "./artifact-identity.mjs";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "factory-template-creator";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ENVIRONMENT_KEYS = ["CI", "HOME", "NO_COLOR", "PATH", "TEMP", "TMP", "TMPDIR"];

export class InstalledRunnerError extends Error {}

const fail = (message) => { throw new InstalledRunnerError(message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value, name) => {
  if (typeof value !== "string" || !value) fail(`${name} is absent or malformed`);
  return value;
};

export const allowlistedEnvironment = (environment = process.env) => Object.fromEntries(
  ENVIRONMENT_KEYS.flatMap((key) => typeof environment[key] === "string" ? [[key, environment[key]]] : []),
);

export const validateTarball = async (tarballPath) => {
  const resolved = path.resolve(text(tarballPath, "tarball path"));
  if (!resolved.endsWith(".tgz")) fail("tarball must have a .tgz extension");
  const metadata = await lstat(resolved).catch(() => fail("tarball is absent"));
  if (!metadata.isFile()) fail("tarball is not a regular file");
  return resolved;
};

const installedPackage = async (installation) => {
  const packagePath = path.join(installation, "node_modules", PACKAGE_NAME);
  const packageJson = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf8"));
  if (!object(packageJson) || packageJson.name !== PACKAGE_NAME || typeof packageJson.version !== "string" || !object(packageJson.bin)) {
    fail("installed package metadata is absent or malformed");
  }
  const entry = packageJson.bin["factory-template"];
  if (typeof entry !== "string" || !entry || path.isAbsolute(entry) || entry.split(/[\\/]/u).includes("..")) {
    fail("installed package CLI is absent or malformed");
  }
  const cliPath = await realpath(path.join(packagePath, entry)).catch(() => fail("installed package CLI is absent"));
  if (!cliPath.startsWith(`${packagePath}${path.sep}`) || !(await lstat(cliPath)).isFile()) fail("installed package CLI is unsafe");
  return { packagePath, cliPath };
};

export const validateCreatorEnvelope = (value, target) => {
  if (!object(value) || value.schema_version !== 1 || value.command !== "apply" || value.status !== "applied" || value.target !== target || !object(value.payload) || typeof value.payload.version !== "string" || !DIGEST.test(value.payload.digest ?? "") || !Array.isArray(value.operations) || !Array.isArray(value.diagnostics) || value.verification !== "verified") {
    fail("creator JSON envelope is absent or malformed");
  }
  return value;
};

export const runInstalledCreator = async ({ tarballPath, targetPath, configPath, environment = process.env }) => {
  const tarball = await validateTarball(tarballPath);
  const target = path.resolve(text(targetPath, "target path"));
  const config = path.resolve(text(configPath, "configuration path"));
  const env = allowlistedEnvironment(environment);
  const installation = await mkdtemp(path.join(os.tmpdir(), "factory-installed-runner-"));
  try {
    await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--prefix", installation, tarball], { env });
    const { packagePath, cliPath } = await installedPackage(installation);
    const result = await execFileAsync(process.execPath, [cliPath, "apply", "--target", target, "--config", config, "--non-interactive"], { env })
      .catch((error) => fail(`installed creator failed: ${String(error.stderr ?? error.message ?? "unknown error")}`));
    let envelope;
    try { envelope = JSON.parse(result.stdout); } catch { fail("installed creator did not emit JSON"); }
    return {
      schema_version: 1,
      identity: await packedArtifactIdentity({ tarballPath: tarball, packagePath, projectPath: target }),
      creator: validateCreatorEnvelope(envelope, target),
    };
  } finally {
    await rm(installation, { recursive: true, force: true });
  }
};

const parseArgs = (arguments_) => {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const key = option === "--tarball" ? "tarballPath" : option === "--target" ? "targetPath" : option === "--config" ? "configPath" : "";
    if (!key || values[key] || !arguments_[index + 1]) fail("usage: installed-runner --tarball <file.tgz> --target <directory> --config <file.json>");
    values[key] = arguments_[index + 1];
  }
  if (Object.keys(values).length !== 3) fail("usage: installed-runner --tarball <file.tgz> --target <directory> --config <file.json>");
  return values;
};

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  runInstalledCreator(parseArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

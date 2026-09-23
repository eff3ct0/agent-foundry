import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const FAULTS = new Set(["corrupt-payload", "corrupt-digest", "partial-write", "unknown-file", "malformed-evidence"]);
const MAX_COMMAND_RESULTS = 8;
const MAX_COMMAND_NAME_CHARS = 96;
const MAX_COMMAND_CHARS = 256;
const MAX_COMMAND_OUTPUT_CHARS = 512;
const MAX_RELEASE_E2E_EVIDENCE_BYTES = 4 * 1024;
const MAX_MATRIX_EVIDENCE_BYTES = 1024 * 1024;

export class LocalMatrixError extends Error {}

export const matrixDimensions = Object.freeze({
  ci: ["rust", "typescript", "python", "go"],
  task: ["custom", "github-issues", "github-projects", "jira", "linear"],
  secrets: ["custom", "doppler", "infisical", "none", "vault"],
  intelligence: ["codegraph", "custom", "none"],
  agent: ["claude-code", "opencode", "codex", "pi"],
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => `sha256:${sha256(Buffer.from(JSON.stringify(value)))}`;
const fail = (message) => { throw new LocalMatrixError(message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value, name) => {
  if (typeof value !== "string" || !value) fail(`${name} is absent or malformed`);
  return value;
};
const json = async (file, name) => {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { fail(`${name} is absent or malformed`); }
};

export const sanitizeEvidenceText = (value, limit = MAX_COMMAND_OUTPUT_CHARS) => String(value ?? "")
  .replaceAll("\0", "")
  .replace(/\b([A-Z_][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY|CREDENTIAL)[A-Z0-9_]*)\s*=\s*[^\s,]+/giu, "$1=<redacted>")
  .replace(/(authorization|bearer|token|password|secret|api[_-]?key|credential)\s*[:=]\s*[^\s,]+/giu, "$1=<redacted>")
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)\b/gu, "<redacted>")
  .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/gu, "https://<redacted>@")
  .replace(/(?:\/tmp|\/var\/tmp|\/private\/tmp|\/home\/[^\s:]+|\/Users\/[^\s:]+|[A-Za-z]:\\[^\s:]+)[^\s,;)]*/gu, "<private-path>")
  .replace(/\s+/gu, " ").trim().slice(0, limit);

const boundedText = (value, limit, name) => {
  if (typeof value !== "string" || !value.trim()) fail(`${name} is absent or malformed`);
  return sanitizeEvidenceText(value, limit);
};

export const captureCommandResult = (value) => {
  if (!object(value) || !["passed", "failed"].includes(value.status) || !Number.isInteger(value.exit_code) && value.exit_code !== null) {
    fail("command result is absent or malformed");
  }
  if (value.exit_code !== null && (value.exit_code < -255 || value.exit_code > 255)) fail("command result exit code is malformed");
  return {
    name: boundedText(value.name, MAX_COMMAND_NAME_CHARS, "command result name"),
    command: boundedText(value.command, MAX_COMMAND_CHARS, "command result command"),
    status: value.status,
    exit_code: value.exit_code,
    output: sanitizeEvidenceText(value.output, MAX_COMMAND_OUTPUT_CHARS),
  };
};

const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

const validateReleaseE2eEvidence = (value, matrixCase) => {
  if (value === undefined) return undefined;
  if (!object(value) || value.schema_version !== 1 || !Array.isArray(value.command_results) || value.command_results.length > MAX_COMMAND_RESULTS) {
    fail(`runner returned malformed release E2E evidence for ${matrixCase.id}`);
  }
  const commandResults = value.command_results.map(captureCommandResult);
  const evidence = { schema_version: 1, command_results: commandResults };
  if (JSON.stringify(value) !== JSON.stringify(evidence) || serializedBytes(evidence) > MAX_RELEASE_E2E_EVIDENCE_BYTES) {
    fail(`runner returned oversized or unsafe release E2E evidence for ${matrixCase.id}`);
  }
  return evidence;
};

export const matrixCaseId = (matrixCase) => {
  if (!object(matrixCase)) fail("matrix case is absent or malformed");
  for (const [dimension, values] of Object.entries(matrixDimensions)) {
    if (!values.includes(matrixCase[dimension])) fail(`matrix case has an unsupported ${dimension} value`);
  }
  return `ci=${matrixCase.ci};task=${matrixCase.task};secrets=${matrixCase.secrets};intelligence=${matrixCase.intelligence};agent=${matrixCase.agent}`;
};

export const enumerateMatrix = () => {
  const cases = [];
  for (const ci of matrixDimensions.ci) {
    for (const task of matrixDimensions.task) {
      for (const secrets of matrixDimensions.secrets) {
        for (const intelligence of matrixDimensions.intelligence) {
          for (const agent of matrixDimensions.agent) {
            const matrixCase = { ci, task, secrets, intelligence, agent };
            cases.push({ id: matrixCaseId(matrixCase), ...matrixCase });
          }
        }
      }
    }
  }
  return cases;
};

export const matrixConfiguration = (matrixCase) => {
  const id = matrixCaseId(matrixCase);
  return {
    values: {
      PROJECT_NAME: `matrix ${id}`,
      TASK_TRACKER: matrixCase.task,
      SECRETS_PROVIDER: matrixCase.secrets,
      CODE_INTELLIGENCE: matrixCase.intelligence,
      CI_STACKS: matrixCase.ci,
    },
  };
};

const manifestFiles = (manifest) => {
  if (!object(manifest) || !Array.isArray(manifest.files) || typeof manifest.payload_version !== "string" || !DIGEST.test(manifest.payload_digest ?? "")) {
    fail("payload manifest is absent or malformed");
  }
  const paths = new Set();
  for (const file of manifest.files) {
    if (!object(file) || typeof file.path !== "string" || !file.path || file.path.startsWith("/") || file.path.includes("..") || !/^[0-7]{4}$/u.test(file.mode ?? "") || !Number.isInteger(file.size) || file.size < 0 || !/^[0-9a-f]{64}$/u.test(file.sha256 ?? "") || paths.has(file.path)) {
      fail("payload manifest contains an invalid file entry");
    }
    paths.add(file.path);
  }
  if (manifest.payload_digest !== digest({ payload_version: manifest.payload_version, files: manifest.files })) fail("payload manifest digest does not match its files");
  return paths;
};

const payloadFiles = async (root, relative = "") => {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => fail("packaged payload is absent"));
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) fail(`packaged payload contains a symlink: ${child}`);
    if (entry.isDirectory()) files.push(...await payloadFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else fail(`packaged payload contains an unsupported entry: ${child}`);
  }
  return files;
};

export const validateLocalArtifact = async (packagePath) => {
  const manifest = await json(path.join(packagePath, "dist", "payload-manifest.json"), "payload manifest");
  const expected = manifestFiles(manifest);
  const payloadRoot = path.join(packagePath, "dist", "payload");
  const actual = new Set(await payloadFiles(payloadRoot));
  if (actual.size !== expected.size || [...actual].some((file) => !expected.has(file))) fail("packaged payload contains an unknown or missing file");
  for (const file of manifest.files) {
    const absolute = path.join(payloadRoot, file.path);
    const metadata = await lstat(absolute).catch(() => fail(`packaged payload file is absent: ${file.path}`));
    const bytes = await readFile(absolute);
    if (!metadata.isFile() || metadata.size !== file.size || (metadata.mode & 0o777).toString(8).padStart(4, "0") !== file.mode || sha256(bytes) !== file.sha256) {
      fail(`packaged payload file does not match the manifest: ${file.path}`);
    }
  }
  return { payload_digest: manifest.payload_digest, payload_version: manifest.payload_version, file_count: manifest.files.length };
};

const validateIdentity = (identity) => {
  if (!object(identity) || identity.schema_version !== 1 || !object(identity.package) || !text(identity.package.name, "package name") || !text(identity.package.version, "package version")) {
    fail("artifact identity is absent or malformed");
  }
  for (const key of ["tarball_digest", "payload_digest", "tree_digest"]) if (!DIGEST.test(identity[key] ?? "")) fail(`artifact identity ${key} is absent or malformed`);
  return identity;
};

const validateResult = (value, matrixCase) => {
  if (!object(value) || !["passed", "failed"].includes(value.status)) fail(`runner returned malformed result for ${matrixCase.id}`);
  if (value.commands !== undefined && (!Array.isArray(value.commands) || value.commands.length > 8 || value.commands.some((command) => typeof command !== "string" || command.length > 256))) {
    fail(`runner returned malformed commands for ${matrixCase.id}`);
  }
  const releaseE2e = validateReleaseE2eEvidence(value.release_e2e, matrixCase);
  return {
    status: value.status,
    commands: (value.commands ?? []).map((command) => sanitizeEvidenceText(command, 256)),
    ...(typeof value.failure === "string" && value.failure ? { failure: sanitizeEvidenceText(value.failure, 256) } : {}),
    ...(releaseE2e ? { release_e2e: releaseE2e } : {}),
  };
};

export const validateMatrixEvidence = (evidence, { allowFailures = false } = {}) => {
  if (!object(evidence) || evidence.schema_version !== 1 || !Array.isArray(evidence.cases)) fail("matrix evidence is absent or malformed");
  if (serializedBytes(evidence) > MAX_MATRIX_EVIDENCE_BYTES) fail("matrix evidence exceeds the serialized size limit");
  validateIdentity(evidence.identity);
  const expected = enumerateMatrix();
  if (evidence.cases.length !== expected.length) fail("matrix evidence does not cover every case");
  let passed = 0;
  let failed = 0;
  for (const [index, matrixCase] of expected.entries()) {
    const record = evidence.cases[index];
    if (!object(record) || record.id !== matrixCase.id || !["passed", "failed"].includes(record.status) || !object(record.configuration) || JSON.stringify(record.configuration) !== JSON.stringify(matrixConfiguration(matrixCase))) {
      fail(`matrix evidence is invalid for ${matrixCase.id}`);
    }
    if (!Array.isArray(record.commands) || record.commands.length > 8 || record.commands.some((command) => typeof command !== "string" || command !== sanitizeEvidenceText(command, 256))) fail(`matrix evidence commands are invalid for ${matrixCase.id}`);
    if (record.status === "failed" && (typeof record.failure !== "string" || !record.failure || record.failure !== sanitizeEvidenceText(record.failure, 256))) fail(`matrix evidence failure is invalid for ${matrixCase.id}`);
    if (record.status === "passed" && record.failure !== undefined) fail(`matrix evidence success has a failure for ${matrixCase.id}`);
    validateReleaseE2eEvidence(record.release_e2e, matrixCase);
    if (record.status === "passed") passed += 1;
    else failed += 1;
  }
  if (evidence.summary?.total !== expected.length || evidence.summary?.passed !== passed || evidence.summary?.failed !== failed || !allowFailures && failed > 0) fail("matrix evidence summary is invalid");
  return evidence;
};

export const runLocalMatrix = async ({ outputDirectory, identity, runCase }) => {
  if (typeof runCase !== "function") fail("local matrix runner is required");
  validateIdentity(identity);
  await mkdir(outputDirectory, { recursive: true });
  const cases = [];
  for (const matrixCase of enumerateMatrix()) {
    const directory = path.join(outputDirectory, matrixCase.id);
    await mkdir(directory, { recursive: true });
    let result;
    try {
      result = validateResult(await runCase({ matrixCase, directory, configuration: matrixConfiguration(matrixCase) }), matrixCase);
    } catch (error) {
      result = { status: "failed", commands: [], failure: sanitizeEvidenceText(error instanceof Error ? error.message : "runner failed", 256) };
    }
    cases.push({
      id: matrixCase.id,
      status: result.status,
      configuration: matrixConfiguration(matrixCase),
      commands: result.commands,
      release_e2e: result.release_e2e ?? { schema_version: 1, command_results: [] },
      ...(result.failure ? { failure: result.failure } : {}),
    });
  }
  const evidence = {
    schema_version: 1,
    identity,
    cases,
    summary: { total: cases.length, passed: cases.filter((entry) => entry.status === "passed").length, failed: cases.filter((entry) => entry.status === "failed").length },
  };
  validateMatrixEvidence(evidence, { allowFailures: true });
  await writeFile(path.join(outputDirectory, "matrix-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (evidence.summary.failed > 0) fail("local matrix contains failed cases");
  return validateMatrixEvidence(evidence);
};

export const installedCreatorRunner = ({ cliPath, environment = process.env }) => async ({ matrixCase, directory, configuration }) => {
  const target = path.join(directory, "project");
  const config = path.join(directory, "answers.json");
  await writeFile(config, JSON.stringify(configuration), "utf8");
  const result = await execFileAsync(process.execPath, [cliPath, "apply", "--target", target, "--config", config, "--agent", matrixCase.agent, "--non-interactive"], { env: environment })
    .then((value) => ({ ...value, status: "passed" })).catch((error) => ({ stdout: error.stdout ?? "", stderr: error.stderr ?? "", status: "failed" }));
  return {
    status: result.status,
    commands: ["foundry apply"],
    release_e2e: {
      schema_version: 1,
      command_results: [captureCommandResult({
        name: "foundry apply",
        command: "foundry apply",
        status: result.status,
        exit_code: result.status === "passed" ? 0 : null,
        output: `${result.stdout}\n${result.stderr}`,
      })],
    },
    ...(result.status === "failed" ? { failure: String(result.stderr) } : {}),
  };
};

export const writeFailureFixture = async ({ root, kind }) => {
  if (!FAULTS.has(kind)) fail("unknown local failure fixture");
  const fixture = path.join(root, kind);
  await rm(fixture, { recursive: true, force: true });
  await mkdir(path.join(fixture, "dist", "payload"), { recursive: true });
  const bytes = Buffer.from("payload\n");
  const files = [{ path: "AGENT.md", mode: "0644", size: bytes.byteLength, sha256: sha256(bytes) }];
  const manifest = { schema_version: 1, package_name: "fixture", package_version: "1.0.0", payload_version: "1.0.0", files, payload_digest: digest({ payload_version: "1.0.0", files }) };
  await writeFile(path.join(fixture, "dist", "payload", "AGENT.md"), bytes);
  await chmod(path.join(fixture, "dist", "payload", "AGENT.md"), 0o644);
  await writeFile(path.join(fixture, "dist", "payload-manifest.json"), JSON.stringify(manifest));
  if (kind === "corrupt-payload") await writeFile(path.join(fixture, "dist", "payload", "AGENT.md"), "corrupt\n");
  if (kind === "corrupt-digest") await writeFile(path.join(fixture, "dist", "payload-manifest.json"), JSON.stringify({ ...manifest, payload_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }));
  if (kind === "unknown-file") await writeFile(path.join(fixture, "dist", "payload", "unexpected.txt"), "unexpected\n");
  if (kind === "partial-write") await writeFile(path.join(fixture, ".factory-staging"), "interrupted\n");
  if (kind === "malformed-evidence") await writeFile(path.join(fixture, "matrix-evidence.json"), "{not json");
  return fixture;
};

export const assertFailureFixture = async ({ fixture, kind, identity }) => {
  if (!FAULTS.has(kind)) fail("unknown local failure fixture");
  if (kind === "partial-write") {
    if (await lstat(path.join(fixture, ".factory-staging")).then(() => true).catch(() => false)) fail("partial project write requires recovery");
    return;
  }
  if (kind === "malformed-evidence") return validateMatrixEvidence(await json(path.join(fixture, "matrix-evidence.json"), "matrix evidence"));
  await validateLocalArtifact(fixture);
  if (identity) validateIdentity(identity);
};

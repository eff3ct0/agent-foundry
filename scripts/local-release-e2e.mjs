import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { allowlistedEnvironment, runInstalledCreator } from "./installed-runner.mjs";
import { captureCommandResult, enumerateMatrix, matrixConfiguration, runLocalMatrix, sanitizeEvidenceText } from "./local-matrix.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = "npm install --offline --ignore-scripts <packed tarball> && factory-template apply --non-interactive";

const fail = (message) => { throw new Error(message); };

const parseArgs = (arguments_) => {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (values.length !== 2 || values[0] !== "--output" || !values[1]) {
    fail("usage: local-release-e2e --output <evidence-directory>");
  }
  return { outputDirectory: path.resolve(values[1]) };
};

export const packLocalArtifact = async ({ environment = process.env } = {}) => {
  const packages = await mkdtemp(path.join(os.tmpdir(), "factory-release-e2e-pack-"));
  try {
    await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packages], {
      cwd: root,
      env: allowlistedEnvironment(environment),
    });
    const tarballs = (await readdir(packages)).filter((entry) => entry.endsWith(".tgz"));
    if (tarballs.length !== 1) fail("pack did not produce exactly one tarball");
    const tarballPath = path.join(packages, tarballs[0]);
    return { tarballPath, cleanup: () => rm(packages, { recursive: true, force: true }) };
  } catch (error) {
    await rm(packages, { recursive: true, force: true });
    throw error;
  }
};

const executeCase = async ({ tarballPath, directory, configuration, runCreator, environment }) => {
  const targetPath = path.join(directory, "project");
  const configPath = path.join(directory, "answers.json");
  await mkdir(directory, { recursive: true });
  await writeFile(configPath, JSON.stringify(configuration), "utf8");
  try {
    const result = await runCreator({ tarballPath, targetPath, configPath, environment });
    return {
      identity: result.identity,
      status: "passed",
      commands: [command],
      release_e2e: {
        schema_version: 1,
        command_results: [captureCommandResult({ name: "installed factory-template apply", command, status: "passed", exit_code: 0, output: "creator applied and verified" })],
      },
    };
  } catch (error) {
    const failure = sanitizeEvidenceText(error instanceof Error ? error.message : "installed creator failed", 256);
    return {
      status: "failed",
      commands: [command],
      failure,
      release_e2e: {
        schema_version: 1,
        command_results: [captureCommandResult({ name: "installed factory-template apply", command, status: "failed", exit_code: null, output: failure })],
      },
    };
  }
};

export const runLocalReleaseE2e = async ({ outputDirectory, tarballPath, runCreator = runInstalledCreator, environment = allowlistedEnvironment() }) => {
  if (typeof outputDirectory !== "string" || !outputDirectory || typeof tarballPath !== "string" || !tarballPath || typeof runCreator !== "function") {
    fail("local release E2E configuration is absent or malformed");
  }
  const firstCase = enumerateMatrix()[0];
  const firstDirectory = path.join(outputDirectory, firstCase.id);
  const first = await executeCase({ tarballPath, directory: firstDirectory, configuration: matrixConfiguration(firstCase), runCreator, environment });
  if (first.status !== "passed" || !first.identity) fail("the first local release E2E case did not produce artifact identity");
  const cached = new Map([[firstCase.id, first]]);
  return runLocalMatrix({
    outputDirectory,
    identity: first.identity,
    runCase: async ({ matrixCase, directory, configuration }) => cached.get(matrixCase.id)
      ?? executeCase({ tarballPath, directory, configuration, runCreator, environment }),
  });
};

const main = async () => {
  const { outputDirectory } = parseArgs(process.argv.slice(2));
  const packed = await packLocalArtifact();
  try {
    await runLocalReleaseE2e({ outputDirectory, tarballPath: packed.tarballPath });
    process.stdout.write(`${outputDirectory}/matrix-evidence.json\n`);
  } finally {
    await packed.cleanup();
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateNpmProvenancePolicy } from "./npm-provenance-policy.mjs";

const PACKAGE = "@eff3ct/agent-foundry";
const REGISTRY = "https://registry.npmjs.org/";
const LOCATION = "node_modules/@eff3ct/agent-foundry";
const MAX_JSON = 1024 * 1024;
const MAX_TARBALL = 32 * 1024 * 1024;
const fail = () => { throw new Error("npm provenance audit could not establish trusted evidence"); };
const hash = (bytes) => createHash("sha512").update(bytes).digest("base64");
const json = (bytes) => { try { return JSON.parse(bytes); } catch { fail(); } };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

// Never use a shell, caller npm configuration, lifecycle scripts or inherited npm credentials.
const runNpm = (cli, root) => (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root, env: { HOME: root, npm_config_cache: path.join(root, "cache"),
      npm_config_update_notifier: "false" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderrSize = 0;
  let exceeded = false;
  const timer = setTimeout(() => { exceeded = true; child.kill("SIGKILL"); }, 60_000);
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + chunk.length > MAX_JSON) { exceeded = true; child.kill("SIGKILL"); }
    else stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderrSize += chunk.length;
    if (stderrSize > MAX_JSON) { exceeded = true; child.kill("SIGKILL"); }
  });
  child.on("error", (error) => { clearTimeout(timer); reject(error); });
  child.on("close", (code, signal) => {
    clearTimeout(timer);
    resolve({ code: exceeded || signal ? -1 : code, stdout });
  });
});

const getBytes = async (url, limit, fetcher) => {
  const target = new URL(url);
  if (target.origin !== "https://registry.npmjs.org" || target.username || target.password
      || target.search || target.hash) fail();
  const response = await fetcher(target.href, { redirect: "manual", signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" } });
  if (response.status !== 200 || !response.body || response.url !== target.href) fail();
  const size = Number(response.headers?.get("content-length"));
  if (size > limit) fail();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) fail();
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
};

// npm's audit signatures inspects installed dependencies, not a package named on the command line.
// The production CLI is resolved beside the running Node installation, not from caller JSON.
const auditWithDependencies = async ({ expected, npmCli, run, fetcher }) => {
  if (!expected || expected.packageName !== PACKAGE || expected.registry !== REGISTRY
      || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(expected.version ?? "")
      || typeof npmCli !== "string" || !path.isAbsolute(npmCli)) fail();
  const root = await mkdtemp(path.join(os.tmpdir(), "npm-provenance-audit-"));
  try {
    const cli = await realpath(npmCli);
    const cliPackage = json(await readFile(path.resolve(path.dirname(cli), "../package.json"), "utf8"));
    if (cliPackage.name !== "npm" || cliPackage.version !== "11.19.1") fail();
    const execute = run ?? runNpm(cli, root);
    const flags = [`--registry=${REGISTRY}`, `--userconfig=${path.join(root, "user.npmrc")}`,
      `--globalconfig=${path.join(root, "global.npmrc")}`, "--fetch-retries=0"];
    const call = async (args) => {
      const result = await execute(args, root);
      if (!result || result.code !== 0 || typeof result.stdout !== "string"
          || Buffer.byteLength(result.stdout) > MAX_JSON) fail();
      return result.stdout.trim();
    };
    if (await call(["--version", ...flags]) !== "11.19.1") fail();
    const spec = `${PACKAGE}@${expected.version}`;
    await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "provenance-audit", version: "1.0.0",
      private: true, dependencies: { [PACKAGE]: expected.version } })}\n`);
    await call(["install", "--ignore-scripts", "--no-audit", "--no-fund", ...flags]);
    const installed = json(await readFile(path.join(root, LOCATION, "package.json"), "utf8"));
    const lock = json(await readFile(path.join(root, "package-lock.json"), "utf8"));
    const dependency = lock.packages?.[LOCATION];
    if (installed.name !== PACKAGE || installed.version !== expected.version
        || !exactKeys(lock.packages?.[""].dependencies, [PACKAGE])
        || lock.packages[""].dependencies[PACKAGE] !== expected.version
        || !exactKeys(lock.packages, ["", LOCATION]) || dependency?.version !== expected.version) fail();
    const versionUrl = `${REGISTRY}@eff3ct%2fagent-foundry/${encodeURIComponent(expected.version)}`;
    const metadata = json(await getBytes(versionUrl, MAX_JSON, fetcher));
    const tarballUrl = `${REGISTRY}@eff3ct/agent-foundry/-/agent-foundry-${expected.version}.tgz`;
    if (metadata.name !== PACKAGE || metadata.version !== expected.version
        || metadata.dist?.tarball !== tarballUrl || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(metadata.dist?.integrity ?? "")
        || dependency.resolved !== tarballUrl || dependency.integrity !== metadata.dist.integrity) fail();
    const tarball = await getBytes(tarballUrl, MAX_TARBALL, fetcher);
    if (!tarball.length || `sha512-${hash(tarball)}` !== metadata.dist.integrity) fail();
    const audit = json(await call(["audit", "signatures", "--json", "--include-attestations", ...flags]));
    if (!exactKeys(audit, ["invalid", "missing", "verified"]) || !Array.isArray(audit.verified)
        || audit.verified.length !== 1 || audit.verified[0]?.name !== PACKAGE
        || audit.verified[0]?.version !== expected.version
        || audit.verified[0]?.location !== LOCATION || audit.verified[0]?.registry !== REGISTRY) fail();
    const result = validateNpmProvenancePolicy({ audit, tarball, expected, npmVersion: "11.19.1" });
    return { ...result, registry_integrity: metadata.dist.integrity, installed: spec };
  } catch { fail(); }
  finally { await rm(root, { recursive: true, force: true }); }
};

// Production callers cannot supply an audit JSON, subprocess result or HTTP response.
export const auditPublishedProvenance = ({ expected } = {}) =>
  auditWithDependencies({ expected,
    npmCli: path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    fetcher: fetch });

// Offline contract tests only: injected results demonstrate handling, not signature verification.
export const auditPublishedProvenanceWithFixtures = ({ expected, npmCli, run, fetcher } = {}) => {
  if (typeof run !== "function" || typeof fetcher !== "function") fail();
  return auditWithDependencies({ expected, npmCli, run, fetcher });
};

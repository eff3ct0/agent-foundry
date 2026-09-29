import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const executeDefault = promisify(execFile);
const registry = "https://registry.npmjs.org/";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => { throw new Error(`offline npm cache preparation: ${message}`); };
const version = (value) => typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value);
const integrity = (value) => typeof value === "string" && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(value);
const packageName = (value) => typeof value === "string" && /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(value);

const lockDocuments = (source) => {
  const documents = parseAllDocuments(source, { uniqueKeys: true });
  if (documents.length !== 2 || documents.some((document) => document.errors.length)) fail("pnpm lock must contain two valid YAML documents");
  const lock = documents[1].toJS();
  if (lock?.lockfileVersion !== "9.0" || !object(lock.importers?.["."]?.dependencies) || !object(lock.packages) || !object(lock.snapshots)) {
    fail("pnpm workspace lock is absent or malformed");
  }
  return lock;
};

export const expectedDependencies = (manifest, source) => {
  const lock = lockDocuments(source);
  if ((manifest.optionalDependencies && Object.keys(manifest.optionalDependencies).length) || (manifest.peerDependencies && Object.keys(manifest.peerDependencies).length)) fail("unsupported packed dependency type");
  const direct = manifest.dependencies ?? {};
  const importer = lock.importers["."].dependencies;
  if (!object(direct) || Object.keys(direct).sort().join("\0") !== Object.keys(importer).sort().join("\0")) fail("packed dependencies differ from workspace importer");
  const expected = new Map();
  const visit = (name, requested, specifier) => {
    if (!packageName(name) || !version(requested) || (specifier !== undefined && specifier !== requested)) fail("dependency version is not exact");
    const key = `${name}@${requested}`;
    const entry = lock.packages[key];
    const snapshot = lock.snapshots[key];
    if (!object(entry?.resolution) || !integrity(entry.resolution.integrity) || !object(snapshot) || entry.resolution.tarball) fail(`missing or invalid locked integrity: ${key}`);
    if (expected.has(name)) {
      if (expected.get(name).version !== requested) fail(`conflicting locked versions: ${name}`);
      return;
    }
    expected.set(name, { version: requested, integrity: entry.resolution.integrity });
    for (const dependencies of [snapshot.dependencies, snapshot.optionalDependencies]) {
      if (dependencies === undefined) continue;
      if (!object(dependencies)) fail(`invalid dependency closure: ${key}`);
      for (const [child, childVersion] of Object.entries(dependencies)) visit(child, childVersion);
    }
  };
  for (const [name, requested] of Object.entries(direct)) {
    const pinned = importer[name];
    if (!object(pinned) || pinned.version !== requested || pinned.specifier !== requested) fail(`packed dependency differs from lock: ${name}`);
    visit(name, requested, pinned.specifier);
  }
  return expected;
};

export const assertInstalledLock = (installed, expected, candidate) => {
  if (installed?.lockfileVersion !== 3 || !object(installed.packages)) fail("npm installation lock is absent or malformed");
  const found = new Map();
  for (const [location, entry] of Object.entries(installed.packages)) {
    if (!location) continue;
    if (location === `node_modules/${candidate.name}` && entry?.version === candidate.version) continue;
    const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/u.exec(location);
    if (!match || !object(entry) || !packageName(match[1]) || !expected.has(match[1])) fail(`unexpected installed package: ${location}`);
    const name = match[1];
    const expectedEntry = expected.get(name);
    const url = new URL(entry.resolved ?? "", registry);
    const base = name.split("/").at(-1);
    const wantedPath = `/${name}/-/${base}-${expectedEntry.version}.tgz`;
    if (found.has(name) || entry.version !== expectedEntry.version || entry.integrity !== expectedEntry.integrity || url.origin !== "https://registry.npmjs.org" || url.pathname !== wantedPath || url.search || url.hash || url.username || url.password) {
      fail(`installed version, integrity or registry differs from pnpm lock: ${name}`);
    }
    found.set(name, entry);
  }
  if (found.size !== expected.size) fail("installed dependency closure differs from pnpm lock");
};

export const prepareOfflineNpmCache = async ({ root, execute = executeDefault, environment = process.env }) => {
  const workspace = path.resolve(root);
  const temp = await mkdtemp(path.join(os.tmpdir(), "factory-npm-cache-"));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "CI"].filter((key) => environment[key]).map((key) => [key, environment[key]]));
  env.npm_config_userconfig = path.join(temp, "user.npmrc");
  env.npm_config_globalconfig = path.join(temp, "global.npmrc");
  env.npm_config_registry = registry;
  try {
    await Promise.all([writeFile(env.npm_config_userconfig, ""), writeFile(env.npm_config_globalconfig, "")]);
    await execute("npm", ["pack", "--offline", "--ignore-scripts", "--pack-destination", temp, "--silent"], { cwd: workspace, env });
    const tarballs = (await readdir(temp)).filter((entry) => entry.endsWith(".tgz"));
    if (tarballs.length !== 1) fail("expected exactly one packed candidate");
    const tarball = path.join(temp, tarballs[0]);
    const manifest = JSON.parse((await execute("tar", ["-xOf", tarball, "package/package.json"], { env })).stdout);
    const expected = expectedDependencies(manifest, await readFile(path.join(workspace, "pnpm-lock.yaml"), "utf8"));
    if (expected.size === 0) return;
    const prefix = path.join(temp, "install");
    await execute("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry", registry, "--prefix", prefix, tarball], { cwd: temp, env });
    assertInstalledLock(JSON.parse(await readFile(path.join(prefix, "package-lock.json"), "utf8")), expected, manifest);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareOfflineNpmCache({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
}

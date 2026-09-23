import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertManifestMatchesLock,
  manifestDigest,
  validateDeclaredPaths,
} from "../scripts/build-payload.mjs";
import { packedArtifactIdentity } from "../scripts/artifact-identity.mjs";
import emitter from "../dist/typed-module-emitter.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist/payload-manifest.json"), "utf8"));
const { emitTypedModules } = emitter;

const walk = async (directory, relative = "") => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), entryRelative));
    else result.push(entryRelative);
  }
  return result.sort();
};

test("manifest covers the bundled payload exactly once", async () => {
  const payloadPaths = await walk(path.join(root, "dist/payload"));
  assert.deepEqual(payloadPaths, manifest.files.map((file) => file.path));
  assert.equal(new Set(payloadPaths).size, payloadPaths.length);
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(root, "dist/payload", file.path));
    assert.equal(bytes.byteLength, file.size, file.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
  assert.equal(manifest.payload_digest, manifestDigest(manifest.payload_version, manifest.files));
});

test("version output exposes the package and payload identity", async () => {
  const human = await execFileAsync(process.execPath, ["dist/index.js", "--version"], { cwd: root });
  assert.match(human.stdout, /@eff3ct\/agent-foundry 0\.1\.0/);
  assert.match(human.stdout, new RegExp(manifest.payload_digest));

  const json = await execFileAsync(process.execPath, ["dist/index.js", "--version", "--json"], { cwd: root });
  assert.deepEqual(JSON.parse(json.stdout), {
    name: manifest.package_name,
    version: manifest.package_version,
    payloadVersion: manifest.payload_version,
    payloadDigest: manifest.payload_digest,
  });
});

test("compiled CLI is executable without an explicit Node interpreter", async (context) => {
  if (process.platform === "win32") {
    context.skip("POSIX executable mode is not applicable on Windows");
    return;
  }
  const cliPath = path.join(root, "dist/index.js");
  assert.equal((await stat(cliPath)).mode & 0o777, 0o755);
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.name, "@eff3ct/agent-foundry");
  assert.deepEqual(packageJson.bin, { foundry: "dist/index.js" });
  const result = await execFileAsync(cliPath, ["--version", "--json"]);
  assert.deepEqual(JSON.parse(result.stdout).payloadDigest, manifest.payload_digest);
  const help = await execFileAsync(cliPath, ["--help"]);
  assert.match(help.stdout, /Usage: foundry /u);
});

test("packaging rejects missing, undeclared, and changed integrity inputs", () => {
  assert.throws(
    () => validateDeclaredPaths(["known.txt"], ["known.txt", "new.txt"]),
    /undeclared payload file is present/,
  );
  assert.throws(
    () => validateDeclaredPaths(["known.txt", "missing.txt"], ["known.txt"]),
    /expected payload file is missing/,
  );
  assert.throws(
    () => validateDeclaredPaths(["../outside.txt"], []),
    /escapes the repository root/,
  );
  assert.throws(
    () => assertManifestMatchesLock(manifest, { ...manifest, payload_digest: "sha256:changed" }),
    /integrity contract/,
  );
});

test("typed module emitter produces runnable isolated ESM .js without .mjs output", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "typed-module-"));
  try {
    const source = path.join(parent, "source");
    const output = path.join(parent, "output");
    await mkdir(path.join(source, "nested"), { recursive: true });
    await writeFile(path.join(source, "nested/value.mts"), "export const value: number = 40;\n");
    await writeFile(path.join(source, "bridge.mts"), 'export { value } from "./nested/value.mjs";\n');
    await writeFile(path.join(source, "main.mts"), [
      'import { value } from "./bridge.mjs";',
      'const other = await import("./nested/value.mjs");',
      'console.log(value + other.value);',
    ].join("\n"));
    const written = await emitTypedModules(source, output);
    assert.deepEqual(written.map((file) => path.relative(output, file)), ["bridge.js", "main.js", "nested/value.js"]);
    assert.deepEqual(await walk(output), ["bridge.js", "main.js", "nested/value.js", "package.json"]);
    assert.equal(JSON.parse(await readFile(path.join(output, "package.json"))).type, "module");
    assert.match(await readFile(path.join(output, "main.js"), "utf8"), /\.\/bridge\.js/u);
    assert.match(await readFile(path.join(output, "bridge.js"), "utf8"), /\.\/nested\/value\.js/u);
    const result = await execFileAsync(process.execPath, [path.join(output, "main.js")]);
    assert.equal(result.stdout, "80\n");
    const cli = await execFileAsync(process.execPath, [path.join(root, "dist/index.js"), "--help"]);
    assert.match(cli.stdout, /Usage: foundry /u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("typed module emitter rejects unsafe or unresolved imports before writing output", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "typed-module-invalid-"));
  try {
    const source = path.join(parent, "source");
    await mkdir(source);
    const invalidImports = [
      ['import "./missing.mjs";', /unresolved relative module specifier/u],
      ['import "../outside.mjs";', /unresolved relative module specifier/u],
      ['import "./value.js";', /unsafe relative module specifier/u],
      ['export { value } from "./value.mjs?query";', /unsafe relative module specifier/u],
      ['await import("file:///tmp/other.mjs");', /unsupported module specifier/u],
      ['await import(`./value.mjs`);', /dynamic import must use a string literal/u],
    ];
    for (const [index, [statement, expected]] of invalidImports.entries()) {
      await writeFile(path.join(source, "entry.mts"), statement);
      const output = path.join(parent, `output-${index}`);
      await assert.rejects(emitTypedModules(source, output), expected);
      await assert.rejects(stat(output), { code: "ENOENT" });
    }
    await writeFile(path.join(source, "entry.mts"), "const value: number = 'invalid';\n");
    await assert.rejects(emitTypedModules(source, path.join(parent, "type-error")), /Type 'string' is not assignable/u);
    await assert.rejects(stat(path.join(parent, "type-error")), { code: "ENOENT" });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("packed package preserves npm transport and startup handoff", async (context) => {
  if (process.platform === "win32") {
    context.skip("the isolated agent launch fixture uses a POSIX executable");
    return;
  }
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-npm-package-"));
  try {
    const packageDirectory = path.join(parent, "package");
    const installDirectory = path.join(parent, "install");
    const target = path.join(parent, "project");
    const bin = path.join(parent, "bin");
    await mkdir(packageDirectory);
    await mkdir(installDirectory);
    await mkdir(bin);
    await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packageDirectory], { cwd: root });
    const tarballName = (await readdir(packageDirectory)).find((entry) => entry.endsWith(".tgz"));
    assert.ok(tarballName, "pnpm pack did not produce a tarball");
    const tarball = path.join(packageDirectory, tarballName);
    await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--prefix", installDirectory, tarball], { cwd: root });

    const executable = path.join(bin, "codex");
    await writeFile(executable, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$FACTORY_NPM_INSTALL_ARGS\"\nexit 0\n");
    await chmod(executable, 0o755);
    const config = path.join(parent, "answers.json");
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "npm transport", TASK_TRACKER: "github-issues" } }));
    const installedCli = path.join(installDirectory, "node_modules", "@eff3ct", "agent-foundry", "dist", "index.js");
    const environment = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, FACTORY_NPM_INSTALL_ARGS: path.join(parent, "handoff-args.txt") };
    const result = await execFileAsync(process.execPath, [installedCli, "apply", "--target", target, "--config", config, "--agent", "codex", "--launch-agent", "--non-interactive"], { cwd: root, env: environment }).then((value) => ({ ...value, code: 0 })).catch((error) => ({ stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code }));
    assert.equal(result.code, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.status, "applied");
    assert.equal(envelope.verification, "verified");
    assert.equal(envelope.handoff.status, "launched");
    assert.equal(await readFile(path.join(parent, "handoff-args.txt"), "utf8"), `--cd\n${target}\n`);
    assert.ok(await stat(path.join(target, ".gitignore")));
    assert.ok(await stat(path.join(target, "start.mjs")));

    const startup = await execFileAsync(process.execPath, [path.join(target, "start.mjs"), "--cwd", target, "--json"]);
    const startupEnvelope = JSON.parse(startup.stdout);
    assert.equal(startupEnvelope.mode, "WORK");
    assert.equal(startupEnvelope.status, "ready");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("two packed artifacts preserve complete package and generated-tree identity", async (context) => {
  if (process.platform === "win32") {
    context.skip("the package installation fixture uses a POSIX executable");
    return;
  }
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-artifact-identity-"));
  try {
    const identities = [];
    for (const run of ["first", "second"]) {
      const packageDirectory = path.join(parent, `${run}-package`);
      const installDirectory = path.join(parent, `${run}-install`);
      const target = path.join(parent, `${run}-project`);
      const config = path.join(parent, `${run}-answers.json`);
      await mkdir(packageDirectory);
      await execFileAsync("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packageDirectory], { cwd: root });
      const tarballName = (await readdir(packageDirectory)).find((entry) => entry.endsWith(".tgz"));
      assert.ok(tarballName, "pnpm pack did not produce a tarball");
      const tarballPath = path.join(packageDirectory, tarballName);
      await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--prefix", installDirectory, tarballPath], { cwd: root });
      await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "artifact identity", TASK_TRACKER: "github-issues" } }));
      const packagePath = path.join(installDirectory, "node_modules", "@eff3ct", "agent-foundry");
      const installedCli = path.join(packagePath, "dist", "index.js");
      const result = await execFileAsync(process.execPath, [installedCli, "apply", "--target", target, "--config", config, "--non-interactive"], { cwd: root })
        .then((value) => ({ ...value, code: 0 }))
        .catch((error) => ({ stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code }));
      assert.equal(result.code, 0, result.stderr);
      identities.push(await packedArtifactIdentity({ tarballPath, packagePath, projectPath: target }));
    }
    assert.deepEqual(identities[0], identities[1]);
    assert.deepEqual(identities[0].package, { name: manifest.package_name, version: manifest.package_version });
    for (const digest of [identities[0].tarball_digest, identities[0].payload_digest, identities[0].tree_digest]) {
      assert.match(digest, /^sha256:[0-9a-f]{64}$/u);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

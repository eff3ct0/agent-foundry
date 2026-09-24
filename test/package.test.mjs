import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
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
import verifier from "../dist/typed-runtime-verifier.js";
import policy from "../dist/module-policy.js";
import sourcePolicy from "../dist/module-policy-source.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist/payload-manifest.json"), "utf8"));
const { emitTypedModules } = emitter;
const { verifyTypedRuntime } = verifier;
const { checkModulePolicy } = policy;
const { inventorySourceModules, checkSourceModulePolicy } = sourcePolicy;
const trustedGit = await (async () => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const name of process.platform === "win32" ? ["git.exe", "git.cmd"] : ["git"]) {
      try {
        const candidate = await realpath(path.join(directory, name));
        if ((await stat(candidate)).isFile()) return candidate;
      } catch { /* Try the next harness path. */ }
    }
  }
  throw new Error("test harness requires a trusted Git executable");
})();

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

test("checked-in typed runtime matches fresh compiler bytes without transient .mjs", async () => {
  const source = path.join(root, "scripts/typed");
  const committed = path.join(root, "scripts/typed-runtime");
  await verifyTypedRuntime(source, committed);
  const parent = await mkdtemp(path.join(os.tmpdir(), "typed-runtime-fixture-"));
  try {
    const output = path.join(parent, "output");
    await emitTypedModules(source, output);
    assert.deepEqual(await walk(output), [
      "check-real-agent-workflow.js", "package.json", "resource-cleanup-eligibility.js", "resource-proof-cleanup.js", "resource-provisioning-proof.js",
    ]);
    assert.deepEqual(await walk(committed), await walk(output));
    for (const file of await walk(output)) {
      assert.deepEqual(await readFile(path.join(committed, file)), await readFile(path.join(output, file)));
    }
    const runtime = path.join(parent, "runtime");
    await cp(output, runtime, { recursive: true });
    await verifyTypedRuntime(source, runtime);
    const js = path.join(runtime, "check-real-agent-workflow.js");
    const bytes = await readFile(js);
    bytes[bytes.length - 2] ^= 1;
    await writeFile(js, bytes);
    await assert.rejects(verifyTypedRuntime(source, runtime), /typed runtime bytes differ/u);
    await writeFile(js, await readFile(path.join(output, "check-real-agent-workflow.js")));
    await rm(js);
    await assert.rejects(verifyTypedRuntime(source, runtime), /typed runtime file set differs/u);
    await cp(output, runtime, { recursive: true });
    await writeFile(path.join(runtime, "extra.js"), "export {};\n");
    await assert.rejects(verifyTypedRuntime(source, runtime), /typed runtime file set differs/u);
    await rm(path.join(runtime, "extra.js"));
    const changedSource = path.join(parent, "source");
    await cp(source, changedSource, { recursive: true });
    await writeFile(path.join(changedSource, "check-real-agent-workflow.mts"), "export const changed: number = 1;\n");
    await assert.rejects(verifyTypedRuntime(changedSource, runtime), /typed runtime bytes differ/u);
    await writeFile(path.join(changedSource, "check-real-agent-workflow.mts"), "const invalid: number = 'wrong';\n");
    await assert.rejects(verifyTypedRuntime(changedSource, runtime), /not assignable/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("module policy classifies tracked, payload, and generated support separately", () => {
  const inventory = {
    tracked: ["src/entry.mts", "src/cli.ts", "hooks/pi/factory-start.ts", "src/tool.ts", "dist/tool.js"],
    payload: ["hooks/opencode/factory-start.ts", "scripts/support.mts"],
    generated: [".factory/scripts/support.js", ".opencode/plugins/factory-start.ts", "app/index.js", "app/feature.mjs"],
    generatedApplication: ["app/index.js", "app/feature.mjs"],
    compiled: [
      { sourceScope: "tracked", source: "src/tool.ts", outputScope: "tracked", output: "dist/tool.js" },
      { sourceScope: "payload", source: "scripts/support.mts", outputScope: "generated", output: ".factory/scripts/support.js" },
    ],
  };
  assert.deepEqual(checkModulePolicy(inventory), []);
  assert.deepEqual(checkModulePolicy({ ...inventory,
    tracked: [...inventory.tracked, "z.mjs", "a.js"],
    payload: [...inventory.payload, "scripts/z.js", "start.mjs"],
    generated: [...inventory.generated, ".factory/scripts/z.mjs", ".factory/scripts/a.js"],
  }), [
    { scope: "generated", path: ".factory/scripts/a.js", reason: "untyped JavaScript module" },
    { scope: "generated", path: ".factory/scripts/z.mjs", reason: "untyped .mjs module" },
    { scope: "payload", path: "scripts/z.js", reason: "untyped JavaScript module" },
    { scope: "payload", path: "start.mjs", reason: "untyped .mjs module" },
    { scope: "tracked", path: "a.js", reason: "untyped JavaScript module" },
    { scope: "tracked", path: "z.mjs", reason: "untyped .mjs module" },
  ]);
});

test("module policy requires exact typed provenance and rejects malformed inventories", () => {
  const baseline = {
    tracked: ["src/tool.ts"], payload: [], generated: [".factory/scripts/tool.js", "app/own.js"],
    generatedApplication: ["app/own.js"], compiled: [],
  };
  const mapping = { sourceScope: "tracked", source: "src/tool.ts", outputScope: "generated", output: ".factory/scripts/tool.js" };
  assert.deepEqual(checkModulePolicy({ ...baseline, compiled: [mapping] }), []);
  for (const candidate of [
    { ...mapping, source: "src/unknown.ts" },
    { ...mapping, source: "src/tool.js" },
    { ...mapping, output: "app/own.js" },
    { ...mapping, output: ".factory/scripts/other.js" },
    { ...mapping, output: ".factory/scripts/tool.mjs" },
  ]) assert.throws(() => checkModulePolicy({ ...baseline, compiled: [candidate] }), /invalid compiled module provenance/u);
  assert.throws(() => checkModulePolicy({ ...baseline, compiled: [mapping, mapping] }), /invalid compiled module provenance/u);
  for (const invalid of ["../escape.js", "/absolute.js", "C:/drive.js", "a//b.js", "a/./b.js", "a\\b.js"]) {
    assert.throws(() => checkModulePolicy({ ...baseline, tracked: [invalid] }), /invalid module policy path/u);
  }
  assert.throws(() => checkModulePolicy({ ...baseline, generated: ["app/own.js", "app/own.js"] }), /duplicate module policy identity/u);
  assert.throws(() => checkModulePolicy({ ...baseline, generated: [{ path: ".factory/scripts/tool.js", kind: "symlink" }] }), /symlink/u);
  assert.throws(() => checkModulePolicy({ ...baseline, generatedApplication: [".factory"] }), /invalid generated application identity/u);
  assert.throws(() => checkModulePolicy({ ...baseline, compiled: null }), /invalid module policy classification manifest/u);
});

test("module policy accepts executable type-derived output but not nearby generated JavaScript", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "module-policy-"));
  try {
    const source = path.join(parent, "source");
    const output = path.join(parent, "output");
    await mkdir(source);
    await writeFile(path.join(source, "startup.mts"), 'console.log("typed startup");\n');
    const emitted = await emitTypedModules(source, output);
    const runtime = await execFileAsync(process.execPath, [emitted[0]]);
    assert.equal(runtime.stdout, "typed startup\n");
    const inventory = {
      tracked: ["scripts/startup.mts"], payload: [],
      generated: [".factory/scripts/startup.js", ".factory/scripts/rogue.js", "app/index.js"],
      generatedApplication: ["app/index.js"],
      compiled: [{ sourceScope: "tracked", source: "scripts/startup.mts", outputScope: "generated", output: ".factory/scripts/startup.js" }],
    };
    assert.deepEqual(checkModulePolicy(inventory), [
      { scope: "generated", path: ".factory/scripts/rogue.js", reason: "untyped JavaScript module" },
    ]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

const sourceFixture = async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "module-source-inventory-"));
  await execFileAsync(trustedGit, ["init", "-q"], { cwd: repository });
  await mkdir(path.join(repository, "package"));
  await mkdir(path.join(repository, "scripts", "nested"), { recursive: true });
  await mkdir(path.join(repository, "hooks"));
  const files = ["scripts/nested/rogue.js", "scripts/nested/start.mjs", "scripts/nested/typed.mts", "hooks/start.ts"];
  for (const file of files) await writeFile(path.join(repository, file), "export {};\n");
  await chmod(path.join(repository, "scripts/nested/start.mjs"), 0o755);
  await writeFile(path.join(repository, "package/payload-files.json"), JSON.stringify({ paths: ["scripts/nested/start.mjs", "hooks/start.ts"] }));
  await writeFile(path.join(repository, "package/payload-manifest.json"), JSON.stringify({ files: [
    { path: "scripts/nested/start.mjs", mode: "100755" },
    { path: "hooks/start.ts", mode: "100644" },
  ] }));
  await execFileAsync(trustedGit, ["add", "--", "."], { cwd: repository });
  return repository;
};

test("source inventory uses Git index modes and exact payload identities with stable policy output", async () => {
  const repository = await sourceFixture();
  try {
    const inventory = await inventorySourceModules(repository, trustedGit);
    assert.deepEqual(inventory.tracked.map(({ path: file }) => file), [
      "hooks/start.ts", "package/payload-files.json", "package/payload-manifest.json",
      "scripts/nested/rogue.js", "scripts/nested/start.mjs", "scripts/nested/typed.mts",
    ]);
    assert.deepEqual(inventory.payload, [
      { path: "hooks/start.ts", kind: "file", mode: "100644" },
      { path: "scripts/nested/start.mjs", kind: "file", mode: "100755" },
    ]);
    await writeFile(path.join(repository, "scripts/nested/untracked.mjs"), "export {};\n");
    assert.deepEqual(await checkSourceModulePolicy(repository, trustedGit), [
      { scope: "payload", path: "scripts/nested/start.mjs", reason: "untyped .mjs module" },
      { scope: "tracked", path: "scripts/nested/rogue.js", reason: "untyped JavaScript module" },
      { scope: "tracked", path: "scripts/nested/start.mjs", reason: "untyped .mjs module" },
    ]);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("source policy proves every tracked typed runtime module from fresh compiler bytes", async () => {
  const repository = await sourceFixture();
  const sourceName = "scripts/typed/check-real-agent-workflow.mts";
  const runtimeName = "scripts/typed-runtime/check-real-agent-workflow.js";
  const secondSource = "scripts/typed/nested/second.mts";
  const secondRuntime = "scripts/typed-runtime/nested/second.js";
  const manifestName = "scripts/typed-runtime/package.json";
  const source = path.join(repository, sourceName);
  const runtime = path.join(repository, runtimeName);
  const output = path.join(repository, "fresh-output");
  try {
    await mkdir(path.dirname(source));
    await mkdir(path.join(repository, "scripts/typed/nested"));
    await writeFile(source, 'export { value } from "./nested/second.mjs";\n');
    await writeFile(path.join(repository, secondSource), "export const value: number = 181;\n");
    await emitTypedModules(path.dirname(source), output);
    await cp(output, path.dirname(runtime), { recursive: true });
    await execFileAsync(trustedGit, ["add", "--", sourceName, secondSource, runtimeName, secondRuntime, manifestName], { cwd: repository });

    const expected = [
      { scope: "payload", path: "scripts/nested/start.mjs", reason: "untyped .mjs module" },
      { scope: "tracked", path: "scripts/nested/rogue.js", reason: "untyped JavaScript module" },
      { scope: "tracked", path: "scripts/nested/start.mjs", reason: "untyped .mjs module" },
    ];
    assert.deepEqual(await checkSourceModulePolicy(repository, trustedGit), expected);
    await execFileAsync(trustedGit, ["rm", "--cached", "--", manifestName], { cwd: repository });
    assert.equal(await readFile(path.join(repository, manifestName), "utf8"), '{"type":"module"}\n');
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime manifest/u);
    await execFileAsync(trustedGit, ["add", "--", manifestName], { cwd: repository });
    await execFileAsync(trustedGit, ["update-index", "--chmod=+x", "--", manifestName], { cwd: repository });
    if (process.platform !== "win32") await chmod(path.join(repository, manifestName), 0o755);
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime manifest|source inventory mode mismatch/u);
    await execFileAsync(trustedGit, ["update-index", "--chmod=-x", "--", manifestName], { cwd: repository });
    if (process.platform !== "win32") await chmod(path.join(repository, manifestName), 0o644);
    assert.deepEqual(await checkSourceModulePolicy(repository, trustedGit), expected);
    await execFileAsync(trustedGit, ["rm", "--cached", "--", secondRuntime], { cwd: repository });
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /tracked file set differs/u);
    await execFileAsync(trustedGit, ["add", "--", secondRuntime], { cwd: repository });
    await execFileAsync(trustedGit, ["update-index", "--chmod=+x", "--", secondRuntime], { cwd: repository });
    if (process.platform !== "win32") await chmod(path.join(repository, secondRuntime), 0o755);
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /tracked regular mode|source inventory mode mismatch/u);
    await execFileAsync(trustedGit, ["update-index", "--chmod=-x", "--", secondRuntime], { cwd: repository });
    if (process.platform !== "win32") await chmod(path.join(repository, secondRuntime), 0o644);
    assert.deepEqual(await checkSourceModulePolicy(repository, trustedGit), expected);
    await writeFile(path.join(repository, "scripts/typed-runtime/untracked.js"), "export {};\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime file set differs/u);
    await rm(path.join(repository, "scripts/typed-runtime/untracked.js"));
    await writeFile(path.join(repository, "scripts/typed/untracked.mts"), "export {};\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime file set differs/u);
    await rm(path.join(repository, "scripts/typed/untracked.mts"));
    await execFileAsync(trustedGit, ["rm", "--cached", "--", secondSource], { cwd: repository });
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /tracked file set differs/u);
    await execFileAsync(trustedGit, ["add", "--", secondSource], { cwd: repository });
    await writeFile(path.join(repository, manifestName), '{"type":"commonjs"}\n');
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime bytes differ/u);
    await writeFile(path.join(repository, manifestName), await readFile(path.join(output, "package.json")));
    await writeFile(path.join(repository, "scripts/typed-runtime/rogue.js"), "export {};\n");
    await writeFile(path.join(repository, "scripts/typed-runtime/rogue.mjs"), "export {};\n");
    await execFileAsync(trustedGit, ["add", "--", "scripts/typed-runtime/rogue.js", "scripts/typed-runtime/rogue.mjs"], { cwd: repository });
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime file set differs/u);
    await rm(path.join(repository, "scripts/typed-runtime/rogue.js"));
    await rm(path.join(repository, "scripts/typed-runtime/rogue.mjs"));
    await execFileAsync(trustedGit, ["add", "-u"], { cwd: repository });
    const neighbor = path.join(repository, "scripts/nested/neighbor.js");
    await writeFile(neighbor, "export {};\n");
    await writeFile(path.join(repository, "scripts/nested/neighbor.mjs"), "export {};\n");
    await execFileAsync(trustedGit, ["add", "--", "scripts/nested/neighbor.js", "scripts/nested/neighbor.mjs"], { cwd: repository });
    assert.deepEqual(await checkSourceModulePolicy(repository, trustedGit), [
      ...expected,
      { scope: "tracked", path: "scripts/nested/neighbor.js", reason: "untyped JavaScript module" },
      { scope: "tracked", path: "scripts/nested/neighbor.mjs", reason: "untyped .mjs module" },
    ].sort((a, b) => `${a.scope}:${a.path}`.localeCompare(`${b.scope}:${b.path}`)));

    await writeFile(runtime, "export const value = 0;\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime bytes differ/u);
    await writeFile(runtime, await readFile(path.join(output, "check-real-agent-workflow.js")));
    await writeFile(path.join(repository, secondRuntime), "export const value = 0;\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime bytes differ/u);
    await writeFile(path.join(repository, secondRuntime), await readFile(path.join(output, "nested/second.js")));
    await writeFile(path.join(repository, secondSource), "export const value: number = 182;\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed runtime bytes differ/u);
    await writeFile(path.join(repository, secondSource), "export const value: number = 181;\n");
    await rm(runtime);
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /ENOENT|source inventory/u);
    await cp(path.join(output, "check-real-agent-workflow.js"), runtime);
    await chmod(runtime, 0o755);
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /source inventory mode mismatch/u);
    await chmod(runtime, 0o644);
    await rm(runtime);
    await symlink(path.join(output, "check-real-agent-workflow.js"), runtime);
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /source inventory symlink/u);
    await rm(runtime);
    await cp(path.join(output, "check-real-agent-workflow.js"), runtime);
    await execFileAsync(trustedGit, ["rm", "--cached", "--", sourceName], { cwd: repository });
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed source\/runtime pair is incomplete|tracked file set differs/u);
    await execFileAsync(trustedGit, ["add", "--", sourceName], { cwd: repository });
    await execFileAsync(trustedGit, ["rm", "--cached", "--", runtimeName], { cwd: repository });
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed source\/runtime pair is incomplete|tracked file set differs/u);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("source policy refuses unpaired JavaScript in the reserved typed runtime", async () => {
  const repository = await sourceFixture();
  try {
    await mkdir(path.join(repository, "scripts/typed-runtime"));
    await writeFile(path.join(repository, "scripts/typed-runtime/rogue.js"), "export {};\n");
    await assert.rejects(checkSourceModulePolicy(repository, trustedGit), /typed source\/runtime pair is incomplete/u);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("source inventory fails closed on symlinks, modes, and malformed payload declarations", async () => {
  const repository = await sourceFixture();
  try {
    const manifestPath = path.join(repository, "package/payload-manifest.json");
    const original = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(original);
    for (const files of [
      [...manifest.files, manifest.files[0]],
      [{ path: "../outside.mjs", mode: "100644" }],
      [{ path: "scripts/nested/rogue.js", mode: "100755" }],
      [manifest.files[0]],
    ]) {
      await writeFile(manifestPath, JSON.stringify({ files }));
      await assert.rejects(inventorySourceModules(repository, trustedGit), /duplicate payload identity|invalid source inventory path|payload is not a matching tracked file|payload manifest and declaration differ/u);
    }
    await writeFile(manifestPath, original);
    await chmod(path.join(repository, "scripts/nested/start.mjs"), 0o644);
    await assert.rejects(inventorySourceModules(repository, trustedGit), /source inventory mode mismatch/u);
    await chmod(path.join(repository, "scripts/nested/start.mjs"), 0o755);
    await rm(path.join(repository, "scripts/nested/rogue.js"));
    await symlink(path.join(repository, "hooks/start.ts"), path.join(repository, "scripts/nested/rogue.js"));
    await assert.rejects(inventorySourceModules(repository, trustedGit), /source inventory symlink/u);
    await rm(path.join(repository, "scripts/nested/rogue.js"));
    await writeFile(path.join(repository, "scripts/nested/rogue.js"), "export {};\n");
    await rm(path.join(repository, "scripts/nested"), { recursive: true });
    await symlink(path.join(repository, "hooks"), path.join(repository, "scripts/nested"));
    await assert.rejects(inventorySourceModules(repository, trustedGit), /source inventory symlink/u);
    await rm(path.join(repository, "scripts/nested"));
    await mkdir(path.join(repository, "scripts/nested"));
    await writeFile(path.join(repository, "scripts/nested/start.mjs"), "export {};\n");
    await chmod(path.join(repository, "scripts/nested/start.mjs"), 0o755);
    await writeFile(path.join(repository, "scripts/nested/typed.mts"), "export {};\n");
    await symlink(path.join(repository, "hooks/start.ts"), path.join(repository, "scripts/nested/rogue.js"));
    await execFileAsync(trustedGit, ["add", "--", "scripts/nested/rogue.js"], { cwd: repository });
    await assert.rejects(inventorySourceModules(repository, trustedGit), /invalid source inventory mode/u);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("source inventory ignores hostile fsmonitor, PATH, and inherited Git config", async (context) => {
  if (process.platform === "win32") {
    context.skip("the hostile executable fixtures use POSIX shell scripts");
    return;
  }
  const repository = await sourceFixture();
  try {
    const monitor = path.join(repository, "monitor");
    const marker = path.join(repository, "monitor-ran");
    const shadow = path.join(repository, "git");
    const shadowMarker = path.join(repository, "shadow-ran");
    await writeFile(monitor, `#!/bin/sh\nprintf invoked > "${marker}"\n`);
    await writeFile(shadow, `#!/bin/sh\nprintf invoked > "${shadowMarker}"\nexit 1\n`);
    await chmod(monitor, 0o755);
    await chmod(shadow, 0o755);
    await execFileAsync(trustedGit, ["config", "--local", "core.fsmonitor", monitor], { cwd: repository });

    // Establish the fixture's real execution path before testing the guarded adapter.
    await execFileAsync(trustedGit, ["rev-parse", "--show-toplevel"], { cwd: repository });
    await assert.rejects(stat(marker), { code: "ENOENT" });
    await execFileAsync(trustedGit, ["ls-files", "--stage", "-z"], { cwd: repository, encoding: "buffer" });
    assert.equal(await readFile(marker, "utf8"), "invoked");
    await rm(marker);

    const script = `const { inventorySourceModules } = require(${JSON.stringify(path.join(root, "dist/module-policy-source.js"))});\n` +
      `inventorySourceModules(${JSON.stringify(repository)}, ${JSON.stringify(trustedGit)})` +
      `.then(({tracked}) => console.log(JSON.stringify(tracked.map(({path}) => path))))` +
      `.catch(error => { console.error(error); process.exitCode = 1; });`;
    const { stdout } = await execFileAsync(process.execPath, ["-e", script], {
      cwd: repository,
      env: { ...process.env, PATH: repository, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: monitor },
    });
    assert.ok(JSON.parse(stdout).includes("scripts/nested/start.mjs"));
    await assert.rejects(stat(marker), { code: "ENOENT" });
    await assert.rejects(stat(shadowMarker), { code: "ENOENT" });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("source inventory fails closed without an external executable or with invalid Git config", async () => {
  const repository = await sourceFixture();
  try {
    for (const candidate of [undefined, "git", path.join(repository, "hooks/start.ts")]) {
      await assert.rejects(inventorySourceModules(repository, candidate), /trusted Git executable|outside the repository/u);
    }
    await assert.rejects(inventorySourceModules(repository, path.join(repository, "missing-git")));
    await writeFile(path.join(repository, ".git", "config"), "[core\n");
    await assert.rejects(inventorySourceModules(repository, trustedGit));
  } finally {
    await rm(repository, { recursive: true, force: true });
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

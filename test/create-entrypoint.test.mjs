import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (file, args, cwd, input, environment = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { cwd, env: { ...process.env, CI: "0", ...environment }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input ?? "");
});

test("packed initializer delegates to the locally installed exact creator", { timeout: 120_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "foundry-create-"));
  try {
    const packs = path.join(temporary, "packs");
    const consumer = path.join(temporary, "consumer");
    await mkdir(packs);
    await mkdir(consumer);
    const creator = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const initializer = JSON.parse(await readFile(path.join(root, "initializer/package.json"), "utf8"));
    assert.equal(initializer.version, creator.version);
    assert.equal(initializer.dependencies[creator.name], creator.version);
    await exec("pnpm", ["pack", "--ignore-scripts", "--pack-destination", packs], { cwd: root });
    await exec("npm", ["pack", path.join(root, "initializer"), "--offline", "--ignore-scripts", "--silent", "--pack-destination", packs], { cwd: consumer });
    const files = (await readdir(packs)).map((name) => path.join(packs, name));
    assert.equal(files.length, 2);
    const rootPack = files.find((name) => path.basename(name).startsWith("eff3ct-agent-foundry-"));
    const initializerPack = files.find((name) => path.basename(name).startsWith("eff3ct-create-agent-foundry-"));
    assert.ok(rootPack && initializerPack);
    const rootEntries = (await exec("tar", ["-tzf", rootPack])).stdout;
    assert.doesNotMatch(rootEntries, /initializer|create-agent-foundry/);
    assert.match((await exec("tar", ["-tzf", initializerPack])).stdout, /package\/bin\/create-agent-foundry\.cjs/);
    await exec("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", "--package-lock=false", rootPack, initializerPack], { cwd: consumer });

    const bin = path.join(consumer, "node_modules/@eff3ct/create-agent-foundry/bin/create-agent-foundry.cjs");
    const foundry = path.join(consumer, "node_modules/@eff3ct/agent-foundry/dist/index.js");
    const installed = JSON.parse(await readFile(path.join(consumer, "node_modules/@eff3ct/create-agent-foundry/package.json"), "utf8"));
    assert.equal(installed.bin["create-agent-foundry"], "bin/create-agent-foundry.cjs");
    assert.equal(installed.dependencies[creator.name], creator.version);
    assert.ok((await stat(bin)).mode & 0o111);
    const identity = JSON.parse((await run(process.execPath, [foundry, "--version", "--json"], consumer)).stdout);
    assert.equal(identity.name, creator.name);
    assert.equal(identity.version, creator.version);
    assert.match(identity.payloadDigest, /^sha256:[0-9a-f]{64}$/);

    const config = path.join(consumer, "answers.json");
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Packed project", TASK_TRACKER: "github-issues" } }));
    const target = path.join(temporary, "project");
    const flags = ["--config", config, "--non-interactive", "--json"];
    const applied = await run(bin, [target, ...flags], consumer);
    assert.equal(applied.code, 0, `${applied.stderr}\n${applied.stdout}`);
    assert.equal(JSON.parse(applied.stdout).verification, "verified");
    assert.equal(JSON.parse(applied.stdout).status, "applied");
    assert.equal(await stat(path.join(target, "README.md")).then(Boolean), true);
    assert.equal(JSON.parse((await run(process.execPath, [bin, target, ...flags], consumer)).stdout).status, "noop");
    for (const command of ["verify", "doctor"]) {
      const result = await run(process.execPath, [foundry, command, "--target", target, ...flags], consumer);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, command === "verify" ? "verified" : "healthy");
    }

    const missing = await run(process.execPath, [bin, path.join(temporary, "missing"), "--non-interactive"], consumer);
    assert.notEqual(missing.code, 0);
    assert.equal(JSON.parse(missing.stdout).status, "error");
    assert.match(JSON.stringify(JSON.parse(missing.stdout).diagnostics), /configuration/);
    const refused = await run(process.execPath, [bin, path.join(temporary, "refused"), "--launch-agent", ...flags], consumer);
    assert.notEqual(refused.code, 0);
    assert.match(refused.stderr, /invalid_arguments/);
    await assert.rejects(stat(path.join(temporary, "refused")));

    const conflict = path.join(temporary, "conflict");
    await mkdir(conflict);
    await writeFile(path.join(conflict, "unknown.txt"), "keep me");
    const blocked = await run(process.execPath, [bin, conflict, ...flags], consumer);
    assert.notEqual(blocked.code, 0);
    assert.match(JSON.stringify(JSON.parse(blocked.stdout).diagnostics), /unknown_file_conflict/);
    assert.equal(await readFile(path.join(conflict, "unknown.txt"), "utf8"), "keep me");

    const before = await readFile(path.join(target, "README.md"));
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Changed project", TASK_TRACKER: "github-issues" } }));
    const failed = await run(process.execPath, [foundry, "apply", "--target", target, ...flags, "--failure-after", "1"], consumer);
    assert.notEqual(failed.code, 0);
    assert.match(JSON.parse(failed.stdout).rollback.message, /rolled back/);
    assert.deepEqual(await readFile(path.join(target, "README.md")), before);

    const cancelled = path.join(temporary, "cancelled");
    const no = await run(process.execPath, [bin, cancelled, "--no-color", "--reduced-motion"], consumer, "Cancelled project\ngithub-issues\nnone\nn\n");
    assert.notEqual(no.code, 0);
    assert.equal(JSON.parse(no.stdout).status, "cancelled");
    assert.match(no.stderr, /Apply these changes/);
    await assert.rejects(stat(cancelled));
    const confirmed = path.join(temporary, "confirmed");
    const yes = await run(process.execPath, [bin, confirmed], consumer, "Confirmed project\ngithub-issues\nnone\ny\n");
    assert.equal(yes.code, 0, yes.stderr);
    assert.equal(JSON.parse(yes.stdout).status, "applied");
    assert.match(yes.stderr, /Apply these changes/);
    const automatic = path.join(temporary, "automatic");
    const accepted = await run(process.execPath, [bin, automatic, "--config", config, "--yes"], consumer);
    assert.equal(accepted.code, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).status, "applied");
    assert.doesNotMatch(accepted.stderr, /Apply these changes/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

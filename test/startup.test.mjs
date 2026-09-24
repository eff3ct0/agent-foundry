import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { detectMode, route, SELF, SETUP, WORK } from "../start.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startup = path.join(root, "start.mjs");
const workFiles = ["AGENT.md", "docs/bindings.md", "templates/agent-runbook.md"];

const writeWork = async (directory) => {
  for (const relative of workFiles) {
    const file = path.join(directory, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "generated\n");
  }
};

const run = async (args, options = {}) => {
  try {
    const result = await execFileAsync(process.execPath, [startup, ...args], options);
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code };
  }
};

test("startup routing recognizes source, setup, work, moved, incomplete, and malformed fixtures", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-startup-test-"));
  try {
    const source = path.join(parent, "source");
    await mkdir(source);
    await writeFile(path.join(source, "MAINTAINERS.md"), "source\n");
    assert.equal((await detectMode(source, "https://github.com/acme/not-template")).mode, SELF);
    assert.equal((await detectMode(source, undefined)).mode, SELF);

    const originSource = path.join(parent, "origin-source");
    await mkdir(originSource);
    await writeFile(path.join(originSource, "placeholders.json"), JSON.stringify({ placeholders: [] }));
    assert.equal((await detectMode(originSource)).mode, SETUP);

    const setup = path.join(parent, "setup");
    await mkdir(setup);
    await writeFile(path.join(setup, "placeholders.json"), JSON.stringify({ placeholders: [] }));
    assert.equal((await detectMode(setup, "git@github.com:acme/service.git")).mode, SETUP);

    const incomplete = path.join(parent, "incomplete");
    await mkdir(path.join(incomplete, ".factory-template-creator"), { recursive: true });
    assert.equal((await detectMode(incomplete, undefined)).status, "incomplete");

    const work = path.join(parent, "work");
    await mkdir(work);
    await writeWork(work);
    assert.equal((await detectMode(work, undefined)).mode, WORK);

    const moved = path.join(parent, "moved");
    await rename(work, moved);
    const movedResult = await route(moved);
    assert.equal(movedResult.mode, WORK);
    assert.equal(movedResult.status, "ready");
    assert.match(movedResult.message, /WORK mode/);

    const malformed = path.join(parent, "malformed");
    await mkdir(malformed);
    await writeFile(path.join(malformed, "placeholders.json"), "{");
    const malformedResult = await route(malformed);
    assert.equal(malformedResult.mode, "ERROR");
    assert.equal(malformedResult.status, "error");
    assert.equal(malformedResult.diagnostics[0].code, "setup_malformed");

    const partial = path.join(parent, "partial");
    await mkdir(partial);
    await writeFile(path.join(partial, "AGENT.md"), "partial\n");
    assert.equal((await detectMode(partial, undefined)).mode, "ERROR");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("SELF mode directs source maintenance to the current repository", async () => {
  const result = await run(["--cwd", root]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /gh issue list -R eff3ct0\/agent-foundry --label type:product/u);
  assert.doesNotMatch(result.stdout, /eff3ct0\/factory-template/u);
});

test("startup JSON output is deterministic and errors stay bounded", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-startup-output-"));
  try {
    await writeFile(path.join(parent, "placeholders.json"), JSON.stringify({ placeholders: [] }));
    const first = await run(["--cwd", parent, "--json"]);
    const second = await run(["--cwd", parent, "--json"]);
    assert.equal(first.code, 0);
    assert.equal(first.stdout, second.stdout);
    assert.equal(JSON.parse(first.stdout).mode, SETUP);
    assert.equal(first.stderr, "");

    await writeFile(path.join(parent, "placeholders.json"), "{");
    const malformed = await run(["--cwd", parent, "--json"]);
    assert.notEqual(malformed.code, 0);
    assert.equal(JSON.parse(malformed.stdout).status, "error");
    assert.match(malformed.stderr, /Startup routing failed closed/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("maintained adapters invoke only the canonical Node router", async () => {
  const claude = await readFile(path.join(root, "hooks/claude-code/session-start.sh"), "utf8");
  const pi = await readFile(path.join(root, "hooks/pi/factory-start.ts"), "utf8");
  const opencode = await readFile(path.join(root, "hooks/opencode/factory-start.ts"), "utf8");
  for (const adapter of [claude, pi, opencode]) {
    assert.match(adapter, /start\.mjs/);
    assert.doesNotMatch(adapter, /python3 start\.py/);
  }
  assert.match(claude, /exec node/);
  assert.match(claude, /--cwd/);
  assert.match(pi, /run\(process\.execPath/);
  assert.match(opencode, /run\(process\.execPath/);
});

test("source mode uses a local marker instead of GitHub repository identity", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "factory-startup-marker-"));
  try {
    await writeFile(path.join(parent, "placeholders.json"), JSON.stringify({ placeholders: [] }));
    const result = await run(["--cwd", parent, "--json"]);
    assert.equal(JSON.parse(result.stdout).mode, SETUP);
    assert.match(JSON.parse(result.stdout).message, /exact-version creator package/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

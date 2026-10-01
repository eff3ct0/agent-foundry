import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Drive dist/index.js inside a real PTY (util-linux `script`), feeding keystrokes
// as each prompt appears. `drive(output, child)` is called on every output chunk
// with the cumulative terminal text; it should guard its own one-shot writes.
const runInstaller = ({ command, target, stdoutFile, extraEnv = {}, drive }) => {
  const shellCommand = stdoutFile
    ? `node dist/index.js ${command} --target ${target} --reduced-motion > ${stdoutFile}`
    : `node dist/index.js ${command} --target ${target} --reduced-motion`;
  const child = spawn("script", ["-qefc", shellCommand, "/dev/null"], {
    cwd: root,
    env: { ...process.env, COLUMNS: "80", FACTORY_ASCII: "1", NO_COLOR: "1", ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("PTY installer did not exit within 10 seconds"));
    }, 10_000);
    const onChunk = (chunk) => { output += chunk; drive(output, child); };
    child.stdout.setEncoding("utf8").on("data", onChunk);
    child.stderr.setEncoding("utf8").on("data", onChunk);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, output }); });
  });
};

const ptyUnavailable = async (context) => {
  if (process.platform === "win32") {
    context.skip("util-linux script PTY harness is not available on Windows");
    return true;
  }
  try {
    await access("/usr/bin/script");
  } catch {
    context.skip("util-linux script PTY harness is not available");
    return true;
  }
  return false;
};

const runPtyCancellation = async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-pty-cancel-"));
  const target = path.join(parent, "project");
  const command = `node dist/index.js apply --target ${target} --reduced-motion`;
  const child = spawn("script", ["-qefc", command, "/dev/null"], {
    cwd: root,
    env: { ...process.env, COLUMNS: "80", FACTORY_ASCII: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let sentEscape = false;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("PTY cancellation did not exit within 8 seconds"));
    }, 8_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
      if (!sentEscape && output.includes("Task provider")) {
        sentEscape = true;
        child.stdin.write("\u001b");
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.stdin.write("PTY cancellation\n");
  });
  try {
    assert.equal(sentEscape, true, "PTY did not reach enum selection");
    assert.notEqual(result.code, 0, `cancellation unexpectedly succeeded (${result.signal ?? "no signal"})`);
    assert.match(output, /Installation cancelled/);
    await assert.rejects(stat(target));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
};

test("real PTY Escape cancellation exits promptly without mutation", async (context) => {
  if (await ptyUnavailable(context)) return;
  await runPtyCancellation();
});

test("real PTY enum selector redraws in place instead of stacking duplicate frames", async (context) => {
  if (await ptyUnavailable(context)) return;
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-pty-redraw-"));
  try {
    let sentName = false;
    let sentDown = false;
    let cancelled = false;
    const clearSequence = /\u001b\[\d+A\u001b\[0J/;
    const { code, output } = await runInstaller({
      command: "dry-run",
      target: path.join(parent, "project"),
      drive: (text, child) => {
        if (!sentName && text.includes("(PROJECT_NAME)")) { sentName = true; child.stdin.write("project\n"); return; }
        if (sentName && !sentDown && text.includes("Task provider")) { sentDown = true; child.stdin.write("\u001b[B"); return; }
        if (sentDown && !cancelled && clearSequence.test(text)) { cancelled = true; child.stdin.write("\u001b"); }
      },
    });
    assert.equal(sentDown, true, "PTY did not reach the enum selector");
    // In-place redraw: cursor-up over the previous frame + clear-to-end-of-screen.
    assert.match(output, clearSequence, "enum selector did not emit an in-place clear sequence");
    // After the final clear, the settled screen shows the prompt block exactly once.
    const tail = output.slice(output.lastIndexOf("\u001b[0J"));
    assert.equal(tail.split("Task provider (TASK_TRACKER)").length - 1, 1, "duplicate enum frames survived the redraw");
    assert.notEqual(code, 0);
    assert.match(output, /Installation cancelled/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

const driveToAgents = (keysForAgents) => {
  let sentName = false;
  let confirmedTask = false;
  let drivenAgents = false;
  const drive = (text, child) => {
    if (!sentName && text.includes("(PROJECT_NAME)")) { sentName = true; child.stdin.write("project\n"); return; }
    if (sentName && !confirmedTask && text.includes("Task provider")) { confirmedTask = true; child.stdin.write("\r"); return; }
    if (confirmedTask && !drivenAgents && text.includes("Agent providers (AGENTS)")) { drivenAgents = true; child.stdin.write(keysForAgents); }
  };
  return { drive, reached: () => drivenAgents };
};

test("real PTY AGENTS multi-select resolves toggled checkboxes to comma-joined ids", async (context) => {
  if (await ptyUnavailable(context)) return;
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-pty-agents-"));
  try {
    // Make the toggled providers' executables resolvable so availability passes offline.
    const binDir = path.join(parent, "bin");
    await mkdir(binDir);
    for (const executable of ["claude", "opencode"]) {
      const file = path.join(binDir, executable);
      await writeFile(file, "#!/bin/sh\nexit 0\n");
      await chmod(file, 0o755);
    }
    const envelopeFile = path.join(parent, "envelope.json");
    // Space toggles claude-code (cursor 0), Down moves to opencode, Space toggles it, Enter confirms.
    const driver = driveToAgents(" \u001b[B \r");
    const { output } = await runInstaller({
      command: "dry-run",
      target: path.join(parent, "project"),
      stdoutFile: envelopeFile,
      extraEnv: { PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
      drive: driver.drive,
    });
    assert.equal(driver.reached(), true, `PTY did not reach the AGENTS multi-select; output:\n${output}`);
    const envelope = JSON.parse(await readFile(envelopeFile, "utf8"));
    assert.equal(envelope.status, "dry-run");
    assert.deepEqual(envelope.providers.selected.map((provider) => provider.id), ["claude-code", "opencode"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("real PTY AGENTS multi-select with no toggles resolves to none", async (context) => {
  if (await ptyUnavailable(context)) return;
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-pty-agents-none-"));
  try {
    const envelopeFile = path.join(parent, "envelope.json");
    const driver = driveToAgents("\r"); // confirm immediately with nothing toggled
    const { output } = await runInstaller({
      command: "dry-run",
      target: path.join(parent, "project"),
      stdoutFile: envelopeFile,
      drive: driver.drive,
    });
    assert.equal(driver.reached(), true, `PTY did not reach the AGENTS multi-select; output:\n${output}`);
    const envelope = JSON.parse(await readFile(envelopeFile, "utf8"));
    assert.equal(envelope.status, "dry-run");
    assert.deepEqual((envelope.providers?.selected ?? []).map((provider) => provider.id), []);
    assert.equal(envelope.diagnostics.some((diagnostic) => diagnostic.code === "provider_unavailable"), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

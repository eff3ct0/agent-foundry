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
const runInstaller = ({ command, target, stdoutFile, extraEnv = {}, drive, cols }) => {
  const base = `node dist/index.js ${command} --target ${target} --reduced-motion`;
  const redirected = stdoutFile ? `${base} > ${stdoutFile}` : base;
  // `cols` resizes the PTY so long lines actually wrap, reproducing the narrow-terminal redraw case.
  const shellCommand = cols ? `stty cols ${cols} rows 24; ${redirected}` : redirected;
  const child = spawn("script", ["-qefc", shellCommand, "/dev/null"], {
    cwd: root,
    env: { ...process.env, COLUMNS: String(cols ?? 80), FACTORY_ASCII: "1", NO_COLOR: "1", ...extraEnv },
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
    // Wrap-proof redraw: restore the saved cursor (ESC 8) then clear-to-end-of-screen, never a line-count cursor-up.
    const clearSequence = /\u001b8\u001b\[0J/;
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
    // First draw saves the cursor (ESC 7); every redraw restores it (ESC 8) and clears to end of screen.
    assert.match(output, /\u001b7/, "enum selector did not save the cursor on first draw");
    assert.match(output, clearSequence, "enum selector did not emit a save/restore in-place clear sequence");
    assert.doesNotMatch(output, /\u001b\[\d+A/u, "redraw must not move the cursor up by a logical line count");
    // After the final clear, the settled screen shows the prompt block exactly once.
    const tail = output.slice(output.lastIndexOf("\u001b[0J"));
    assert.equal(tail.split("Task provider (TASK_TRACKER)").length - 1, 1, "duplicate enum frames survived the redraw");
    assert.notEqual(code, 0);
    assert.match(output, /Installation cancelled/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

// Minimal VT replay for the in-place redraw: ESC 7 saves the cursor, ESC 8 restores it, ESC[0J
// clears to end of screen, ESC[<n>A is the retired logical-line cursor-up, plus CR, LF, and
// auto-wrap at `width`. A hint wider than `width` pushes extra physical rows that a logical-line
// cursor-up undershoots, stranding a duplicate header row that this replay surfaces (>1 header).
const renderScreen = (bytes, width) => {
  const rows = [[]];
  let r = 0, c = 0, savedR = 0, savedC = 0;
  const ensure = (row) => { while (rows.length <= row) rows.push([]); };
  for (let i = 0; i < bytes.length; i += 1) {
    const ch = bytes[i];
    if (ch === "\u001b") {
      if (bytes[i + 1] === "7") { savedR = r; savedC = c; i += 1; continue; }
      if (bytes[i + 1] === "8") { r = savedR; c = savedC; i += 1; continue; }
      const seq = /^\[(\d*)([A-Za-z])/u.exec(bytes.slice(i + 1, i + 8));
      if (seq) {
        const n = seq[1] === "" ? 1 : Number(seq[1]);
        if (seq[2] === "J") { rows[r] = rows[r].slice(0, c); rows.length = r + 1; }
        else if (seq[2] === "A") { r = Math.max(0, r - n); }
        else if (seq[2] === "B") { r += n; ensure(r); }
        i += seq[0].length;
      }
      continue;
    }
    if (ch === "\r") { c = 0; continue; }
    if (ch === "\n") { r += 1; ensure(r); continue; }
    ensure(r);
    while (rows[r].length < c) rows[r].push(" ");
    rows[r][c] = ch;
    c += 1;
    if (c >= width) { c = 0; r += 1; ensure(r); }
  }
  return rows.map((row) => row.join("").replace(/\s+$/u, ""));
};

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

test("real PTY AGENTS multi-select header stays intact when the hint wraps in a narrow terminal (#379)", async (context) => {
  if (await ptyUnavailable(context)) return;
  const parent = await mkdtemp(path.join(os.tmpdir(), "creator-pty-narrow-"));
  try {
    const binDir = path.join(parent, "bin");
    await mkdir(binDir);
    for (const executable of ["claude", "opencode"]) {
      const file = path.join(binDir, executable);
      await writeFile(file, "#!/bin/sh\nexit 0\n");
      await chmod(file, 0o755);
    }
    const envelopeFile = path.join(parent, "envelope.json");
    // 40 columns: the 24-char header fits on one row but the 47-char toggle hint wraps, the exact
    // condition that made the retired logical-line cursor-up undershoot and duplicate the header.
    const driver = driveToAgents(" \u001b[B \r");
    const { output } = await runInstaller({
      command: "dry-run",
      target: path.join(parent, "project"),
      stdoutFile: envelopeFile,
      cols: 40,
      extraEnv: { PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
      drive: driver.drive,
    });
    assert.equal(driver.reached(), true, `PTY did not reach the AGENTS multi-select; output:\n${output}`);
    assert.doesNotMatch(output, /\u001b\[\d+A/u, "narrow redraw must not use a logical-line cursor-up");
    const screen = renderScreen(output, 40);
    const headerRows = screen.filter((line) => line.includes("Agent providers (AGENTS)"));
    assert.equal(headerRows.length, 1, `header should render exactly once, got ${headerRows.length}:\n${screen.join("\n")}`);
    const envelope = JSON.parse(await readFile(envelopeFile, "utf8"));
    assert.deepEqual(envelope.providers.selected.map((provider) => provider.id), ["claude-code", "opencode"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

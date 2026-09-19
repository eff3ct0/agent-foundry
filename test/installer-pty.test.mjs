import assert from "node:assert/strict";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  if (process.platform === "win32") {
    context.skip("util-linux script PTY harness is not available on Windows");
    return;
  }
  try {
    await access("/usr/bin/script");
  } catch {
    context.skip("util-linux script PTY harness is not available");
    return;
  }
  await runPtyCancellation();
});

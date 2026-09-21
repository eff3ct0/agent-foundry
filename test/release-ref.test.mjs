import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateTag } from "../scripts/release-ref.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "release-ref.mjs");

test("release reference validation accepts safe Git tags", () => {
  assert.equal(validateTag(" v1.2.3 "), "v1.2.3");
  assert.equal(validateTag("release+build/1"), "release+build/1");
});

test("release reference validation rejects unsafe Git refs", () => {
  for (const tag of [null, "", "@", "release..candidate", "release//candidate", "release@{1}", ".release", "release.", "release.lock"]) {
    assert.throws(() => validateTag(tag), /tag must be a safe non-empty Git ref/);
  }
});

test("Node command validates the Python consumer boundary", async () => {
  const selfCheck = await execFileAsync(process.execPath, [script, "--self-check"]);
  assert.equal(selfCheck.stdout, "release reference validation self-check OK\n");

  const consumer = await execFileAsync("python3", ["-c", "from scripts.release_ref import validate_tag; print(validate_tag('release+build/1'))"], { cwd: root });
  assert.equal(consumer.stdout, "release+build/1\n");
  await assert.rejects(
    execFileAsync("python3", ["-c", "from scripts.release_ref import validate_tag; validate_tag('release..candidate')"], { cwd: root }),
    /tag must be a safe non-empty Git ref/,
  );
});

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { ReleaseNotesContractError, check } from "../scripts/check-release-notes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixture = async (mutate, assertion) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "release-notes-contract-"));
  try {
    await mkdir(path.join(directory, "scripts"));
    const file = path.join(directory, "scripts", "release-notes.mjs");
    await cp(path.join(root, "scripts", "release-notes.mjs"), file);
    await writeFile(file, mutate(await readFile(file, "utf8")), "utf8");
    await assert.rejects(check(directory), (error) => error instanceof ReleaseNotesContractError && assertion(error.message));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("the static checker accepts the deterministic release-note generator", async () => {
  assert.equal(await check(root), "release notes deterministic contract OK");
});

test("the static checker rejects remote, time-based, and unstable generator mutations", async () => {
  for (const [from, to] of [
    ["const root =", "const remote = fetch('https://example.invalid');\nconst root ="],
    ["normalized.sort(", "normalized.map("],
    ["\"--no-merges\", ", ""],
    ["Source commit:", "Generated at ${Date.now()}\nSource commit:"],
  ]) {
    await fixture((source) => source.replace(from, to), (message) => message.startsWith("release notes generator"));
  }
});

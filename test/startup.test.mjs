import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { detectMode } from "../start.mjs";

test("passive startup refuses linked and legacy state without changing it", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "foundry-407-startup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal((await detectMode(directory)).mode, "INCOMPLETE");
  assert.deepEqual(await readdir(directory), []);
  await mkdir(path.join(directory, ".factory"));
  await symlink(os.tmpdir(), path.join(directory, ".factory/creator"));
  assert.equal((await detectMode(directory)).mode, "UNSAFE");
  await rm(path.join(directory, ".factory/creator"));
  await mkdir(path.join(directory, ".factory/creator"));
  await writeFile(path.join(directory, ".factory/creator/state.json"), '{"schema_version":1,"onboarded":true}');
  assert.equal((await detectMode(directory)).mode, "UNSAFE");
});

test("source marker preserves SELF protection independently of installed configuration", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "foundry-407-self-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "MAINTAINERS.md"), "source governance\n");
  const result = await detectMode(directory);
  assert.equal(result.mode, "SELF");
  assert.notEqual(result.integrity, "verified");
  assert.equal(result.setup, "incomplete");
  assert.deepEqual(await readdir(directory), ["MAINTAINERS.md"]);
});

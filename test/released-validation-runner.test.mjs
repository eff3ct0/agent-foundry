import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildReleasePackage, runReleasedValidationCase, verifyReleaseSource } from "../scripts/released-validation-runner.mjs";

const sha = "a".repeat(40);
const identity = {
  schema_version: 1,
  package: { name: "@eff3ct/agent-foundry", version: "0.1.0" },
  tarball_digest: `sha256:${"a".repeat(64)}`,
  payload_digest: `sha256:${"b".repeat(64)}`,
  tree_digest: `sha256:${"c".repeat(64)}`,
};
const matrixCase = { ci: "go", task: "github-issues", secrets: "none", intelligence: "none", agent: "codex" };
const sourceRunner = (calls, head = sha, dirty = "") => async (name, arguments_, options) => {
  calls.push([name, arguments_, Object.keys(options.env).sort()]);
  if (name === "git" && arguments_[0] === "rev-parse") return { stdout: `${head}\n` };
  if (name === "git") return { stdout: dirty };
  if (arguments_[0] === "pack") await writeFile(path.join(arguments_.at(-1), "eff3ct-agent-foundry-0.1.0.tgz"), "package");
  return { stdout: "" };
};

test("release package build verifies the exact clean SHA before fixed build commands", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-released-validation-"));
  const calls = [];
  try {
    const result = await buildReleasePackage({ sourcePath: directory, releaseSha: sha, outputDirectory: path.join(directory, "evidence"), environment: { PATH: process.env.PATH, TOKEN: "secret" }, execute: sourceRunner(calls) });
    assert.equal(result.release_sha, sha);
    assert.match(result.tarball_path, /release-package\/eff3ct-agent-foundry-0\.1\.0\.tgz$/u);
    assert.deepEqual(calls.map(([name, arguments_]) => [name, arguments_]), [
      ["git", ["rev-parse", "HEAD"]], ["git", ["status", "--porcelain"]],
      ["pnpm", ["install", "--frozen-lockfile"]], ["pnpm", ["build"]], ["pnpm", ["pack", "--ignore-scripts", "--pack-destination", path.join(directory, "evidence", "release-package")]],
    ]);
    assert.deepEqual(calls[0][2], ["PATH"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source validation rejects mismatched and modified release checkouts before packaging", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-released-validation-"));
  try {
    await assert.rejects(verifyReleaseSource({ sourcePath: directory, releaseSha: sha, execute: sourceRunner([], "b".repeat(40)) }), /HEAD/u);
    await assert.rejects(verifyReleaseSource({ sourcePath: directory, releaseSha: sha, execute: sourceRunner([], sha, " M package.json") }), /immutable/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("released validation writes bounded redacted per-case evidence from the installed creator", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-released-validation-"));
  try {
    const result = await runReleasedValidationCase({ releasePackage: { release_sha: sha, tarball_path: "/tmp/release.tgz" }, matrixCase, configuration: { values: {} }, outputDirectory: directory, environment: { PATH: process.env.PATH, TOKEN: "secret" }, runCreator: async ({ environment }) => {
      assert.deepEqual(Object.keys(environment), ["PATH"]);
      return { identity, creator: { status: "applied", verification: "verified" } };
    } });
    assert.equal(result.command_results[0].status, "passed");
    const evidence = await readFile(path.join(directory, "ci=go;task=github-issues;secrets=none;intelligence=none;agent=codex", "release-evidence.json"), "utf8");
    assert.equal(JSON.parse(evidence).identity.payload_digest, identity.payload_digest);
    await assert.rejects(runReleasedValidationCase({ releasePackage: { release_sha: sha, tarball_path: "/tmp/release.tgz" }, matrixCase, configuration: {}, outputDirectory: directory, runCreator: async () => { throw new Error("TOKEN=secret failed in /tmp/private"); } }), /case failed/u);
    const failed = await readFile(path.join(directory, "ci=go;task=github-issues;secrets=none;intelligence=none;agent=codex", "release-evidence.json"), "utf8");
    assert.equal(failed.includes("TOKEN=secret") || failed.includes("/tmp/private"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { createFixtureReadClient, main, prepareRelease } from "../scripts/release-prepare.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "test", "fixtures", "release-prepare-fixture.json");
const scriptPath = path.join(root, "scripts", "release-prepare.mjs");
const sha = "a".repeat(40);
const execFileAsync = promisify(execFile);

const options = ["--repository", "acme/factory", "--tag", "v1.2.3", "--expected-sha", sha, "--fixture", fixturePath];

test("prepares a verified published release with a deterministic recipe matrix", async () => {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  assert.deepEqual(await prepareRelease({
    client: createFixtureReadClient(fixture),
    repository: "acme/factory",
    tag: "v1.2.3",
    expectedSha: sha,
    recipes: { typescript: "node", rust: "cargo", go: "go", python: "python" },
  }), {
    schema_version: 1,
    status: "ok",
    release: { tag: "v1.2.3", sha },
    matrix: { recipe_count: 4, recipes: ["go", "python", "rust", "typescript"] },
  });
});

test("returns the F2 published-release failure without producing matrix output", async () => {
  const result = await prepareRelease({
    client: { async get() { return { status: "indeterminate", code: "read_indeterminate" }; } },
    repository: "acme/factory",
    tag: "v1.2.3",
    expectedSha: sha,
    recipes: { go: "go" },
  });
  assert.deepEqual(result, { schema_version: 1, status: "indeterminate", code: "read_indeterminate" });
  assert.equal("matrix" in result, false);
});

test("CLI emits a stable success envelope from an offline fixture", async () => {
  const result = await execFileAsync(process.execPath, [scriptPath, ...options], { cwd: root });
  assert.deepEqual(JSON.parse(result.stdout), {
    schema_version: 1,
    status: "ok",
    release: { tag: "v1.2.3", sha },
    matrix: { recipe_count: 4, recipes: ["go", "python", "rust", "typescript"] },
  });
  assert.equal(result.stderr, "");
});

test("CLI rejects malformed arguments and fixtures with stable failure envelopes", async () => {
  assert.deepEqual(await main(["--repository", "acme/factory"]), { schema_version: 1, status: "rejected", code: "invalid_arguments" });
  assert.deepEqual(await main(["--repository", "acme/factory", "--tag", "release..candidate", "--expected-sha", sha, "--fixture", fixturePath]), {
    schema_version: 1,
    status: "rejected",
    code: "invalid_arguments",
  });
  await assert.rejects(execFileAsync(process.execPath, [scriptPath, ...options.slice(0, -1), path.join(root, "package.json")], { cwd: root }), (error) => {
    assert.equal(error.code, 1);
    assert.deepEqual(JSON.parse(error.stdout), { schema_version: 1, status: "rejected", code: "invalid_fixture" });
    assert.equal(error.stderr, "");
    return true;
  });
  assert.deepEqual(await main([...options.slice(0, -1), path.join(root, "package.json")]), { schema_version: 1, status: "rejected", code: "invalid_fixture" });
});

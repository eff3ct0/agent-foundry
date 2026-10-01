import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { generateReleaseNotes, main, readReleaseCommits } from "../scripts/release-notes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "release-notes.mjs");
const sha = "a".repeat(40);
const secondSha = "b".repeat(40);

test("release notes are grouped and byte-stable regardless of commit input order", () => {
  const input = [
    { sha: secondSha, subject: "fix(release): keep readback offline" },
    { sha, subject: "feat(creator)!: add exact version output" },
    { sha: "c".repeat(40), subject: "maintain the release ledger" },
  ];
  const expected = generateReleaseNotes({
    packageName: "@eff3ct/agent-foundry",
    version: "0.1.2",
    sourceSha: "d".repeat(40),
    previousTag: "v0.1.0",
    commits: input,
  });
  assert.equal(expected, generateReleaseNotes({
    packageName: "@eff3ct/agent-foundry",
    version: "0.1.2",
    sourceSha: "d".repeat(40),
    previousTag: "v0.1.0",
    commits: [...input].reverse(),
  }));
  assert.match(expected, /# @eff3ct\/agent-foundry v0\.1\.2/u);
  assert.match(expected, /## Features\n\n- \*\*creator:\*\* add exact version output \*\*\(breaking\)\*\*/u);
  assert.match(expected, /## Other changes\n\n- maintain the release ledger/u);
  assert.equal(expected.includes("2026-"), false);
});

test("empty ranges produce an explicit deterministic note", () => {
  assert.equal(generateReleaseNotes({
    packageName: "@eff3ct/agent-foundry",
    version: "0.1.2",
    sourceSha: sha,
    previousTag: "v0.1.0",
    commits: [],
  }), [
    "# @eff3ct/agent-foundry v0.1.2",
    "",
    `Source commit: \`${sha}\``,
    `Commit range: \`v0.1.0..${sha}\``,
    "",
    "## Changes",
    "",
    "- No changes recorded.",
    "",
  ].join("\n"));
});

test("duplicate commit identities and unrelated history fail closed", async () => {
  assert.throws(() => generateReleaseNotes({
    packageName: "@eff3ct/agent-foundry", version: "0.1.2", sourceSha: sha, previousTag: "v0.1.0",
    commits: [{ sha, subject: "feat: one" }, { sha, subject: "feat: duplicate" }],
  }), (error) => error.code === "duplicate_commit");

  const calls = [];
  await assert.rejects(readReleaseCommits({
    previousTag: "v0.1.0",
    sourceSha: sha,
    runGit: async (args) => { calls.push(args); throw new Error("not an ancestor"); },
  }), (error) => error.code === "unrelated_history");
  assert.deepEqual(calls, [["merge-base", "--is-ancestor", "v0.1.0", sha]]);
});

test("release commit collection uses an offline, bounded Git range", async () => {
  const calls = [];
  const commits = await readReleaseCommits({
    previousTag: "v0.1.0",
    sourceSha: sha,
    runGit: async (args) => {
      calls.push(args);
      return args[0] === "log" ? { stdout: `${secondSha}\0fix: b\n${sha}\0feat: a\n` } : { stdout: "" };
    },
  });
  assert.deepEqual(commits, [{ sha: secondSha, subject: "fix: b" }, { sha, subject: "feat: a" }]);
  assert.deepEqual(calls, [
    ["merge-base", "--is-ancestor", "v0.1.0", sha],
    ["log", "--no-merges", "--format=%H%x00%s", "--no-decorate", `v0.1.0..${sha}`],
  ]);
});

test("CLI reads package version and emits only local generated notes", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.version, "0.3.1");
  await assert.rejects(main(["--version", "0.1.2", "--source-sha", sha, "--previous-tag", "v0.1.0"]), (error) => error.code === "package_version_mismatch");
  const result = await promisify(execFile)(process.execPath, [script, "--version", "0.3.1", "--source-sha", "c153a0b358c65a3983c32e2febd225dd02b5f9fd", "--previous-tag", "v0.1.0"], { cwd: root });
  assert.match(result.stdout, /^# @eff3ct\/agent-foundry v0\.3\.1\n/u);
  assert.equal(result.stderr, "");
});

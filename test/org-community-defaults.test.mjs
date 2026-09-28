import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = "org-community-defaults";
const files = ["ISSUE_TEMPLATE/bug.yml", "ISSUE_TEMPLATE/feature.yml", "PULL_REQUEST_TEMPLATE.md"];
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("organization defaults are generic, usable forms and PR text", async () => {
  const contents = await Promise.all(files.map((file) => read(`${seed}/${file}`)));
  for (const [index, content] of contents.entries()) {
    assert.ok(content.trim(), `${files[index]} must not be empty`);
    assert.doesNotMatch(content, /agent[ -]?foundry|eff3ct0|status:approved|type:[a-z-]+|required approval|approval label|approval gate|must be approved|release (?:check|gate|approval)|Closes\s+#\d+|templates\//iu);
  }
  for (const form of contents.slice(0, 2)) {
    assert.match(form, /^name: /mu);
    assert.match(form, /^description: /mu);
    assert.match(form, /^body:\s*$/mu);
    assert.match(form, /^    validations:\s*\n      required: true$/mu);
    assert.doesNotMatch(form, /^labels:|^    default:|^    value:/mu);
  }
  assert.match(contents[2], /^## Summary$/mu);
  assert.match(contents[2], /^## Verification$/mu);
});

test("source-only defaults are inventoried and guide maps only these paths", async () => {
  const ownership = JSON.parse(await read("archetype-ownership.json"));
  const removed = Object.values(ownership.categories)
    .filter((category) => category.disposition === "removed")
    .flatMap((category) => category.paths);
  assert.ok(removed.some((entry) => entry.path === seed && entry.kind === "directory"));
  assert.ok(!Object.values(ownership.categories)
    .filter((category) => category.disposition === "inherited" || category.payload === true)
    .flatMap((category) => category.paths)
    .some((entry) => entry.path === seed));
  const guide = await read("docs/org-factory.md");
  for (const file of files) {
    assert.ok(guide.includes(`\`${file}\` | \`.github/${file}\``), `missing verbatim mapping for ${file}`);
  }
  assert.match(guide, /create it only if absent; if present, compare bytes/iu);
  assert.match(guide, /A different file, symlink, or unreviewed destination\s+is a \*\*stop\*\*/iu);
});

test("offline creator removes source-only defaults from a fresh generated project", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "community-defaults-"));
  const target = path.join(parent, "project");
  const config = path.join(parent, "answers.json");
  try {
    await writeFile(config, JSON.stringify({ values: { PROJECT_NAME: "Example project", TASK_TRACKER: "github-issues" } }));
    const args = ["--target", target, "--config", config, "--non-interactive"];
    const cli = path.join(root, "dist/index.js");
    const run = async (command) => JSON.parse((await execFileAsync(process.execPath, [cli, command, ...args], { cwd: root })).stdout);
    assert.equal((await run("apply")).status, "applied");
    assert.equal((await run("verify")).status, "verified");
    await assert.rejects(stat(path.join(target, seed)), { code: "ENOENT" });
    assert.match(await readFile(path.join(target, ".github/ISSUE_TEMPLATE/bug.yml"), "utf8"), /name: Bug report/u);
    assert.ok(await stat(path.join(target, ".factory/docs/org-factory.md")));
    assert.equal((await run("apply")).status, "noop");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

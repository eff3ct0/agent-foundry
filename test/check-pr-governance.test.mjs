import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { boundTaskProvider, githubIssueLabels, issueNumbers, validateEvent, validatePr } from "../scripts/typed-inherited-runtime/check-pr-governance.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "typed-inherited-runtime", "check-pr-governance.js");
const linearFixture = path.join(root, "test", "fixtures", "pr-governance", "linear.json");
const approved = { 42: ["status:approved"] };
const githubPr = { body: "Summary\n\nCloses #42 and fixes acme/example#42.", labels: [{ name: "type:product" }] };

test("GitHub governance requires one type label, a local close reference, and approval", () => {
  assert.deepEqual(validatePr(githubPr, approved, "acme/example", "github-issues"), []);
  assert.deepEqual(issueNumbers("Fixes acme/example#7 and closes other/repo#8", "acme/example"), [7]);
  const rejected = validatePr({ body: "Closes #42", labels: [] }, {}, "acme/example", "github-issues");
  assert.ok(rejected.includes("PR must have exactly one type:* label"));
  assert.ok(rejected.includes("linked issue #42 must have the human status:approved label"));
  assert.match(validatePr({ ...githubPr, body: "Closes other/repo#42" }, approved, "acme/example", "github-issues").join("\n"), /closing reference/u);
});

test("a Linear fixture requires its native reference without issue lookups", async () => {
  const fixture = JSON.parse(await readFile(linearFixture, "utf8"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "governance-linear-"));
  try {
    await mkdir(path.join(directory, "docs"));
    await writeFile(path.join(directory, "docs", "bindings.md"), fixture.bindings, "utf8");
    const provider = await boundTaskProvider(directory);
    assert.equal(provider, fixture.provider);
    const errors = await validateEvent(fixture.event, fixture.repository, "token", {
      provider,
      fetchImpl: () => { throw new Error("Linear validation must not query GitHub"); },
    });
    assert.deepEqual(errors, fixture.expectedErrors);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("non-GitHub providers reject missing native references without issue lookups", async () => {
  const jira = { body: "Summary\n\nJira: FEX-1", labels: [{ name: "type:product" }] };
  assert.deepEqual(validatePr(jira, {}, undefined, "jira"), []);
  assert.match(validatePr({ ...jira, body: "Closes #42" }, {}, undefined, "jira").join("\n"), /native Jira reference/u);
});

test("event validation reads each linked GitHub issue and rejects malformed responses", async () => {
  const requested = [];
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => {
    requested.push(url);
    return { labels: [{ name: "status:approved" }] };
  } });
  assert.deepEqual(await validateEvent({ pull_request: githubPr }, "acme/example", "token", { provider: "github-issues", fetchImpl }), []);
  assert.deepEqual(requested, ["https://api.github.com/repos/acme/example/issues/42"]);
  await assert.rejects(githubIssueLabels("acme/example", "token", 42, async () => ({ ok: false, status: 503 })), /status 503/u);
  await assert.rejects(githubIssueLabels("acme/example", "token", 42, async () => ({ ok: true, status: 200, json: async () => ({}) })), /malformed labels/u);
});

test("provider fixture reads generated bindings and falls back when absent", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "governance-provider-"));
  try {
    assert.equal(await boundTaskProvider(directory), "github-issues");
    await mkdir(path.join(directory, "docs"));
    await writeFile(path.join(directory, "docs", "bindings.md"), "> **Capability:** `task`\n> **Provider:** `linear`\n");
    assert.equal(await boundTaskProvider(directory), "linear");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("required validate runs trusted validator and bindings despite PR replacements", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "governance.yml"), "utf8");
  const untrusted = await mkdtemp(path.join(os.tmpdir(), "governance-pr-"));
  try {
    await mkdir(path.join(untrusted, "docs"));
    await mkdir(path.join(untrusted, "scripts"));
    await writeFile(path.join(untrusted, "docs", "bindings.md"), "> **Capability:** `task`\n> **Provider:** `linear`\n", "utf8");
    await mkdir(path.join(untrusted, "scripts", "typed-inherited-runtime"));
    await writeFile(path.join(untrusted, "scripts", "typed-inherited-runtime", "check-pr-governance.js"), "process.exit(0);\n", "utf8");

    assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
    assert.doesNotMatch(workflow, /merge_commit_sha/u);
    assert.equal((workflow.match(/uses: actions\/checkout@/gu) ?? []).length, 1);
    assert.match(workflow, /run: node scripts\/typed-inherited-runtime\/check-pr-governance\.js/u);
    const buildStep = "      - name: Verify committed typed runtime\n        run: |\n          npm install --global pnpm@12.4.2\n          pnpm install --frozen-lockfile --ignore-scripts\n          pnpm build\n";
    const validateStep = "      - name: Validate PR metadata\n        run: node scripts/typed-inherited-runtime/check-pr-governance.js\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n";
    assert.ok(workflow.indexOf(buildStep) > workflow.indexOf("persist-credentials: false"));
    assert.ok(workflow.indexOf(validateStep) > workflow.indexOf(buildStep));
    assert.equal((workflow.match(/pnpm build/gu) ?? []).length, 1);
    assert.equal((workflow.match(/GITHUB_TOKEN:/gu) ?? []).length, 1);
    assert.equal((workflow.match(/uses: actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/gu) ?? []).length, 1);
    for (const changed of [workflow.replace(buildStep, ""), workflow.replace(buildStep, "").replace(validateStep, validateStep + buildStep)]) {
      assert.equal(changed.indexOf(buildStep) < changed.indexOf(validateStep) && changed.indexOf(buildStep) >= 0, false);
    }
    assert.doesNotMatch(workflow, /check-pr-governance\.py/u);
    assert.equal(await boundTaskProvider(root), "github-issues");
    assert.equal(await boundTaskProvider(untrusted), "linear");
  } finally {
    await rm(untrusted, { recursive: true, force: true });
  }
});

test("CLI self-check validates the pinned Node workflow consumer", async () => {
  const result = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.equal(result.stdout, "self-check OK\n");
});

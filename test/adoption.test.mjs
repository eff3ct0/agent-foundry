import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import creator from "../dist/creator.js";

const exec = promisify(execFile);
const configuration = JSON.parse(await readFile(new URL("./fixtures/matt-first.json", import.meta.url)));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixture = async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "foundry-408-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, "application");
  const originals = {
    "AGENT.md": "# Application rules\n\nUse the existing application checks. Foundry may add nonconflicting procedure guidance.\n",
    "docs/bindings.md": "# Application authority\n\nTask authority: GitHub eff3ct0/agent-foundry Project 1. Documentation: local Git.\n",
    ".gitignore": "node_modules/\n",
    "start.mjs": "console.log('existing application');\n",
    "src/app.mjs": "export const answer = () => 42;\n",
    ".github/workflows/ci.yml": "name: Application CI\non: push\njobs: {}\n",
    ".factory/unrelated.txt": "Project-owned support; never remove.\n",
    "MAINTAINERS.md": "Application maintainers own application policy.\n",
  };
  for (const [relative, bytes] of Object.entries(originals)) {
    await mkdir(path.dirname(path.join(target, relative)), { recursive: true });
    await writeFile(path.join(target, relative), bytes);
  }
  await chmod(path.join(target, "AGENT.md"), 0o640);
  await exec("git", ["-C", target, "-c", "init.templateDir=", "init", "--quiet"]);
  const reviews = await Promise.all(["AGENT.md", "docs/bindings.md"].map(async (relative) => ({
    path: relative, sha256: hash(await readFile(path.join(target, relative))),
    mode: ((await lstat(path.join(target, relative))).mode & 0o7777).toString(8).padStart(4, "0"),
    compatible: true, resolution: "Reviewed nonconflicting existing rules and same task/documentation authority under covering fixture delegation.",
  })));
  const config = { ...configuration, adoption: { startup: ".factory/start.mjs", shared_files: ["AGENT.md", "docs/bindings.md", ".gitignore"], adopt_files: [], rule_reviews: reviews } };
  const configPath = path.join(directory, "setup.json");
  const saveConfig = () => writeFile(configPath, JSON.stringify(config));
  await saveConfig();
  return { directory, target, originals, config, configPath, saveConfig, options: { command: "apply", target, configPath } };
};

test("adoption preserves a real application's authority, Git, startup and support while installing scoped blocks", async (t) => {
  const f = await fixture(t);
  const gitHead = await readFile(path.join(f.target, ".git/HEAD"));
  const preview = await creator.preparePlan(f.options);
  assert.equal(preview.envelope.status, "planned", JSON.stringify(preview.envelope.diagnostics));
  const result = await creator.applyPlan(preview, preview.envelope.plan_digest);
  assert.equal(result.integrity, "verified");
  for (const [relative, bytes] of Object.entries(f.originals)) {
    const actual = await readFile(path.join(f.target, relative), "utf8");
    if (f.config.adoption.shared_files.includes(relative)) assert.ok(actual.startsWith(bytes));
    else assert.equal(actual, bytes, relative);
  }
  assert.deepEqual(await readFile(path.join(f.target, ".git/HEAD")), gitHead);
  assert.equal((await lstat(path.join(f.target, "AGENT.md"))).mode & 0o7777, 0o640);
  assert.equal((await exec(process.execPath, ["start.mjs"], { cwd: f.target })).stdout, "existing application\n");
  const startup = JSON.parse((await exec(process.execPath, [".factory/start.mjs", "--json"], { cwd: f.target })).stdout);
  assert.equal(startup.mode, "USABLE");
  assert.equal(startup.setup, "incomplete");
  assert.equal(startup.next_action.started, false);
  const state = JSON.parse(await readFile(path.join(f.target, ".factory/creator/state.json")));
  const rule = state.owned_files.find((file) => file.path === "AGENT.md");
  assert.equal(rule.boundary, "block");
  assert.equal(rule.before.sha256, hash(Buffer.from(f.originals["AGENT.md"])));
  assert.deepEqual(await readFile(path.join(f.target, ".factory/creator/.staging/before/AGENT.md")), Buffer.from(f.originals["AGENT.md"]));
  const checked = await creator.verify(await creator.preparePlan(f.options));
  assert.equal(checked.status, "verified", JSON.stringify(checked.diagnostics));
});

test("declined adoption and unresolved rule conflicts leave the application untouched", async (t) => {
  const f = await fixture(t);
  const plan = await creator.preparePlan(f.options);
  await assert.rejects(creator.applyPlan(plan, ""), { code: "acceptance_required" });
  f.config.adoption.rule_reviews[0].compatible = false;
  await f.saveConfig();
  const conflict = await creator.preparePlan(f.options);
  assert.equal(conflict.envelope.diagnostics[0].code, "rule_conflict");
  assert.equal(conflict.envelope.diagnostics[0].path, "AGENT.md");
  await assert.rejects(lstat(path.join(f.target, ".factory/creator")), { code: "ENOENT" });
  for (const [relative, bytes] of Object.entries(f.originals)) assert.equal(await readFile(path.join(f.target, relative), "utf8"), bytes);
});

test("identical unowned content requires explicit adoption rather than silently acquiring ownership", async (t) => {
  const f = await fixture(t);
  const relative = ".factory/skills/matt-pocock/LICENSE";
  const license = await readFile(new URL("../foundation/matt-first/upstream/LICENSE", import.meta.url));
  await mkdir(path.dirname(path.join(f.target, relative)), { recursive: true });
  await writeFile(path.join(f.target, relative), license);
  const rejected = await creator.preparePlan(f.options);
  assert.equal(rejected.envelope.diagnostics[0].code, "ownership_uncertain");
  assert.equal(rejected.envelope.diagnostics[0].path, relative);
  f.config.adoption.adopt_files.push(relative);
  await f.saveConfig();
  const accepted = await creator.preparePlan(f.options);
  assert.equal(accepted.envelope.operations.find((entry) => entry.path === relative).action, "adopt");
  await creator.applyPlan(accepted, accepted.envelope.plan_digest);
  assert.deepEqual(await readFile(path.join(f.target, relative)), license);
  assert.equal((await creator.verify(await creator.preparePlan(f.options))).status, "verified");
});

test("stale accepted bytes, modes and shared context prevent all installation writes", async (t) => {
  for (const change of ["bytes", "mode", "context"]) {
    const f = await fixture(t);
    const plan = await creator.preparePlan(f.options);
    const relative = change === "context" ? ".gitignore" : "AGENT.md";
    if (change === "mode") await chmod(path.join(f.target, relative), 0o600);
    else await writeFile(path.join(f.target, relative), `${f.originals[relative]}concurrent edit\n`);
    await assert.rejects(creator.applyPlan(plan, plan.envelope.plan_digest), { code: "plan_stale" });
    await assert.rejects(lstat(path.join(f.target, ".factory/creator")), { code: "ENOENT" });
  }
});

test("unsafe touched paths and unowned block delimiters fail without writing", async (t) => {
  for (const defect of ["symlink", "directory", "begin-only", "end-only", "duplicate"]) {
    const f = await fixture(t);
    const relative = ".gitignore";
    const location = path.join(f.target, relative);
    if (defect === "symlink" || defect === "directory") {
      await rm(location);
      if (defect === "symlink") await symlink(path.join(f.target, "start.mjs"), location);
      else await mkdir(location);
    } else await writeFile(location, defect === "begin-only" ? "# BEGIN AGENT FOUNDRY\n"
      : defect === "end-only" ? "# END AGENT FOUNDRY\n"
        : "# BEGIN AGENT FOUNDRY\n# END AGENT FOUNDRY\n# BEGIN AGENT FOUNDRY\n# END AGENT FOUNDRY\n");
    const result = await creator.preparePlan(f.options);
    assert.equal(result.envelope.status, "conflict");
    assert.equal(result.envelope.diagnostics[0].path, relative);
    await assert.rejects(lstat(path.join(f.target, ".factory/creator")), { code: "ENOENT" });
    assert.equal(await readFile(path.join(f.target, "start.mjs"), "utf8"), f.originals["start.mjs"]);
  }
});

test("owned block and surrounding-context drift cannot be verified or reapplied", async (t) => {
  for (const change of ["block", "context", "baseline"]) {
    const f = await fixture(t);
    const plan = await creator.preparePlan(f.options);
    await creator.applyPlan(plan, plan.envelope.plan_digest);
    const relative = change === "baseline" ? ".factory/creator/.staging/before/AGENT.md" : "AGENT.md";
    const filename = path.join(f.target, relative);
    const original = await readFile(filename, "utf8");
    await writeFile(filename, change === "block" ? original.replace("## Authority and work", "## Changed block") : `changed context\n${original}`);
    const changed = await creator.preparePlan(f.options);
    assert.equal(changed.envelope.status, "conflict");
    assert.notEqual((await creator.verify(changed)).integrity, "verified");
    await assert.rejects(creator.applyPlan(changed, plan.envelope.plan_digest), { code: "acceptance_required" });
    await assert.rejects(exec(process.execPath, [".factory/start.mjs", "--json"], { cwd: f.target }), (error) => {
      assert.equal(JSON.parse(error.stdout).mode, "UNSAFE");
      return true;
    });
  }
});

test("interrupted shared-block adoption retains actual effects and exact private preimages for diagnosis", async (t) => {
  const f = await fixture(t);
  const plan = await creator.preparePlan(f.options);
  f.options.interruptAfter = plan.files.findIndex((file) => file.relativePath === "AGENT.md") + 1;
  const accepted = await creator.preparePlan(f.options);
  await assert.rejects(creator.applyPlan(accepted, accepted.envelope.plan_digest), (error) => {
    assert.equal(error.plan.envelope.status, "partial");
    return true;
  });
  const diagnosed = await creator.doctor(await creator.preparePlan({ ...f.options, command: "doctor" }));
  assert.equal(diagnosed.status, "partial", JSON.stringify(diagnosed.diagnostics));
  assert.ok(diagnosed.applied.includes("AGENT.md"));
  assert.ok(diagnosed.pending.includes("docs/bindings.md"));
  const journal = JSON.parse(await readFile(path.join(f.target, ".factory/creator/.staging/journal.json")));
  assert.ok(journal.displaced.includes("AGENT.md"));
  assert.deepEqual(await readFile(path.join(f.target, ".factory/creator/.staging/before/AGENT.md")), Buffer.from(f.originals["AGENT.md"]));
  assert.equal(await readFile(path.join(f.target, "start.mjs"), "utf8"), f.originals["start.mjs"]);
});

test("disappearance of explicitly reviewed non-output authority invalidates acceptance", async (t) => {
  const f = await fixture(t);
  const relative = "rules.md";
  const bytes = Buffer.from("Additional project authority. Nonconflicting selected procedures only.\n");
  await writeFile(path.join(f.target, relative), bytes);
  f.config.adoption.rule_reviews.push({ path: relative, sha256: hash(bytes), mode: "0644", compatible: true, resolution: "Reviewed exact project authority." });
  await f.saveConfig();
  const accepted = await creator.preparePlan(f.options);
  assert.equal(accepted.envelope.status, "planned");
  await rm(path.join(f.target, relative));
  await assert.rejects(creator.applyPlan(accepted, accepted.envelope.plan_digest), { code: "plan_stale" });
  await assert.rejects(lstat(path.join(f.target, ".factory/creator")), { code: "ENOENT" });
});

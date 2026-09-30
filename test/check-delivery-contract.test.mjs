import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { check, delegatedApprovalAllowed, delegatedApprovalErrors } from "../scripts/typed-inherited-runtime/check-delivery-contract.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "typed-inherited-runtime", "check-delivery-contract.js");
const providerContract = "# Abstract contract\n\n## Identity\n## Binding\n## How the agent interacts\n## Rules and limitations\n## Prohibitions\n";
const provider = "## Valid provider\n\n> **Contract instance:** [`_contract.md`](./_contract.md)\n> **Capability:** `code-intelligence`\n> **Provider:** `valid`\n\n## Identity\n## Binding\nA provider.\n## How the agent interacts\nUse it.\n## Rules and limitations\nUse native tools.\n## Prohibitions\nDo not bypass policy.\n";
const approvalEvidence = () => ({
  instruction: { source: "direct-human", current: true, issue: 32, action: "add status:approved", principal: "human-1" },
  principal: { evidence_source: "target-host", subject: "human-1", role: "MAINTAINER" },
  actor: { subject: "human-1", capability: "ADMIN" },
  operation: { issue: 32, label: "status:approved", attempts: 1, result: "added", sequence: ["add", "readback"] },
  readback: { issue: 32, labels: ["status:approved"] },
});

const fixture = async (callback) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "delivery-contract-test-"));
  try { return await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
};

test("the repository delivery contract remains structurally valid", async () => {
  assert.deepEqual(await check(), []);
});

test("source entry rejects headings-only safety, removed rules, and broken required routes", async () => {
  await fixture(async (directory) => {
    for (const relative of ["AGENT.md", "MAINTAINERS.md", "docs/bindings.md", "docs/agent-init.md", "docs/bootstrap.md", "docs/engineering-handbook.md", "docs/workflow.md", "templates/agent-runbook.md"]) {
      await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
      await copyFile(path.join(root, relative), path.join(directory, relative));
    }
    const target = path.join(directory, "AGENT.md");
    const original = await readFile(target, "utf8");
    const routeErrors = async () => (await check([target], directory)).filter((error) => /critical rule|task route|required route|route entry/u.test(error));
    await assert.rejects(readFile(path.join(directory, "docs/factory-layout.md")));
    assert.deepEqual(await routeErrors(), []); // An absent optional topic is not a required-route failure.

    await writeFile(target, original.split("\n").filter((line) => /^#{1,6} /u.test(line)).join("\n"));
    assert.ok((await routeErrors()).some((error) => error.includes("missing critical rule: single add and immediate target-host readback")));

    for (const [clause, replacement, requirement] of [
      ["The authenticated actor has target-host capability `MAINTAIN` or `ADMIN`.", "The actor may proceed.", "actor MAINTAIN or ADMIN capability"],
      ["only the setup-bound task provider", "any convenient task provider", "exclusive bound task provider"],
      ["provider-native confirmation **and fresh readback**", "local confirmation", "provider-native confirmation and fresh readback"],
      ["are NOT executed without explicit approval", "may be executed routinely", "explicit outward-action approval"],
    ]) {
      assert.ok(original.includes(clause), `fixture clause missing: ${clause}`);
      await writeFile(target, original.replace(clause, replacement));
      assert.ok((await routeErrors()).some((error) => error.includes(`missing critical rule: ${requirement}`)), requirement);
    }

    await writeFile(target, original.replace("`docs/engineering-handbook.md` → `.factory/docs/engineering-handbook.md` for code", "`docs/missing/engineering-handbook.md` → `.factory/docs/engineering-handbook.md` for code"));
    assert.ok((await routeErrors()).some((error) => error.includes("Bug fix or implementation required route missing destination: docs/missing/engineering-handbook.md")));
  });
});

test("the required task contracts make provider readback and local projections explicit", async () => {
  for (const relative of ["AGENT.md", "templates/handoff.md", "docs/agent-init.md", "providers/task/_contract.md"]) {
    const text = await readFile(path.join(root, relative), "utf8");
    assert.match(text, /every durable task\/TODO mechanism[\s\S]*?harness/iu, relative);
    assert.match(text, /(?:<TASK_TRACKER>|`TASK_TRACKER`)/u, relative);
    assert.match(text, /(?:<TRACKER_KEY>|`TRACKER_KEY`)/u, relative);
    assert.match(text, /confirm(?:ation|ed|s)?[\s\S]*?readback/iu, relative);
    assert.match(text, /optional[\s\S]*?(?:non-authoritative|fallback)/iu, relative);
    assert.match(text, /(?:cold|resum)[\s\S]*?provider|provider[\s\S]*?(?:cold|resum)/iu, relative);
    assert.match(text, /(?:unsupported|fails?)[\s\S]*?(?:ambiguous|mismatch)/iu, relative);
  }
  const runbook = await readFile(path.join(root, "templates/agent-runbook.md"), "utf8");
  assert.match(runbook, /bound task provider in `docs\/bindings\.md`/u);
  assert.match(runbook, /confirm\/read back each operation/u);
  assert.match(runbook, /optional and\s+non-authoritative/u);
  assert.match(runbook, /native operation fails/u);
});

test("the task contract checker rejects missing binding and fail-closed clauses for every selection", async () => {
  await fixture(async (directory) => {
    const taskDirectory = path.join(directory, "providers", "task");
    await mkdir(taskDirectory, { recursive: true });
    await mkdir(path.join(directory, "templates"));
    await writeFile(path.join(directory, "templates", "handoff.md"), "# Handoff\n");
    await writeFile(path.join(taskDirectory, "_contract.md"), await readFile(path.join(root, "providers", "task", "_contract.md")));
    for (const selection of ["jira", "github-issues", "github-projects", "linear", "custom"]) {
      const target = path.join(taskDirectory, `${selection}.md`);
      const original = await readFile(path.join(root, "providers", "task", `${selection}.md`), "utf8");
      await writeFile(target, original);
      assert.deepEqual(await check([target], directory), [], selection);
      for (const [before, after, requirement] of [
        ["<TRACKER_KEY>", "board identifier", "selected tracker identity"],
        ["Every durable harness task/TODO", "Some durable harness tasks", "all durable harness tasks"],
        ["confirmation and fresh readback", "acknowledgment", "native confirmation and intended-state readback"],
        ["optional derived projections", "mandatory local task files", "optional local projection without fallback"],
        ["unsupported", "supported", "unsupported operation blocks success"],
        ["unavailable", "available", "unavailable or mismatched readback blocks success"],
        ["mismatched", "matched", "unavailable or mismatched readback blocks success"],
        ["ambiguous", "uncertain", "fail-closed operation and readback"],
        ["malformed", "valid", "malformed readback blocks success"],
        [/evidence\s+needed to\s+resume/gu, "details later", "actionable continuation"],
      ]) {
        assert.ok(typeof before === "string" ? original.includes(before) : new RegExp(before.source, "u").test(original), `${selection}: missing fixture phrase ${before}`);
        await writeFile(target, original.replaceAll(before, after));
        const errors = await check([target], directory);
        assert.ok(errors.includes(`providers/task/${selection}.md missing task binding requirement: ${requirement}`), `${selection} (${before}): ${errors.join("; ")}`);
      }
    }
  });
});

test("a missing selected file reports a root-relative deterministic error", async () => {
  await fixture(async (directory) => {
    assert.deepEqual(await check([path.join(directory, "missing.md")], directory), ["required file missing: missing.md"]);
  });
});

test("provider fixtures reject broken contract links and missing required sections", async () => {
  await fixture(async (directory) => {
    const providerDirectory = path.join(directory, "providers", "code-intel");
    await mkdir(providerDirectory, { recursive: true });
    const contractPath = path.join(providerDirectory, "_contract.md");
    const providerPath = path.join(providerDirectory, "valid.md");
    await writeFile(contractPath, providerContract, "utf8");
    await writeFile(providerPath, provider.replace("./_contract.md", "./missing-contract.md"), "utf8");
    const broken = await check([contractPath, providerPath], directory);
    assert.ok(broken.some((error) => error === "providers/code-intel/valid.md broken link: ./missing-contract.md"), broken.join("\n"));
    await writeFile(providerPath, "## Valid provider\n", "utf8");
    const incomplete = await check([contractPath, providerPath], directory);
    assert.ok(incomplete.some((error) => error.includes("missing contract section")), incomplete.join("\n"));
  });
});

test("valid explicit provider fixtures pass without leaking temporary paths", async () => {
  await fixture(async (directory) => {
    const providerDirectory = path.join(directory, "providers", "code-intel");
    await mkdir(providerDirectory, { recursive: true });
    const contractPath = path.join(providerDirectory, "_contract.md");
    const providerPath = path.join(providerDirectory, "valid.md");
    await writeFile(contractPath, providerContract, "utf8");
    await writeFile(providerPath, provider, "utf8");
    assert.deepEqual(await check([contractPath, providerPath], directory), []);
  });
});

test("protected approval fixtures allow only complete target-bound evidence", () => {
  const valid = approvalEvidence();
  assert.deepEqual(delegatedApprovalErrors(valid, 32), []);
  assert.equal(delegatedApprovalAllowed(valid, 32), true);
  for (const [field, value] of [
    [["instruction", "issue"], 31], [["instruction", "current"], false], [["instruction"], {}],
    [["principal", "role"], "CONTRIBUTOR"], [["actor", "capability"], "TRIAGE"],
    [["operation", "result"], "unknown"], [["readback", "labels"], []],
  ]) {
    const rejected = structuredClone(valid);
    if (field.length === 2) rejected[field[0]][field[1]] = value;
    else rejected[field[0]] = value;
    assert.equal(delegatedApprovalAllowed(rejected, 32), false, field.join("."));
  }
});

test("the Node CLI self-check is the structural delivery-contract command", async () => {
  const result = await execFileAsync(process.execPath, [script, "--self-check"], { cwd: root });
  assert.equal(result.stdout, "self-check OK\n");
  const approval = await execFileAsync(process.execPath, [script, "--approval-self-check"], { cwd: root });
  assert.equal(approval.stdout, "approval self-check OK\n");
  await assert.rejects(execFileAsync(process.execPath, [script], { cwd: root }), /usage: check-delivery-contract\.mjs --self-check\|--approval-self-check/u);
});

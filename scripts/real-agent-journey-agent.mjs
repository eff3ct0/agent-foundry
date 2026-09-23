#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStage, stageEnvelope, validateRepository, validateRunId, validateRuntime, writeJson, selfCheck } from "./real-agent-journey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const values = Object.fromEntries(process.argv.slice(2).map((value, index, args) => value.startsWith("--") ? [value.slice(2).replaceAll("-", "_"), args[index + 1]] : []).filter(Boolean));
const load = async (file) => JSON.parse(await readFile(file, "utf8"));
const run = async () => {
  const runId = validateRunId(values.run_id); const repository = validateRepository(values.repository); validateRuntime(values.runtime);
  const provision = validateStage("provision", await load(values.provision), runId, repository); const sourceSha = provision.identifiers.revision;
  const evidencePath = path.join(path.dirname(values.output), "codex.json");
  const result = await new Promise((resolve) => { const child = spawn(process.execPath, [path.join(ROOT, "scripts/real-agent-e2e.mjs"), "run", "--repository", repository, "--workspace", path.resolve(values.workspace), "--expected-sha", sourceSha, "--source-identity", path.resolve(values.source_identity), "--package-name", values.package_name, "--package-version", values.package_version, "--decisions", path.resolve(values.decisions ?? path.join(ROOT, "scripts/real-agent-decisions.json")), "--evidence", evidencePath], { cwd: path.resolve(values.workspace), env: process.env, stdio: "inherit" }); child.on("close", (code) => resolve(code)); });
  const codex = await load(evidencePath); if (result !== 0 || codex.result !== "passed") throw new Error("cold agent did not complete");
  const metadata = { schema_version: "real-agent-journey/v1", run_id: runId, source_repository: provision.identifiers.source_template, source_sha: sourceSha, generated_repository: repository, generated_default_branch: provision.identifiers.default_branch, feature_issue: codex.issue, implementation_branch: codex.branch, implementation_commit: codex.commit, bindings: {}, ci_jobs: [], checks: [{ name: "package-verify", status: "passed" }], test_command: "configured" };
  const evidence = stageEnvelope("agent", runId, repository, "passed", { issue: String(codex.issue), branch: codex.branch, commit: codex.commit, tests: "passed" }); evidence.runtime = values.runtime; evidence.metadata = metadata; await writeJson(values.output, evidence);
};
if (process.argv.includes("--self-check")) selfCheck(); else run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { resolveCodexEvidencePath } from "../scripts/real-agent-journey-agent.mjs";

test("relative agent output resolves Codex evidence beside workflow evidence", () => {
  const jobCwd = path.resolve("/tmp", "journey-job");
  const generatedWorkspace = path.join(jobCwd, "generated");
  const evidencePath = resolveCodexEvidencePath("stage/agent.json", jobCwd);

  assert.equal(evidencePath, path.join(jobCwd, "stage", "codex.json"));
  assert.equal(path.isAbsolute(evidencePath), true);
  assert.equal(evidencePath.startsWith(`${generatedWorkspace}${path.sep}`), false);
});

test("invoke-agent forwards the hosted workflow adapter arguments after the separator", () => {
  const result = spawnSync(process.execPath, [
    "scripts/real-agent-journey.mjs", "invoke-agent", "--runtime", "codex-cli", "--",
    "--self-check", "--repository", "acme/real-agent-journey-123", "--run-id", "123",
    "--runtime", "codex-cli", "--provision", "stage-input/provision.json", "--workspace", "generated",
    "--decisions", "scripts/real-agent-decisions.json", "--output", "stage/agent.json",
    "--source-identity", "generated/.journey-source.json", "--package-name", "@eff3ct/agent-foundry",
    "--package-version", "0.1.0",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "real-agent journey contract self-check OK\n");
});

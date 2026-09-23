import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  captureCommandResult,
  LocalMatrixError,
  assertFailureFixture,
  enumerateMatrix,
  matrixCaseId,
  matrixConfiguration,
  matrixDimensions,
  runLocalMatrix,
  validateLocalArtifact,
  validateMatrixEvidence,
  writeFailureFixture,
} from "../scripts/local-matrix.mjs";

const identity = {
  schema_version: 1,
  package: { name: "@eff3ct/agent-foundry", version: "0.1.0" },
  tarball_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  payload_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  tree_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
};

const temporaryDirectory = async (name, run) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
};

test("the local matrix is the complete stable Cartesian product", () => {
  assert.deepEqual(matrixDimensions, {
    ci: ["rust", "typescript", "python", "go"],
    task: ["custom", "github-issues", "github-projects", "jira", "linear"],
    secrets: ["custom", "doppler", "infisical", "none", "vault"],
    intelligence: ["codegraph", "custom", "none"],
    agent: ["claude-code", "opencode", "codex", "pi"],
  });
  const cases = enumerateMatrix();
  assert.equal(cases.length, 4 * 5 * 5 * 3 * 4);
  assert.equal(new Set(cases.map((matrixCase) => matrixCase.id)).size, cases.length);
  assert.equal(cases[0].id, "ci=rust;task=custom;secrets=custom;intelligence=codegraph;agent=claude-code");
  assert.equal(cases.at(-1).id, "ci=go;task=linear;secrets=vault;intelligence=none;agent=pi");
  assert.equal(matrixCaseId(cases[413]), cases[413].id);
  assert.deepEqual(matrixConfiguration(cases[413]).values, {
    PROJECT_NAME: `matrix ${cases[413].id}`,
    TASK_TRACKER: cases[413].task,
    SECRETS_PROVIDER: cases[413].secrets,
    CODE_INTELLIGENCE: cases[413].intelligence,
    CI_STACKS: cases[413].ci,
  });
});

test("the local runner executes and records every matrix case", async () => {
  await temporaryDirectory("factory-local-matrix", async (directory) => {
    const invoked = [];
    const evidence = await runLocalMatrix({
      outputDirectory: directory,
      identity,
      runCase: async ({ matrixCase, configuration, directory: caseDirectory }) => {
        invoked.push({ matrixCase, configuration, caseDirectory });
        return {
          status: "passed",
          commands: ["foundry apply", "foundry verify"],
          release_e2e: {
            schema_version: 1,
            command_results: [captureCommandResult({ name: "foundry apply", command: "foundry apply", status: "passed", exit_code: 0, output: "created" })],
          },
        };
      },
    });
    assert.equal(invoked.length, 1200);
    assert.equal(evidence.summary.passed, 1200);
    assert.equal(evidence.summary.failed, 0);
    const written = JSON.parse(await readFile(path.join(directory, "matrix-evidence.json"), "utf8"));
    assert.deepEqual(validateMatrixEvidence(written), evidence);
    assert.equal(written.cases[0].commands.length, 2);
    assert.equal(written.cases[0].release_e2e.schema_version, 1);
    assert.equal(written.cases[0].release_e2e.command_results[0].output, "created");
  });
});

test("release E2E command results redact credentials and private temporary paths", () => {
  const result = captureCommandResult({
    name: "release command",
      command: "TOKEN=secret foundry apply --target /tmp/private-project",
    status: "failed",
    exit_code: 1,
    output: "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789 /home/runner/work/key github_pat_abcdefghijklmnopqrstuvwxyz0123456789",
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.exit_code, 1);
  assert.match(serialized, /<redacted>/);
  assert.match(serialized, /<private-path>/);
  assert.doesNotMatch(serialized, /secret|ghp_|github_pat_|\/tmp\/|\/home\//);
});

test("release E2E evidence rejects unsafe or oversized serialized command results", async () => {
  await temporaryDirectory("factory-local-matrix-evidence", async (directory) => {
    const evidence = await runLocalMatrix({
      outputDirectory: directory,
      identity,
      runCase: async () => ({ status: "passed" }),
    });
    evidence.cases[0].release_e2e.command_results = Array.from({ length: 8 }, (_, index) => captureCommandResult({
      name: `command-${index}`,
      command: "foundry apply",
      status: "passed",
      exit_code: 0,
      output: "x".repeat(512),
    }));
    await assert.rejects(async () => validateMatrixEvidence(evidence), LocalMatrixError);

    evidence.cases[0].release_e2e = { schema_version: 1, command_results: [] };
    evidence.oversized = "x".repeat(1024 * 1024);
    await assert.rejects(async () => validateMatrixEvidence(evidence), LocalMatrixError);
    delete evidence.oversized;
    evidence.cases[1].release_e2e = {
      schema_version: 1,
      command_results: [captureCommandResult({ name: "unsafe", command: "foundry apply", status: "passed", exit_code: 0, output: "safe" })],
      unexpected: "field",
    };
    await assert.rejects(async () => validateMatrixEvidence(evidence), LocalMatrixError);
  });
});

test("the local runner persists bounded failure evidence before failing", async () => {
  await temporaryDirectory("factory-local-matrix-failure", async (directory) => {
    await assert.rejects(
      runLocalMatrix({
        outputDirectory: directory,
        identity,
        runCase: async ({ matrixCase }) => matrixCase.id.includes("task=jira") ? { status: "failed", failure: "fixture failure" } : { status: "passed" },
      }),
      LocalMatrixError,
    );
    const written = JSON.parse(await readFile(path.join(directory, "matrix-evidence.json"), "utf8"));
    assert.equal(written.summary.total, 1200);
    assert.equal(written.summary.failed, 4 * 5 * 3 * 4);
    assert.ok(written.cases.some((entry) => entry.failure === "fixture failure"));
  });
});

test("corrupt payload, digest, and unknown-file fixtures fail closed", async () => {
  await temporaryDirectory("factory-local-matrix-artifact", async (directory) => {
    for (const kind of ["corrupt-payload", "corrupt-digest", "unknown-file"]) {
      const fixture = await writeFailureFixture({ root: directory, kind });
      await assert.rejects(validateLocalArtifact(fixture), LocalMatrixError, kind);
      await assert.rejects(assertFailureFixture({ fixture, kind, identity }), LocalMatrixError, kind);
    }
  });
});

test("partial-write and malformed-evidence fixtures fail closed", async () => {
  await temporaryDirectory("factory-local-matrix-recovery", async (directory) => {
    const partial = await writeFailureFixture({ root: directory, kind: "partial-write" });
    await assert.rejects(assertFailureFixture({ fixture: partial, kind: "partial-write", identity }), LocalMatrixError);
    const malformed = await writeFailureFixture({ root: directory, kind: "malformed-evidence" });
    await assert.rejects(assertFailureFixture({ fixture: malformed, kind: "malformed-evidence", identity }), LocalMatrixError);
  });
});

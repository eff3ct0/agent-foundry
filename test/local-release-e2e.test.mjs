import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runLocalReleaseE2e } from "../scripts/local-release-e2e.mjs";
import { validateMatrixEvidence } from "../scripts/local-matrix.mjs";

const identity = {
  schema_version: 1,
  package: { name: "factory-template-creator", version: "0.1.0" },
  tarball_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  payload_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  tree_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
};

test("the full local release E2E continues after failures and writes all redacted records", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-local-release-e2e-"));
  let runs = 0;
  try {
    await assert.rejects(
      runLocalReleaseE2e({
        outputDirectory: directory,
        tarballPath: "/tmp/factory-template.tgz",
        runCreator: async () => {
          runs += 1;
          if (runs === 2) throw new Error("TOKEN=secret failed in /tmp/private-project");
          return { identity, creator: { status: "applied", verification: "verified" } };
        },
      }),
      /local matrix contains failed cases/u,
    );
    assert.equal(runs, 1200);
    const evidence = JSON.parse(await readFile(path.join(directory, "matrix-evidence.json"), "utf8"));
    assert.equal(evidence.cases.length, 1200);
    assert.deepEqual(evidence.summary, { total: 1200, passed: 1199, failed: 1 });
    assert.equal(evidence.cases[1].release_e2e.command_results[0].output.includes("secret"), false);
    assert.equal(evidence.cases[1].failure.includes("/tmp"), false);
    assert.deepEqual(validateMatrixEvidence(evidence, { allowFailures: true }), evidence);
    assert.throws(() => validateMatrixEvidence(evidence), /summary is invalid/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

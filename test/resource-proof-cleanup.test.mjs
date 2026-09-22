import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanupProvisionedResource } from "../scripts/resource-proof-cleanup.mjs";
import { serializeProvisioningProof } from "../scripts/resource-provisioning-proof.mjs";

const owner = "sandbox-owner";
const runId = "123";
const name = "bootstrap-e2e-123-typescript";
const target = `${owner}/${name}`;
const proof = (overrides = {}) => ({
  schema_version: 1,
  status: "verified",
  run_id: runId,
  owner,
  name,
  full_name: target,
  repository_id: 42,
  visibility: "private",
  template: "eff3ct0/factory-template",
  release_sha: "a".repeat(40),
  default_branch: "main",
  ...overrides,
});
const readback = (overrides = {}) => ({
  id: 42,
  full_name: target,
  name,
  owner: { login: owner },
  visibility: "private",
  template_repository: { full_name: "eff3ct0/factory-template" },
  ...overrides,
});

const input = (overrides = {}) => {
  const events = [];
  const artifacts = [];
  return {
    events,
    artifacts,
    evidence: { async download() { events.push("download"); return serializeProvisioningProof(proof()); } },
    artifact: { async write(value) { events.push("write"); artifacts.push(JSON.parse(value)); } },
    readClient: { async get(endpoint) { events.push(`read:${endpoint}`); return { status: "ok", payload: readback() }; } },
    mutationClient: { async deleteRepository(request) { events.push(`delete:${JSON.stringify(request)}`); return { status: "deleted" }; } },
    owner,
    target,
    runId,
    ...overrides,
  };
};

test("downloads one canonical proof, re-reads it, deletes its exact repository, and writes cleanup evidence", async () => {
  const supplied = input();
  assert.deepEqual(await cleanupProvisionedResource(supplied), {
    schema_version: 1, owner, target, run_id: runId, status: "deleted",
  });
  assert.deepEqual(supplied.events, [
    "download", `read:/repos/${target}`,
    `delete:${JSON.stringify({ owner, name })}`, "write",
  ]);
  assert.deepEqual(supplied.artifacts, [{ schema_version: 1, owner, target, run_id: runId, status: "deleted" }]);
});

test("treats an exact already-absent target as successful without deleting", async () => {
  const supplied = input({ readClient: { async get() { supplied.events.push(`read:/repos/${target}`); return { status: "missing" }; } } });
  assert.equal((await cleanupProvisionedResource(supplied)).status, "already-absent");
  assert.deepEqual(supplied.events, ["download", `read:/repos/${target}`, "write"]);
  assert.equal(supplied.artifacts[0].status, "already-absent");
});

test("requires recovery when downloaded proof is absent or malformed before any hosted read", async () => {
  for (const evidence of [
    { async download() { return undefined; } },
    { async download() { return `${serializeProvisioningProof(proof())}\n`; } },
  ]) {
    const supplied = input({ evidence });
    assert.deepEqual(await cleanupProvisionedResource(supplied), {
      schema_version: 1, owner, target, run_id: runId, status: "recovery-required", code: "proof_unavailable",
    });
    assert.deepEqual(supplied.events, ["write"]);
  }
});

test("requires recovery when downloaded proof does not bind the requested target", async () => {
  const supplied = input({ evidence: { async download() { return serializeProvisioningProof(proof({ run_id: "124" })); } } });
  assert.deepEqual(await cleanupProvisionedResource(supplied), {
    schema_version: 1, owner, target, run_id: runId, status: "recovery-required", code: "proof_scope_mismatch",
  });
  assert.deepEqual(supplied.events, ["write"]);
});

test("requires recovery and never deletes when F4 finds a mismatched exact readback", async () => {
  const supplied = input({ readClient: { async get(endpoint) { supplied.events.push(`read:${endpoint}`); return { status: "ok", payload: readback({ id: 43 }) }; } } });
  assert.deepEqual(await cleanupProvisionedResource(supplied), {
    schema_version: 1, owner, target, run_id: runId, status: "recovery-required", code: "repository_id_changed",
  });
  assert.deepEqual(supplied.events, ["download", `read:/repos/${target}`, "write"]);
});

test("requires recovery after an indeterminate or rejected bounded deletion", async () => {
  for (const [deletion, code] of [
    [{ status: "indeterminate" }, "delete_indeterminate"],
    [{ status: "rejected", code: "mutation_rejected" }, "delete_rejected"],
  ]) {
    const supplied = input({ mutationClient: { async deleteRepository() { return deletion; } } });
    assert.equal((await cleanupProvisionedResource(supplied)).code, code);
    assert.equal(supplied.artifacts[0].code, code);
  }
});

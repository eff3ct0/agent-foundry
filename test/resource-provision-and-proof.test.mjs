import assert from "node:assert/strict";
import { test } from "node:test";

import { provisionAndProve, ResourceProvisionAndProofError, validatePersistedProvisioningProof } from "../scripts/typed-runtime/resource-provision-and-proof.js";

const runId = "123";
const owner = "sandbox-owner";
const resource = "typescript";
const name = "bootstrap-e2e-123-typescript";
const template = "eff3ct0/factory-template";
const releaseSha = "a".repeat(40);
const proof = {
  schema_version: 1,
  status: "verified",
  run_id: runId,
  owner,
  name,
  full_name: `${owner}/${name}`,
  repository_id: 42,
  visibility: "private",
  template,
  release_sha: releaseSha,
  default_branch: "main",
};

const readbackClient = (events, responses) => ({
  async get(endpoint) {
    events.push(`read:${endpoint}`);
    return responses.shift();
  },
});

const input = (overrides = {}) => {
  const events = [];
  const stored = { value: undefined };
  return {
    events,
    stored,
    mutationClient: {
      async createTemplateRepository(request) {
        events.push(`create:${JSON.stringify(request)}`);
        return { status: "created", payload: { id: 42 } };
      },
    },
    proofClient: readbackClient(events, [
      { status: "ok", payload: {
        id: 42,
        full_name: `${owner}/${name}`,
        name,
        owner: { login: owner },
        visibility: "private",
        template_repository: { full_name: template },
        default_branch: "main",
      } },
      { status: "ok", payload: { object: { type: "commit", sha: releaseSha } } },
    ]),
    proofStore: {
      async write(value) {
        events.push("write");
        stored.value = value;
      },
      async read() {
        events.push("read-proof");
        return stored.value;
      },
    },
    runId,
    owner,
    resource,
    template,
    releaseSha,
    ...overrides,
  };
};

test("creates one canonical repository, reads it back through F3, and persists before validation", async () => {
  const supplied = input();
  assert.deepEqual(await provisionAndProve(supplied), { status: "verified", proof });
  assert.equal(supplied.stored.value, `${JSON.stringify(proof)}\n`);
  assert.deepEqual(supplied.events, [
    `create:${JSON.stringify({ template, owner, name })}`,
    `read:/repos/${owner}/${name}`,
    `read:/repos/${owner}/${name}/git/ref/heads/main`,
    "write",
    "read-proof",
  ]);
});

test("does not persist or validate when F3 rejects the exact repository readback", async () => {
  const supplied = input({
    proofClient: readbackClient([], [{ status: "ok", payload: {
      id: 42,
      full_name: "sandbox-owner/bootstrap-e2e-124-typescript",
      name: "bootstrap-e2e-124-typescript",
      owner: { login: owner },
      visibility: "private",
      template_repository: { full_name: template },
      default_branch: "main",
    } }]),
  });
  const result = await provisionAndProve(supplied);
  assert.deepEqual(result, { status: "rejected", code: "resource_name_mismatch" });
  assert.equal(supplied.stored.value, undefined);
});

test("fails closed when the persisted versioned proof cannot be validated", async () => {
  const supplied = input({
    proofStore: {
      async write() {},
      async read() { return "{\"schema_version\":2}\n"; },
    },
  });
  assert.deepEqual(await provisionAndProve(supplied), { status: "recovery-required", code: "proof_validation_failed" });
});

test("validates every injected boundary before creating a repository", async () => {
  const supplied = input({ proofClient: undefined });
  await assert.rejects(provisionAndProve(supplied), (error) => error.code === "invalid_proof_client");
  assert.deepEqual(supplied.events, []);
});

test("preserves rejected, indeterminate, and proof persistence outcomes without retrying creation", async () => {
  for (const [create, expected] of [
    [async () => { throw new Error("connection lost"); }, { status: "indeterminate", code: "mutation_indeterminate" }],
    [async () => ({ status: "rejected", code: "forbidden" }), { status: "rejected", code: "forbidden" }],
    [async () => ({ status: "created" }), { status: "recovery-required", code: "proof_persistence_failed" }],
  ]) {
    const supplied = input();
    supplied.mutationClient.createTemplateRepository = async (request) => {
      supplied.events.push(`create:${JSON.stringify(request)}`);
      return create();
    };
    if (expected.status === "recovery-required") supplied.proofStore.write = async () => { throw new Error("disk unavailable"); };
    assert.deepEqual(await provisionAndProve(supplied), expected);
    assert.equal(supplied.events.filter((event) => event.startsWith("create:")).length, 1);
    assert.equal(supplied.events.includes("read-proof"), false);
  }
});

test("rejects invalid persisted proof boundaries and retains typed error codes", async () => {
  assert.equal(validatePersistedProvisioningProof({ serialized: `${JSON.stringify({ ...proof, repository_id: 0 })}\n`, runId, owner, resource, template, releaseSha }), undefined);
  const supplied = input({ owner: "invalid/owner" });
  await assert.rejects(provisionAndProve(supplied), (error) => error instanceof ResourceProvisionAndProofError && error.code === "invalid_owner");
  assert.deepEqual(supplied.events, []);
});

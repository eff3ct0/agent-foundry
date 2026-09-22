import assert from "node:assert/strict";
import { test } from "node:test";

import { createHostedLifecycleReadClient } from "../scripts/hosted-lifecycle-read-client.mjs";
import { decideCleanupEligibility, readCleanupEligibility } from "../scripts/resource-cleanup-eligibility.mjs";

const owner = "sandbox-owner";
const runId = "123";
const name = "bootstrap-e2e-123-typescript";
const target = `${owner}/${name}`;
const template = "eff3ct0/factory-template";
const proof = (overrides = {}) => ({
  schema_version: 1,
  status: "verified",
  run_id: runId,
  owner,
  name,
  full_name: target,
  repository_id: 42,
  visibility: "private",
  template,
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
  template_repository: { full_name: template },
  ...overrides,
});
const exact = (overrides = {}) => ({ owner, target, runId, proof: proof(), ...overrides });

const client = (response) => {
  const calls = [];
  return {
    calls,
    client: { async get(endpoint) { calls.push(endpoint); return response; } },
  };
};

test("makes an exact proof and exact readback eligible for bounded recovery", async () => {
  const injected = client({ status: "ok", payload: readback() });
  assert.deepEqual(await readCleanupEligibility({ client: injected.client, ...exact() }), {
    status: "eligible",
    recovery: { owner, target, run_id: runId, proof: proof() },
  });
  assert.deepEqual(injected.calls, [`/repos/${target}`]);
});

test("recognizes one exact target as already absent", async () => {
  const injected = client({ status: "missing" });
  assert.deepEqual(await readCleanupEligibility({ client: injected.client, ...exact() }), { status: "already-absent" });
  assert.deepEqual(injected.calls, [`/repos/${target}`]);
});

test("treats an exact repository 404 from the lifecycle client as already absent", async () => {
  const calls = [];
  const lifecycleClient = createHostedLifecycleReadClient({
    token: "github_pat_secret-value",
    transport: async (request) => {
      calls.push(request);
      return new Response('{"message":"Not Found"}', { status: 404 });
    },
  });

  assert.deepEqual(await readCleanupEligibility({ client: lifecycleClient, ...exact() }), { status: "already-absent" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, `https://api.github.com/repos/${target}`);
});

test("requires recovery after timeout or malformed readback without widening the target", async () => {
  const timeout = { async get() { throw new Error("timeout"); } };
  assert.deepEqual(await readCleanupEligibility({ client: timeout, ...exact() }), {
    status: "recovery-required", code: "read_indeterminate",
  });
  for (const [response, code] of [
    [undefined, "readback_malformed"],
    [{ status: "ok", payload: [] }, "readback_malformed"],
    [{ status: "rejected" }, "read_indeterminate"],
  ]) {
    const injected = client(response);
    assert.deepEqual(await readCleanupEligibility({ client: injected.client, ...exact() }), {
      status: "recovery-required", code,
    });
    assert.deepEqual(injected.calls, [`/repos/${target}`]);
  }
});

test("requires recovery when a readback changes an immutable identity field", () => {
  const cases = [
    [readback({ id: 43 }), "repository_id_changed"],
    [readback({ owner: { login: "other-owner" } }), "resource_owner_changed"],
    [readback({ name: "bootstrap-e2e-123-python", full_name: `${owner}/bootstrap-e2e-123-python` }), "resource_name_changed"],
    [readback({ template_repository: { full_name: "other/template" } }), "resource_template_changed"],
    [readback({ visibility: "public" }), "resource_visibility_changed"],
  ];
  for (const [current, code] of cases) {
    assert.deepEqual(decideCleanupEligibility({ ...exact(), readback: current }), {
      status: "recovery-required", code,
    });
  }
});

test("rejects changed owner, target, run, or malformed proof before any hosted read", async () => {
  for (const values of [
    exact({ owner: "other-owner" }),
    exact({ target: `${owner}/bootstrap-e2e-123-python` }),
    exact({ runId: "124" }),
    exact({ proof: proof({ template: "malformed template" }) }),
  ]) {
    const injected = client({ status: "ok", payload: readback() });
    assert.deepEqual(await readCleanupEligibility({ client: injected.client, ...values }), {
      status: "recovery-required", code: "proof_scope_mismatch",
    });
    assert.deepEqual(injected.calls, []);
  }
});

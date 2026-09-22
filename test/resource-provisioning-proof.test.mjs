import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalResourceName,
  proveProvisionedResource,
  ResourceProvisioningProofError,
  serializeProvisioningProof,
} from "../scripts/resource-provisioning-proof.mjs";

const runId = "123";
const owner = "sandbox-owner";
const resource = "typescript";
const name = "bootstrap-e2e-123-typescript";
const template = "eff3ct0/factory-template";
const releaseSha = "a".repeat(40);
const details = (overrides = {}) => ({
  id: 42,
  full_name: `${owner}/${name}`,
  name,
  owner: { login: owner },
  visibility: "private",
  template_repository: { full_name: template },
  default_branch: "main",
  ...overrides,
});
const reference = (overrides = {}) => ({ object: { type: "commit", sha: releaseSha }, ...overrides });

const client = (responses) => {
  const calls = [];
  return {
    calls,
    client: {
      async get(endpoint) {
        calls.push(endpoint);
        return responses.shift();
      },
    },
  };
};

const prove = (proofClient, overrides = {}) => proveProvisionedResource({
  client: proofClient,
  runId,
  owner,
  resource,
  template,
  releaseSha,
  ...overrides,
});

test("records a run-scoped immutable repository-ID provisioning proof", async () => {
  const injected = client([{ status: "ok", payload: details() }, { status: "ok", payload: reference() }]);
  const proof = await prove(injected.client);
  assert.deepEqual(proof, {
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
  });
  assert.deepEqual(injected.calls, [
    `/repos/${owner}/${name}`,
    `/repos/${owner}/${name}/git/ref/heads/main`,
  ]);
});

test("rejects invalid run IDs and resource names before reading", () => {
  for (const input of [
    { runId: "12x", resource },
    { runId, resource: "TypeScript" },
    { runId, resource: "../typescript" },
  ]) {
    assert.throws(() => canonicalResourceName(input), (error) => error instanceof ResourceProvisioningProofError);
  }
});

test("rejects a resource from another run without inferring its owner", async () => {
  const injected = client([{ status: "ok", payload: details({ name: "bootstrap-e2e-124-typescript", full_name: `${owner}/bootstrap-e2e-124-typescript` }) }]);
  assert.deepEqual(await prove(injected.client), { status: "rejected", code: "resource_name_mismatch" });
  assert.equal(injected.calls.length, 1);
});

test("rejects owner, visibility, template, release SHA, and repository ID mismatches", async () => {
  const cases = [
    [details({ owner: { login: "other-owner" } }), undefined, "resource_owner_mismatch"],
    [details({ visibility: "public" }), undefined, "resource_visibility_mismatch"],
    [details({ template_repository: { full_name: "other/template" } }), undefined, "resource_template_mismatch"],
    [details({ id: 0 }), undefined, "repository_id_mismatch"],
    [details(), reference({ object: { type: "commit", sha: "b".repeat(40) } }), "resource_release_sha_mismatch"],
  ];
  for (const [repository, branch, code] of cases) {
    const injected = client([{ status: "ok", payload: repository }, ...(branch ? [{ status: "ok", payload: branch }] : [])]);
    assert.deepEqual(await prove(injected.client), { status: "rejected", code });
  }
});

test("serializes a verified proof deterministically", async () => {
  const first = await prove(client([{ status: "ok", payload: details() }, { status: "ok", payload: reference() }]).client);
  const second = await prove(client([{ status: "ok", payload: details() }, { status: "ok", payload: reference() }]).client);
  assert.equal(serializeProvisioningProof(first), serializeProvisioningProof(second));
  assert.equal(serializeProvisioningProof(first).endsWith("\n"), true);
});

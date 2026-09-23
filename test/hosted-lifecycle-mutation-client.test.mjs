import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSTED_LIFECYCLE_ORIGIN,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  HostedLifecycleMutationError,
  createHostedLifecycleMutationClient,
} from "../scripts/hosted-lifecycle-mutation-client.mjs";

const response = (body, status = 201, headers = {}) => new Response(body, { status, headers });
const client = (transport, token = "github_pat_secret-value") => createHostedLifecycleMutationClient({ transport, token });

test("uses injected transport for exact empty repository creation and repository deletion", async () => {
  const requests = [];
  const lifecycle = client(async (request) => {
    requests.push(request);
    return request.method === "POST" ? response('{"id":1}', 201) : response(null, 204);
  });
  assert.deepEqual(await lifecycle.createEmptyRepository({ owner: "acme", name: "real-agent-journey-1" }), { status: "created", payload: { id: 1 } });
  assert.deepEqual(await lifecycle.deleteRepository({ owner: "acme", name: "bootstrap-e2e-1-node" }), { status: "deleted" });
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, `${HOSTED_LIFECYCLE_ORIGIN}/orgs/acme/repos`);
  assert.deepEqual(JSON.parse(requests[0].body), { name: "real-agent-journey-1", private: true, auto_init: false, has_issues: true, has_projects: false, has_wiki: false });
  assert.equal(requests[1].method, "DELETE");
  assert.equal(requests[1].url, `${HOSTED_LIFECYCLE_ORIGIN}/repos/acme/bootstrap-e2e-1-node`);
  assert.equal(requests[1].body, undefined);
  assert.equal(requests[0].signal instanceof AbortSignal, true);
  assert.equal(REQUEST_TIMEOUT_MS, 30_000);
});

test("rejects malformed ownership and template inputs before transport", async () => {
  let calls = 0;
  const lifecycle = client(async () => { calls += 1; return response("{}"); });
    await assert.rejects(() => lifecycle.createTemplateRepository({ template: "https://example.test/repo", owner: "acme", name: "repo" }), HostedLifecycleMutationError);
    await assert.rejects(() => lifecycle.createTemplateRepository({ template: "eff3ct0/factory-template", owner: "acme/repo", name: "repo" }), HostedLifecycleMutationError);
    await assert.rejects(() => lifecycle.createEmptyRepository({ owner: "acme/repo", name: "repo" }), HostedLifecycleMutationError);
  await assert.rejects(() => lifecycle.deleteRepository({ owner: "acme", name: "../repo" }), HostedLifecycleMutationError);
  assert.equal(calls, 0);
});

test("enforces request and response byte caps", async () => {
  let calls = 0;
  await assert.rejects(() => client(async () => { calls += 1; return response("{}"); }, "x".repeat(MAX_REQUEST_BYTES)).deleteRepository({ owner: "acme", name: "repo" }), { code: "request_too_large" });
  const tooLarge = await client(async () => response("{}", 201, { "content-length": String(MAX_RESPONSE_BYTES + 1) })).createTemplateRepository({ template: "eff3ct0/factory-template", owner: "acme", name: "repo" });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); controller.close(); } });
  const streamed = await client(async () => ({ status: 201, headers: new Headers(), body: stream })).createTemplateRepository({ template: "eff3ct0/factory-template", owner: "acme", name: "repo" });
  assert.deepEqual(tooLarge, { status: "rejected", code: "response_too_large" });
  assert.deepEqual(streamed, { status: "rejected", code: "response_too_large" });
  assert.equal(calls, 0);
});

test("fails closed on malformed success responses", async () => {
  assert.deepEqual(await client(async () => response("not-json")).createTemplateRepository({ template: "eff3ct0/factory-template", owner: "acme", name: "repo" }), { status: "rejected", code: "invalid_json" });
  assert.deepEqual(await client(async () => response("[]")).createTemplateRepository({ template: "eff3ct0/factory-template", owner: "acme", name: "repo" }), { status: "rejected", code: "invalid_json" });
  assert.deepEqual(await client(async () => ({ status: 204, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }) })).deleteRepository({ owner: "acme", name: "repo" }), { status: "rejected", code: "invalid_response" });
});

test("normalizes timeout, network, and 5xx outcomes without retries or tokens", async () => {
  for (const transport of [
    async () => { throw new DOMException("github_pat_secret-value timed out", "TimeoutError"); },
    async () => { throw new Error("github_pat_secret-value network failure"); },
    async () => response("server failure", 503),
  ]) {
    let calls = 0;
    const result = await client(async (request) => { calls += 1; return transport(request); }).deleteRepository({ owner: "acme", name: "repo" });
    assert.deepEqual(result, { status: "indeterminate", code: "mutation_indeterminate" });
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes("github_pat_secret-value"), false);
  }
});

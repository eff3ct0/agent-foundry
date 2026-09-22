import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSTED_LIFECYCLE_ORIGIN,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  HostedLifecycleReadError,
  createHostedLifecycleReadClient,
} from "../scripts/hosted-lifecycle-read-client.mjs";

const response = (body, status = 200, headers = {}) => new Response(body, { status, headers });
const client = (transport, token = "github_pat_secret-value") => createHostedLifecycleReadClient({ transport, token });

test("uses the injected transport for one guarded GET with a 30-second abort", async () => {
  let request;
  const result = await client(async (value) => {
    request = value;
    return response('{"state":"ready"}');
  }).get("/repos/acme/factory/actions/runs/1");
  assert.deepEqual(result, { status: "ok", payload: { state: "ready" } });
  assert.equal(request.method, "GET");
  assert.equal(request.url, `${HOSTED_LIFECYCLE_ORIGIN}/repos/acme/factory/actions/runs/1`);
  assert.equal(request.signal instanceof AbortSignal, true);
  assert.equal(REQUEST_TIMEOUT_MS, 30_000);
  assert.equal(request.headers.Authorization, "Bearer github_pat_secret-value");
});

test("rejects endpoints outside the guarded GitHub API path before transport", async () => {
  let calls = 0;
  const read = client(async () => { calls += 1; return response("{}"); });
  for (const endpoint of ["https://example.test/secret", "//example.test/secret", "/repos/%2e%2e/secret", "/repos/acme#fragment"]) {
    await assert.rejects(() => read.get(endpoint), HostedLifecycleReadError);
  }
  assert.equal(calls, 0);
});

test("enforces the request and streamed response caps", async () => {
  let calls = 0;
  const oversizedToken = "x".repeat(MAX_REQUEST_BYTES);
  await assert.rejects(() => client(async () => { calls += 1; return response("{}"); }, oversizedToken).get("/repos/acme/factory"), { code: "request_too_large" });
  const tooLarge = await client(async () => response("{}", 200, { "content-length": String(MAX_RESPONSE_BYTES + 1) })).get("/repos/acme/factory");
  assert.deepEqual(tooLarge, { status: "rejected", code: "response_too_large" });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); controller.close(); } });
  const streamed = await client(async () => ({ status: 200, headers: new Headers(), body: stream })).get("/repos/acme/factory");
  assert.deepEqual(streamed, { status: "rejected", code: "response_too_large" });
  assert.equal(calls, 0);
});

test("fails closed on malformed JSON and non-object JSON", async () => {
  assert.deepEqual(await client(async () => response("not-json")).get("/repos/acme/factory"), { status: "rejected", code: "invalid_json" });
  assert.deepEqual(await client(async () => response("[]")).get("/repos/acme/factory"), { status: "rejected", code: "invalid_json" });
});

test("normalizes timeout, network, and 5xx outcomes without retries or tokens", async () => {
  for (const transport of [
    async () => { throw new DOMException("github_pat_secret-value timed out", "TimeoutError"); },
    async () => { throw new Error("github_pat_secret-value network failure"); },
    async () => response("server failure", 503),
  ]) {
    let calls = 0;
    const result = await client(async (request) => { calls += 1; return transport(request); }).get("/repos/acme/factory");
    assert.deepEqual(result, { status: "indeterminate", code: "read_indeterminate" });
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes("github_pat_secret-value"), false);
  }
});

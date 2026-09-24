import assert from "node:assert/strict";
import { test } from "node:test";

import { createHostedLifecycleReadClient } from "../scripts/hosted-lifecycle-read-client.mjs";
import { MAX_ANNOTATED_TAG_DEPTH, PUBLISH_CLAIM_ASSET, claimPublishAttempt, resolvePublishedRelease, resolveReleaseForPublish } from "../scripts/release-readback.mjs";

const tag = "v1.2.3";
const repository = "acme/factory";
const sha = "a".repeat(40);
const annotatedSha = "b".repeat(40);
const response = (payload) => new Response(JSON.stringify(payload));
const release = (overrides = {}) => ({ tag_name: tag, draft: false, published_at: "2026-09-22T12:00:00Z", ...overrides });
const tagReference = (type, targetSha) => ({ object: { type, sha: targetSha } });

const injectedClient = (responses) => {
  const calls = [];
  const client = createHostedLifecycleReadClient({
    token: "github_pat_offline-test-token",
    transport: async ({ url }) => {
      calls.push(url);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { client, calls };
};

const resolve = (client, expectedSha = sha) => resolvePublishedRelease({ client, repository, tag, expectedSha });

test("resolves a published lightweight release tag to its full immutable SHA", async () => {
  const { client, calls } = injectedClient([response(release()), response(tagReference("commit", sha))]);
  assert.deepEqual(await resolve(client), { status: "ok", tag, sha });
  assert.deepEqual(calls.map((url) => new URL(url).pathname), [
    "/repos/acme/factory/releases/tags/v1.2.3",
    "/repos/acme/factory/git/ref/tags/v1.2.3",
  ]);
});

test("dereferences bounded annotated tags before returning the immutable commit", async () => {
  const { client, calls } = injectedClient([
    response(release()),
    response(tagReference("tag", annotatedSha)),
    response(tagReference("commit", sha)),
  ]);
  assert.deepEqual(await resolve(client), { status: "ok", tag, sha });
  assert.equal(new URL(calls[2]).pathname, `/repos/acme/factory/git/tags/${annotatedSha}`);
});

test("rejects draft and unpublished releases", async () => {
  for (const value of [release({ draft: true }), release({ published_at: null })]) {
    const { client, calls } = injectedClient([response(value)]);
    assert.deepEqual(await resolve(client), { status: "rejected", code: "release_unpublished" });
    assert.equal(calls.length, 1);
  }
});

test("rejects a mismatched release tag or expected commit", async () => {
  let fixture = injectedClient([response(release({ tag_name: "v9.9.9" }))]);
  assert.deepEqual(await resolve(fixture.client), { status: "rejected", code: "release_tag_mismatch" });

  fixture = injectedClient([response(release()), response(tagReference("commit", sha))]);
  assert.deepEqual(await resolve(fixture.client, "c".repeat(40)), { status: "rejected", code: "release_sha_mismatch" });
});

test("publish guard accepts release and manual dispatch only for the exact event commit", async () => {
  for (const eventName of ["release", "workflow_dispatch"]) {
    const { client, calls } = injectedClient([response(release()), response(tagReference("commit", sha))]);
    assert.deepEqual(await resolveReleaseForPublish({ client, repository, tag, eventName, eventSha: sha }), { status: "ok", tag, sha });
    assert.equal(calls.length, 2);
  }
});

test("publish guard rejects either event when its commit differs from the resolved tag", async () => {
  for (const eventName of ["release", "workflow_dispatch"]) {
    const { client, calls } = injectedClient([response(release()), response(tagReference("commit", sha))]);
    assert.deepEqual(await resolveReleaseForPublish({ client, repository, tag, eventName, eventSha: "c".repeat(40) }),
      { status: "rejected", code: "release_sha_mismatch" });
    assert.equal(calls.length, 2);
  }
});

test("publish guard rejects missing or malformed event SHA before any read", async () => {
  for (const eventName of ["release", "workflow_dispatch"]) {
    for (const eventSha of [undefined, "", "short", "C".repeat(40)]) {
      const { client, calls } = injectedClient([]);
      assert.deepEqual(await resolveReleaseForPublish({ client, repository, tag, eventName, eventSha }),
        { status: "rejected", code: "event_sha_missing_or_malformed" });
      assert.deepEqual(calls, []);
    }
  }
  const { client } = injectedClient([]);
  assert.deepEqual(await resolveReleaseForPublish({ client, repository, tag, eventName: "push", eventSha: sha }),
    { status: "rejected", code: "unsupported_release_event" });
});

test("rejects malformed release and tag response payloads", async () => {
  let fixture = injectedClient([response({ draft: false, published_at: "2026-09-22T12:00:00Z" })]);
  assert.deepEqual(await resolve(fixture.client), { status: "rejected", code: "malformed_release" });

  fixture = injectedClient([response(release()), response({ object: { type: "commit", sha: "short" } })]);
  assert.deepEqual(await resolve(fixture.client), { status: "rejected", code: "malformed_tag_reference" });
});

test("fails closed when annotated tag nesting exceeds the bounded dereference depth", async () => {
  const tagShas = Array.from({ length: MAX_ANNOTATED_TAG_DEPTH + 1 }, (_, index) => String(index).repeat(40));
  const { client, calls } = injectedClient([
    response(release()),
    response(tagReference("tag", tagShas[0])),
    ...tagShas.slice(1).map((value) => response(tagReference("tag", value))),
  ]);
  assert.deepEqual(await resolve(client), { status: "rejected", code: "annotated_tag_depth_exceeded" });
  assert.equal(calls.length, MAX_ANNOTATED_TAG_DEPTH + 2);
});

test("preserves indeterminate read outcomes without continuing the resolution", async () => {
  const { client, calls } = injectedClient([new Error("offline transport failure")]);
  assert.deepEqual(await resolve(client), { status: "indeterminate", code: "read_indeterminate" });
  assert.equal(calls.length, 1);
});

const claimInput = { repository, releaseId: 123, tag, sourceSha: sha, packageName: "@eff3ct/agent-foundry", version: "1.2.3", runId: "456" };
const claimBody = Buffer.from(JSON.stringify({ tag, source_sha: sha, package: claimInput.packageName, version: "1.2.3", run_id: "456" }));
const asset = (overrides = {}) => ({ id: 789, name: PUBLISH_CLAIM_ASSET, state: "uploaded", size: claimBody.length, ...overrides });
const binaryResponse = (body, status = 200) => new Response(body, { status });
const downloadUrl = "https://release-assets.githubusercontent.com/signed/claim?token=fixture";
const redirectResponse = (location = downloadUrl) => new Response(null, { status: 302, headers: { Location: location } });
const claimFixture = (responses) => {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("unexpected request");
    return next;
  };
  return { calls, transport, attempt: (overrides = {}) => claimPublishAttempt({ ...claimInput, transport, ...overrides }) };
};
const claimedResponses = () => [binaryResponse(JSON.stringify(asset()), 201), response([asset()]), binaryResponse(claimBody)];

test("claims once on 201 only after scoped list and exact binary readback", async () => {
  const fixture = claimFixture(claimedResponses());
  assert.deepEqual(await fixture.attempt(), { status: "claimed", releaseId: 123, assetId: 789 });
  assert.deepEqual(fixture.calls.map(({ method, url }) => [method, new URL(url).host, new URL(url).pathname]), [
    ["POST", "uploads.github.com", "/repos/acme/factory/releases/123/assets"],
    ["GET", "api.github.com", "/repos/acme/factory/releases/123/assets"],
    ["GET", "api.github.com", "/repos/acme/factory/releases/assets/789"],
  ]);
  assert.equal(new URL(fixture.calls[0].url).searchParams.get("name"), PUBLISH_CLAIM_ASSET);
  assert.deepEqual(JSON.parse(fixture.calls[0].body.toString()), JSON.parse(claimBody.toString()));
  assert.equal(fixture.calls[0].headers["Content-Length"], String(claimBody.length));
  assert.equal(fixture.calls[2].redirect, "manual");
});

test("claims on a single allowlisted 302 download with exact bytes and no forwarded API credentials", async () => {
  const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], redirectResponse()]);
  const apiTransport = (request) => fixture.transport({ ...request, headers: { ...request.headers, Authorization: "Bearer offline-api-token" } });
  const downloads = [];
  const downloadTransport = async (request) => {
    downloads.push(request);
    return binaryResponse(claimBody);
  };
  assert.deepEqual(await fixture.attempt({ transport: apiTransport, downloadTransport }), { status: "claimed", releaseId: 123, assetId: 789 });
  assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST", "GET", "GET"]);
  assert.equal(fixture.calls[2].headers.Authorization, "Bearer offline-api-token");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, downloadUrl);
  assert.equal(downloads[0].method, "GET");
  assert.equal(downloads[0].redirect, "manual");
  assert.equal(downloads[0].credentials, "omit");
  assert.equal(downloads[0].headers, undefined);
  assert.equal(downloads[0].body, undefined);
  assert.equal(downloads[0].signal, fixture.calls[2].signal);
});

test("redirected claims block absent, unapproved or credential-bearing download targets without a second request", async () => {
  for (const redirect of [
    new Response(null, { status: 302 }),
    redirectResponse("http://release-assets.githubusercontent.com/signed/claim"),
    redirectResponse("https://release-assets.githubusercontent.com.evil.test/signed/claim"),
    redirectResponse("https://objects.githubusercontent.com/signed/claim"),
    redirectResponse("https://evil.test/signed/claim"),
    redirectResponse("https://user@release-assets.githubusercontent.com/signed/claim"),
    redirectResponse("//release-assets.githubusercontent.com/signed/claim"),
  ]) {
    const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], redirect]);
    const downloads = [];
    assert.deepEqual(await fixture.attempt({ downloadTransport: async (request) => { downloads.push(request); return binaryResponse(claimBody); } }),
      { status: "blocked", code: "claim_unverified" });
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST", "GET", "GET"]);
    assert.deepEqual(downloads, []);
  }
  const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], redirectResponse()]);
  assert.deepEqual(await fixture.attempt(), { status: "blocked", code: "claim_unverified" });
  assert.equal(fixture.calls.length, 3);
  const sameTransport = claimFixture([claimedResponses()[0], claimedResponses()[1], redirectResponse()]);
  assert.deepEqual(await sameTransport.attempt({ downloadTransport: sameTransport.transport }), { status: "blocked", code: "claim_unverified" });
  assert.equal(sameTransport.calls.length, 3);
});

test("redirected claims block secondary redirects, mismatched or oversized bytes and timeout without retry", async () => {
  for (const download of [redirectResponse(), binaryResponse("wrong"), binaryResponse("x".repeat(1025))]) {
    const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], redirectResponse()]);
    const downloads = [];
    assert.equal((await fixture.attempt({ downloadTransport: async (request) => { downloads.push(request); return download; } })).status, "blocked");
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST", "GET", "GET"]);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].redirect, "manual");
  }
  const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], redirectResponse()]);
  const downloads = [];
  assert.deepEqual(await fixture.attempt({ timeoutMs: 10, downloadTransport: (request) => {
    downloads.push(request);
    return new Promise(() => {});
  } }), { status: "blocked", code: "claim_unknown" });
  assert.equal(fixture.calls.length, 3);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].signal.aborted, true);
});

test("duplicate 422 and 502 starter block without reads, deletes or retry", async () => {
  for (const [reply, code] of [[binaryResponse("duplicate", 422), "claim_exists"], [binaryResponse("upstream", 502), "claim_unknown"]]) {
    const fixture = claimFixture([reply]);
    assert.deepEqual(await fixture.attempt(), { status: "blocked", code });
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST"]);
  }
});

test("lost response, timeout, malformed or oversized POST block with one write", async () => {
  for (const replies of [
    [new Error("lost response")],
    [binaryResponse("not json", 201)],
    [binaryResponse("x".repeat(1025), 201)],
    [binaryResponse(JSON.stringify(asset({ state: "starter" })), 201)],
  ]) {
    const fixture = claimFixture(replies);
    assert.equal((await fixture.attempt()).status, "blocked");
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST"]);
  }
  const calls = [];
  const timeout = await claimPublishAttempt({ ...claimInput, transport: ({ method }) => {
    calls.push(method);
    throw new DOMException("timed out", "TimeoutError");
  } });
  assert.deepEqual(timeout, { status: "blocked", code: "claim_unknown" });
  assert.deepEqual(calls, ["POST"]);
  const stalled = await claimPublishAttempt({ ...claimInput, timeoutMs: 10, transport: ({ method }) => {
    calls.push(method);
    return new Promise(() => {});
  } });
  assert.deepEqual(stalled, { status: "blocked", code: "claim_unknown" });
  assert.deepEqual(calls, ["POST", "POST"]);
});

test("starter, ambiguous and mismatched scoped list/readback block with zero further writes", async () => {
  const cases = [
    [response([asset({ state: "starter" })])],
    [response([asset(), asset({ id: 790 })])],
    [response([asset({ id: 790 })])],
    [response([asset({ name: "unrelated" })])],
    [response(Array(100).fill(asset()))],
    [binaryResponse("bad json")],
    [new Error("list network error")],
    [binaryResponse("missing", 404)],
  ];
  for (const replies of cases) {
    const fixture = claimFixture([claimedResponses()[0], ...replies]);
    assert.equal((await fixture.attempt()).status, "blocked");
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST", "GET"]);
  }
  for (const download of [binaryResponse(Buffer.from("wrong")), redirectResponse(), new Error("download lost"), binaryResponse("x".repeat(1025))]) {
    const fixture = claimFixture([claimedResponses()[0], claimedResponses()[1], download]);
    assert.equal((await fixture.attempt()).status, "blocked");
    assert.deepEqual(fixture.calls.map(({ method }) => method), ["POST", "GET", "GET"]);
  }
});

test("invalid release, SHA and claim identity never reach the transport", async () => {
  for (const change of [{ releaseId: 0 }, { sourceSha: "short" }, { version: "9.9.9" }, { runId: "secret arg" }]) {
    const fixture = claimFixture([]);
    await assert.rejects(fixture.attempt(change), { code: "invalid_claim" });
    assert.equal(fixture.calls.length, 0);
  }
});

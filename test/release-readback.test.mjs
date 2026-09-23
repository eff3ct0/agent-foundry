import assert from "node:assert/strict";
import { test } from "node:test";

import { createHostedLifecycleReadClient } from "../scripts/hosted-lifecycle-read-client.mjs";
import { MAX_ANNOTATED_TAG_DEPTH, resolvePublishedRelease, resolveReleaseForPublish } from "../scripts/release-readback.mjs";

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

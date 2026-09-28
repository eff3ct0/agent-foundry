import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { provision } from "../scripts/real-agent-journey.mjs";

const template = "eff3ct0/agent-foundry";
const owner = "acme";
const runId = "123";
const sourceSha = "a".repeat(40);
const repository = `${owner}/real-agent-journey-${runId}`;
const generatedRepository = (overrides = {}) => ({
  full_name: repository,
  owner: { login: owner },
  id: 42,
  default_branch: "master",
  ...overrides,
});
const response = (payload, status = 200) => new Response(payload === undefined ? null : JSON.stringify(payload), { status });

const expectedRequests = [
  ["GET", `https://api.github.com/repos/${template}`],
  ["GET", `https://api.github.com/repos/${template}/git/ref/heads/main`],
  ["POST", `https://api.github.com/orgs/${owner}/repos`],
  ["GET", `https://api.github.com/repos/${repository}`],
];

const installTransport = (t, overrides = {}) => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.JOURNEY_TOKEN;
  process.env.JOURNEY_TOKEN = "journey-test-token";
  globalThis.fetch = async (url, options = {}) => {
    const request = { method: options.method ?? "GET", url: String(url), body: options.body };
    calls.push(request);
    switch (calls.length) {
      case 1:
        return response({ full_name: template, default_branch: "main" });
      case 2:
        return response({ object: { sha: sourceSha } });
      case 3:
        assert.deepEqual(JSON.parse(request.body), {
          name: "real-agent-journey-123",
          private: true,
          auto_init: false,
          has_issues: true,
          has_projects: false,
          has_wiki: false,
        });
        return response({ id: 42 }, 201);
      case 4:
        return response(generatedRepository(overrides));
      default:
        throw new Error(`unexpected request: ${request.method} ${request.url}`);
    }
  };
  t.after(async () => {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.JOURNEY_TOKEN;
    else process.env.JOURNEY_TOKEN = previousToken;
  });
  return calls;
};

const outputFor = async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "real-agent-journey-provision-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, "provision.json");
};

const provisionInput = (output) => ({
  template,
  owner,
  runId,
  expectedSourceSha: sourceSha,
  output,
});

test("accepts an owner-configured empty-repository default branch and records workflow main", async (t) => {
  const output = await outputFor(t);
  const calls = installTransport(t);

  await provision(provisionInput(output));

  const evidence = JSON.parse(await readFile(output, "utf8"));
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.failure_code, "");
  assert.equal(evidence.identifiers.default_branch, "main");
  assert.deepEqual(calls.map(({ method, url }) => [method, url]), expectedRequests);
});

for (const [mismatch, overrides] of [
  ["owner", { owner: { login: "another-owner" } }],
  ["name", { full_name: `${owner}/another-name`, name: "another-name" }],
  ["ID", { id: 43 }],
]) {
  test(`preserves generated repository ${mismatch} mismatch failure`, async (t) => {
    const output = await outputFor(t);
    const calls = installTransport(t, overrides);

    await assert.rejects(
      () => provision(provisionInput(output)),
      (error) => error?.code === "generated_identity_mismatch",
    );

    const evidence = JSON.parse(await readFile(output, "utf8"));
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.failure_code, "generated_identity_mismatch");
    assert.deepEqual(calls.map(({ method, url }) => [method, url]), expectedRequests);
  });
}

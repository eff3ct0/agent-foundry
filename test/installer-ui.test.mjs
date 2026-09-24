import assert from "node:assert/strict";
import { test } from "node:test";

const {
  detectUiOptions,
  operationCounts,
  renderCompletion,
  renderReview,
  renderSelection,
  renderStep,
  renderWelcome,
} = await import("../dist/installer-ui.js");

const options = { color: false, unicode: false, reducedMotion: true, width: 40 };

test("welcome renders Agent Foundry without color and preserves its template description", () => {
  const welcome = renderWelcome(options);
  assert.equal(welcome, "Agent Foundry installer\nPrepare a repository from the packaged template");
  assert.doesNotMatch(welcome, /Factory Template installer|\u001b/);
});

test("renderer uses stable ASCII output for narrow, reduced-motion terminals", () => {
  const selection = renderSelection({ key: "TASK_TRACKER", prompt: "Task provider", default: "", required: true, enum: ["jira", "github-issues"] }, 1, options);
  assert.equal(selection, "Task provider (TASK_TRACKER)\nUse Up/Down and Enter, or press a number.\n  1. jira\n> 2. github-issues");
  assert.equal(renderStep(2, 3, "Collecting answers", options), "> Step 2/3 Collecting answers");
});

test("review and completion render from the creator envelope without changing it", () => {
  const envelope = {
    schema_version: 1,
    command: "dry-run",
    status: "dry-run",
    target: "/tmp/project",
    payload: { version: "1", digest: "sha256:test" },
    operations: [
      { path: "README.md", action: "create", mode: "0644", size: 1, sha256: "a", reason: "missing" },
      { path: "same.txt", action: "noop", mode: "0644", size: 1, sha256: "b", reason: "unchanged" },
    ],
    diagnostics: [],
  };
  assert.deepEqual(operationCounts(envelope.operations), { create: 1, noop: 1 });
  assert.match(renderReview(envelope, options), /1 create/);
  assert.match(renderReview(envelope, options), /README.md/);
  assert.match(renderCompletion(envelope, options), /Plan ready/);
  assert.doesNotMatch(renderCompletion(envelope, options), /\u001b/);
});

test("environment policy disables color and Unicode fallbacks deterministically", () => {
  assert.deepEqual(detectUiOptions({ NO_COLOR: "1", TERM: "dumb", LANG: "C", FACTORY_REDUCED_MOTION: "1" }, 20), {
    color: false,
    unicode: false,
    reducedMotion: true,
    width: 40,
  });
});

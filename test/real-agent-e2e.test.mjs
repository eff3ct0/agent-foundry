import assert from "node:assert/strict";
import test from "node:test";
import { buildPhaseSchema, providerDiagnostic } from "../scripts/real-agent-e2e.mjs";

const assertStrictSchema = (schema, properties) => {
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), properties);
  assert.deepEqual(schema.required, properties);
  assert.equal(Object.hasOwn(schema.properties, "unexpected"), false);
};

test("Codex request and execution schemas are strict and preserve their field contracts", () => {
  const request = buildPhaseSchema("request");
  const execution = buildPhaseSchema("execution");

  assertStrictSchema(request, ["required_documents"]);
  assert.deepEqual(request.properties.required_documents, { type: "array", items: { type: "string" } });

  const executionFields = ["status", "issue_url", "branch", "commit", "tests", "approval_gate"];
  assertStrictSchema(execution, executionFields);
  assert.deepEqual(execution.properties.status, { type: "string", enum: ["passed"] });
  assert.deepEqual(execution.properties.tests, { anyOf: [{ type: "string" }, { type: "boolean" }] });
});

test("provider diagnostics are bounded, redacted, and do not retain stdout prompts", () => {
  const secret = "sk-live-provider-secret";
  const workspace = "/home/steam/private/workspace";
  const diagnostic = providerDiagnostic({
    error: new Error("request failed"),
    stderr: `provider rejected api_key=${secret} in ${workspace} ${"x".repeat(4000)}`,
    stdout: "raw prompt must not be retained",
  }, [secret], workspace);

  assert.match(diagnostic, /error: Error: request failed/u);
  assert.match(diagnostic, /stderr: provider rejected api_key=<redacted>/u);
  assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes(workspace), false);
  assert.equal(diagnostic.includes("raw prompt"), false);
  assert.equal(Buffer.byteLength(diagnostic, "utf8") <= 2000, true);
});

test("provider diagnostics retain only structured Codex error-event messages", () => {
  const secret = "sk-live-provider-secret";
  const workspace = "/home/steam/private/workspace";
  const diagnostic = providerDiagnostic({
    stdout: [
      JSON.stringify({ type: "message", message: "prompt and arbitrary agent output" }),
      JSON.stringify({ type: "error", message: `request failed api_key=${secret} in ${workspace}` }),
      JSON.stringify({ type: "error", message: "second provider error" }),
    ].join("\n"),
  }, [secret], workspace);

  assert.match(diagnostic, /codex error: request failed api_key=<redacted> in <private-path>/u);
  assert.match(diagnostic, /codex error: second provider error/u);
  assert.equal(diagnostic.includes("prompt and arbitrary agent output"), false);
  assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes(workspace), false);
});

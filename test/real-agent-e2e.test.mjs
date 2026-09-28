import assert from "node:assert/strict";
import test from "node:test";
import { providerDiagnostic } from "../scripts/real-agent-e2e.mjs";

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

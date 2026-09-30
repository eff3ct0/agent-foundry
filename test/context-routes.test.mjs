import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agent = await readFile(path.join(root, "AGENT.md"), "utf8");
const routes = new Map(
  agent.split("\n").filter((line) => line.startsWith("| ") && line.includes(" → "))
    .map((line) => {
      const [, trigger, required, optional] = line.split("|").map((cell) => cell.trim());
      return [trigger, { required, optional }];
    }),
);

test("cold source bug-fix and release navigation loads only required routed topics", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [path.join(root, "start.mjs"), "--json"], { cwd: root });
  assert.equal(JSON.parse(stdout).mode, "SELF");
  for (const [trigger, requiredTopic, unrelated] of [
    ["Bug fix or implementation", "docs/engineering-handbook.md", "docs/agent-init.md"],
    ["Release or deployment", "docs/workflow.md", "docs/agent-init.md"],
  ]) {
    const required = routes.get([...routes.keys()].find((name) => name.startsWith(trigger)))?.required;
    assert.ok(required, `${trigger} must be discoverable from AGENT.md`);
    const loaded = [...required.matchAll(/`([^`]+\.md)` → /gu)].map((match) => match[1]);
    assert.ok(loaded.includes(requiredTopic), `${trigger} must load ${requiredTopic}`);
    assert.ok(!loaded.includes(unrelated), `${trigger} must not load ${unrelated}`);
    for (const relative of loaded) assert.ok((await readFile(path.join(root, relative), "utf8")).trim(), relative);
  }
});

test("task routes discover relevant source topics without loading unrelated topics", async () => {
  for (const [trigger, expected, excluded] of [
    ["Bug fix or implementation", "docs/engineering-handbook.md", "docs/agent-init.md"],
    ["Provider setup or binding failure", "docs/agent-init.md", "MAINTAINERS.md"],
    ["Release or deployment", "docs/workflow.md", "docs/agent-init.md"],
  ]) {
    const match = [...routes].find(([name]) => name.startsWith(trigger));
    assert.ok(match, `${trigger} route missing`);
    const { required, optional } = match[1];
    assert.match(required, new RegExp(expected.replaceAll(".", "\\.")));
    assert.doesNotMatch(required, new RegExp(excluded.replaceAll(".", "\\.")));
    assert.match(required, / → /u);
    for (const source of required.matchAll(/`([^`]+\.md)` → /gu)) {
      await stat(path.join(root, source[1]));
    }
    assert.ok(optional, `${trigger} optional reading must be explicit`);
  }
});

test("entry and shim distinguish mandatory discovery from optional task context", async () => {
  const shim = await readFile(path.join(root, "CLAUDE.md"), "utf8");
  const bindings = await readFile(path.join(root, "docs/bindings.md"), "utf8");
  assert.match(shim, /node start\.mjs/u);
  assert.match(shim, /AGENT\.md.*docs\/bindings\.md/u);
  assert.match(agent, /A link only points to content; it does not load it/u);
  assert.match(agent, /required local content is missing/u);
  assert.match(agent, /50–200.*50–150/u);
  assert.match(bindings, /source-template guide/u);
  assert.match(bindings, /canonical source/u);
});

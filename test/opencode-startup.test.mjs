import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const loadPlugin = async () => {
  const source = await readFile(path.join(root, "hooks/opencode/factory-start.ts"), "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(require, module.exports, module);
  return module.exports;
};

test("isolates concurrent OpenCode startup output and delivers it once", async () => {
  const first = deferred();
  const second = deferred();
  const runners = [first, second];
  const { createFactoryStartPlugin } = await loadPlugin();
  const plugin = createFactoryStartPlugin({
    worktree: root,
    runStart: () => runners.shift().promise,
  });

  await Promise.all([
    plugin.event({ event: { type: "session.created", properties: { sessionID: "first" } } }),
    plugin.event({ event: { type: "session.created", properties: { sessionID: "second" } } }),
  ]);

  const firstOutput = { parts: [] };
  const duplicateFirstOutput = { parts: [] };
  const secondOutput = { parts: [] };
  const firstDelivery = plugin["chat.message"]({ sessionID: "first" }, firstOutput);
  const duplicateFirstDelivery = plugin["chat.message"]({ sessionID: "first" }, duplicateFirstOutput);
  const secondDelivery = plugin["chat.message"]({ sessionID: "second" }, secondOutput);

  second.resolve("second startup\n");
  await secondDelivery;
  first.resolve("first startup\n");
  await Promise.all([firstDelivery, duplicateFirstDelivery]);

  assert.deepEqual(firstOutput.parts, [{ type: "text", text: "first startup\n" }]);
  assert.deepEqual(secondOutput.parts, [{ type: "text", text: "second startup\n" }]);
  assert.deepEqual(duplicateFirstOutput.parts, []);
  await plugin["chat.message"]({ sessionID: "second" }, secondOutput);
  assert.equal(secondOutput.parts.length, 1);
});

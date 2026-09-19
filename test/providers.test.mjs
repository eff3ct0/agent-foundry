import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  parseProviderSelection,
  validateProviderCatalog,
} from "../dist/providers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = validateProviderCatalog(JSON.parse(await readFile(path.join(root, "dist", "payload", "providers/agents/catalog.json"), "utf8")));

test("the provider catalog is versioned and contains the supported matrix", () => {
  assert.equal(catalog.catalog_version, "1.0.0");
  assert.deepEqual(catalog.providers.map(({ id }) => id), ["claude-code", "opencode", "codex", "pi"]);
  assert.ok(catalog.providers.every(({ workspace, launch, manual_prerequisites }) => workspace.files.length > 0 && launch.args.length > 0 && manual_prerequisites.length > 0));
});

test("provider selection is deterministic and rejects invalid combinations", () => {
  assert.deepEqual(parseProviderSelection("opencode", undefined, catalog), ["opencode"]);
  assert.deepEqual(parseProviderSelection(undefined, ["pi", "claude-code"], catalog), ["claude-code", "pi"]);
  assert.deepEqual(parseProviderSelection("none", undefined, catalog), []);
  assert.throws(() => parseProviderSelection("none,codex", undefined, catalog), /none cannot be combined/);
  assert.throws(() => parseProviderSelection("missing", undefined, catalog), /unknown agent provider/);
});

/** Pure policy over caller-inventoried file identities; filesystem discovery is a later integration step. */
export type InventoryScope = "tracked" | "payload" | "generated";
export type InventoryFile = string | { path: string; kind: "file" | "symlink" };

export interface CompiledModule {
  sourceScope: InventoryScope;
  source: string;
  outputScope: InventoryScope;
  output: string;
}

export interface ModulePolicyInventory {
  tracked: readonly InventoryFile[];
  payload: readonly InventoryFile[];
  generated: readonly InventoryFile[];
  /** Exact application-owned file identities, not directories or globs. */
  generatedApplication: readonly string[];
  /** Explicit source-to-output compiler provenance, never an extension or directory exemption. */
  compiled: readonly CompiledModule[];
}

export interface ModulePolicyDiagnostic {
  scope: InventoryScope;
  path: string;
  reason: "untyped JavaScript module" | "untyped .mjs module";
}

const scopes: readonly InventoryScope[] = ["tracked", "payload", "generated"];
const typed = /\.(?:ts|tsx|mts|cts)$/u;
const javascript = /\.(?:js|jsx|cjs|mjs)$/u;

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const relativeFile = (value: unknown): string => {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") ||
    value.startsWith("/") || /^[A-Za-z]:/u.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`invalid module policy path: ${String(value)}`);
  }
  return value;
};

const scopeName = (value: unknown): InventoryScope => {
  if (!scopes.includes(value as InventoryScope)) throw new Error(`invalid module policy scope: ${String(value)}`);
  return value as InventoryScope;
};

/** Fail closed on malformed inventories, then return stable path-ordered diagnostics. */
export const checkModulePolicy = (inventory: ModulePolicyInventory): ModulePolicyDiagnostic[] => {
  if (!object(inventory)) throw new Error("invalid module policy inventory");
  const files = new Map<InventoryScope, Set<string>>();
  for (const scope of scopes) {
    const entries = inventory[scope];
    if (!Array.isArray(entries)) throw new Error(`invalid module policy inventory: ${scope}`);
    const paths = new Set<string>();
    for (const entry of entries) {
      if (typeof entry !== "string" && (!object(entry) || entry.kind !== "file")) {
        throw new Error(`module policy inventory contains a symlink or malformed entry: ${scope}`);
      }
      const file = relativeFile(typeof entry === "string" ? entry : entry.path);
      if (paths.has(file)) throw new Error(`duplicate module policy identity: ${scope}:${file}`);
      paths.add(file);
    }
    files.set(scope, paths);
  }

  if (!Array.isArray(inventory.generatedApplication) || !Array.isArray(inventory.compiled)) {
    throw new Error("invalid module policy classification manifest");
  }
  const application = new Set<string>();
  for (const entry of inventory.generatedApplication) {
    const file = relativeFile(entry);
    if (application.has(file) || !files.get("generated")!.has(file)) {
      throw new Error(`invalid generated application identity: ${file}`);
    }
    application.add(file);
  }

  const outputs = new Set<string>();
  for (const entry of inventory.compiled) {
    if (!object(entry)) throw new Error("invalid compiled module provenance");
    const sourceScope = scopeName(entry.sourceScope);
    const outputScope = scopeName(entry.outputScope);
    const source = relativeFile(entry.source);
    const output = relativeFile(entry.output);
    const sourceName = source.split("/").at(-1)!;
    const outputName = output.split("/").at(-1)!;
    const outputKey = `${outputScope}:${output}`;
    if (!typed.test(source) || !/\.(?:js|cjs)$/u.test(output) ||
      sourceName.replace(typed, "") !== outputName.replace(/\.(?:js|cjs)$/u, "") ||
      !files.get(sourceScope)!.has(source) || !files.get(outputScope)!.has(output) ||
      (sourceScope === "generated" && application.has(source)) ||
      (outputScope === "generated" && application.has(output)) || outputs.has(outputKey)) {
      throw new Error(`invalid compiled module provenance: ${outputKey}`);
    }
    outputs.add(outputKey);
  }

  const diagnostics: ModulePolicyDiagnostic[] = [];
  for (const scope of scopes) {
    for (const file of files.get(scope)!) {
      if (scope === "generated" && application.has(file)) continue;
      if (!javascript.test(file)) continue;
      if (file.endsWith(".mjs")) {
        diagnostics.push({ scope, path: file, reason: "untyped .mjs module" });
      } else if (!outputs.has(`${scope}:${file}`)) {
        diagnostics.push({ scope, path: file, reason: "untyped JavaScript module" });
      }
    }
  }
  return diagnostics.sort((a, b) =>
    `${a.scope}:${a.path}` < `${b.scope}:${b.path}` ? -1 : `${a.scope}:${a.path}` > `${b.scope}:${b.path}` ? 1 : 0);
};

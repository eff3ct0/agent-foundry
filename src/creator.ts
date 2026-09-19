import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  inspectProviderAvailability,
  launchProvider,
  parseProviderSelection,
  validateProviderCatalog,
  type ProviderCatalog,
  type ProviderRuntime,
} from "./providers";

export const CREATOR_SCHEMA_VERSION = 1;
export const CREATOR_DIRECTORY = ".factory-template-creator";
export const STATE_FILE = `${CREATOR_DIRECTORY}/state.json`;
export const STAGING_DIRECTORY = `${CREATOR_DIRECTORY}/.staging`;

const MAX_STATE_FILES = 10_000;
const MAX_STATE_BYTES = 10 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

export interface PayloadFile {
  path: string;
  mode: string;
  size: number;
  sha256: string;
}

export interface PayloadManifest {
  schema_version: number;
  package_name: string;
  package_version: string;
  payload_version: string;
  files: PayloadFile[];
  payload_digest: string;
}

export interface PlaceholderCondition {
  key: string;
  equals?: string | string[];
  not_equals?: string | string[];
}

export interface Placeholder {
  key: string;
  prompt: string;
  default: string;
  required: boolean;
  enum?: string[];
  kind?: string;
  condition?: PlaceholderCondition;
  when?: PlaceholderCondition;
}

export interface PlaceholderManifest {
  placeholders: Placeholder[];
}

export type OwnershipDisposition = "removed" | "inherited" | "generated";

export interface OwnershipEntry {
  path: string;
  kind: "file" | "directory";
}

export interface OwnershipCategory {
  disposition: OwnershipDisposition;
  paths: OwnershipEntry[];
  payload?: boolean;
}

export interface OwnershipManifest {
  schema_version: number;
  description?: string;
  text_files: string[];
  categories: Record<string, OwnershipCategory>;
}

interface CreatorState {
  schema_version: number;
  payload_version: string;
  payload_digest: string;
  config_digest: string;
  owned_files: Array<Pick<PayloadFile, "path" | "mode" | "size" | "sha256">>;
}

export interface CreatorConfig {
  values: Record<string, string>;
  digest: string;
}

export interface ProviderSummary {
  catalog_version: string;
  selected: Array<{
    id: string;
    display_name: string;
    executable: string;
    available: boolean;
    capabilities: string[];
    workspace_files: string[];
    manual_prerequisites: string[];
    next_steps: string[];
  }>;
  manifest_path?: string;
}

export interface HandoffResult {
  status: "launched" | "failed";
  provider: string;
  argv: string[];
  exit_code: number;
  signal: NodeJS.Signals | null;
  message: string;
}

export type Command = "plan" | "dry-run" | "apply" | "verify" | "doctor";
export type OperationAction = "create" | "update" | "remove" | "noop" | "conflict";

export interface Diagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface Operation {
  path: string;
  action: OperationAction;
  mode: string;
  size: number;
  sha256: string;
  reason: string;
}

export interface CreatorEnvelope {
  schema_version: number;
  command: Command;
  status: string;
  target: string;
  payload: {
    version: string;
    digest: string;
  };
  config_digest?: string;
  operations: Operation[];
  diagnostics: Diagnostic[];
  providers?: ProviderSummary;
  verification?: "verified" | "failed";
  handoff?: HandoffResult;
  rollback?: {
    attempted: boolean;
    restored: boolean;
    message: string;
  };
}

export interface CreatorOptions {
  command: Command;
  target: string;
  configPath?: string;
  nonInteractive?: boolean;
  prompt?: (placeholder: Placeholder) => Promise<string>;
  failAfter?: number;
  interruptAfter?: number;
  agent?: string;
  agents?: string[];
  launchAgent?: boolean;
  resolvedConfig?: CreatorConfig;
}

interface PlannedFile {
  relativePath: string;
  bytes: Buffer;
  mode: number;
  sha256: string;
  size: number;
}

export interface PreparedPlan {
  envelope: CreatorEnvelope;
  target: string;
  targetExisted: boolean;
  files: PlannedFile[];
  stateBytes?: Buffer;
  config?: CreatorConfig;
  state?: CreatorState;
  failAfter?: number;
  interruptAfter?: number;
  providerRuntimes: ProviderRuntime[];
  providerSummary?: ProviderSummary;
}

export class CreatorError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly plan?: PreparedPlan;
  readonly preserveStaging: boolean;

  constructor(code: string, message: string, options: { path?: string; plan?: PreparedPlan; preserveStaging?: boolean } = {}) {
    super(message);
    this.name = "CreatorError";
    this.code = code;
    this.path = options.path;
    this.plan = options.plan;
    this.preserveStaging = options.preserveStaging ?? false;
  }
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const canonicalJson = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const normalizePath = (value: string): string => value.replaceAll(path.sep, "/");
const compareStrings = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const diagnostic = (code: string, message: string, relativePath?: string): Diagnostic => ({
  code,
  message,
  ...(relativePath ? { path: relativePath } : {}),
});

const sortDiagnostics = (items: Diagnostic[]): Diagnostic[] => [...items].sort((left, right) =>
  compareStrings(`${left.code}\0${left.path ?? ""}\0${left.message}`, `${right.code}\0${right.path ?? ""}\0${right.message}`));

const sortOperations = (items: Operation[]): Operation[] => [...items].sort((left, right) => compareStrings(left.path, right.path));

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

const assertNoDuplicateJsonKeys = (text: string, label: string): void => {
  let index = 0;
  const whitespace = () => { while (/\s/u.test(text[index] ?? "")) index += 1; };
  const stringValue = (): string => {
    const start = index;
    if (text[index] !== '"') throw new Error(`${label} contains an invalid string`);
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") index += 2;
      else if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index)) as string;
      } else index += 1;
    }
    throw new Error(`${label} contains an unterminated string`);
  };
  const value = (): void => {
    whitespace();
    if (text[index] === "{") {
      index += 1;
      whitespace();
      const keys = new Set<string>();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        whitespace();
        const key = stringValue();
        if (keys.has(key)) throw new Error(`${label} contains duplicate key: ${key}`);
        keys.add(key);
        whitespace();
        if (text[index] !== ":") throw new Error(`${label} contains an invalid object`);
        index += 1;
        value();
        whitespace();
        if (text[index] === "}") { index += 1; return; }
        if (text[index] !== ",") throw new Error(`${label} contains an invalid object`);
        index += 1;
      }
    } else if (text[index] === "[") {
      index += 1;
      whitespace();
      if (text[index] === "]") { index += 1; return; }
      while (true) {
        value();
        whitespace();
        if (text[index] === "]") { index += 1; return; }
        if (text[index] !== ",") throw new Error(`${label} contains an invalid array`);
        index += 1;
      }
    } else if (text[index] === '"') {
      stringValue();
    } else {
      const start = index;
      while (index < text.length && !/[\s,\]}]/u.test(text[index])) index += 1;
      if (start === index) throw new Error(`${label} contains an invalid value`);
    }
  };
  value();
  whitespace();
  if (index !== text.length) throw new Error(`${label} contains trailing data`);
};

const parseJson = async (filePath: string, label: string): Promise<unknown> => {
  try {
    const text = await readFile(filePath, "utf8");
    assertNoDuplicateJsonKeys(text, label);
    return JSON.parse(text);
  } catch (error) {
    throw new CreatorError("invalid_json", `${label} is not valid JSON: ${(error as Error).message}`, { path: filePath });
  }
};

const assertSafeRelative = (relativePath: string): void => {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || normalized.includes("\0")) {
    throw new CreatorError("unsafe_path", `unsafe creator path: ${relativePath}`, { path: relativePath });
  }
};

const resolveTarget = async (rawTarget: string): Promise<{ absolute: string; existed: boolean }> => {
  if (!rawTarget || rawTarget === "-") throw new CreatorError("invalid_target", "a target directory is required");
  if (rawTarget.replaceAll("\\", "/").split("/").includes("..")) {
    throw new CreatorError("target_traversal", "target path traversal is not allowed", { path: rawTarget });
  }
  const absolute = path.resolve(process.cwd(), rawTarget);
  let entry;
  try {
    entry = await lstat(absolute);
  } catch {
    entry = undefined;
  }
  if (entry?.isSymbolicLink()) throw new CreatorError("target_symlink", "target directory must not be a symlink", { path: rawTarget });
  if (entry && !entry.isDirectory()) throw new CreatorError("target_not_directory", "target exists but is not a directory", { path: rawTarget });
  if (entry && (entry.mode & 0o222) === 0) throw new CreatorError("target_unwritable", "target directory has no write permission", { path: rawTarget });

  let parent = absolute;
  while (true) {
    try {
      const parentEntry = await lstat(parent);
      if (!parentEntry.isDirectory() || parentEntry.isSymbolicLink()) {
        throw new CreatorError("target_symlink", "target parent must not contain a symlink", { path: parent });
      }
      if ((parentEntry.mode & 0o222) === 0) throw new CreatorError("target_unwritable", "target parent has no write permission", { path: parent });
      const realParent = await realpath(parent);
      if (realParent !== path.resolve(parent)) {
        throw new CreatorError("target_symlink", "target parent resolves outside its lexical path", { path: parent });
      }
      break;
    } catch (error) {
      if (error instanceof CreatorError) throw error;
      const next = path.dirname(parent);
      if (next === parent) throw new CreatorError("invalid_target", "target parent cannot be resolved", { path: absolute });
      parent = next;
    }
  }
  return { absolute, existed: Boolean(entry) };
};

export const validatePlaceholderManifest = (value: unknown): PlaceholderManifest => {
  if (!isObject(value) || !Array.isArray(value.placeholders)) throw new CreatorError("payload_invalid", "placeholder manifest has an unsupported shape");
  const seen = new Set<string>();
  const placeholders = value.placeholders.map((raw) => {
    if (!isObject(raw) || typeof raw.key !== "string" || !raw.key || seen.has(raw.key)) {
      throw new CreatorError("payload_invalid", `placeholder manifest has an invalid or duplicate key: ${String(isObject(raw) ? raw.key : raw)}`);
    }
    seen.add(raw.key);
    if (typeof raw.prompt !== "string" || typeof raw.default !== "string" || typeof raw.required !== "boolean") {
      throw new CreatorError("payload_invalid", `placeholder ${raw.key} has an invalid schema`);
    }
    if (raw.enum !== undefined && (!Array.isArray(raw.enum) || raw.enum.some((item) => typeof item !== "string") || new Set(raw.enum).size !== raw.enum.length)) {
      throw new CreatorError("payload_invalid", `placeholder ${raw.key} has an invalid enum`);
    }
    for (const condition of [raw.condition, raw.when]) {
      const validExpected = (expected: unknown): boolean => typeof expected === "string" || (Array.isArray(expected) && expected.every((item) => typeof item === "string"));
      if (condition !== undefined && (!isObject(condition) || typeof condition.key !== "string" || (condition.equals === undefined && condition.not_equals === undefined) || (condition.equals !== undefined && !validExpected(condition.equals)) || (condition.not_equals !== undefined && !validExpected(condition.not_equals)) || (condition.equals !== undefined && condition.not_equals !== undefined))) {
        throw new CreatorError("payload_invalid", `placeholder ${raw.key} has an invalid condition`);
      }
    }
    return raw as unknown as Placeholder;
  });
  const keys = new Set(placeholders.map((placeholder) => placeholder.key));
  for (const placeholder of placeholders) {
    const condition = placeholder.condition ?? placeholder.when;
    if (condition && !keys.has(condition.key)) throw new CreatorError("payload_invalid", `placeholder ${placeholder.key} conditions on unknown key ${condition.key}`);
  }
  return { placeholders };
};

export const validateOwnershipManifest = (value: unknown): OwnershipManifest => {
  if (!isObject(value) || value.schema_version !== 1 || !isObject(value.categories) || !Array.isArray(value.text_files)) {
    throw new CreatorError("ownership_invalid", "ownership manifest has an unsupported shape");
  }
  const seen = new Set<string>();
  const categories: Record<string, OwnershipCategory> = {};
  for (const [category, raw] of Object.entries(value.categories)) {
    if (!isObject(raw) || !["removed", "inherited", "generated"].includes(String(raw.disposition)) || !Array.isArray(raw.paths) || raw.paths.length === 0) {
      throw new CreatorError("ownership_invalid", `ownership category ${category} is invalid`);
    }
    const paths = raw.paths.map((entry) => {
      if (!isObject(entry) || typeof entry.path !== "string" || !["file", "directory"].includes(String(entry.kind)) || entry.path.startsWith("/") || entry.path.split("/").includes("..") || seen.has(entry.path)) {
        throw new CreatorError("ownership_invalid", `ownership path is invalid or duplicated: ${String(isObject(entry) ? entry.path : entry)}`);
      }
      seen.add(entry.path);
      return entry as unknown as OwnershipEntry;
    });
    categories[category] = { disposition: raw.disposition as OwnershipDisposition, paths, payload: raw.payload === true };
  }
  const textFiles = value.text_files.map((entry) => {
    if (typeof entry !== "string" || !entry || entry.startsWith("/") || entry.split("/").includes("..")) throw new CreatorError("ownership_invalid", `invalid text-file inventory entry: ${String(entry)}`);
    return entry;
  });
  if (new Set(textFiles).size !== textFiles.length) throw new CreatorError("ownership_invalid", "text-file inventory contains duplicate paths");
  return { schema_version: 1, description: typeof value.description === "string" ? value.description : undefined, text_files: textFiles, categories };
};

const loadManifest = async (): Promise<{ manifest: PayloadManifest; payloadRoot: string; placeholders: PlaceholderManifest; ownership: OwnershipManifest; providerCatalog: ProviderCatalog }> => {
  const payloadRoot = path.join(__dirname, "payload");
  const manifest = await parseJson(path.join(__dirname, "payload-manifest.json"), "payload manifest") as PayloadManifest;
  if (!isObject(manifest) || !Array.isArray(manifest.files) || typeof manifest.payload_digest !== "string") {
    throw new CreatorError("payload_invalid", "payload manifest has an unsupported shape");
  }
  const files = [...manifest.files].sort((left, right) => compareStrings(left.path, right.path));
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) {
    throw new CreatorError("payload_invalid", "payload manifest files are not in stable order");
  }
  const expectedDigest = `sha256:${sha256(Buffer.from(JSON.stringify({ payload_version: manifest.payload_version, files: manifest.files })))}`;
  if (expectedDigest !== manifest.payload_digest) {
    throw new CreatorError("payload_invalid", "payload manifest digest does not match its files");
  }
  const placeholders = validatePlaceholderManifest(await parseJson(path.join(payloadRoot, "placeholders.json"), "placeholder manifest"));
  const ownership = validateOwnershipManifest(await parseJson(path.join(payloadRoot, "archetype-ownership.json"), "ownership manifest"));
  const providerCatalog = validateProviderCatalog(await parseJson(path.join(payloadRoot, "providers/agents/catalog.json"), "provider catalog"));
  return { manifest, payloadRoot, placeholders, ownership, providerCatalog };
};

const valueFromInput = (input: unknown): Record<string, unknown> => {
  if (!isObject(input)) throw new CreatorError("configuration_invalid", "configuration must be a JSON object");
  const wrapped = input.values !== undefined || input.answers !== undefined;
  if (wrapped && Object.keys(input).some((key) => key !== "values" && key !== "answers")) throw new CreatorError("configuration_invalid", "configuration contains unknown top-level keys");
  const candidate = input.values ?? input.answers ?? input;
  if (!isObject(candidate)) throw new CreatorError("configuration_invalid", "configuration values must be a JSON object");
  return candidate;
};

const validateValue = (placeholder: Placeholder, rawValue: unknown): string => {
  if (rawValue === undefined || rawValue === null) return "";
  if (!["string", "number", "boolean"].includes(typeof rawValue)) {
    throw new CreatorError("configuration_invalid", `${placeholder.key} must be a string, number, or boolean`);
  }
  const value = String(rawValue);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new CreatorError("configuration_invalid", `${placeholder.key} contains a control character`);
  }
  if (placeholder.enum && !placeholder.enum.includes(value)) {
    throw new CreatorError("configuration_invalid", `${placeholder.key} must be one of: ${placeholder.enum.join(", ")}`);
  }
  return value;
};

const conditionMatches = (condition: PlaceholderCondition | undefined, values: Record<string, string>): boolean => {
  if (!condition) return true;
  const actual = values[condition.key] ?? "";
  const matches = (expected: string | string[] | undefined): boolean => expected === undefined ? false : Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  if (condition.equals !== undefined) return matches(condition.equals);
  return !matches(condition.not_equals);
};

const resolveConfig = async (
  manifest: PlaceholderManifest,
  configPath: string | undefined,
  nonInteractive: boolean,
  prompt: ((placeholder: Placeholder) => Promise<string>) | undefined,
): Promise<CreatorConfig> => {
  let input: Record<string, unknown> = {};
  if (configPath) input = valueFromInput(await parseJson(path.resolve(process.cwd(), configPath), "configuration"));
  const knownKeys = new Set(manifest.placeholders.map((placeholder) => placeholder.key));
  const unknownKeys = Object.keys(input).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) throw new CreatorError("configuration_invalid", `configuration contains unknown keys: ${unknownKeys.sort().join(", ")}`);
  const byKey = new Map(manifest.placeholders.map((placeholder) => [placeholder.key, placeholder]));
  const values: Record<string, string> = {};
  const resolving = new Set<string>();
  const resolveKey = async (key: string): Promise<string> => {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    const placeholder = byKey.get(key);
    if (!placeholder) throw new CreatorError("configuration_invalid", `condition references unknown key: ${key}`);
    if (resolving.has(key)) throw new CreatorError("configuration_invalid", `placeholder conditions contain a cycle at ${key}`);
    resolving.add(key);
    const condition = placeholder.condition ?? placeholder.when;
    const conditionValues = { ...values };
    if (condition && !Object.prototype.hasOwnProperty.call(conditionValues, condition.key)) conditionValues[condition.key] = await resolveKey(condition.key);
    const supplied = Object.prototype.hasOwnProperty.call(input, placeholder.key);
    const raw = supplied ? input[placeholder.key] : placeholder.default;
    if (!conditionMatches(condition, conditionValues)) {
      values[placeholder.key] = "";
    } else if (!supplied && (raw === undefined || raw === null || raw === "") && placeholder.required) {
      values[placeholder.key] = !nonInteractive && prompt ? validateValue(placeholder, await prompt(placeholder)) : "";
    } else {
      values[placeholder.key] = validateValue(placeholder, raw);
    }
    resolving.delete(key);
    return values[placeholder.key];
  };
  for (const placeholder of manifest.placeholders) await resolveKey(placeholder.key);

  const missing = (): Placeholder[] => manifest.placeholders.filter((placeholder) => conditionMatches(placeholder.condition ?? placeholder.when, values) && placeholder.required && !values[placeholder.key]);
  const missingKeys = missing().map((placeholder) => placeholder.key);
  if (missingKeys.length > 0) {
    throw new CreatorError("incomplete_configuration", `required configuration is missing: ${missingKeys.join(", ")}`);
  }
  if (values.FACTORY_REQUIRED === "true" && !values.FACTORY_SPEC) {
    throw new CreatorError("incomplete_configuration", "FACTORY_SPEC is required when FACTORY_REQUIRED is true");
  }
  const trackerDisplay: Record<string, string> = { jira: "Jira", "github-issues": "GitHub Issues", "github-projects": "GitHub Projects", linear: "Linear", custom: "(custom)" };
  if (!values.TRACKER && values.TASK_TRACKER) values.TRACKER = trackerDisplay[values.TASK_TRACKER] ?? values.TASK_TRACKER;
  const ordered = Object.fromEntries(Object.keys(values).sort().map((key) => [key, values[key]]));
  return { values, digest: `sha256:${sha256(canonicalJson(ordered))}` };
};

const safeMode = (mode: string): number => {
  const parsed = Number.parseInt(mode.slice(-4), 8);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0o7777) throw new CreatorError("payload_invalid", `invalid payload mode: ${mode}`);
  return parsed;
};

interface SourceFile {
  path: string;
  bytes: Buffer;
  mode: number;
}

const ownershipEntries = (ownership: OwnershipManifest): Array<{ category: string; definition: OwnershipCategory; entry: OwnershipEntry }> =>
  Object.entries(ownership.categories).flatMap(([category, definition]) => definition.paths.map((entry) => ({ category, definition, entry })));

const pathMatchesEntry = (relativePath: string, entry: OwnershipEntry): boolean =>
  relativePath === entry.path || (entry.kind === "directory" && relativePath.startsWith(`${entry.path}/`));

const relocationDestination = (relativePath: string): string => {
  if (relativePath === "docs/bindings.md" || relativePath.startsWith(".factory/")) return relativePath;
  if (["checks", "hooks", "scripts", "templates"].some((directory) => relativePath === directory || relativePath.startsWith(`${directory}/`))) {
    return `.factory/${relativePath}`;
  }
  if (relativePath === "test_init.py" || relativePath === "test_factory_bootstrap.py") return `.factory/scripts/${relativePath}`;
  if (relativePath === "docs" || relativePath.startsWith("docs/")) return `.factory/${relativePath}`;
  return relativePath;
};

const relativeSource = (sourcePath: string, targetPath: string): string => {
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), targetPath));
  return normalized.replace(/^\.\//u, "");
};

const renderMarkdown = (
  text: string,
  sourcePath: string,
  destinationPath: string,
  destinations: Map<string, string>,
  removed: Set<string>,
): string => text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/gu, (whole, label: string, target: string) => {
  if (target.startsWith("#") || target.startsWith("/") || target.includes("://")) return whole;
  const [targetPath, anchor] = target.split("#", 2);
  if (!targetPath) return whole;
  const sourceTarget = relativeSource(sourcePath, targetPath);
  const mapped = destinations.get(sourceTarget);
  if (!mapped || removed.has(sourceTarget)) return label;
  const rebased = path.posix.relative(path.posix.dirname(destinationPath), mapped) || path.posix.basename(mapped);
  return `[${label}](${rebased}${anchor === undefined ? "" : `#${anchor}`})`;
});

const renderTextFile = (
  source: SourceFile,
  destinationPath: string,
  config: CreatorConfig,
  textFiles: Set<string>,
  destinations: Map<string, string>,
  removed: Set<string>,
): Buffer => {
  if (!textFiles.has(source.path)) return source.bytes;
  const text = source.bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(source.bytes)) return source.bytes;
  let rendered = text;
  for (const [key, value] of Object.entries(config.values)) rendered = rendered.replaceAll(`<${key}>`, () => value);
  if (destinationPath.endsWith(".md")) rendered = renderMarkdown(rendered, source.path, destinationPath, destinations, removed);
  for (const key of Object.keys(config.values)) {
    if (rendered.includes(`<${key}>`)) throw new CreatorError("unresolved_placeholder", `generated file contains unresolved placeholder: ${key}`, { path: destinationPath });
  }
  return Buffer.from(rendered, "utf8");
};

const providerManifestPath = ".factory/provider-manifest.json";

const providerCommand = (executable: string, args: string[]): string => [executable, ...args].map((part) => part.replaceAll("{workspace}", "<project-directory>")).join(" ");

const providerSummary = (catalog: ProviderCatalog, runtimes: ProviderRuntime[], manifestPath = providerManifestPath): ProviderSummary => ({
  catalog_version: catalog.catalog_version,
  selected: runtimes.map(({ provider }) => ({
    id: provider.id,
    display_name: provider.display_name,
    executable: provider.executable,
    available: true,
    capabilities: [...provider.capabilities],
    workspace_files: provider.workspace.files.map((file) => file.path),
    manual_prerequisites: [...provider.manual_prerequisites],
    next_steps: [providerCommand(provider.executable, provider.launch.args)],
  })),
  ...(runtimes.length > 0 ? { manifest_path: manifestPath } : {}),
});

const providerConfigDigest = (config: CreatorConfig, selected: string[]): CreatorConfig => ({
  values: config.values,
  digest: `sha256:${sha256(canonicalJson({ agents: selected, values: Object.fromEntries(Object.keys(config.values).sort().map((key) => [key, config.values[key]])) }))}`,
});

const composeProviderFiles = (
  catalog: ProviderCatalog,
  runtimes: ProviderRuntime[],
  sources: Map<string, SourceFile>,
  config: CreatorConfig,
  textFiles: Set<string>,
  destinations: Map<string, string>,
  removed: Set<string>,
): { files: PlannedFile[]; summary: ProviderSummary } => {
  const summary = providerSummary(catalog, runtimes);
  if (runtimes.length === 0) return { files: [], summary };
  const files: PlannedFile[] = [];
  for (const { provider } of runtimes) {
    for (const workspaceFile of provider.workspace.files) {
      const source = sources.get(workspaceFile.template);
      if (!source) throw new CreatorError("provider_invalid", `provider template is missing: ${workspaceFile.template}`, { path: workspaceFile.template });
      const bytes = renderTextFile(source, workspaceFile.path, config, textFiles, destinations, removed);
      files.push({ relativePath: workspaceFile.path, bytes, mode: 0o644, sha256: sha256(bytes), size: bytes.byteLength });
    }
  }
  const manifest = {
    schema_version: 1,
    catalog_version: catalog.catalog_version,
    providers: summary.selected.map(({ id, display_name, executable, capabilities, workspace_files, manual_prerequisites, next_steps }) => ({
      id,
      display_name,
      executable,
      capabilities,
      workspace_files,
      manual_prerequisites,
      next_steps,
    })),
    handoff: { enabled_by_default: false, opt_in_flag: "--launch-agent" },
  };
  const bytes = canonicalJson(manifest);
  files.push({ relativePath: providerManifestPath, bytes, mode: 0o644, sha256: sha256(bytes), size: bytes.byteLength });
  return { files, summary };
};

const bindingHeader = `# Bindings - mandatory project providers

These bindings are mandatory for every agent, regardless of harness.
The shape of each instance is defined by:
- [task provider contract](../providers/task/_contract.md)
- [secrets provider contract](../providers/secrets/_contract.md)
- [code-intelligence provider contract](../providers/code-intel/_contract.md) when selected
- [CI recipe contract](../ci/_contract.md)
The harness provides access and the binding provides the rules.

## Protected \`status:approved\` gate
The bound task provider may support delegated approval only through its fail-closed protocol: a current direct human instruction must name the exact issue and add status:approved; target-host evidence must bind that principal to maintainer/authorized-approver authority; the authenticated actor must have MAINTAIN or ADMIN; and exactly one scoped add attempt must be followed by target-host readback. Any mismatch, stale/ambiguous/missing instruction, insufficient permission, failed/unknown mutation, or readback mismatch stops the operation. Without that evidence, the human applies the label directly. This contract change does not approve existing work.
`;

const providerFragment = (sources: Map<string, SourceFile>, capability: string, name: string): SourceFile => {
  const selected = `providers/${capability}/${name}.md`;
  const fallback = `providers/${capability}/custom.md`;
  const source = sources.get(selected) ?? (name !== "_contract" ? sources.get(fallback) : undefined);
  if (!source) throw new CreatorError("provider_invalid", `no provider fragment exists for ${capability}/${name}`);
  return source;
};

const parseStacks = (value: string): string[] => {
  if (!value.trim()) return [];
  const stacks = value.split(",").map((stack) => stack.trim().toLowerCase());
  if (stacks.some((stack) => !stack)) throw new CreatorError("ci_invalid", "CI_STACKS contains an empty selection");
  if (new Set(stacks).size !== stacks.length) throw new CreatorError("ci_invalid", `CI_STACKS contains a duplicate selection: ${stacks.find((stack, index) => stacks.indexOf(stack) !== index)}`);
  return stacks;
};

const composeBindings = (
  sources: Map<string, SourceFile>,
  config: CreatorConfig,
  destinations: Map<string, string>,
  removed: Set<string>,
): Buffer => {
  const task = config.values.TASK_TRACKER;
  const secrets = config.values.SECRETS_PROVIDER || "none";
  const codeIntel = config.values.CODE_INTELLIGENCE || "none";
  if (!task) throw new CreatorError("configuration_invalid", "TASK_TRACKER is required for binding composition");
  const parts = [renderMarkdown(bindingHeader, "docs/bindings.md", "docs/bindings.md", destinations, removed).trimEnd()];
  for (const [capability, name] of [["task", task], ["secrets", secrets]] as const) {
    const source = providerFragment(sources, capability, name);
    parts.push(renderTextFile(source, "docs/bindings.md", config, new Set([source.path]), destinations, removed).toString("utf8").trimEnd());
  }
  if (codeIntel !== "none") {
    const source = providerFragment(sources, "code-intel", codeIntel);
    parts.push(renderTextFile(source, "docs/bindings.md", config, new Set([source.path]), destinations, removed).toString("utf8").trimEnd());
  }
  return Buffer.from(`${parts.join("\n\n")}\n`, "utf8");
};

const composeCi = (sources: Map<string, SourceFile>, config: CreatorConfig): Buffer | undefined => {
  const system = config.values.CI_SYSTEM || "";
  const stacks = parseStacks(config.values.CI_STACKS || "");
  if (!system.toLowerCase().includes("github") || stacks.length === 0) return undefined;
  const recipes = sources.get("ci/recipes.json");
  if (!recipes) throw new CreatorError("ci_invalid", "CI recipe catalog is missing");
  let catalog: Record<string, string>;
  try { catalog = JSON.parse(recipes.bytes.toString("utf8")) as Record<string, string>; } catch (error) { throw new CreatorError("ci_invalid", `CI recipe catalog is invalid: ${(error as Error).message}`); }
  const unknown = stacks.filter((stack) => !Object.prototype.hasOwnProperty.call(catalog, stack));
  if (unknown.length > 0) throw new CreatorError("ci_invalid", `CI_STACKS contains unknown selection(s): ${unknown.join(", ")}`);
  return Buffer.from(`name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n${stacks.map((stack) => catalog[stack]).join("\n")}\n`, "utf8");
};

const readPayloadFiles = async (
  manifest: PayloadManifest,
  payloadRoot: string,
  config: CreatorConfig,
  ownership: OwnershipManifest,
  providerCatalog: ProviderCatalog,
  providerRuntimes: ProviderRuntime[],
): Promise<{ files: PlannedFile[]; sourceFiles: Map<string, SourceFile>; removedSourcePaths: Set<string>; providerSummary: ProviderSummary }> => {
  if (manifest.files.length > MAX_STATE_FILES) throw new CreatorError("payload_invalid", "payload contains too many files");
  const sourceFiles = new Map<string, SourceFile>();
  for (const entry of manifest.files) {
    assertSafeRelative(entry.path);
    const source = path.join(payloadRoot, entry.path);
    const sourceStat = await lstat(source).catch(() => undefined);
    if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) throw new CreatorError("payload_invalid", `payload file is not a regular file: ${entry.path}`, { path: entry.path });
    const sourceBytes = await readFile(source);
    const sourceMode = sourceStat.mode & 0o7777;
    if (sourceBytes.byteLength !== entry.size || sha256(sourceBytes) !== entry.sha256 || sourceMode !== safeMode(entry.mode)) {
      throw new CreatorError("payload_mismatch", `packaged payload bytes or mode differ from the manifest: ${entry.path}`, { path: entry.path });
    }
    sourceFiles.set(entry.path, { path: entry.path, bytes: sourceBytes, mode: safeMode(entry.mode) });
  }
  const textFiles = new Set(ownership.text_files);
  const removedSourcePaths = new Set<string>();
  const removedEntries = ownershipEntries(ownership).filter(({ definition }) => definition.disposition === "removed");
  for (const sourcePath of sourceFiles.keys()) {
    if (removedEntries.some(({ entry }) => pathMatchesEntry(sourcePath, entry))) removedSourcePaths.add(sourcePath);
  }
  const destinations = new Map<string, string>();
  const retainedEntries = ownershipEntries(ownership).filter(({ definition }) => definition.disposition === "inherited");
  for (const source of sourceFiles.values()) {
    const retained = retainedEntries.some(({ entry }) => pathMatchesEntry(source.path, entry));
    if (retained) destinations.set(source.path, relocationDestination(source.path));
  }
  const workflow = composeCi(sourceFiles, config);
  destinations.set("docs/bindings.md", "docs/bindings.md");
  if (workflow) destinations.set(".github/workflows/ci.yml", ".github/workflows/ci.yml");
  if (config.values.OPENCODE_PLUGIN === "true") destinations.set(".opencode/plugins/factory-start.ts", ".opencode/plugins/factory-start.ts");
  const files: PlannedFile[] = [];
  for (const source of sourceFiles.values()) {
    if (!destinations.has(source.path)) continue;
    const destinationPath = destinations.get(source.path)!;
    const bytes = renderTextFile(source, destinationPath, config, textFiles, destinations, removedSourcePaths);
    files.push({ relativePath: destinationPath, bytes, mode: source.mode, sha256: sha256(bytes), size: bytes.byteLength });
  }
  const generatedPaths = new Set(ownershipEntries(ownership).filter(({ definition }) => definition.disposition === "generated").map(({ entry }) => entry.path));
  if (generatedPaths.has("docs/bindings.md")) {
    const bytes = composeBindings(sourceFiles, config, destinations, removedSourcePaths);
    files.push({ relativePath: "docs/bindings.md", bytes, mode: 0o644, sha256: sha256(bytes), size: bytes.byteLength });
  }
  if (workflow && generatedPaths.has(".github/workflows/ci.yml")) files.push({ relativePath: ".github/workflows/ci.yml", bytes: workflow, mode: 0o644, sha256: sha256(workflow), size: workflow.byteLength });
  if (config.values.OPENCODE_PLUGIN === "true" && generatedPaths.has(".opencode/plugins/factory-start.ts")) {
    const source = sourceFiles.get("hooks/opencode/factory-start.ts");
    if (!source) throw new CreatorError("composition_invalid", "OpenCode plugin source is missing");
    const bytes = renderTextFile(source, ".opencode/plugins/factory-start.ts", config, textFiles, destinations, removedSourcePaths);
    files.push({ relativePath: ".opencode/plugins/factory-start.ts", bytes, mode: source.mode, sha256: sha256(bytes), size: bytes.byteLength });
  }
  const composedProviders = composeProviderFiles(
    providerCatalog,
    providerRuntimes,
    sourceFiles,
    config,
    textFiles,
    destinations,
    removedSourcePaths,
  );
  files.push(...composedProviders.files);
  for (const sourcePath of sourceFiles.keys()) {
    if (!removedSourcePaths.has(sourcePath) && !destinations.has(sourcePath)) throw new CreatorError("ownership_invalid", `payload file is not classified by ownership: ${sourcePath}`, { path: sourcePath });
  }
  if (files.length > MAX_STATE_FILES) throw new CreatorError("payload_invalid", "composed payload contains too many files");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_STATE_BYTES) throw new CreatorError("payload_invalid", "payload exceeds the bounded creator state limit");
  return { files, sourceFiles, removedSourcePaths, providerSummary: composedProviders.summary };
};

const readState = async (target: string): Promise<CreatorState | undefined> => {
  const statePath = path.join(target, STATE_FILE);
  try {
    const raw = await readFile(statePath, "utf8");
    let value: CreatorState;
    try {
      value = JSON.parse(raw) as CreatorState;
    } catch (error) {
      throw new CreatorError("state_invalid", `creator state is not valid JSON: ${(error as Error).message}`, { path: STATE_FILE });
    }
    if (!isObject(value) || value.schema_version !== CREATOR_SCHEMA_VERSION || !Array.isArray(value.owned_files)) {
      throw new CreatorError("state_invalid", "creator state has an unsupported shape", { path: STATE_FILE });
    }
    if (value.owned_files.length > MAX_STATE_FILES) throw new CreatorError("state_invalid", "creator state lists too many files", { path: STATE_FILE });
    return value;
  } catch (error) {
    if (error instanceof CreatorError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
};

const creatorDirectoryStatus = async (target: string): Promise<{ safe: boolean; diagnostic?: Diagnostic }> => {
  const creatorPath = path.join(target, CREATOR_DIRECTORY);
  const entry = await lstat(creatorPath).catch(() => undefined);
  if (!entry) return { safe: true };
  if (entry.isSymbolicLink()) {
    return { safe: false, diagnostic: diagnostic("symlink_escape", "creator state directory must not be a symlink", CREATOR_DIRECTORY) };
  }
  if (!entry.isDirectory()) {
    return { safe: false, diagnostic: diagnostic("path_conflict", "creator state path must be a directory", CREATOR_DIRECTORY) };
  }
  return { safe: true };
};

const collectEntries = async (directory: string, relative = ""): Promise<Array<{ path: string; directory: boolean; symlink: boolean }>> => {
  const result: Array<{ path: string; directory: boolean; symlink: boolean }> = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => compareStrings(left.name, right.name))) {
    const entryPath = normalizePath(path.posix.join(relative, entry.name));
    if (entry.isSymbolicLink()) result.push({ path: entryPath, directory: false, symlink: true });
    else if (entry.isDirectory()) {
      result.push({ path: entryPath, directory: true, symlink: false });
      result.push(...await collectEntries(path.join(directory, entry.name), entryPath));
    } else result.push({ path: entryPath, directory: false, symlink: false });
  }
  return result;
};

const parentPaths = (relativePath: string): Set<string> => {
  const result = new Set<string>();
  let current = path.posix.dirname(relativePath);
  while (current && current !== ".") {
    result.add(current);
    current = path.posix.dirname(current);
  }
  return result;
};

const fileOperation = (file: PlannedFile, action: OperationAction, reason: string): Operation => ({
  path: file.relativePath,
  action,
  mode: file.mode.toString(8).padStart(4, "0"),
  size: file.size,
  sha256: file.sha256,
  reason,
});

const stateBytesFor = (manifest: PayloadManifest, config: CreatorConfig, files: PlannedFile[]): Buffer => canonicalJson({
  schema_version: CREATOR_SCHEMA_VERSION,
  payload_version: manifest.payload_version,
  payload_digest: manifest.payload_digest,
  config_digest: config.digest,
  owned_files: files.map((file) => ({
    path: file.relativePath,
    mode: file.mode.toString(8).padStart(4, "0"),
    size: file.size,
    sha256: file.sha256,
  })),
});

const expectedStateFile = (stateBytes: Buffer): PlannedFile => ({
  relativePath: STATE_FILE,
  bytes: stateBytes,
  mode: 0o600,
  sha256: sha256(stateBytes),
  size: stateBytes.byteLength,
});

const baseEnvelope = (command: Command, target: string, manifest: PayloadManifest): CreatorEnvelope => ({
  schema_version: CREATOR_SCHEMA_VERSION,
  command,
  status: "planned",
  target,
  payload: { version: manifest.payload_version, digest: manifest.payload_digest },
  operations: [],
  diagnostics: [],
});

const addPathDiagnostics = async (target: string, relativePath: string, diagnostics: Diagnostic[]): Promise<void> => {
  const segments = relativePath.split("/");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    const entry = await lstat(current).catch(() => undefined);
    if (entry?.isSymbolicLink()) diagnostics.push(diagnostic("symlink_escape", "payload parent is a symlink", relativePath));
    else if (entry && !entry.isDirectory()) diagnostics.push(diagnostic("path_conflict", "payload parent is not a directory", relativePath));
  }
};

export const preparePlan = async (options: CreatorOptions): Promise<PreparedPlan> => {
  const { manifest, payloadRoot, placeholders, ownership, providerCatalog } = await loadManifest();
  const target = await resolveTarget(options.target);
  const envelope = baseEnvelope(options.command, target.absolute, manifest);
  const diagnostics: Diagnostic[] = [];
  const creatorDirectory = await creatorDirectoryStatus(target.absolute);
  if (creatorDirectory.diagnostic) diagnostics.push(creatorDirectory.diagnostic);
  const targetEntries = target.existed ? await collectEntries(target.absolute) : [];
  if (targetEntries.some((entry) => entry.path === STAGING_DIRECTORY || entry.path.startsWith(`${STAGING_DIRECTORY}/`))) {
    diagnostics.push(diagnostic("staging_interrupted", "an interrupted staging directory requires recovery", STAGING_DIRECTORY));
  }
  const state = target.existed && creatorDirectory.safe ? await readState(target.absolute) : undefined;
  if (state && (state.payload_version !== manifest.payload_version || state.payload_digest !== manifest.payload_digest)) {
    diagnostics.push(diagnostic("payload_mismatch", "creator state does not match the packaged payload"));
  }

  let config: CreatorConfig | undefined = options.resolvedConfig;
  if (!config) {
    try {
      config = await resolveConfig(placeholders, options.configPath, options.nonInteractive ?? false, options.prompt);
    } catch (error) {
      if (error instanceof CreatorError) diagnostics.push(diagnostic(error.code, error.message, error.path));
      else throw error;
    }
  }
  envelope.config_digest = config?.digest;

  if (!config) {
    envelope.status = "error";
    envelope.diagnostics = sortDiagnostics(diagnostics);
    return { envelope, target: target.absolute, targetExisted: target.existed, files: [], failAfter: options.failAfter, interruptAfter: options.interruptAfter, providerRuntimes: [] };
  }

  let providerRuntimes: ProviderRuntime[] = [];
  let selectedProviders: string[] = [];
  try {
    let rawSelection: string | undefined = options.agent;
    if (options.agent === undefined && options.agents === undefined && !options.nonInteractive && options.prompt) {
      try {
        rawSelection = await options.prompt({ key: "AGENTS", prompt: "Agent providers (comma-separated, or none)", default: "none", required: false });
      } catch {
        rawSelection = "none";
      }
    }
    selectedProviders = parseProviderSelection(rawSelection, options.agents, providerCatalog);
    if (options.launchAgent && selectedProviders.length !== 1) throw new Error("--launch-agent requires exactly one selected agent provider");
    providerRuntimes = await inspectProviderAvailability(providerCatalog, selectedProviders);
    config = providerConfigDigest(config, selectedProviders);
    envelope.providers = providerSummary(providerCatalog, providerRuntimes);
    envelope.config_digest = config.digest;
  } catch (error) {
    const providerError = error instanceof Error ? error : new Error(String(error));
    diagnostics.push(diagnostic((error as { code?: string }).code ?? "provider_invalid", providerError.message));
    envelope.status = "error";
    envelope.diagnostics = sortDiagnostics(diagnostics);
    return { envelope, target: target.absolute, targetExisted: target.existed, files: [], config, state, failAfter: options.failAfter, interruptAfter: options.interruptAfter, providerRuntimes: [] };
  }

  let composed: { files: PlannedFile[]; sourceFiles: Map<string, SourceFile>; removedSourcePaths: Set<string>; providerSummary: ProviderSummary };
  try {
    composed = await readPayloadFiles(manifest, payloadRoot, config, ownership, providerCatalog, providerRuntimes);
  } catch (error) {
    if (!(error instanceof CreatorError)) throw error;
    envelope.status = "error";
    envelope.diagnostics = sortDiagnostics([...diagnostics, diagnostic(error.code, error.message, error.path)]);
    return { envelope, target: target.absolute, targetExisted: target.existed, files: [], config, state, failAfter: options.failAfter, interruptAfter: options.interruptAfter, providerRuntimes };
  }
  const files = composed.files;
  envelope.providers = composed.providerSummary;
  const oldOwned = new Map((state?.owned_files ?? []).map((file) => [file.path, file]));
  const desiredPaths = new Set(files.map((file) => file.relativePath));
  const removablePaths = new Set(composed.removedSourcePaths);
  const knownStatePaths = new Set([CREATOR_DIRECTORY, STATE_FILE, STAGING_DIRECTORY]);
  const allowedDirectories = new Set<string>([
    CREATOR_DIRECTORY,
    ...files.flatMap((file) => [...parentPaths(file.relativePath)]),
    ...[...removablePaths].flatMap((file) => [...parentPaths(file)]),
  ]);
  for (const entry of targetEntries) {
    if (knownStatePaths.has(entry.path) || entry.path.startsWith(`${STAGING_DIRECTORY}/`)) continue;
    if (entry.directory && allowedDirectories.has(entry.path)) continue;
    if (desiredPaths.has(entry.path) || oldOwned.has(entry.path) || removablePaths.has(entry.path)) continue;
    diagnostics.push(diagnostic("unknown_file_conflict", "target contains a file or directory not owned by the creator", entry.path));
  }
  if (!state && targetEntries.some((entry) => entry.path !== CREATOR_DIRECTORY && !entry.path.startsWith(`${CREATOR_DIRECTORY}/`) && !removablePaths.has(entry.path))) {
    diagnostics.push(diagnostic("unknown_file_conflict", "a non-empty target has no creator ownership state"));
  }
  const operations: Operation[] = [];
  for (const file of files) {
    await addPathDiagnostics(target.absolute, file.relativePath, diagnostics);
    const destination = path.join(target.absolute, file.relativePath);
    const existing = await lstat(destination).catch(() => undefined);
    const owned = oldOwned.get(file.relativePath);
    if (existing?.isSymbolicLink()) {
      operations.push(fileOperation(file, "conflict", "symlink"));
      diagnostics.push(diagnostic("owned_file_drift", "owned payload path is a symlink", file.relativePath));
      continue;
    }
    if (existing && !existing.isFile()) {
      operations.push(fileOperation(file, "conflict", "path-conflict"));
      diagnostics.push(diagnostic("owned_file_drift", "owned payload path is not a regular file", file.relativePath));
      continue;
    }
    if (!existing) {
      operations.push(fileOperation(file, "create", "missing"));
      continue;
    }
    const existingBytes = await readFile(destination);
    const same = sha256(existingBytes) === file.sha256 && (existing.mode & 0o7777) === file.mode;
    if (same) operations.push(fileOperation(file, "noop", "unchanged"));
    else if (owned && state?.config_digest !== config.digest && owned.sha256 === sha256(existingBytes)) {
      operations.push(fileOperation(file, "update", "configuration-changed"));
    } else {
      operations.push(fileOperation(file, "conflict", "owned-file-drift"));
      diagnostics.push(diagnostic("owned_file_drift", "owned file bytes or mode differ from the planned output", file.relativePath));
    }
  }

  const removalOperation = async (relativePath: string, reason: string, expectedSha?: string): Promise<void> => {
    if (desiredPaths.has(relativePath)) return;
    const destination = path.join(target.absolute, relativePath);
    const existing = await lstat(destination).catch(() => undefined);
    if (!existing) return;
    if (existing.isSymbolicLink() || !existing.isFile()) {
      operations.push({ path: relativePath, action: "conflict", mode: "0000", size: 0, sha256: "", reason: "path-conflict" });
      diagnostics.push(diagnostic("removed_file_drift", "owned cleanup path is not a regular file", relativePath));
      return;
    }
    const bytes = await readFile(destination);
    const digest = sha256(bytes);
    if (expectedSha && digest !== expectedSha) {
      operations.push({ path: relativePath, action: "conflict", mode: (existing.mode & 0o7777).toString(8).padStart(4, "0"), size: bytes.byteLength, sha256: digest, reason: "removed-file-drift" });
      diagnostics.push(diagnostic("removed_file_drift", "cleanup refused to remove a changed application file", relativePath));
      return;
    }
    operations.push({ path: relativePath, action: "remove", mode: (existing.mode & 0o7777).toString(8).padStart(4, "0"), size: bytes.byteLength, sha256: digest, reason });
  };
  for (const [relativePath, owned] of oldOwned) await removalOperation(relativePath, "no-longer-owned", owned.sha256);
  for (const relativePath of composed.removedSourcePaths) {
    const source = composed.sourceFiles.get(relativePath);
    await removalOperation(relativePath, "ownership-removed", source ? sha256(source.bytes) : undefined);
  }

  const stateBytes = stateBytesFor(manifest, config, files);
  const stateFile = expectedStateFile(stateBytes);
  const existingState = await lstat(path.join(target.absolute, STATE_FILE)).catch(() => undefined);
  const stateSame = existingState?.isFile() && sha256(await readFile(path.join(target.absolute, STATE_FILE))) === stateFile.sha256;
  operations.push(fileOperation(stateFile, stateSame ? "noop" : (existingState ? "update" : "create"), stateSame ? "unchanged" : "state"));

  const sortedOperations = sortOperations(operations);
  const hasConflict = diagnostics.some((item) => ["unknown_file_conflict", "staging_interrupted", "payload_mismatch", "symlink_escape", "path_conflict", "owned_file_drift", "removed_file_drift"].includes(item.code)) || sortedOperations.some((operation) => operation.action === "conflict");
  envelope.operations = sortedOperations;
  envelope.diagnostics = sortDiagnostics(diagnostics);
  envelope.status = hasConflict ? "conflict" : sortedOperations.every((operation) => operation.action === "noop") ? "noop" : options.command === "dry-run" ? "dry-run" : "planned";
  return { envelope, target: target.absolute, targetExisted: target.existed, files: [...files, stateFile], stateBytes, config, state, failAfter: options.failAfter, interruptAfter: options.interruptAfter, providerRuntimes };
};

const pathFor = (target: string, relativePath: string): string => path.join(target, relativePath);

const removeEmptyParents = async (target: string, relativePath: string): Promise<void> => {
  let current = path.dirname(pathFor(target, relativePath));
  const stop = path.resolve(target);
  while (current !== stop && current.startsWith(`${stop}${path.sep}`)) {
    try {
      await rm(current, { recursive: false });
    } catch {
      break;
    }
    current = path.dirname(current);
  }
};

export const applyPlan = async (prepared: PreparedPlan): Promise<CreatorEnvelope> => {
  if (prepared.envelope.status === "conflict" || prepared.envelope.status === "error") {
    throw new CreatorError("plan_rejected", "apply refused a plan containing conflicts or errors", { plan: prepared });
  }
  if (prepared.envelope.status === "noop") return { ...prepared.envelope, command: "apply", status: "noop" };
  const stagingPath = pathFor(prepared.target, STAGING_DIRECTORY);
  const backupPath = path.join(stagingPath, "backup");
  const changed = prepared.envelope.operations.filter((operation) => operation.action === "create" || operation.action === "update" || operation.action === "remove");
  const existedBefore = new Map<string, boolean>();
  let committed = 0;
  try {
    await mkdir(prepared.target, { recursive: true });
    const creatorDirectory = await creatorDirectoryStatus(prepared.target);
    if (!creatorDirectory.safe) {
      throw new CreatorError(creatorDirectory.diagnostic?.code ?? "path_conflict", creatorDirectory.diagnostic?.message ?? "creator state path is unsafe", { plan: prepared, path: CREATOR_DIRECTORY });
    }
    await mkdir(path.dirname(stagingPath), { recursive: true });
    await mkdir(stagingPath);
    await mkdir(backupPath);
    for (const file of prepared.files) {
      const staged = pathFor(stagingPath, file.relativePath);
      await mkdir(path.dirname(staged), { recursive: true });
      await writeFile(staged, file.bytes, { mode: file.mode });
      await chmod(staged, file.mode);
      const stagedStat = await stat(staged);
      if (stagedStat.size !== file.size || sha256(await readFile(staged)) !== file.sha256 || (stagedStat.mode & 0o7777) !== file.mode) {
        throw new CreatorError("staging_verification_failed", `staged bytes or mode differ for ${file.relativePath}`, { path: file.relativePath });
      }
    }
    if (prepared.interruptAfter) {
      throw new CreatorError("staging_interrupted", "injected interruption left staging for doctor recovery", { plan: prepared, preserveStaging: true });
    }
    for (const operation of changed) {
      const destination = pathFor(prepared.target, operation.path);
      const backup = pathFor(backupPath, operation.path);
      const current = await lstat(destination).catch(() => undefined);
      existedBefore.set(operation.path, Boolean(current));
      if (current) {
        await mkdir(path.dirname(backup), { recursive: true });
        if (!current.isFile()) throw new CreatorError("path_conflict", `cannot transactionally back up non-file: ${operation.path}`, { path: operation.path });
        await copyFile(destination, backup);
        await chmod(backup, current.mode & 0o7777);
      }
      if (operation.action === "remove") {
        await unlink(destination);
        await removeEmptyParents(prepared.target, operation.path);
      } else {
        const staged = pathFor(stagingPath, operation.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await rename(staged, destination);
      }
      committed += 1;
      if (prepared.failAfter && committed >= prepared.failAfter) {
        throw new CreatorError("injected_failure", `injected failure after ${committed} committed operation(s)`, { plan: prepared });
      }
    }
    await rm(stagingPath, { recursive: true, force: true });
    return { ...prepared.envelope, command: "apply", status: changed.length === 0 ? "noop" : "applied" };
  } catch (error) {
    if (error instanceof CreatorError && error.preserveStaging) throw error;
    let restored = true;
    for (const operation of changed.slice(0, committed).reverse()) {
      const destination = pathFor(prepared.target, operation.path);
      const backup = pathFor(backupPath, operation.path);
      try {
        if (existedBefore.get(operation.path)) {
          await rm(destination, { force: true });
          await rename(backup, destination);
        } else {
          await rm(destination, { force: true });
          await removeEmptyParents(prepared.target, operation.path);
        }
      } catch {
        restored = false;
      }
    }
    try {
      await rm(stagingPath, { recursive: true, force: true });
      if (!prepared.targetExisted) await rm(prepared.target, { recursive: true, force: true });
    } catch {
      restored = false;
    }
    const wrapped = error instanceof CreatorError ? error : new CreatorError("apply_failed", (error as Error).message);
    throw new CreatorError(wrapped.code, wrapped.message, { plan: prepared, preserveStaging: !restored });
  }
};

export const doctor = async (prepared: PreparedPlan): Promise<CreatorEnvelope> => {
  const diagnostics = [...prepared.envelope.diagnostics];
  if (prepared.envelope.config_digest === undefined) diagnostics.push(diagnostic("incomplete_configuration", "doctor could not validate the target without complete configuration"));
  return {
    ...prepared.envelope,
    command: "doctor",
    status: diagnostics.length > 0 ? "unhealthy" : "healthy",
    diagnostics: sortDiagnostics(diagnostics),
  };
};

export const verify = async (prepared: PreparedPlan): Promise<CreatorEnvelope> => {
  const missing = prepared.envelope.operations.some((operation) => operation.action === "create" || operation.action === "update");
  const conflict = prepared.envelope.status === "conflict" || prepared.envelope.status === "error";
  return {
    ...prepared.envelope,
    command: "verify",
    status: conflict ? "failed" : missing ? "not-created" : "verified",
  };
};

export const launchSelectedAgent = async (prepared: PreparedPlan): Promise<HandoffResult> => {
  if (prepared.providerRuntimes.length !== 1) throw new CreatorError("handoff_invalid", "agent handoff requires exactly one selected provider", { plan: prepared });
  const runtime = prepared.providerRuntimes[0];
  try {
    const result = await launchProvider(runtime, prepared.target);
    return {
      status: result.code === 0 ? "launched" : "failed",
      provider: runtime.provider.id,
      argv: result.argv,
      exit_code: result.code,
      signal: result.signal,
      message: result.code === 0 ? "agent exited successfully" : "agent exited unsuccessfully; repository readiness is reported separately",
    };
  } catch (error) {
    return {
      status: "failed",
      provider: runtime.provider.id,
      argv: [runtime.executable_path, ...runtime.provider.launch.args.map((arg) => arg.replaceAll("{workspace}", prepared.target))],
      exit_code: 1,
      signal: null,
      message: `agent could not be launched: ${(error as Error).message}`,
    };
  }
};

export const envelopeJson = (envelope: CreatorEnvelope): string => `${JSON.stringify({
  schema_version: envelope.schema_version,
  command: envelope.command,
  status: envelope.status,
  target: envelope.target,
  payload: envelope.payload,
  ...(envelope.config_digest ? { config_digest: envelope.config_digest } : {}),
  ...(envelope.providers ? { providers: envelope.providers } : {}),
  operations: sortOperations(envelope.operations),
  diagnostics: sortDiagnostics(envelope.diagnostics),
  ...(envelope.verification ? { verification: envelope.verification } : {}),
  ...(envelope.handoff ? { handoff: envelope.handoff } : {}),
  ...(envelope.rollback ? { rollback: envelope.rollback } : {}),
}, null, 2)}\n`;

export const errorEnvelope = (command: Command, target: string, error: CreatorError): CreatorEnvelope => {
  const envelope = error.plan?.envelope ?? {
    schema_version: CREATOR_SCHEMA_VERSION,
    command,
    status: "error",
    target,
    payload: { version: "unknown", digest: "unknown" },
    operations: [],
    diagnostics: [],
  };
  return {
    ...envelope,
    command,
    status: "error",
    diagnostics: sortDiagnostics([...envelope.diagnostics, diagnostic(error.code, error.message, error.path)]),
    rollback: error.plan ? { attempted: true, restored: !error.preserveStaging, message: error.preserveStaging ? "staging was preserved for doctor recovery" : "creator-owned changes were rolled back" } : undefined,
  };
};

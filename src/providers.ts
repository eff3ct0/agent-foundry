import { access, constants } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const PROVIDER_CATALOG_VERSION = "1.0.0";

export interface ProviderWorkspaceFile {
  path: string;
  template: string;
}

export interface ProviderCatalogEntry {
  id: string;
  display_name: string;
  executable: string;
  capabilities: string[];
  workspace: { files: ProviderWorkspaceFile[] };
  launch: { args: string[] };
  manual_prerequisites: string[];
  missing_executable_hint: string;
}

export interface ProviderCatalog {
  schema_version: number;
  catalog_version: string;
  providers: ProviderCatalogEntry[];
}

export interface ProviderRuntime {
  provider: ProviderCatalogEntry;
  executable_path: string;
}

export class ProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeRelative = (value: string): boolean => {
  const normalized = value.replaceAll("\\", "/");
  return Boolean(normalized) && !normalized.startsWith("/") && !normalized.split("/").includes("..") && !normalized.includes("\0");
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new ProviderError("provider_invalid", `${label} must be a non-empty string`);
  return value;
};

export const validateProviderCatalog = (value: unknown): ProviderCatalog => {
  if (!isObject(value) || value.schema_version !== 1 || value.catalog_version !== PROVIDER_CATALOG_VERSION || !Array.isArray(value.providers) || value.providers.length !== 4) {
    throw new ProviderError("provider_invalid", "provider catalog has an unsupported schema or version");
  }
  const ids = new Set<string>();
  const requiredIds = new Set(["claude-code", "opencode", "codex", "pi"]);
  const providers = value.providers.map((raw, index) => {
    if (!isObject(raw)) throw new ProviderError("provider_invalid", `provider catalog entry ${index + 1} is invalid`);
    const id = requireString(raw.id, `provider catalog entry ${index + 1} id`);
    if (ids.has(id)) throw new ProviderError("provider_invalid", `provider catalog contains duplicate provider: ${id}`);
    ids.add(id);
    if (!requiredIds.has(id)) throw new ProviderError("provider_invalid", `provider catalog contains unsupported provider: ${id}`);
    const displayName = requireString(raw.display_name, `${id} display_name`);
    const executable = requireString(raw.executable, `${id} executable`);
    if (!Array.isArray(raw.capabilities) || raw.capabilities.length === 0 || raw.capabilities.some((item) => typeof item !== "string" || !item)) {
      throw new ProviderError("provider_invalid", `${id} capabilities are invalid`);
    }
    if (!isObject(raw.workspace) || !Array.isArray(raw.workspace.files) || raw.workspace.files.length === 0) {
      throw new ProviderError("provider_invalid", `${id} workspace configuration is invalid`);
    }
    const filePaths = new Set<string>();
    const files = raw.workspace.files.map((file, fileIndex) => {
      if (!isObject(file)) throw new ProviderError("provider_invalid", `${id} workspace file ${fileIndex + 1} is invalid`);
      const filePath = requireString(file.path, `${id} workspace file path`);
      const template = requireString(file.template, `${id} workspace file template`);
      if (!isSafeRelative(filePath) || filePath.endsWith("/")) throw new ProviderError("provider_invalid", `${id} workspace file path is unsafe: ${filePath}`);
      if (filePaths.has(filePath)) throw new ProviderError("provider_invalid", `${id} workspace file path is duplicated: ${filePath}`);
      filePaths.add(filePath);
      return { path: filePath, template };
    });
    if (!isObject(raw.launch) || !Array.isArray(raw.launch.args) || raw.launch.args.some((arg) => typeof arg !== "string" || !arg)) {
      throw new ProviderError("provider_invalid", `${id} launch arguments are invalid`);
    }
    const manualPrerequisites = raw.manual_prerequisites;
    if (!Array.isArray(manualPrerequisites) || manualPrerequisites.some((item) => typeof item !== "string" || !item)) {
      throw new ProviderError("provider_invalid", `${id} manual prerequisites are invalid`);
    }
    const missingHint = requireString(raw.missing_executable_hint, `${id} missing_executable_hint`);
    return {
      id,
      display_name: displayName,
      executable,
      capabilities: [...raw.capabilities] as string[],
      workspace: { files },
      launch: { args: [...raw.launch.args] as string[] },
      manual_prerequisites: [...manualPrerequisites] as string[],
      missing_executable_hint: missingHint,
    };
  });
  if (ids.size !== requiredIds.size || [...requiredIds].some((id) => !ids.has(id))) throw new ProviderError("provider_invalid", "provider catalog must contain claude-code, opencode, codex, and pi");
  return { schema_version: 1, catalog_version: value.catalog_version, providers };
};

const splitSelections = (values: string[]): string[] => values.flatMap((value) => value.split(",").map((item) => item.trim()).filter(Boolean));

export const parseProviderSelection = (agent: string | undefined, agents: string[] | undefined, catalog: ProviderCatalog): string[] => {
  if (agent !== undefined && agents !== undefined) throw new ProviderError("provider_invalid", "use --agent or --agents, not both");
  const raw = agents ?? (agent === undefined ? [] : [agent]);
  const selections = splitSelections(raw);
  if (selections.length === 0) return [];
  if (selections.includes("none")) {
    if (selections.length !== 1) throw new ProviderError("provider_invalid", "none cannot be combined with an agent provider");
    return [];
  }
  const known = new Set(catalog.providers.map((provider) => provider.id));
  const unknown = selections.filter((selection) => !known.has(selection));
  if (unknown.length > 0) throw new ProviderError("provider_invalid", `unknown agent provider(s): ${[...new Set(unknown)].join(", ")}`);
  if (new Set(selections).size !== selections.length) throw new ProviderError("provider_invalid", "agent provider selection contains duplicates");
  const selected = new Set(selections);
  return catalog.providers.filter((provider) => selected.has(provider.id)).map((provider) => provider.id);
};

export const selectionForPrompt = (value: string, catalog: ProviderCatalog): string[] => parseProviderSelection(value, undefined, catalog);

const executableCandidates = (executable: string, environment: NodeJS.ProcessEnv): string[] => {
  if (path.isAbsolute(executable)) return [executable];
  const pathValue = environment.PATH ?? "";
  const candidates: string[] = [];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, executable));
    if (process.platform === "win32") {
      for (const extension of (environment.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)) candidates.push(path.join(directory, `${executable}${extension.toLowerCase()}`));
    }
  }
  return candidates;
};

const findExecutable = async (executable: string, environment: NodeJS.ProcessEnv): Promise<string | undefined> => {
  for (const candidate of executableCandidates(executable, environment)) {
    try {
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH without invoking a shell.
    }
  }
  return undefined;
};

export const inspectProviderAvailability = async (catalog: ProviderCatalog, selected: string[], environment = process.env): Promise<ProviderRuntime[]> => {
  const runtimes: ProviderRuntime[] = [];
  for (const id of selected) {
    const provider = catalog.providers.find((candidate) => candidate.id === id);
    if (!provider) throw new ProviderError("provider_invalid", `provider is not in the catalog: ${id}`);
    const executablePath = await findExecutable(provider.executable, environment);
    if (!executablePath) throw new ProviderError("provider_unavailable", `${provider.display_name} is not installed (${provider.executable}). ${provider.missing_executable_hint}`);
    runtimes.push({ provider, executable_path: executablePath });
  }
  return runtimes;
};

export const launchProvider = (runtime: ProviderRuntime, workspace: string): Promise<{ code: number; signal: NodeJS.Signals | null; argv: string[] }> => {
  const args = runtime.provider.launch.args.map((arg) => arg.replaceAll("{workspace}", workspace));
  const argv = [runtime.executable_path, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(runtime.executable_path, args, { cwd: workspace, shell: false, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, argv }));
  });
};

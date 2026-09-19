import { execFile } from "node:child_process";
import type { ProcessEnvOptions } from "node:child_process";

export const PROVISIONING_SCHEMA_VERSION = 1;
export const GH_TIMEOUT_MS = 30_000;

const VALID_VISIBILITIES = ["public", "internal", "private"] as const;
const INDETERMINATE_MARKERS = [
  "network", "timed out", "timeout", "connection", "could not resolve host", "temporary failure",
  "tls", "proxy", "rate limit", "secondary rate", " 429", " 500", " 502", " 503", " 504",
];
const MISSING_MARKERS = ["could not resolve to a repository", "not found", "404", "does not exist"];
const REJECTED_MARKERS = ["unauthorized", "not authenticated", "not logged in", "not logged into", "bad credentials", "permission", "forbidden", "access denied", " 401", " 403", " 422"];

export type Visibility = typeof VALID_VISIBILITIES[number];
export type ProvisionOutcome = "existing" | "created" | "skipped" | "missing" | "rejected" | "indeterminate";

export interface CommandExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  missingExecutable: boolean;
}

export interface CommandRunner {
  (file: string, args: string[], options: { env: ProcessEnvOptions["env"]; timeoutMs: number }): Promise<CommandExecution>;
}

export interface RepositoryReadback {
  nameWithOwner: string;
  visibility?: Visibility;
}

export interface GitHubClient {
  preflight(): Promise<{ ok: true } | { ok: false; outcome: "rejected" | "indeterminate"; code: string }>;
  lookup(target: string): Promise<{ outcome: "existing" | "missing" | "rejected" | "indeterminate"; code?: string }>;
  create(target: string, visibility: Visibility): Promise<{ outcome: "created" | "existing" | "rejected" | "indeterminate"; code?: string }>;
  readback(target: string): Promise<{ outcome: "existing" | "rejected" | "indeterminate"; repository?: RepositoryReadback; code?: string }>;
}

export interface ProvisioningOptions {
  org: string;
  factoryRepo?: string;
  visibility?: Visibility;
  plan?: boolean;
  noCreate?: boolean;
  yes?: boolean;
  client?: GitHubClient;
  confirm?: (target: string) => Promise<boolean>;
}

export interface ProvisioningTarget {
  target: string;
  outcome?: ProvisionOutcome;
  code?: string;
}

export interface ProvisioningEnvelope {
  schema_version: number;
  command: "github-provision";
  status: "planned" | "noop" | "applied" | "missing" | "skipped" | "rejected" | "indeterminate";
  org: string;
  factory_repo: string;
  visibility: Visibility;
  no_create: boolean;
  targets: ProvisioningTarget[];
  summary: Record<ProvisionOutcome, number>;
  diagnostics: Array<{ code: string; target?: string }>;
}

export class ProvisioningError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
  }
}

const safeEnvironment = (): ProcessEnvOptions["env"] => {
  const environment: ProcessEnvOptions["env"] = {};
  for (const name of ["PATH", "HOME", "USERPROFILE", "GH_HOST", "GH_CONFIG_DIR", "XDG_CONFIG_HOME", "TMPDIR", "TEMP"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
};

export const execFileRunner: CommandRunner = (file, args, options) => new Promise((resolve) => {
  execFile(file, args, {
    env: options.env,
    shell: false,
    timeout: options.timeoutMs,
    encoding: "utf8",
    windowsHide: true,
  }, (error, stdout, stderr) => {
    const failure = error as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: number | string }) | null;
    resolve({
      exitCode: typeof failure?.code === "number" ? failure.code : failure ? 1 : 0,
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      timedOut: failure?.code === "ETIMEDOUT" || failure?.signal === "SIGTERM" || failure?.killed === true,
      missingExecutable: failure?.code === "ENOENT",
    });
  });
});

const validateName = (value: string, label: string, maximum: number): void => {
  if (!value || value.length > maximum || value === "." || value === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/u.test(value)) {
    throw new ProvisioningError("invalid_target", `${label} is not a valid GitHub name`);
  }
};

export const validateProvisioningOptions = (options: ProvisioningOptions): Required<Pick<ProvisioningOptions, "org" | "factoryRepo" | "visibility" | "plan" | "noCreate" | "yes">> => {
  validateName(options.org, "organization", 39);
  const factoryRepo = options.factoryRepo ?? "factory";
  validateName(factoryRepo, "factory repository", 100);
  if (factoryRepo.toLowerCase() === ".github") throw new ProvisioningError("invalid_target", "factory repository must not be .github");
  const visibility = options.visibility ?? "private";
  if (!VALID_VISIBILITIES.includes(visibility)) throw new ProvisioningError("invalid_visibility", "visibility must be public, internal, or private");
  const noCreate = options.noCreate ?? false;
  const yes = options.yes ?? false;
  if (noCreate && yes) throw new ProvisioningError("invalid_arguments", "--no-create and --yes cannot be combined");
  return { org: options.org, factoryRepo, visibility, plan: options.plan ?? false, noCreate, yes };
};

const targetsFor = (org: string, factoryRepo: string): string[] => [`${org}/.github`, `${org}/${factoryRepo}`];

const lowerOutput = (execution: CommandExecution): string => `${execution.stdout}\n${execution.stderr}`.toLowerCase();

const classifyFailure = (execution: CommandExecution, missingIsMissing: boolean): "missing" | "rejected" | "indeterminate" => {
  if (execution.timedOut || execution.missingExecutable) return "indeterminate";
  const detail = lowerOutput(execution);
  if (missingIsMissing && MISSING_MARKERS.some((marker) => detail.includes(marker))) return "missing";
  if (REJECTED_MARKERS.some((marker) => detail.includes(marker))) return "rejected";
  if (INDETERMINATE_MARKERS.some((marker) => detail.includes(marker))) return "indeterminate";
  return "indeterminate";
};

const outputIsAlreadyExists = (execution: CommandExecution): boolean => lowerOutput(execution).includes("already exists");

const repositoryFromReadback = (stdout: string, target: string): RepositoryReadback | undefined => {
  if (!stdout.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (typeof record.nameWithOwner !== "string" || record.nameWithOwner.toLowerCase() !== target.toLowerCase()) return undefined;
  const rawVisibility = record.visibility;
  if (rawVisibility === undefined) return { nameWithOwner: record.nameWithOwner };
  if (typeof rawVisibility !== "string" || !VALID_VISIBILITIES.includes(rawVisibility.toLowerCase() as Visibility)) return undefined;
  return { nameWithOwner: record.nameWithOwner, visibility: rawVisibility.toLowerCase() as Visibility };
};

export const createGitHubClient = (runner: CommandRunner = execFileRunner): GitHubClient => {
  const run = (args: string[]) => runner("gh", args, { env: safeEnvironment(), timeoutMs: GH_TIMEOUT_MS });
  return {
    async preflight() {
      const execution = await run(["auth", "status"]);
      if (execution.exitCode === 0) return { ok: true };
      const outcome = execution.missingExecutable ? "rejected" : classifyFailure(execution, false);
      return { ok: false, outcome: outcome === "indeterminate" ? "indeterminate" : "rejected", code: execution.missingExecutable ? "gh_missing" : "authentication_failed" };
    },
    async lookup(target) {
      const execution = await run(["repo", "view", target]);
      if (execution.exitCode === 0) return { outcome: "existing" };
      const outcome = classifyFailure(execution, true);
      return { outcome, code: outcome === "missing" ? "not_found" : execution.missingExecutable ? "gh_missing" : "lookup_failed" };
    },
    async create(target, visibility) {
      const execution = await run(["repo", "create", target, `--${visibility}`]);
      if (execution.exitCode === 0) return { outcome: "created" };
      if (outputIsAlreadyExists(execution)) return { outcome: "existing", code: "already_exists" };
      const classified = classifyFailure(execution, false);
      const outcome = classified === "missing" ? "indeterminate" : classified;
      return { outcome, code: outcome === "rejected" ? "create_rejected" : "create_indeterminate" };
    },
    async readback(target) {
      const execution = await run(["repo", "view", target, "--json", "nameWithOwner,visibility"]);
      if (execution.exitCode !== 0) return { outcome: "indeterminate", code: "readback_unavailable" };
      const repository = repositoryFromReadback(execution.stdout, target);
      if (!repository) return { outcome: "indeterminate", code: "readback_mismatch" };
      return { outcome: "existing", repository };
    },
  };
};

const emptySummary = (): Record<ProvisionOutcome, number> => ({ existing: 0, created: 0, skipped: 0, missing: 0, rejected: 0, indeterminate: 0 });

const summarize = (targets: ProvisioningTarget[]): Record<ProvisionOutcome, number> => {
  const summary = emptySummary();
  for (const target of targets) if (target.outcome) summary[target.outcome] += 1;
  return summary;
};

const statusFor = (summary: Record<ProvisionOutcome, number>): ProvisioningEnvelope["status"] => {
  if (summary.indeterminate > 0) return "indeterminate";
  if (summary.rejected > 0) return "rejected";
  if (summary.skipped > 0) return "skipped";
  if (summary.missing > 0) return "missing";
  if (summary.created > 0) return "applied";
  return "noop";
};

const envelopeFor = (values: Required<Pick<ProvisioningOptions, "org" | "factoryRepo" | "visibility" | "noCreate">>, targets: ProvisioningTarget[], diagnostics: Array<{ code: string; target?: string }>, status?: ProvisioningEnvelope["status"]): ProvisioningEnvelope => ({
  schema_version: PROVISIONING_SCHEMA_VERSION,
  command: "github-provision",
  status: status ?? statusFor(summarize(targets)),
  org: values.org,
  factory_repo: values.factoryRepo,
  visibility: values.visibility,
  no_create: values.noCreate,
  targets,
  summary: summarize(targets),
  diagnostics,
});

export const planProvisioning = (options: ProvisioningOptions): ProvisioningEnvelope => {
  const values = validateProvisioningOptions({ ...options, plan: true });
  const targets = targetsFor(values.org, values.factoryRepo).map((target) => ({ target }));
  return envelopeFor(values, targets, [], "planned");
};

export const provisionRepositories = async (options: ProvisioningOptions): Promise<ProvisioningEnvelope> => {
  const values = validateProvisioningOptions(options);
  if (values.plan) return planProvisioning(values);
  const client = options.client ?? createGitHubClient();
  const targetNames = targetsFor(values.org, values.factoryRepo);
  const diagnostics: Array<{ code: string; target?: string }> = [];
  const results: ProvisioningTarget[] = [];

  const preflight = await client.preflight();
  if (!preflight.ok) {
    diagnostics.push({ code: preflight.code });
    const outcome: ProvisionOutcome = preflight.outcome;
    return envelopeFor(values, targetNames.map((target) => ({ target, outcome, code: preflight.code })), diagnostics);
  }

  for (const target of targetNames) {
    const lookup = await client.lookup(target);
    if (lookup.outcome === "existing") results.push({ target, outcome: "existing" });
    else results.push({ target, outcome: lookup.outcome, code: lookup.code });
    if (lookup.outcome === "indeterminate" || lookup.outcome === "rejected") diagnostics.push({ code: lookup.code ?? "lookup_failed", target });
  }

  if (results.some((result) => result.outcome === "indeterminate" || result.outcome === "rejected")) return envelopeFor(values, results, diagnostics);
  if (values.noCreate) return envelopeFor(values, results, diagnostics);

  for (const result of results.filter((candidate) => candidate.outcome === "missing")) {
    const consented = values.yes || (options.confirm ? await options.confirm(result.target).catch(() => false) : false);
    if (!consented) {
      result.outcome = "skipped";
      continue;
    }
    const created = await client.create(result.target, values.visibility);
    if (created.outcome === "rejected" || created.outcome === "indeterminate") {
      result.outcome = created.outcome;
      result.code = created.code;
      diagnostics.push({ code: created.code ?? "create_failed", target: result.target });
      if (created.outcome === "indeterminate") break;
      continue;
    }
    const readback = await client.readback(result.target);
    if (readback.outcome !== "existing" || !readback.repository || (readback.repository.visibility && readback.repository.visibility !== values.visibility)) {
      result.outcome = "indeterminate";
      result.code = readback.code ?? "readback_mismatch";
      diagnostics.push({ code: result.code, target: result.target });
      break;
    }
    result.outcome = created.outcome === "existing" ? "existing" : "created";
    delete result.code;
  }
  return envelopeFor(values, results, diagnostics);
};

export const provisioningEnvelopeJson = (envelope: ProvisioningEnvelope): string => `${JSON.stringify({
  schema_version: envelope.schema_version,
  command: envelope.command,
  status: envelope.status,
  org: envelope.org,
  factory_repo: envelope.factory_repo,
  visibility: envelope.visibility,
  no_create: envelope.no_create,
  targets: envelope.targets,
  summary: envelope.summary,
  diagnostics: envelope.diagnostics,
}, null, 2)}\n`;

export const provisioningErrorEnvelope = (error: ProvisioningError): ProvisioningEnvelope => ({
  schema_version: PROVISIONING_SCHEMA_VERSION,
  command: "github-provision",
  status: "rejected",
  org: "",
  factory_repo: "",
  visibility: "private",
  no_create: false,
  targets: [],
  summary: emptySummary(),
  diagnostics: [{ code: error.code }],
});

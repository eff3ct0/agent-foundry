import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, type FileHandle } from "node:fs/promises";
import { AnchoredDirectory } from "./creator-filesystem";
import path from "node:path";
import { devNull } from "node:os";
import { promisify } from "node:util";
import { parseDocument } from "yaml";

export const CREATOR_SCHEMA_VERSION = 2;
export const CREATOR_DIRECTORY = ".factory/creator";
export const STATE_FILE = `${CREATOR_DIRECTORY}/state.json`;
export const STAGING_DIRECTORY = `${CREATOR_DIRECTORY}/.staging`;
const LEGACY_DIRECTORY = ".factory-template-creator";
const PROVENANCE = ".factory/provenance.json";
const UPSTREAM = "49dd158d1076134a641b33efb035946536778336";
const MAX_BYTES = 10 * 1024 * 1024;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const runFile = promisify(execFile);
const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const digest = (value: unknown): string => `sha256:${hash(json(value))}`;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export type Command = "plan" | "dry-run" | "apply" | "verify" | "doctor";
export interface PayloadFile { path: string; mode: string; size: number; sha256: string }
export interface PayloadManifest {
  schema_version: number; package_name: string; package_version: string; payload_version: string;
  profile: string; files: PayloadFile[]; payload_digest: string;
}
export interface CreatorConfig {
  schema_version: 2;
  profile: "matt-first";
  project: { name: string };
  binding: {
    provider: string; repository: string; project: string; access: string; recovery: string;
    permissions: string[]; approval_gates: string[];
    documentation: { architecture: string; constraints: string; business: string; technical: string };
  };
  hosts: Array<{ id: string; version: string; route: "manual" }>;
  initialize_git: boolean;
  readiness_record: string;
}
interface CreatorState {
  schema_version: 2; profile: "matt-first"; payload_digest: string; config_digest: string;
  candidate_digest: string; provenance_digest: string; owned_files: Array<PayloadFile & { boundary: "file"; before: "absent" }>;
  local_git: "initialize" | "none";
}
export interface Diagnostic { code: string; message: string; path?: string }
export interface Operation extends PayloadFile { action: "create" | "noop" | "conflict"; reason: string }
export interface CreatorEnvelope {
  schema_version: number; command: Command; status: string; target: string;
  profile: "matt-first"; payload: { version: string; digest: string };
  candidate?: Record<string, unknown>; config_digest?: string; plan_digest?: string;
  operations: Operation[]; diagnostics: Diagnostic[];
  effects?: { local_git: "initialize" | "none"; external: string[]; recovery_baseline: string; recovery_files?: PayloadFile[]; journal?: { path: string; mode: string } };
  integrity?: "verified" | "failed" | "not-checked";
  setup: "incomplete";
  readiness?: { record: string; required: string[]; observed_by_installer: false };
  next_action?: { procedure: string; source: string; authority: string; started: false };
  applied?: string[]; pending?: string[];
  configuration?: CreatorConfig;
  recovery?: { journal: string; status: string; local_git: string; candidate: unknown; baseline: unknown };
  rollback?: { attempted: boolean; restored: boolean; message: string };
}
export interface CreatorOptions {
  command: Command; target: string; configPath?: string;
  failAfter?: number; interruptAfter?: number;
}
interface PlannedFile { relativePath: string; bytes: Buffer; mode: number; sha256: string; size: number }
export interface PreparedPlan {
  envelope: CreatorEnvelope; target: string; targetExisted: boolean; files: PlannedFile[];
  stateBytes?: Buffer; state?: CreatorState; config?: CreatorConfig;
  options: CreatorOptions;
  baseline: { existed: boolean; dev: number; ino: number; mode: number };
}
export class CreatorError extends Error {
  constructor(readonly code: string, message: string, readonly options: { path?: string; plan?: PreparedPlan } = {}) {
    super(message); this.name = "CreatorError";
  }
  get path(): string | undefined { return this.options.path; }
  get plan(): PreparedPlan | undefined { return this.options.plan; }
}
function fail(code: string, message: string, relative?: string): never {
  throw new CreatorError(code, message, { path: relative });
}
const diagnostic = (code: string, message: string, relative?: string): Diagnostic => ({ code, message, ...(relative ? { path: relative } : {}) });
const safeRelative = (relative: string): boolean => typeof relative === "string" && relative.length > 0 && !/[\\:\u0000-\u001f]/u.test(relative)
  && relative.split("/").every((part) => part !== "" && part !== "." && part !== "..");
const metadata = async (filename: string) => lstat(filename).catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});

// Reject symlink parents as well as leaf links. O_NOFOLLOW binds the final read to a regular file.
const safeParents = async (root: string, relative: string): Promise<void> => {
  if (!safeRelative(relative)) fail("unsafe_path", "unsafe relative path", relative);
  let current = root;
  for (const part of relative.split("/").slice(0, -1)) {
    current = path.join(current, part);
    const entry = await metadata(current);
    if (entry && !entry.isDirectory()) fail("unsafe_path", "parent must be a real directory", relative);
  }
};
const regular = async (root: string, relative: string): Promise<{ bytes: Buffer; mode: number }> => {
  await safeParents(root, relative);
  const filename = path.join(root, relative);
  if (!(await lstat(filename)).isFile()) fail("unsafe_file", "expected a regular file, not a link/directory/device", relative);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.size > MAX_BYTES) fail("unsafe_file", "expected a bounded regular file", relative);
    return { bytes: await handle.readFile(), mode: entry.mode & 0o7777 };
  } finally { await handle.close(); }
};
const parseJson = (bytes: Buffer, label: string): unknown => {
  try {
    // JSON.parse enforces JSON syntax; YAML's duplicate-key diagnostic closes JSON.parse's last-key-wins hole.
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (parseDocument(bytes.toString("utf8"), { uniqueKeys: true }).errors.length) throw new Error("duplicate or invalid keys");
    return value;
  } catch { return fail("invalid_json", `${label} must be JSON without duplicate keys`); }
};
const keys = (value: unknown, expected: string[], label: string): Record<string, unknown> => {
  if (!object(value) || Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")) fail("configuration_invalid", `${label} has missing or unknown fields`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 4096 || /[\u0000-\u001f\u007f<>`]/u.test(value)) fail("configuration_invalid", `${label} must be nonempty plain text without controls or markup`);
  return (value as string).trim();
};
const https = (value: unknown, label: string): string => {
  const result = text(value, label);
  let url: URL;
  try { url = new URL(result); } catch { return fail("configuration_invalid", `${label} requires an exact HTTPS URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || /\s/u.test(result)) fail("configuration_invalid", `${label} requires an exact credential-free HTTPS URL`);
  return result;
};
const textList = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || !value.length || value.length > 32) fail("configuration_invalid", `${label} requires an explicit nonempty list`);
  return (value as unknown[]).map((entry) => text(entry, label));
};
export const validateConfig = (raw: unknown): CreatorConfig => {
  const value = keys(raw, ["schema_version", "profile", "project", "binding", "hosts", "initialize_git", "readiness_record"], "configuration");
  if (value.schema_version !== 2 || value.profile !== "matt-first") fail("configuration_version", "requires schema_version 2 / matt-first; legacy configuration is not converted");
  const project = keys(value.project, ["name"], "project");
  const binding = keys(value.binding, ["provider", "repository", "project", "access", "recovery", "permissions", "approval_gates", "documentation"], "binding");
  const documentation = keys(binding.documentation, ["architecture", "constraints", "business", "technical"], "documentation authority");
  const docs = Object.fromEntries(Object.entries(documentation).map(([family, location]) => {
    const source = text(location, `${family} source`);
    if (!safeRelative(source) && !source.startsWith("https://")) fail("configuration_invalid", "documentation source requires a safe repository path or exact HTTPS URL");
    if (source.startsWith("https://")) https(source, `${family} source`);
    return [family, source];
  })) as CreatorConfig["binding"]["documentation"];
  if (!Array.isArray(value.hosts) || !value.hosts.length || value.hosts.length > 16) fail("configuration_invalid", "select at least one exact manual host");
  const seen = new Set<string>();
  const hosts = (value.hosts as unknown[]).map((entry) => {
    const host = keys(entry, ["id", "version", "route"], "host");
    const id = text(host.id, "host id");
    if (!/^[a-z][a-z0-9-]*$/u.test(id) || seen.has(id) || host.route !== "manual") fail("route_unavailable", "fresh foundation supports explicitly selected unique manual routes only; no native downgrade");
    seen.add(id);
    return { id, version: text(host.version, "host version"), route: "manual" as const };
  });
  if (typeof value.initialize_git !== "boolean") fail("configuration_invalid", "initialize_git requires explicit true or false");
  const repository = https(binding.repository, "task repository");
  const readiness = https(value.readiness_record, "readiness record");
  if (!readiness.startsWith(`${repository}/`)) fail("configuration_invalid", "readiness record must belong to the accepted task repository");
  return {
    schema_version: 2, profile: "matt-first", project: { name: text(project.name, "project name") },
    binding: { provider: text(binding.provider, "task provider"), repository, project: https(binding.project, "task project/board"),
      access: text(binding.access, "access route"), recovery: text(binding.recovery, "access recovery"),
      permissions: textList(binding.permissions, "permissions"), approval_gates: textList(binding.approval_gates, "approval gates"), documentation: docs },
    hosts, initialize_git: value.initialize_git as boolean, readiness_record: readiness,
  };
};
const resolveTarget = async (raw: string): Promise<{ absolute: string; existed: boolean; identity: PreparedPlan["baseline"] }> => {
  if (!raw || raw.replaceAll("\\", "/").split("/").includes("..")) fail("invalid_target", "target traversal or empty target is not allowed");
  const absolute = path.resolve(raw);
  const entry = await metadata(absolute);
  if (entry && !entry.isDirectory()) fail("unsafe_target", "target must be a real directory", absolute);
  const parent = entry ? absolute : path.dirname(absolute);
  const parentEntry = await metadata(parent);
  if (!parentEntry?.isDirectory() || await realpath(parent) !== parent) fail("unsafe_target", "target and parent must resolve without symlinks; parent must exist", parent);
  if ((parentEntry.mode & 0o222) === 0) fail("target_unwritable", "target parent has no write permissions", parent);
  return { absolute, existed: Boolean(entry), identity: { existed: Boolean(entry), dev: parentEntry.dev, ino: parentEntry.ino, mode: parentEntry.mode } };
};
const plannedFile = (relativePath: string, bytes: Buffer, mode = 0o644): PlannedFile => ({ relativePath, bytes, mode, sha256: hash(bytes), size: bytes.length });
const fileIdentity = (file: PlannedFile): PayloadFile => ({ path: file.relativePath, mode: file.mode.toString(8).padStart(4, "0"), size: file.size, sha256: file.sha256 });
const operation = (file: PlannedFile, action: Operation["action"], reason: string): Operation => ({ ...fileIdentity(file), action, reason });

const loadManifest = async (): Promise<{ manifest: PayloadManifest; candidate: Record<string, unknown>; sources: Map<string, PlannedFile> }> => {
  const manifest = parseJson((await regular(__dirname, "payload-manifest.json")).bytes, "payload manifest") as PayloadManifest;
  if (!object(manifest) || manifest.schema_version !== 2 || manifest.profile !== "matt-first" || manifest.payload_version !== "2.0.0" || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 1000) fail("payload_invalid", "requires a schema-2 Matt-first payload");
  const expected = `sha256:${hash(Buffer.from(JSON.stringify({ payload_version: manifest.payload_version, files: manifest.files })))}`;
  if (expected !== manifest.payload_digest) fail("payload_invalid", "payload manifest digest mismatch");
  const candidate = parseJson((await regular(__dirname, "candidate.json")).bytes, "candidate") as Record<string, unknown>;
  if (!object(candidate) || candidate.schema_version !== 2 || candidate.payload_digest !== manifest.payload_digest || !object(candidate.engine_files)
    || !digestPattern.test(String(candidate.candidate_digest)) || digest({ ...candidate, candidate_digest: undefined }) !== candidate.candidate_digest) fail("candidate_invalid", "candidate identity mismatch");
  for (const [relative, expectedHash] of Object.entries(candidate.engine_files)) {
    if (!safeRelative(relative) || hash((await regular(__dirname, relative)).bytes) !== expectedHash) fail("candidate_invalid", "packaged engine bytes differ", relative);
  }
  const sources = new Map<string, PlannedFile>();
  let total = 0;
  for (const file of manifest.files) {
    if (!safeRelative(file.path) || !["100644", "100755", "0644", "0755"].includes(file.mode) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/u.test(file.sha256)) fail("payload_invalid", "invalid payload identity");
    const source = await regular(path.join(__dirname, "payload"), file.path);
    const mode = parseInt(file.mode.slice(-3), 8);
    if (source.bytes.length !== file.size || hash(source.bytes) !== file.sha256 || (source.mode !== mode && !(source.mode === 0o644 && mode === 0o755))) fail("payload_mismatch", "payload bytes or mode differ", file.path);
    total += source.bytes.length;
    const sourcePath = file.path.startsWith("foundation/matt-first/") ? file.path.slice("foundation/matt-first/".length) : file.path;
    if (sources.has(sourcePath)) fail("payload_invalid", "duplicate composition input", sourcePath);
    sources.set(sourcePath, plannedFile(sourcePath, source.bytes, mode));
  }
  if (total > MAX_BYTES) fail("payload_invalid", "payload is too large");
  return { manifest, candidate, sources };
};
const composeBindings = (config: CreatorConfig): Buffer => Buffer.from(`# Accepted repository binding\n\nThis is the sole binding, not an access certificate. Read [the integration envelope](../AGENT.md).\n\n## Task authority\n\n- Provider: ${config.binding.provider}\n- Repository: ${config.binding.repository}\n- Project/board: ${config.binding.project}\n- Access route: ${config.binding.access}\n- Recovery: ${config.binding.recovery}\n\nRead fresh native identity, state, owner, parent/dependencies and canonical checkpoint before work. Confirm each durable operation and freshly read back the exact target, intended content and state. An unknown effect requires exact-target inspection before retry. No local task fallback or takeover from silence. Use the provider's current forms/conventions and actual native capabilities; no implicit label creation or manual relation downgrade.\n\n## Accepted validation/work permissions\n\n${config.binding.permissions.map((item) => `- ${item}`).join("\n")}\n\n## Human gates\n\n${config.binding.approval_gates.map((item) => `- ${item}`).join("\n")}\n\nNo procedure grants protected approval, merge, deployment, migration, publication, global configuration or expanded scope.\n\n## Documentation authority\n\n${Object.entries(config.binding.documentation).map(([family, source]) => `- ${family}: ${source}`).join("\n")}\n\nGit code/docs and tracker task/spec/decision/checkpoint/evidence are distinct authorities. External documentation requires its declared access/recovery and separately permitted supported write/acknowledgment/fresh readback; a derived copy is not fallback authority.\n\n## Selected manual hosts\n\n${config.hosts.map((host) => `- ${host.id} ${host.version}: explicit readable-source loading (manual); native registration not selected.`).join("\n")}\n\n## Readiness\n\nRecord: ${config.readiness_record}\n\nInstallation does not test access, perform tracker writes, launch a validator or start planning. Separately invoke an independent manual discovery check, verify permitted provider identity/write/readback, identify the proposed planning action and stop. Required missing observations mean setup incomplete. Results bind exact content, host/version, workspace and access; recheck affected evidence after change. Local installer state is ownership/recovery evidence only.\n`);
const readPayloadFiles = (sources: Map<string, PlannedFile>, manifest: PayloadManifest, candidate: Record<string, unknown>, config: CreatorConfig): { files: PlannedFile[]; nextAction: NonNullable<CreatorEnvelope["next_action"]> } => {
  const files: PlannedFile[] = [];
  for (const [relative, source] of sources) {
    const destination = relative === "envelope.md" ? "AGENT.md" : relative === "procedures.md" ? ".factory/procedures.md"
      : relative.startsWith("upstream/") ? `.factory/skills/matt-pocock/${relative.slice(9)}`
        : relative.startsWith("skills/") ? `.factory/${relative}` : relative === "start.mjs" ? relative : undefined;
    if (destination) files.push(plannedFile(destination, source.bytes, source.mode));
    else if (relative !== "upstream-lock.json") fail("composition_invalid", "unclassified payload input", relative);
  }
  for (const required of ["AGENT.md", "start.mjs", ".factory/procedures.md", ".factory/skills/foundry-checkpoint/SKILL.md", ".factory/skills/foundry-resume/SKILL.md", ".factory/skills/matt-pocock/LICENSE"]) {
    if (!files.some((file) => file.relativePath === required)) fail("composition_invalid", "required source missing", required);
  }
  const lockSource = sources.get("upstream-lock.json");
  if (!lockSource) fail("composition_invalid", "upstream lock missing");
  const lock = parseJson(lockSource!.bytes, "upstream lock") as { repository: string; revision: string; files: PayloadFile[] };
  if (lock.repository !== "mattpocock/skills" || lock.revision !== UPSTREAM || !Array.isArray(lock.files)) fail("composition_invalid", "wrong upstream baseline");
  for (const entry of lock.files) {
    const source = sources.get(`upstream/${entry.path}`);
    if (!source || source.sha256 !== entry.sha256 || source.size !== entry.size || source.mode !== parseInt(entry.mode.slice(-3), 8)) fail("composition_invalid", "upstream lock mismatch", entry.path);
  }
  if (sources.size !== lock.files.length + 6) fail("composition_invalid", "unexpected upstream selection");
  files.push(plannedFile("docs/bindings.md", composeBindings(config)));
  files.push(plannedFile(".gitignore", Buffer.from("# Local installer ownership/recovery bytes; not task authority\n/.factory/creator/\n")));
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  const entries = ["grill-with-docs", "wayfinder", "to-spec", "to-tickets", "implement", "code-review"].map((name) => `.factory/skills/matt-pocock/skills/engineering/${name}/SKILL.md`)
    .concat([".factory/skills/foundry-checkpoint/SKILL.md", ".factory/skills/foundry-resume/SKILL.md"]);
  for (const entry of entries) if (!files.some((file) => file.relativePath === entry)) fail("composition_invalid", "indexed method missing", entry);
  const nextAction = { procedure: "grill-with-docs", source: entries[0], authority: "Explicit planning selection or a delegation covering its objective and effects; do not start during setup.", started: false as const };
  const provenance = {
    schema_version: 2, profile: "matt-first", candidate, payload: { version: manifest.payload_version, digest: manifest.payload_digest },
    configuration: config, config_digest: digest(config), startup: "start.mjs", binding: "docs/bindings.md", catalog: ".factory/procedures.md",
    sources: { repository: lock.repository, revision: lock.revision, lock_digest: `sha256:${lockSource!.sha256}`, adaptations: [], license: ".factory/skills/matt-pocock/LICENSE" },
    method_entries: entries, files: files.map(fileIdentity), adapters: config.hosts.map((host) => ({ ...host, discovery: "explicit AGENT.md and indexed readable paths", projections: [] })),
    readiness_record: config.readiness_record,
    next_action: nextAction,
  };
  files.push(plannedFile(PROVENANCE, json(provenance)));
  return { files: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en")), nextAction };
};

export const preparePlan = async (options: CreatorOptions): Promise<PreparedPlan> => {
  const { manifest, candidate, sources } = await loadManifest();
  const target = await resolveTarget(options.target);
  const envelope: CreatorEnvelope = {
    schema_version: 2, command: options.command, status: "planned", target: target.absolute, profile: "matt-first",
    payload: { version: manifest.payload_version, digest: manifest.payload_digest }, candidate,
    operations: [], diagnostics: [], setup: "incomplete", integrity: "not-checked",
  };
  const prepared: PreparedPlan = { envelope, target: target.absolute, targetExisted: target.existed, files: [], options: { ...options }, baseline: target.identity };
  try {
    if (await metadata(path.join(target.absolute, "MAINTAINERS.md"))) fail("source_self", "never apply the creator to its source SELF", "MAINTAINERS.md");
    if (!options.configPath) fail("configuration_required", "supply an explicit schema-2 configuration with --config; detection is not acceptance");
    const configFilename = path.resolve(options.configPath!);
    const config = validateConfig(parseJson((await regular(path.dirname(configFilename), path.basename(configFilename))).bytes, "configuration"));
    envelope.configuration = config;
    prepared.config = config;
    envelope.config_digest = digest(config);
    envelope.effects = { local_git: config.initialize_git ? "initialize" : "none", external: [], recovery_baseline: "Empty destination; every named output was absent. Private staged bytes and applying/committed journal are retained for inspected recovery; no automatic deletion, restoration or crash-atomicity claim." };
    envelope.readiness = { record: config.readiness_record, required: config.hosts.flatMap((host) => [`${host.id}@${host.version}: independent manual entrypoint/method/resource discovery and passive next-action stop`, `${host.id}@${host.version}: permitted tracker identity/access/write and fresh exact readback`]), observed_by_installer: false };
    const { files, nextAction } = readPayloadFiles(sources, manifest, candidate, config);
    const provenance = files.find((file) => file.relativePath === PROVENANCE)!;
    envelope.next_action = nextAction;
    const state: CreatorState = { schema_version: 2, profile: "matt-first", payload_digest: manifest.payload_digest, config_digest: envelope.config_digest,
      candidate_digest: candidate.candidate_digest as string, provenance_digest: `sha256:${provenance.sha256}`,
      owned_files: files.map((file) => ({ ...fileIdentity(file), boundary: "file", before: "absent" })), local_git: config.initialize_git ? "initialize" : "none" };
    prepared.stateBytes = json(state);
    const stateFile = plannedFile(STATE_FILE, prepared.stateBytes, 0o600);
    prepared.files = [...files, stateFile];
    envelope.effects.recovery_files = prepared.files.map((file) => ({ ...fileIdentity(file), path: `${STAGING_DIRECTORY}/files/${file.relativePath}` }));
    envelope.effects.journal = { path: `${STAGING_DIRECTORY}/journal.json`, mode: "0600" };
    await safeParents(target.absolute, STATE_FILE);
    if (await metadata(path.join(target.absolute, LEGACY_DIRECTORY))) fail("legacy_readoption_required", "legacy creator state/staging requires separately accepted re-adoption", LEGACY_DIRECTORY);
    if (await metadata(path.join(target.absolute, STAGING_DIRECTORY))) {
      const interrupted = await inspectJournal(prepared);
      envelope.applied = interrupted.applied;
      envelope.pending = interrupted.pending;
      envelope.recovery = interrupted.recovery;
      if (interrupted.recovery.status !== "committed"
        || JSON.stringify(interrupted.files) !== JSON.stringify(prepared.files.map(fileIdentity))) {
        fail("staging_interrupted", "inspect journal and actual destinations before authorized recovery; do not replay apply", STAGING_DIRECTORY);
      }
    }
    const existingState = await metadata(path.join(target.absolute, STATE_FILE));
    if (existingState) {
      const stored = await regular(target.absolute, STATE_FILE);
      const parsed = parseJson(stored.bytes, "installation state");
      if (!object(parsed) || parsed.schema_version !== 2 || parsed.profile !== "matt-first") fail("legacy_readoption_required", "unknown/schema-1 state is not converted", STATE_FILE);
      if (stored.mode !== 0o600 || !stored.bytes.equals(prepared.stateBytes)) fail("ownership_reconciliation_required", "state/config/candidate differs; inspect and accept a scoped update/recovery plan", STATE_FILE);
      prepared.state = state;
    } else if (target.existed && (await readdir(target.absolute)).length) {
      fail("fresh_target_not_empty", "fresh setup requires an empty destination; adoption is not implicit");
    }
    for (const file of prepared.files) {
      await safeParents(target.absolute, file.relativePath);
      const entry = await metadata(path.join(target.absolute, file.relativePath));
      if (!entry) {
        if (existingState) fail("owned_file_missing", "owned file missing; recovery requires inspection", file.relativePath);
        envelope.operations.push(operation(file, "create", "accepted fresh file; previous boundary absent"));
      } else {
        if (!prepared.state) fail("ownership_uncertain", "matching bytes do not establish ownership", file.relativePath);
        const current = await regular(target.absolute, file.relativePath);
        if (current.mode !== file.mode || !current.bytes.equals(file.bytes)) fail("owned_file_drift", "owned bytes or mode differ; no overwrite", file.relativePath);
        envelope.operations.push(operation(file, "noop", "exact owned file unchanged"));
      }
    }
    if (config.initialize_git && prepared.state && !(await metadata(path.join(target.absolute, ".git")))) fail("local_git_missing", "accepted local Git effect is missing; inspect before recovery", ".git");
    const top = target.existed ? (await readdir(target.absolute)).sort() : [];
    envelope.plan_digest = digest({ target: target.absolute, baseline: target.identity, top, candidate: candidate.candidate_digest, config: envelope.config_digest, operations: envelope.operations, effects: envelope.effects });
    envelope.status = prepared.state ? "noop" : options.command === "dry-run" ? "dry-run" : "planned";
  } catch (error) {
    if (!(error instanceof CreatorError)) throw error;
    envelope.status = "conflict";
    envelope.diagnostics.push(diagnostic(error.code, error.message, error.path));
  }
  return prepared;
};

const inspectJournal = async (prepared: PreparedPlan) => {
  const relative = `${STAGING_DIRECTORY}/journal.json`;
  const journal = parseJson((await regular(prepared.target, relative)).bytes, "recovery journal");
  if (!object(journal) || journal.schema_version !== 2 || journal.profile !== "matt-first" || !Array.isArray(journal.files)
    || journal.files.length > 1000 || !["applying", "committed"].includes(String(journal.status))) fail("journal_invalid", "unsupported recovery journal", relative);
  const files: PayloadFile[] = [];
  const seen = new Set<string>();
  for (const entry of journal.files) {
    if (!object(entry) || typeof entry.path !== "string" || !safeRelative(entry.path) || seen.has(entry.path)
      || typeof entry.mode !== "string" || !/^0[0-7]{3}$/u.test(entry.mode) || typeof entry.size !== "number"
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) fail("journal_invalid", "invalid/duplicate recovery file boundary", relative);
    seen.add(entry.path);
    files.push({ path: entry.path, mode: entry.mode, size: entry.size, sha256: entry.sha256 });
  }
  const applied: string[] = [];
  const pending: string[] = [];
  for (const file of files) {
    try {
      const current = await regular(prepared.target, file.path);
      if (current.mode === parseInt(file.mode, 8) && current.bytes.length === file.size && hash(current.bytes) === file.sha256) applied.push(file.path);
      else pending.push(file.path);
    } catch { pending.push(file.path); }
  }
  return { files, applied, pending, recovery: { journal: relative, status: String(journal.status), local_git: String(journal.local_git),
    candidate: journal.candidate, baseline: journal.baseline } };
};

const verifyDisk = async (prepared: PreparedPlan): Promise<void> => {
  for (const file of prepared.files) {
    const current = await regular(prepared.target, file.relativePath);
    if (current.mode !== file.mode || hash(current.bytes) !== file.sha256) fail("integrity_failed", "installed bytes or mode differ", file.relativePath);
  }
};
export const applyPlan = async (preview: PreparedPlan, acceptedDigest: string): Promise<CreatorEnvelope> => {
  if (!acceptedDigest || acceptedDigest !== preview.envelope.plan_digest || preview.envelope.status === "conflict") throw new CreatorError("acceptance_required", "apply requires acceptance of this exact conflict-free plan digest", { plan: preview });
  const prepared = await preparePlan(preview.options);
  if (prepared.envelope.plan_digest !== acceptedDigest || prepared.envelope.status === "conflict") throw new CreatorError("plan_stale", "candidate, configuration or destination changed since preview; reconcile and accept a new plan", { plan: prepared });
  if (prepared.state) return { ...prepared.envelope, command: "apply", status: "noop", integrity: "verified" };
  let root: AnchoredDirectory | undefined;
  let journalHandle: FileHandle | undefined;
  let stageOwned = false;
  const applied: string[] = [];
  const journal = { schema_version: 2, profile: "matt-first", status: "applying", plan_digest: acceptedDigest, candidate: prepared.envelope.candidate,
    baseline: "all named destination files absent", files: prepared.files.map(fileIdentity), local_git: prepared.config!.initialize_git ? "not-started" : "not-selected", applied };
  const journalPath = `${STAGING_DIRECTORY}/journal.json`;
  const updateJournal = async (): Promise<void> => {
    const held = await journalHandle!.stat();
    await root!.parent(journalPath, false, async (leaf) => {
      const named = await lstat(leaf);
      if (!named.isFile() || held.dev !== named.dev || held.ino !== named.ino) fail("journal_replaced", "journal pathname was replaced; held recovery bytes retained without following replacement", journalPath);
    });
    const bytes = json(journal);
    await journalHandle!.write(bytes, 0, bytes.length, 0);
    await journalHandle!.truncate(bytes.length);
    await journalHandle!.sync();
  };
  try {
    if (!prepared.targetExisted) {
      const parent = await AnchoredDirectory.open(path.dirname(prepared.target), prepared.baseline);
      try { await parent.parent(path.basename(prepared.target), false, (leaf) => mkdir(leaf, { mode: 0o755 })); }
      finally { await parent.handle.close(); }
    }
    root = await AnchoredDirectory.open(prepared.target, prepared.targetExisted ? prepared.baseline : undefined);
    await root.matchesRoot(prepared.target);
    // The staging leaf is acquired exclusively. A competing apply never acquires or cleans another transaction.
    await root.parent(STAGING_DIRECTORY, true, (leaf) => mkdir(leaf, { mode: 0o700 }));
    stageOwned = true;
    journalHandle = await root.parent(journalPath, false, (leaf) => open(leaf, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
    await updateJournal();
    for (const file of prepared.files) {
      await root.parent(`${STAGING_DIRECTORY}/files/${file.relativePath}`, true, async (leaf) => {
        const staged = await open(leaf, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, file.mode);
        try { await staged.writeFile(file.bytes); await staged.chmod(file.mode); }
        finally { await staged.close(); }
      });
      await root.verify({ ...file, relativePath: `${STAGING_DIRECTORY}/files/${file.relativePath}` });
    }
    for (const file of prepared.files) {
      await root.matchesRoot(prepared.target);
      await root.parent(`${STAGING_DIRECTORY}/files/${file.relativePath}`, false, (source) =>
        root!.parent(file.relativePath, true, (destination) => link(source, destination)));
      applied.push(file.relativePath);
      await updateJournal();
      if (prepared.options.interruptAfter && applied.length >= prepared.options.interruptAfter) fail("staging_interrupted", "injected interruption; exact journal/staged bytes retained");
      if (prepared.options.failAfter && applied.length >= prepared.options.failAfter) fail("apply_failed", "injected handled failure; no unsafe compare-then-delete rollback");
    }
    for (const file of prepared.files) await root.verify(file);
    await root.matchesRoot(prepared.target);
    if (prepared.config!.initialize_git) {
      // Both Git roots stay descriptor-bound. No inherited GIT_* setting can redirect this effect.
      const environment: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
        TMPDIR: process.env.TMPDIR, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull };
      await root.parent(".git", false, (leaf) => mkdir(leaf, { mode: 0o755 }));
      const gitDirectory = await root.parent(".git", false, (leaf) => AnchoredDirectory.open(leaf));
      try {
        journal.local_git = "attempted";
        await updateJournal();
        await runFile("git", [`--git-dir=${gitDirectory.location}`, `--work-tree=${root.location}`, "-c", "init.templateDir=", "init", "--quiet", "--initial-branch=main"], { timeout: 30_000, env: environment });
        await root.matchesRoot(prepared.target);
        const initialized = await runFile("git", ["-C", prepared.target, "rev-parse", "--absolute-git-dir"], { timeout: 30_000, env: environment });
        if (initialized.stdout.trim() !== path.join(prepared.target, ".git")) fail("local_git_uncertain", "local Git readback differs from accepted target", ".git");
        journal.local_git = "verified";
      } finally { await gitDirectory.handle.close(); }
    }
    journal.status = "committed";
    await updateJournal();
    await root.matchesRoot(prepared.target);
    return { ...prepared.envelope, command: "apply", status: "applied", integrity: "verified", applied, pending: [],
      recovery: { journal: journalPath, status: journal.status, local_git: journal.local_git, candidate: journal.candidate, baseline: journal.baseline } };
  } catch (error) {
    const issue = error instanceof CreatorError ? error : new CreatorError("apply_failed", (error as Error).message);
    // A portable compare-then-unlink cannot exclude a concurrent replacement. Preserve rather than delete.
    prepared.envelope = { ...prepared.envelope, status: stageOwned ? "partial" : "conflict", integrity: "failed", applied,
      pending: prepared.files.filter((file) => !applied.includes(file.relativePath)).map((file) => file.relativePath),
      recovery: { journal: journalPath, status: journal.status, local_git: journal.local_git, candidate: journal.candidate, baseline: journal.baseline },
      rollback: { attempted: false, restored: false, message: "No automatic deletion/restoration: concurrent edits cannot be safely excluded. Inspect retained journal/staged bytes and actual touched paths before separately authorized recovery." } };
    throw new CreatorError(issue.code, issue.message, { plan: prepared, path: issue.path });
  } finally { await journalHandle?.close(); await root?.handle.close(); }
};
export const verify = async (prepared: PreparedPlan): Promise<CreatorEnvelope> => {
  if (prepared.envelope.status !== "noop") return { ...prepared.envelope, command: "verify", status: "verification-failed", integrity: "failed" };
  await verifyDisk(prepared);
  return { ...prepared.envelope, command: "verify", status: "verified", integrity: "verified" };
};
export const doctor = async (prepared: PreparedPlan): Promise<CreatorEnvelope> => {
  const checked = await verify(prepared);
  const partial = checked.recovery && checked.recovery.status !== "committed";
  return { ...checked, command: "doctor", status: partial ? "partial" : checked.integrity === "verified" ? "healthy" : "unhealthy" };
};
export const envelopeJson = (envelope: CreatorEnvelope): string => json(envelope).toString("utf8");
export const errorEnvelope = (command: Command, target: string, error: CreatorError): CreatorEnvelope => ({
  ...(error.plan?.envelope ?? { schema_version: 2, command, target, profile: "matt-first", payload: { version: "unknown", digest: "unknown" }, operations: [], diagnostics: [], setup: "incomplete" }),
  command, status: error.plan?.envelope.status === "partial" ? "partial" : error.plan?.envelope.status === "failed" ? "failed" : "error",
  diagnostics: [...(error.plan?.envelope.diagnostics ?? []), diagnostic(error.code, error.message, error.path)],
});

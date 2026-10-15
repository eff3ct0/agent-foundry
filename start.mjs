#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devNull } from "node:os";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export const STARTUP_SCHEMA_VERSION = 2;
export const SELF = "SELF";
export const INCOMPLETE = "INCOMPLETE";
export const USABLE = "USABLE";
export const UNSAFE = "UNSAFE";
const PROVENANCE = ".factory/provenance.json";
const STATE = ".factory/creator/state.json";
const STAGING = ".factory/creator/.staging";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeRelative = (relative) => typeof relative === "string" && relative.length > 0 && !/[\\:\u0000-\u001f]/u.test(relative)
  && relative.split("/").every((part) => part !== "" && part !== "." && part !== "..");
const metadata = async (filename) => lstat(filename).catch((error) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});
const regular = async (root, relative) => {
  if (!safeRelative(relative)) throw new Error(`unsafe path: ${relative}`);
  let current = root;
  for (const part of relative.split("/").slice(0, -1)) {
    current = path.join(current, part);
    const entry = await metadata(current);
    if (entry && !entry.isDirectory()) throw new Error(`unsafe parent: ${relative}`);
  }
  const filename = path.join(root, relative);
  if (!(await lstat(filename)).isFile()) throw new Error(`expected regular file, not link/directory/device: ${relative}`);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.size > 10 * 1024 * 1024) throw new Error(`expected bounded regular file: ${relative}`);
    return { bytes: await handle.readFile(), mode: entry.mode & 0o7777 };
  } finally { await handle.close(); }
};
const readJson = async (root, relative) => {
  const file = await regular(root, relative);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (!file.bytes.equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))) throw new Error(`noncanonical or duplicate JSON: ${relative}`);
  return { value, ...file };
};
const verifyLocalGit = async (root) => {
  const expected = path.join(root, ".git");
  const before = await metadata(expected);
  if (!before?.isDirectory() || await realpath(expected) !== expected) throw new Error("accepted local Git boundary is missing, linked or unsafe");
  const environment = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    TMPDIR: process.env.TMPDIR, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull };
  const observed = await runFile("git", ["-C", root, "rev-parse", "--absolute-git-dir", "--show-toplevel"], { timeout: 30_000, env: environment });
  const after = await metadata(expected);
  if (!after?.isDirectory() || before.dev !== after.dev || before.ino !== after.ino || observed.stdout !== `${expected}\n${root}\n`
    || await realpath(expected) !== expected) throw new Error("local Git boundary changed or resolves outside the accepted destination");
};
const identityValid = (file) => object(file) && safeRelative(file.path) && /^0[0-7]{3}$/u.test(file.mode)
  && Number.isSafeInteger(file.size) && file.size >= 0 && /^[a-f0-9]{64}$/u.test(file.sha256);
const ownershipValid = (file) => identityValid(file) && ["file", "block"].includes(file.boundary)
  && (file.before === "absent" || (identityValid(file.before) && file.before.path === file.path))
  && (file.boundary !== "block" || (file.before !== "absent" && object(file.block)
    && typeof file.block.begin === "string" && typeof file.block.end === "string"
    && /^[a-f0-9]{64}$/u.test(file.block.sha256) && file.block.context_sha256 === file.before.sha256));

export const isTemplate = async (root) => (await metadata(path.join(root, "MAINTAINERS.md")))?.isFile() === true
  && (await regular(root, "MAINTAINERS.md")).bytes.toString("utf8").startsWith("# MAINTAINERS - Agent Foundry source governance\n");
export const detectMode = async (root) => {
  const resolved = path.resolve(root);
  const result = { mode: INCOMPLETE, status: "incomplete", integrity: "not-checked", setup: "incomplete", diagnostics: [], applied: [], pending: [] };
  try {
    const rootIdentity = await metadata(resolved);
    if (!rootIdentity?.isDirectory() || await realpath(resolved) !== resolved) throw new Error("startup root must be a real directory without symlink parents");
    if (await isTemplate(resolved)) return { ...result, mode: SELF, status: "source" };
    for (const relative of [".factory", ".factory/creator", STAGING, ".factory-template-creator"]) {
      const entry = await metadata(path.join(resolved, relative));
      if (entry && !entry.isDirectory()) throw new Error(`unsafe directory: ${relative}`);
    }
    if (await metadata(path.join(resolved, ".factory-template-creator"))) throw new Error("legacy creator location requires explicit inspected re-adoption; no ordinary conversion");
    let recoveryJournal;
    if (await metadata(path.join(resolved, STAGING))) {
      const { value: journal, mode } = await readJson(resolved, `${STAGING}/journal.json`);
      if (mode !== 0o600 || journal.schema_version !== 2 || journal.profile !== "matt-first" || !["applying", "committed"].includes(journal.status)
        || !object(journal.candidate) || !/^sha256:[a-f0-9]{64}$/u.test(journal.plan_digest)
        || !(journal.baseline === "all named destination files absent" || (Array.isArray(journal.baseline)
          && journal.baseline.every(ownershipValid) && new Set(journal.baseline.map((file) => file.path)).size === journal.baseline.length))
        || !["not-selected", "not-started", "attempted", "verified"].includes(journal.local_git)
        || !Array.isArray(journal.files) || journal.files.length > 1000 || !journal.files.every(identityValid)
        || new Set(journal.files.map((file) => file.path)).size !== journal.files.length
        || !Array.isArray(journal.applied) || journal.applied.length > journal.files.length
        || !journal.applied.every((entry, index) => entry === journal.files[index]?.path)
        || (journal.status === "committed" && journal.applied.length !== journal.files.length)) throw new Error("invalid recovery journal identity, mode, baseline or effect boundary; inspect locally");
      recoveryJournal = journal;
      for (const file of journal.files) {
        try {
          const current = await regular(resolved, file.path);
          if (current.mode === parseInt(file.mode, 8) && hash(current.bytes) === file.sha256) result.applied.push(file.path);
          else result.pending.push(file.path);
        } catch { result.pending.push(file.path); }
        if (journal.status === "committed") {
          const staged = await regular(resolved, `${STAGING}/files/${file.path}`);
          if (staged.mode !== parseInt(file.mode, 8) || staged.bytes.length !== file.size || hash(staged.bytes) !== file.sha256) throw new Error(`retained recovery bytes or mode differ: ${file.path}`);
        }
      }
      if (journal.status !== "committed") return { ...result, integrity: "failed", recovery: { journal: `${STAGING}/journal.json`, local_git: journal.local_git }, diagnostics: [{ code: "partial_apply", path: STAGING, message: "Interrupted/uncertain transaction. Inspect journal and actual touched bytes/modes/local Git before separately authorized recovery; no blind replay." }] };
    }
    const provenanceEntry = await metadata(path.join(resolved, PROVENANCE));
    if (!provenanceEntry) {
      if (await metadata(path.join(resolved, STATE))) throw new Error("installation state without Matt-first provenance; inspect legacy/partial state");
      return { ...result, diagnostics: [{ code: "foundation_missing", path: PROVENANCE, message: "No recognized installed foundation; inspect and accept a fresh/adoption plan before mutation." }] };
    }
    const { value: provenance, bytes: provenanceBytes } = await readJson(resolved, PROVENANCE);
    if (!object(provenance) || provenance.schema_version !== 2 || provenance.profile !== "matt-first" || !object(provenance.candidate)
      || !object(provenance.configuration) || provenance.configuration.schema_version !== 2 || !object(provenance.configuration.binding)
      || !object(provenance.sources) || provenance.sources.revision !== "49dd158d1076134a641b33efb035946536778336"
      || !Array.isArray(provenance.files) || provenance.files.length < 6 || provenance.files.length > 1000
      || !Array.isArray(provenance.method_entries) || !object(provenance.next_action) || provenance.next_action.started !== false
      || typeof provenance.readiness_record !== "string" || !provenance.readiness_record.startsWith("https://")) throw new Error("unsupported or malformed Matt-first provenance");
    if (recoveryJournal) {
      const expected = [...provenance.files, { path: PROVENANCE, mode: "0644", size: provenanceBytes.length, sha256: hash(provenanceBytes) }].sort((a, b) => a.path.localeCompare(b.path, "en"));
      if (JSON.stringify(recoveryJournal.candidate) !== JSON.stringify(provenance.candidate)
        || !recoveryJournal.files.some((file) => file.path === STATE)
        || JSON.stringify(recoveryJournal.files.filter((file) => file.path !== STATE)) !== JSON.stringify(expected)
        || recoveryJournal.local_git !== (provenance.configuration.initialize_git ? "verified" : "not-selected")) throw new Error("recovery evidence differs from installed candidate/configuration/file boundaries");
      if (provenance.configuration.adoption && JSON.stringify(recoveryJournal.baseline) !== JSON.stringify(provenance.ownership)) throw new Error("scoped recovery baseline differs from accepted provenance");
      if (provenance.configuration.initialize_git) await verifyLocalGit(resolved);
    }
    const seen = new Set();
    for (const file of provenance.files) {
      if (!identityValid(file) || seen.has(file.path) || file.path === PROVENANCE || file.path.startsWith(".factory/creator/") || file.path.startsWith(".factory-template-creator/")) throw new Error("invalid/duplicate/reserved provenance file boundary");
      seen.add(file.path);
      const current = await regular(resolved, file.path);
      if (current.mode !== parseInt(file.mode, 8) || current.bytes.length !== file.size || hash(current.bytes) !== file.sha256) throw new Error(`installed bytes or mode differ: ${file.path}`);
    }
    if (!["start.mjs", ".factory/start.mjs"].includes(provenance.startup)
      || provenance.startup !== (provenance.configuration.adoption?.startup ?? "start.mjs")) throw new Error("startup path differs from accepted configuration");
    for (const required of ["AGENT.md", provenance.startup, "docs/bindings.md", ".factory/procedures.md", ".factory/skills/matt-pocock/LICENSE", ".factory/skills/foundry-checkpoint/SKILL.md", ".factory/skills/foundry-resume/SKILL.md", ...provenance.method_entries]) {
      if (!seen.has(required)) throw new Error(`required indexed source absent: ${required}`);
    }
    let ownership = "missing: read-only discovery allowed; managed mutation needs inspected accepted ownership establishment";
    if (await metadata(path.join(resolved, STATE))) {
      if (!recoveryJournal) throw new Error("local ledger is missing its retained committed recovery evidence");
      const { value: state, mode, bytes: stateBytes } = await readJson(resolved, STATE);
      const boundary = recoveryJournal.files.find((file) => file.path === STATE);
      if (!boundary || mode !== parseInt(boundary.mode, 8) || stateBytes.length !== boundary.size || hash(stateBytes) !== boundary.sha256) throw new Error("present ledger differs from its committed recovery identity; no ownership inference");
      if (mode !== 0o600 || state.schema_version !== 2 || state.profile !== "matt-first" || state.provenance_digest !== `sha256:${hash(provenanceBytes)}`
        || state.config_digest !== provenance.config_digest || state.candidate_digest !== provenance.candidate.candidate_digest
        || !Array.isArray(state.owned_files) || state.owned_files.length !== provenance.files.length + 1) throw new Error("ledger does not match installed provenance; no ownership inference");
      const owned = new Set();
      for (const file of state.owned_files) {
        if (!ownershipValid(file) || owned.has(file.path)) throw new Error("invalid owned file/block boundary");
        owned.add(file.path);
        const current = await regular(resolved, file.path);
        if (current.mode !== parseInt(file.mode, 8) || hash(current.bytes) !== file.sha256 || current.bytes.length !== file.size) throw new Error(`owned file drift: ${file.path}`);
        if (file.before !== "absent") {
          const before = await regular(resolved, `${STAGING}/before/${file.path}`);
          if (before.mode !== parseInt(file.before.mode, 8) || before.bytes.length !== file.before.size || hash(before.bytes) !== file.before.sha256) throw new Error(`private baseline differs: ${file.path}`);
          if (file.boundary === "block") {
            const begin = Buffer.from(`${file.block.begin}\n`);
            const index = current.bytes.indexOf(begin);
            if (index < 0 || current.bytes.indexOf(begin, index + begin.length) !== -1
              || !current.bytes.subarray(0, before.bytes.length).equals(before.bytes)
              || hash(current.bytes.subarray(index)) !== file.block.sha256) throw new Error(`owned block/context differs: ${file.path}`);
          }
        }
      }
      if (owned.size !== seen.size + 1 || !owned.has(PROVENANCE) || [...seen].some((relative) => !owned.has(relative))) throw new Error("ledger file set differs from provenance");
      if (provenance.configuration.adoption && JSON.stringify(state.owned_files.filter((file) => file.path !== PROVENANCE)) !== JSON.stringify(provenance.ownership)) throw new Error("ledger boundaries differ from accepted provenance");
      ownership = "exact schema-2 file/block boundaries and protected context verified; no directory ownership";
    }
    const finalRoot = await metadata(resolved);
    if (!finalRoot?.isDirectory() || finalRoot.dev !== rootIdentity.dev || finalRoot.ino !== rootIdentity.ino || await realpath(resolved) !== resolved) throw new Error("workspace identity changed during read-only diagnosis");
    return { ...result, mode: USABLE, status: "usable", integrity: "verified", ownership,
      readiness: { record: provenance.readiness_record, observed_by_startup: false, required: "Fresh permitted tracker identity/access/write-readback and genuinely independent selected-host manual discovery. Consult the exact scoped record; file integrity is not readiness." },
      next_action: provenance.next_action,
      diagnostics: [{ code: "readiness_not_observed", message: "Startup is passive and does not fetch tracker evidence or launch validation. Setup remains incomplete until required observations are confirmed on the bound tracker." }] };
  } catch (error) {
    return { ...result, mode: UNSAFE, status: "error", integrity: "failed", diagnostics: [{ code: "unsafe_foundation", message: String(error.message).slice(0, 1024) }] };
  }
};
export const route = async (root) => {
  const result = await detectMode(root);
  const message = result.mode === SELF
    ? "SELF mode - archetype development (this repo IS the template).\n  - DO NOT apply the creator package to this repo: it is the source archetype.\n  - Follow MAINTAINERS.md + templates/agent-runbook.md.\n  - Work only the authorized issue through GitHub Issues / Project #1."
    : result.mode === USABLE
      ? "USABLE installed Matt-first foundation; file integrity verified, external readiness NOT observed by startup.\nRead AGENT.md, docs/bindings.md and .factory/procedures.md. Consult the scoped tracker readiness record.\nProposed next action: explicitly select grill-with-docs for the authorized project objective. Planning has NOT started."
      : result.mode === INCOMPLETE
        ? "INCOMPLETE setup. Inspect diagnostics and exact applied/pending effects. Do not replay an interrupted apply or start planning."
        : "UNSAFE/unrecognized foundation. Stop affected use; inspect exact diagnostics before an authorized repair.";
  return { schema_version: 2, root: path.resolve(root), ...result, message };
};
export const main = async (argv = process.argv.slice(2)) => {
  let root = process.cwd();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--cwd" || argv[index] === "-C") root = argv[++index];
    else if (argv[index] === "--json") json = true;
    else if (argv[index] === "--help") { process.stdout.write("Usage: node start.mjs [--cwd <directory>] [--json]\n"); return 0; }
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (!root) throw new Error("--cwd requires a directory");
  const result = await route(root);
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.message}\n${result.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n")}\n`);
  return result.mode === UNSAFE ? 1 : 0;
};
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`error[startup]: ${error.message}\n`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import { access, lstat, readFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STARTUP_SCHEMA_VERSION = 1;
export const SELF = "SELF";
export const SETUP = "SETUP";
export const WORK = "WORK";
export const SOURCE_MARKER = "MAINTAINERS.md";

const MAX_DIAGNOSTICS = 8;
const MAX_DIAGNOSTIC_CHARS = 512;
const MAX_JSON_BYTES = 10 * 1024 * 1024;
const REQUIRED_WORK_FILES = [
  "AGENT.md",
  "docs/bindings.md",
  "templates/agent-runbook.md",
];

const messages = {
  [SELF]: [
    "SELF mode - archetype development (this repo IS the template).",
    "  - DO NOT apply the creator package to this repo: it is the source archetype.",
    "  - Follow MAINTAINERS.md + templates/agent-runbook.md.",
    "  - Next: choose the next actionable issue from the backlog",
    "    (gh issue list -R eff3ct0/factory-template --label type:product / Project #1)",
    "    and announce 'Working #<n>'.",
  ].join("\n"),
  [SETUP]: [
    "SETUP mode - uninitialized instance (placeholders.json exists).",
    "  - Follow docs/agent-init.md; detect the stack.",
    "  - Use the exact-version creator package documented in docs/creator.md.",
    "  - Review the plan, then apply and verify with the package CLI.",
    "  - No outward action without explicit approval.",
  ].join("\n"),
  [WORK]: [
    "WORK mode - initialized project (placeholders.json is absent).",
    "  - Follow AGENT.md + templates/agent-runbook.md.",
    "  - Next: choose the next actionable ticket from the bound tracker",
    "    (docs/bindings.md) and announce 'Working <ID>'.",
  ].join("\n"),
};

const bounded = (value, limit = MAX_DIAGNOSTIC_CHARS) => String(value).replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, limit);
const diagnostic = (code, message, relativePath) => ({
  code,
  message: bounded(message),
  ...(relativePath ? { path: bounded(relativePath) } : {}),
});

const exists = async (file) => access(file, constants.F_OK).then(() => true).catch(() => false);

const readJson = async (file, label) => {
  const entry = await lstat(file).catch(() => undefined);
  if (!entry?.isFile()) throw new Error(`${label} must be a regular file`);
  if (entry.size > MAX_JSON_BYTES) throw new Error(`${label} exceeds the ${MAX_JSON_BYTES} byte limit`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
};

export const isTemplate = async (root) => {
  const marker = await lstat(path.join(root, SOURCE_MARKER)).catch(() => undefined);
  return marker?.isFile() === true;
};

const layoutPath = async (root, relative) => {
  const direct = path.join(root, relative);
  if (await exists(direct)) return relative;
  const factory = path.join(root, ".factory", relative);
  if (await exists(factory)) return `.factory/${relative}`;
  return relative;
};

const setupMessage = async (root) => {
  let message = messages[SETUP];
  message = message.replaceAll("docs/agent-init.md", await layoutPath(root, "docs/agent-init.md"));
  return message;
};

const workMessage = async (root) => {
  let message = messages[WORK];
  message = message.replaceAll("templates/agent-runbook.md", await layoutPath(root, "templates/agent-runbook.md"));
  message = message.replaceAll("docs/bindings.md", await layoutPath(root, "docs/bindings.md"));
  return message;
};

const validatePlaceholders = async (root) => {
  const value = await readJson(path.join(root, "placeholders.json"), "placeholders.json");
  if (!value || typeof value !== "object" || !Array.isArray(value.placeholders)) {
    throw new Error("placeholders.json must contain a placeholders array");
  }
};

const validateCreatorState = async (root) => {
  const directory = path.join(root, ".factory-template-creator");
  const entry = await lstat(directory).catch(() => undefined);
  if (!entry) return { present: false, incomplete: false };
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("creator state path must be a directory");
  const statePath = path.join(directory, "state.json");
  if (!(await exists(statePath))) return { present: true, incomplete: true };
  const state = await readJson(statePath, "creator state");
  if (!state || typeof state !== "object" || state.schema_version !== 1 || typeof state.payload_version !== "string" || typeof state.payload_digest !== "string" || typeof state.config_digest !== "string" || !Array.isArray(state.owned_files)) {
    throw new Error("creator state is malformed");
  }
  return { present: true, incomplete: false };
};

const workFiles = async (root) => {
  const paths = [];
  for (const relative of REQUIRED_WORK_FILES) paths.push(await layoutPath(root, relative));
  return paths;
};

export const detectMode = async (root) => {
  const resolved = path.resolve(root);
  const entry = await lstat(resolved).catch(() => undefined);
  if (!entry?.isDirectory()) return { mode: "ERROR", status: "error", diagnostics: [diagnostic("workspace_invalid", "startup root must be a directory")] };
  if (await isTemplate(resolved)) return { mode: SELF, status: "ready", diagnostics: [] };

  const placeholders = await exists(path.join(resolved, "placeholders.json"));
  if (placeholders) {
    try {
      await validatePlaceholders(resolved);
      return { mode: SETUP, status: "ready", diagnostics: [] };
    } catch (error) {
      return { mode: "ERROR", status: "error", diagnostics: [diagnostic("setup_malformed", error.message, "placeholders.json")] };
    }
  }

  try {
    const state = await validateCreatorState(resolved);
    const files = await workFiles(resolved);
    const present = await Promise.all(files.map((relative) => exists(path.join(resolved, relative))));
    if (state.incomplete) {
      return { mode: SETUP, status: "incomplete", diagnostics: [diagnostic("creator_incomplete", "creator state exists without a completed state file", ".factory-template-creator")] };
    }
    if (present.every(Boolean)) return { mode: WORK, status: "ready", diagnostics: [] };
    if (present.every((value) => !value)) {
      return { mode: SETUP, status: "incomplete", diagnostics: [diagnostic("project_incomplete", "generated project contracts are not present")] };
    }
    return { mode: "ERROR", status: "error", diagnostics: [diagnostic("project_malformed", "generated project is missing one or more required contracts")] };
  } catch (error) {
    return { mode: "ERROR", status: "error", diagnostics: [diagnostic("state_malformed", error.message, ".factory-template-creator/state.json")] };
  }
};

export const route = async (root) => {
  const resolved = path.resolve(root);
  const result = await detectMode(resolved);
  const message = result.mode === SELF ? messages[SELF] : result.mode === SETUP ? await setupMessage(resolved) : result.mode === WORK ? await workMessage(resolved) : "Startup routing failed closed; inspect diagnostics and repair the workspace before continuing.";
  return {
    schema_version: STARTUP_SCHEMA_VERSION,
    root: resolved,
    mode: result.mode,
    status: result.status,
    message,
    diagnostics: result.diagnostics.slice(0, MAX_DIAGNOSTICS),
  };
};

const jsonOutput = (result) => `${JSON.stringify(result, null, 2)}\n`;

const selfCheck = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-startup-"));
  try {
    await writeFile(path.join(directory, "MAINTAINERS.md"), "maintainer\n");
    assert((await detectMode(directory)).mode === SELF, "source fixture is not SELF");
    await rm(path.join(directory, "MAINTAINERS.md"));
    await writeFile(path.join(directory, "placeholders.json"), JSON.stringify({ placeholders: [] }));
    assert((await detectMode(directory)).mode === SETUP, "setup fixture is not SETUP");
    await rm(path.join(directory, "placeholders.json"));
    for (const relative of REQUIRED_WORK_FILES) {
      await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
      await writeFile(path.join(directory, relative), "generated\n");
    }
    assert((await detectMode(directory, undefined)).mode === WORK, "work fixture is not WORK");
    await writeFile(path.join(directory, "placeholders.json"), "{");
    assert((await detectMode(directory, undefined)).status === "error", "malformed fixture did not fail closed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const parseArgs = (argv) => {
  let root = process.cwd();
  let json = false;
  let check = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd" || arg === "-C") root = argv[++index] ?? "";
    else if (arg === "--json") json = true;
    else if (arg === "--self-check") check = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!root) throw new Error("--cwd requires a directory");
  return { root, json, check, help };
};

export const main = async (argv = process.argv.slice(2)) => {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write("Usage: node start.mjs [--cwd <directory>] [--json] [--self-check]\n");
    return 0;
  }
  if (parsed.check) {
    await selfCheck();
    process.stdout.write("startup self-check OK\n");
    return 0;
  }
  const result = await route(parsed.root);
  if (parsed.json) process.stdout.write(jsonOutput(result));
  else if (result.status !== "error") process.stdout.write(`${result.message}\n`);
  if (result.status === "error") process.stderr.write(`error[startup_routing]: ${result.message}\n`);
  return result.status === "error" ? 1 : 0;
};

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    const result = {
      schema_version: STARTUP_SCHEMA_VERSION,
      root: path.resolve(process.cwd()),
      mode: "ERROR",
      status: "error",
      message: "Startup routing failed closed; inspect diagnostics and repair the workspace before continuing.",
      diagnostics: [diagnostic("startup_invalid", error.message)],
    };
    if (process.argv.includes("--json")) process.stdout.write(jsonOutput(result));
    process.stderr.write(`error[startup_invalid]: ${bounded(error.message)}\n`);
    process.exitCode = 1;
  }).then((code) => {
    if (typeof code === "number") process.exitCode = code;
  });
}

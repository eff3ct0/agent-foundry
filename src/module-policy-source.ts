import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { checkModulePolicy, type ModulePolicyDiagnostic } from "./module-policy";

const execFileAsync = promisify(execFile);
type FileMode = "100644" | "100755";
export interface SourceFileIdentity {
  path: string;
  kind: "file";
  mode: FileMode;
}

export interface SourceModuleInventory {
  tracked: SourceFileIdentity[];
  payload: SourceFileIdentity[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const relativeFile = (value: unknown): string => {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") ||
    value.startsWith("/") || /^[A-Za-z]:/u.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`invalid source inventory path: ${String(value)}`);
  }
  return value;
};

const mode = (value: unknown): FileMode => {
  if (value !== "100644" && value !== "100755") throw new Error(`invalid source inventory mode: ${String(value)}`);
  return value;
};

const onDisk = async (root: string, relative: string, expected: FileMode): Promise<SourceFileIdentity> => {
  const parts = relativeFile(relative).split("/");
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) throw new Error(`source inventory symlink: ${relative}`);
    if (index < parts.length - 1 && !entry.isDirectory()) {
      throw new Error(`source inventory parent is not a directory: ${relative}`);
    }
    if (index === parts.length - 1) {
      if (!entry.isFile()) throw new Error(`source inventory is not a file: ${relative}`);
      const actual = entry.mode & 0o111 ? "100755" : "100644";
      if (actual !== expected) throw new Error(`source inventory mode mismatch: ${relative}`);
    }
  }
  return { path: relative, kind: "file", mode: expected };
};

const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));

/** Inventory the Git index and the checked-in payload declaration; never follow source symlinks. */
export const inventorySourceModules = async (directory: string): Promise<SourceModuleInventory> => {
  const root = path.resolve(directory);
  const rootEntry = await lstat(root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw new Error("source inventory root must be a real directory");
  const { stdout: toplevel } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: root });
  if (path.resolve(toplevel.trim()) !== root) throw new Error("source inventory requires a Git repository root");
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage", "-z"], {
    cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (bytes.length && bytes.at(-1) !== 0) throw new Error("unterminated Git source inventory");
  const entries = bytes.length ? bytes.subarray(0, -1).toString("utf8").split("\0") : [];
  // Reject lossy decoding of Git path bytes, not just malformed UTF-8 or duplicate decoded identities.
  if (!Buffer.from(entries.join("\0") + (bytes.length ? "\0" : "")).equals(bytes)) {
    throw new Error("invalid Git source inventory encoding");
  }
  const tracked: SourceFileIdentity[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const match = /^([0-7]{6}) [0-9a-f]{40,64} ([0-3])\t(.*)$/us.exec(entry);
    if (!match || match[2] !== "0") throw new Error(`invalid or unmerged Git source entry: ${entry}`);
    const file = relativeFile(match[3]);
    if (seen.has(file)) throw new Error(`duplicate source inventory identity: ${file}`);
    seen.add(file);
    tracked.push(await onDisk(root, file, mode(match[1])));
  }
  tracked.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  if (!seen.has("package/payload-files.json") || !seen.has("package/payload-manifest.json")) {
    throw new Error("source payload declarations must be tracked regular files");
  }

  const declaration = await json(path.join(root, "package", "payload-files.json"));
  const manifest = await json(path.join(root, "package", "payload-manifest.json"));
  if (!record(declaration) || !Array.isArray(declaration.paths) ||
    !record(manifest) || !Array.isArray(manifest.files)) {
    throw new Error("invalid source payload declaration");
  }
  const declared = new Set<string>();
  for (const item of declaration.paths) {
    const file = relativeFile(item);
    if (declared.has(file)) throw new Error(`duplicate payload declaration: ${file}`);
    declared.add(file);
  }
  const byPath = new Map(tracked.map((file) => [file.path, file]));
  const payload: SourceFileIdentity[] = [];
  const payloadSeen = new Set<string>();
  for (const item of manifest.files) {
    if (!record(item)) throw new Error("invalid source payload entry");
    const file = relativeFile(item.path);
    const expected = mode(item.mode);
    if (payloadSeen.has(file)) throw new Error(`duplicate payload identity: ${file}`);
    payloadSeen.add(file);
    if (!declared.has(file) || byPath.get(file)?.mode !== expected) {
      throw new Error(`payload is not a matching tracked file: ${file}`);
    }
    payload.push({ path: file, kind: "file", mode: expected });
  }
  if (payloadSeen.size !== declared.size || [...declared].some((file) => !payloadSeen.has(file))) {
    throw new Error("payload manifest and declaration differ");
  }
  payload.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { tracked, payload };
};

/** Source-only adapter: no caller-supplied generated ownership or compiler exemptions. */
export const checkSourceModulePolicy = async (root: string): Promise<ModulePolicyDiagnostic[]> => {
  const { tracked, payload } = await inventorySourceModules(root);
  return checkModulePolicy({ tracked, payload, generated: [], generatedApplication: [], compiled: [] });
};

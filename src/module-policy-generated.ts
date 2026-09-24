import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { preparePlan, STATE_FILE, type CreatorOptions } from "./creator";
import { checkModulePolicy, type ModulePolicyDiagnostic } from "./module-policy";

const digest = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const onDisk = async (root: string, relative: string): Promise<{ mode: number; bytes: Buffer }> => {
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) throw new Error(`generated inventory symlink: ${relative}`);
    if (index < parts.length - 1 && !entry.isDirectory()) {
      throw new Error(`generated inventory parent is not a directory: ${relative}`);
    }
    if (index === parts.length - 1) {
      if (!entry.isFile()) throw new Error(`generated inventory is not a file: ${relative}`);
      return { mode: entry.mode & 0o7777, bytes: await readFile(current) };
    }
  }
  throw new Error(`invalid generated inventory path: ${relative}`);
};

const scanFactory = async (root: string, relative = ".factory"): Promise<string[]> => {
  const absolute = path.join(root, relative);
  const entry = await lstat(absolute);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`generated inventory unsafe directory: ${relative}`);
  const found: string[] = [];
  for (const name of (await readdir(absolute)).sort(compare)) {
    const child = `${relative}/${name}`;
    const stat = await lstat(path.join(root, child));
    if (stat.isSymbolicLink()) throw new Error(`generated inventory symlink: ${child}`);
    if (stat.isDirectory()) found.push(...await scanFactory(root, child));
    else if (stat.isFile()) found.push(child);
    else throw new Error(`generated inventory unsupported entry: ${child}`);
  }
  return found;
};

/** Recompose ownership from the packaged creator, then reconcile state and disk; state alone grants no exception. */
export const checkGeneratedModulePolicy = async (
  options: Pick<CreatorOptions, "target" | "configPath" | "agent" | "agents">,
): Promise<ModulePolicyDiagnostic[]> => {
  const planned = await preparePlan({ ...options, command: "verify", nonInteractive: true });
  if (!planned.targetExisted || !planned.stateBytes || !planned.state || !planned.files.length ||
    planned.envelope.diagnostics.some((item) => item.code !== "unknown_file_conflict") ||
    planned.envelope.operations.some((operation) => operation.action !== "noop")) {
    throw new Error("generated inventory does not match the composed creator plan");
  }
  const root = planned.target;
  const rootEntry = await lstat(root);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) throw new Error("generated inventory root is not a real directory");
  const expected = new Map(planned.files.map((file) => [file.relativePath, file]));
  if (expected.size !== planned.files.length || !expected.has(STATE_FILE) ||
    !planned.state.owned_files || planned.state.owned_files.length !== expected.size - 1) {
    throw new Error("generated inventory has inconsistent creator identities");
  }
  const stateDisk = await onDisk(root, STATE_FILE);
  if (!stateDisk.bytes.equals(planned.stateBytes)) throw new Error("generated inventory creator state differs from composed plan");
  const owned = new Set<string>();
  for (const entry of planned.state.owned_files) {
    const file = expected.get(entry.path);
    if (!file || entry.path === STATE_FILE || owned.has(entry.path) ||
      entry.mode !== file.mode.toString(8).padStart(4, "0") || entry.size !== file.size || entry.sha256 !== file.sha256) {
      throw new Error("generated inventory creator state has unplanned ownership");
    }
    owned.add(entry.path);
  }
  for (const file of planned.files) {
    const disk = await onDisk(root, file.relativePath);
    if (disk.mode !== file.mode || disk.bytes.length !== file.size || digest(disk.bytes) !== file.sha256) {
      throw new Error(`generated inventory owned file drift: ${file.relativePath}`);
    }
  }
  const generated = new Set(owned);
  for (const file of await scanFactory(root)) generated.add(file);
  return checkModulePolicy({
    tracked: [], payload: [], generated: [...generated].sort(compare), generatedApplication: [], compiled: [],
  });
};

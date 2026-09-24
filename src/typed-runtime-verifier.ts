import { lstat, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emitTypedModules } from "./typed-module-emitter";

const filesIn = async (root: string, relative = ""): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(root, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`typed runtime contains a non-file entry: ${name}`);
  }
  return files.sort();
};

/** Compare a fresh compiler result with checked-in runtime bytes; never rewrite them. */
export const verifyTypedRuntime = async (source: string, committed: string): Promise<string[]> => {
  if (!(await lstat(committed)).isDirectory()) throw new Error("typed runtime must be a directory");
  const scratch = await mkdtemp(path.join(os.tmpdir(), "typed-runtime-verify-"));
  try {
    const output = path.join(scratch, "output");
    await emitTypedModules(source, output);
    const expected = await filesIn(output);
    const actual = await filesIn(committed);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`typed runtime file set differs: expected ${expected.join(", ")}; found ${actual.join(", ")}`);
    }
    for (const file of expected) {
      const compiled = await readFile(path.join(output, file));
      const checkedIn = await readFile(path.join(committed, file));
      if (!compiled.equals(checkedIn)) throw new Error(`typed runtime bytes differ: ${file}`);
    }
    return expected;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

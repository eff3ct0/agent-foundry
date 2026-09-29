#!/usr/bin/env node
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const requiredRoot = [".gitignore", "AGENT.md", "CLAUDE.md", "README.md", "start.mjs", "docs/bindings.md"];
const optionalOutputs = [".github/workflows/ci.yml"];
const requiredSupport = ["docs", "hooks", "scripts", "templates"];
const inheritedFiles = [".factory/docs/factory-layout.md", ".factory/hooks/README.md", ".factory/scripts/check-factory-layout.mjs", ".factory/templates/agent-runbook.md"];

export const check = async (projectRoot) => {
  const errors = [];
  const entry = async (relative) => lstat(path.join(projectRoot, relative)).catch((error) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  });
  for (const file of requiredRoot) {
    if (!(await entry(file))?.isFile()) errors.push(`required root file missing or not a file: ${file}`);
  }
  for (const file of optionalOutputs) {
    const present = await entry(file);
    if (present && !present.isFile()) errors.push(`generated output is not a file: ${file}`);
  }
  for (const directory of ["checks", "hooks", "scripts", "templates"]) {
    if (await entry(directory)) errors.push(`factory support directory remains at root: ${directory}`);
  }
  if (!(await entry(".factory"))?.isDirectory()) {
    errors.push("missing factory boundary: .factory");
  } else {
    for (const directory of [...requiredSupport, "checks"]) {
      const relative = `.factory/${directory}`;
      const present = await entry(relative);
      if ((directory !== "checks" || present) && !present?.isDirectory()) errors.push(`missing or invalid .factory directory: ${relative}`);
    }
    for (const file of inheritedFiles) {
      if (!(await entry(file))?.isFile()) errors.push(`inherited support file missing or not a file: ${file}`);
    }
    if (await entry(".factory/layout.json")) errors.push("obsolete factory pointer manifest: .factory/layout.json");
  }
  if ((await entry(".factory/docs"))?.isDirectory() && (await entry(inheritedFiles[0]))?.isFile()) {
    const text = await readFile(path.join(projectRoot, inheritedFiles[0]), "utf8");
    for (const file of [...requiredRoot, ...optionalOutputs]) {
      if (!text.includes(`\`${file}\``)) errors.push(`contract omits path: ${file}`);
    }
  }
  return errors;
};

export const selfCheck = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-layout-"));
  const target = (relative) => path.join(directory, relative);
  try {
    for (const file of [...requiredRoot, ...inheritedFiles]) {
      await mkdir(path.dirname(target(file)), { recursive: true });
      await writeFile(target(file), [...requiredRoot, ...optionalOutputs].map((item) => `\`${item}\``).join("\n"));
    }
    for (const child of requiredSupport) await mkdir(target(`.factory/${child}`), { recursive: true });
    assert.deepEqual(await check(directory), [], "optional absent paths must pass");
    await mkdir(target(".factory/checks"));
    await mkdir(target(".github/workflows"), { recursive: true });
    await writeFile(target(optionalOutputs[0]), "jobs: {}\n");
    assert.deepEqual(await check(directory), [], "optional present paths must pass");
    await rm(target(".factory/checks"), { recursive: true });
    await writeFile(target(".factory/checks"), "invalid\n");
    assert.deepEqual(await check(directory), ["missing or invalid .factory directory: .factory/checks"]);
    await rm(target(".factory/checks"));
    await rm(target(optionalOutputs[0]));
    await mkdir(target(optionalOutputs[0]));
    assert.deepEqual(await check(directory), ["generated output is not a file: .github/workflows/ci.yml"]);
    await rm(target(optionalOutputs[0]), { recursive: true });
    await rm(target(inheritedFiles[3]));
    assert.deepEqual(await check(directory), [`inherited support file missing or not a file: ${inheritedFiles[3]}`]);
    console.log("factory layout structural self-check OK");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const action = args.length === 0 || args.length === 1 && args[0] === "--self-check"
    ? selfCheck()
    : args.length === 2 && args[0] === "--target"
      ? check(path.resolve(args[1])).then((errors) => {
        if (errors.length) throw new Error(errors.join("\n"));
        console.log("factory layout OK");
      })
      : Promise.reject(new Error("usage: check-factory-layout.mjs [--self-check | --target <project-root>]"));
  action.catch((error) => { console.error(error.message); process.exitCode = 1; });
}

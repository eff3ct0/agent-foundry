#!/usr/bin/env node
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredRoot = [".gitignore", "AGENT.md", "CLAUDE.md", "README.md", "start.mjs", "docs/bindings.md"];
const optionalOutputs = [".github/workflows/ci.yml"];
const requiredSupport = ["docs", "hooks", "scripts", "templates"];
const optionalSupport = ["checks"];
const layoutContract = ".factory/docs/factory-layout.md";
const inheritedFiles = [layoutContract, ".factory/hooks/README.md", ".factory/scripts/check-factory-layout.mjs", ".factory/templates/agent-runbook.md"];

const walk = async (directory, relative = "") => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    result.push(name);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), name));
  }
  return result;
};

export const check = async (projectRoot) => {
  const entries = new Set(await walk(projectRoot));
  const errors = [];
  const kind = async (relative) => lstat(path.join(projectRoot, relative)).catch((error) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  });
  for (const file of requiredRoot) {
    if (!(await kind(file))?.isFile()) errors.push(`required root file missing or not a file: ${file}`);
  }
  for (const file of optionalOutputs) {
    if (entries.has(file) && !(await kind(file))?.isFile()) errors.push(`generated output is not a file: ${file}`);
  }
  for (const directory of ["checks", "hooks", "scripts", "templates"]) {
    if (entries.has(directory)) errors.push(`factory support directory remains at root: ${directory}`);
  }
  if (!(await kind(".factory"))?.isDirectory()) {
    errors.push("missing factory boundary: .factory");
  } else {
    for (const directory of [...requiredSupport, ...optionalSupport]) {
      const relative = `.factory/${directory}`;
      const entry = await kind(relative);
      if (requiredSupport.includes(directory) || entry) {
        if (!entry?.isDirectory()) errors.push(`missing or invalid .factory directory: ${relative}`);
      }
    }
    for (const file of inheritedFiles) {
      if (!(await kind(file))?.isFile()) errors.push(`inherited support file missing or not a file: ${file}`);
    }
  }
  const text = await readFile(path.join(projectRoot, layoutContract), "utf8").catch(() => "");
  for (const file of [...requiredRoot, ...optionalOutputs]) {
    if (!text.includes(`\`${file}\``)) errors.push(`contract omits path: ${file}`);
  }
  return errors;
};

const fixture = async (directory) => {
  const paths = [...requiredRoot, ...inheritedFiles];
  for (const file of paths) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, [...requiredRoot, ...optionalOutputs].map((item) => `\`${item}\``).join("\n"));
  }
  for (const child of requiredSupport) await mkdir(path.join(directory, ".factory", child), { recursive: true });
};

export const selfCheck = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-layout-"));
  const target = (relative) => path.join(directory, relative);
  try {
    await fixture(directory);
    assert.deepEqual(await check(directory), [], "minimal generated layout must pass");

    await mkdir(target(".factory/checks"));
    await mkdir(target(".github/workflows"), { recursive: true });
    await writeFile(target(".github/workflows/ci.yml"), "jobs: {}\n");
    assert.deepEqual(await check(directory), [], "optional checks and CI must pass when present");
    await rm(target(".factory/checks"), { recursive: true });
    await writeFile(target(".factory/checks"), "not a directory\n");
    assert.deepEqual(await check(directory), ["missing or invalid .factory directory: .factory/checks"]);
    await rm(target(".factory/checks"));

    await rm(target(".github/workflows/ci.yml"));
    await mkdir(target(".github/workflows/ci.yml"));
    assert.deepEqual(await check(directory), ["generated output is not a file: .github/workflows/ci.yml"]);
    await rm(target(".github/workflows/ci.yml"), { recursive: true });

    const inheritedChecker = ".factory/scripts/check-factory-layout.mjs";
    await rm(target(inheritedChecker));
    assert.deepEqual(await check(directory), [`inherited support file missing or not a file: ${inheritedChecker}`]);
    await writeFile(target(inheritedChecker), "inherited checker\n");

    await rm(target("docs/bindings.md"));
    assert.deepEqual(await check(directory), ["required root file missing or not a file: docs/bindings.md"]);
    await writeFile(target("docs/bindings.md"), "bindings\n");

    await rm(target(".factory/hooks"), { recursive: true });
    assert.deepEqual(await check(directory), [
      "missing or invalid .factory directory: .factory/hooks",
      "inherited support file missing or not a file: .factory/hooks/README.md",
    ]);
    await mkdir(target(".factory/hooks"));
    await writeFile(target(".factory/hooks/README.md"), "inherited hooks\n");

    await mkdir(target("scripts"));
    assert.deepEqual(await check(directory), ["factory support directory remains at root: scripts"]);
    await rm(target("scripts"), { recursive: true });
    assert.deepEqual(await check(directory), []);
    console.log("factory layout structural self-check OK");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) selfCheck().catch((error) => { console.error(error); process.exitCode = 1; });

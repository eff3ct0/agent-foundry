#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, ".github", "labels.json");

const invalidCatalog = () => new Error("labels.json must contain unique non-empty label names");

export const loadLabels = async (file = catalogPath) => {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const labels = parsed.labels;
  if (!Array.isArray(labels) || labels.length === 0) throw invalidCatalog();
  const names = labels.map((label) => label?.name);
  if (names.some((name) => typeof name !== "string" || name.length === 0) || new Set(names).size !== names.length) {
    throw invalidCatalog();
  }
  for (const label of labels) {
    if (typeof label.color !== "string" || label.color.length === 0 || typeof label.description !== "string" || label.description.length === 0) {
      throw new Error("each label needs color and description");
    }
  }
  return labels;
};

const commandFor = (label, repo) => [
  "label", "create", label.name, "--color", label.color, "--description", label.description, "--force",
  ...(repo ? ["--repo", repo] : []),
];

export const syncLabels = (labels, { repo, dryRun = false, runner = spawnSync } = {}) => {
  for (const label of labels) {
    const args = commandFor(label, repo);
    if (dryRun) {
      process.stdout.write(`Would run: gh ${args.join(" ")}\n`);
      continue;
    }
    const result = runner("gh", args, { cwd: root, encoding: "utf8", shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr?.trim() || `gh exited with status ${result.status}`);
  }
};

const parseArguments = (values) => {
  const options = { dryRun: false, selfCheck: false, repo: undefined };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--self-check") options.selfCheck = true;
    else if (value === "--repo") {
      options.repo = values[index + 1];
      if (!options.repo || options.repo.startsWith("-")) throw new Error("--repo requires OWNER/REPO");
      index += 1;
    } else throw new Error(`unknown argument: ${value}`);
  }
  return options;
};

export const main = async (values = process.argv.slice(2)) => {
  const options = parseArguments(values);
  const labels = await loadLabels();
  if (options.selfCheck) {
    syncLabels(labels.slice(0, 1), { repo: "acme/example", dryRun: true });
    process.stdout.write("self-check OK\n");
    return;
  }
  syncLabels(labels, options);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

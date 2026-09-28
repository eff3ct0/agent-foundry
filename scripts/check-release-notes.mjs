#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  /\bfetch\s*\(/u,
  /node:(?:http|https|net|tls)\b/u,
  /\bprocess\.env\b/u,
  /\bDate(?:\.now)?\b/u,
  /\bMath\.random\b/u,
  /crypto\.randomUUID/u,
  /NPM_TOKEN|GITHUB_TOKEN/u,
];

export class ReleaseNotesContractError extends Error {}
const fail = (message) => { throw new ReleaseNotesContractError(message); };

export const check = async (projectRoot = root) => {
  const source = await readFile(path.join(projectRoot, "scripts", "release-notes.mjs"), "utf8");
  for (const pattern of forbidden) if (pattern.test(source)) fail(`release notes generator contains forbidden nondeterministic or remote input: ${pattern}`);
  for (const required of [
    "export const generateReleaseNotes",
    "export const readReleaseCommits",
    '"merge-base", "--is-ancestor"',
    '"--no-merges", "--format=%H%x00%s", "--no-decorate"',
    "normalized.sort(",
    "Source commit:",
    "Commit range:",
  ]) if (!source.includes(required)) fail(`release notes generator is missing deterministic contract: ${required}`);
  return "release notes deterministic contract OK";
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  check().then(console.log).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

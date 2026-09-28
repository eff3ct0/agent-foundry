#!/usr/bin/env node
import { execFile as executeFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { validateTag } from "./release-ref.mjs";

const execFile = promisify(executeFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SUBJECT = /^[^\r\n]+$/u;
const CONVENTIONAL = /^(?<type>feat|fix|perf|refactor|docs|build|ci|test|chore|revert)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?: (?<subject>.+)$/u;
const SECTION_ORDER = Object.freeze([
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactoring"],
  ["docs", "Documentation"],
  ["build", "Build"],
  ["ci", "CI"],
  ["test", "Tests"],
  ["chore", "Chores"],
  ["revert", "Reverts"],
  ["other", "Other changes"],
]);
const sectionNames = new Map(SECTION_ORDER);

export class ReleaseNotesError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message = code) => { throw new ReleaseNotesError(code, message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const validateSha = (value, name) => {
  if (typeof value !== "string" || !SHA.test(value)) fail(`${name}_invalid`, `${name} must be a full lowercase commit SHA`);
  return value;
};

const validateVersion = (value) => {
  if (typeof value !== "string" || !VERSION.test(value)) fail("version_invalid", "version must be an exact semver version");
  return value;
};

const validatePreviousTag = (value) => {
  try { return validateTag(value); } catch { fail("previous_tag_invalid", "previous tag must be a safe Git ref"); }
};

const normalizeCommit = (value) => {
  if (!object(value)) fail("commit_invalid", "release commit must be an object");
  const sha = validateSha(value.sha, "commit SHA");
  if (typeof value.subject !== "string" || !SUBJECT.test(value.subject) || value.subject.trim() !== value.subject) {
    fail("commit_subject_invalid", "release commit subject must be one non-empty line");
  }
  const match = CONVENTIONAL.exec(value.subject);
  return {
    sha,
    subject: match?.groups.subject ?? value.subject,
    scope: match?.groups.scope ?? "",
    type: match?.groups.type ?? "other",
    breaking: Boolean(match?.groups.breaking),
  };
};

export const generateReleaseNotes = ({ packageName, version, sourceSha, previousTag, commits }) => {
  if (typeof packageName !== "string" || packageName.trim() !== packageName || packageName.length === 0) {
    fail("package_name_invalid", "package name must be a non-empty string");
  }
  validateVersion(version);
  validateSha(sourceSha, "source SHA");
  validatePreviousTag(previousTag);
  if (!Array.isArray(commits)) fail("commits_invalid", "release commits must be an array");

  const normalized = commits.map(normalizeCommit);
  const seen = new Set();
  for (const commit of normalized) {
    if (seen.has(commit.sha)) fail("duplicate_commit", `release commit is listed more than once: ${commit.sha}`);
    seen.add(commit.sha);
  }
  normalized.sort((left, right) => compare(left.type, right.type) || compare(left.subject, right.subject)
    || compare(left.scope, right.scope) || compare(left.sha, right.sha));

  const grouped = new Map(SECTION_ORDER.map(([type]) => [type, []]));
  for (const commit of normalized) grouped.get(commit.type).push(commit);
  const lines = [
    `# ${packageName} v${version}`,
    "",
    `Source commit: \`${sourceSha}\``,
    `Commit range: \`${previousTag}..${sourceSha}\``,
    "",
  ];
  let hasChanges = false;
  for (const [type] of SECTION_ORDER) {
    const changes = grouped.get(type);
    if (changes.length === 0) continue;
    hasChanges = true;
    lines.push(`## ${sectionNames.get(type)}`, "");
    for (const change of changes) {
      const scope = change.scope ? `**${change.scope}:** ` : "";
      const breaking = change.breaking ? " **(breaking)**" : "";
      lines.push(`- ${scope}${change.subject}${breaking} (\`${change.sha}\`)`);
    }
    lines.push("");
  }
  if (!hasChanges) lines.push("## Changes", "", "- No changes recorded.", "");
  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
};

const parseGitLog = (stdout) => {
  if (typeof stdout !== "string" || stdout.length === 0) return [];
  return stdout.split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf("\0");
    if (separator <= 0) fail("git_log_invalid", "git log output is malformed");
    return { sha: line.slice(0, separator), subject: line.slice(separator + 1) };
  });
};

const defaultGit = async (args) => execFile("git", args, { cwd: root, maxBuffer: 1024 * 1024 });

export const readReleaseCommits = async ({ previousTag, sourceSha, runGit = defaultGit }) => {
  validatePreviousTag(previousTag);
  validateSha(sourceSha, "source SHA");
  if (typeof runGit !== "function") fail("git_runner_invalid", "Git runner must be a function");
  try {
    await runGit(["merge-base", "--is-ancestor", previousTag, sourceSha]);
  } catch {
    fail("unrelated_history", "previous tag must be an ancestor of the source commit");
  }
  const result = await runGit(["log", "--no-merges", "--format=%H%x00%s", "--no-decorate", `${previousTag}..${sourceSha}`]);
  return parseGitLog(result.stdout);
};

const parseArgs = (values) => {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!["--version", "--source-sha", "--previous-tag", "--output"].includes(name)
        || typeof value !== "string" || value.length === 0 || options[name]) fail("invalid_arguments", "usage: release-notes.mjs --version <version> --source-sha <sha> --previous-tag <tag> [--output <file>]");
    options[name] = value;
  }
  if (!["--version", "--source-sha", "--previous-tag"].every((name) => options[name])) fail("invalid_arguments", "usage: release-notes.mjs --version <version> --source-sha <sha> --previous-tag <tag> [--output <file>]");
  return options;
};

export const main = async (values = process.argv.slice(2)) => {
  const options = parseArgs(values);
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (packageJson.version !== options["--version"]) fail("package_version_mismatch", "requested version does not match package.json");
  const sourceSha = validateSha(options["--source-sha"], "source SHA");
  const previousTag = validatePreviousTag(options["--previous-tag"]);
  const commits = await readReleaseCommits({ previousTag, sourceSha });
  const notes = generateReleaseNotes({ packageName: packageJson.name, version: packageJson.version, sourceSha, previousTag, commits });
  if (options["--output"]) await writeFile(path.resolve(options["--output"]), notes, "utf8");
  return notes;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((notes) => {
    if (!process.argv.includes("--output")) process.stdout.write(notes);
  }).catch((error) => {
    process.stderr.write(`${error instanceof ReleaseNotesError ? error.code : error.message}\n`);
    process.exitCode = 1;
  });
}

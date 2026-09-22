#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, path.basename(path.dirname(scriptDirectory)) === ".factory" ? "../.." : "..");
const closeReference = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+))?#(?<number>[0-9]+)\b/giu;
const defaultTaskProvider = "github-issues";
const githubTaskProviders = new Set(["github-issues", "github-projects"]);
const taskReferences = {
  jira: /\bJira\s*:\s*[A-Za-z][A-Za-z0-9_]*-[0-9]+\b/iu,
  linear: /\bLinear\s*:\s*[A-Za-z][A-Za-z0-9_]*-[0-9]+\b/iu,
  custom: /\bTask\s*:\s*[A-Za-z0-9][A-Za-z0-9_.:/-]*\b/iu,
};

export const boundTaskProvider = async (projectRoot = root) => {
  const bindings = await readFile(path.join(projectRoot, "docs", "bindings.md"), "utf8").catch(() => undefined);
  return bindings?.match(/^> \*\*Capability:\*\* `task`\s*$\n^> \*\*Provider:\*\* `([^`]+)`$/mu)?.[1] ?? defaultTaskProvider;
};

export const issueNumbers = (body, repository = "") => {
  const references = [];
  const expectedRepository = repository.toLowerCase();
  for (const match of String(body ?? "").matchAll(closeReference)) {
    const qualified = match.groups.owner && `${match.groups.owner}/${match.groups.repo}`;
    if (qualified && qualified.toLowerCase() !== expectedRepository) continue;
    const number = Number.parseInt(match.groups.number, 10);
    if (!references.includes(number)) references.push(number);
  }
  return references;
};

export const validatePr = (pullRequest, issueLabels = {}, repository, provider = defaultTaskProvider) => {
  const errors = [];
  const labels = Array.isArray(pullRequest?.labels) ? pullRequest.labels.map((label) => label?.name) : [];
  if (labels.filter((label) => typeof label === "string" && label.startsWith("type:")).length !== 1) {
    errors.push("PR must have exactly one type:* label");
  }
  if (!githubTaskProviders.has(provider) && !Object.hasOwn(taskReferences, provider)) {
    return [...errors, `unsupported bound task provider: ${provider}`];
  }
  const body = pullRequest?.body ?? "";
  if (Object.hasOwn(taskReferences, provider)) {
    if (!taskReferences[provider].test(body)) {
      const label = provider === "custom" ? "Task" : `${provider[0].toUpperCase()}${provider.slice(1)}`;
      errors.push(`PR body must contain a native ${label} reference such as '${label}: PROJ-123'`);
    }
    return errors;
  }
  const references = issueNumbers(body, repository);
  if (references.length === 0) errors.push("PR body must contain a closing reference such as 'Closes #123'");
  for (const number of references) {
    if (!issueLabels[number]?.includes("status:approved")) errors.push(`linked issue #${number} must have the human status:approved label`);
  }
  return errors;
};

export const githubIssueLabels = async (repository, token, number, fetchImpl = fetch) => {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${number}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub issue lookup failed with status ${response.status}`);
  const issue = await response.json();
  if (!Array.isArray(issue.labels)) throw new Error("GitHub issue lookup returned malformed labels");
  return issue.labels.map((label) => label?.name).filter((label) => typeof label === "string");
};

export const validateEvent = async (event, repository, token, options = {}) => {
  const provider = options.provider ?? await boundTaskProvider();
  const fetchImpl = options.fetchImpl ?? fetch;
  const pullRequest = event?.pull_request ?? {};
  const issueLabels = {};
  if (githubTaskProviders.has(provider)) {
    for (const number of issueNumbers(pullRequest.body, repository)) issueLabels[number] = await githubIssueLabels(repository, token, number, fetchImpl);
  }
  return validatePr(pullRequest, issueLabels, repository, provider);
};

const selfCheck = async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "governance.yml"), "utf8");
  const provider = await boundTaskProvider(root);
  assert.match(workflow, /^  validate:$/mu);
  assert.match(workflow, /^    name: validate$/mu);
  assert.match(workflow, /pull_request_target:/u);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
  assert.doesNotMatch(workflow, /merge_commit_sha/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.doesNotMatch(workflow, /(?:contents|issues|pull-requests): write/u);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u);
  assert.match(workflow, /node-version: 20\.19\.0/u);
  for (const template of [".github/pull_request_template.md", "templates/pull-request.md"]) {
    const text = await readFile(path.join(root, template), "utf8");
    assert.match(text, /provider-governance:start/u);
    if (githubTaskProviders.has(provider)) {
      assert.match(text, /Closes #<TICKET_ID>/u);
      assert.doesNotMatch(text, /Closes `<TICKET_ID>`/u);
    } else {
      const label = provider === "custom" ? "Task" : `${provider[0].toUpperCase()}${provider.slice(1)}`;
      assert.match(text, new RegExp(`${label}: <TICKET_ID>`, "u"));
      assert.doesNotMatch(text, /Closes #<TICKET_ID>/u);
    }
  }
  const valid = { body: "Summary\n\nCloses #42.", labels: [{ name: "type:product" }] };
  assert.deepEqual(validatePr(valid, { 42: ["status:approved"] }, "acme/example", "github-issues"), []);
  assert.deepEqual(issueNumbers("Fixes acme/example#7 and closes other/repo#8", "acme/example"), [7]);
  assert.deepEqual(validatePr({ body: "Jira: FEX-1", labels: [{ name: "type:product" }] }, {}, undefined, "jira"), []);
  const directory = await mkdtemp(path.join(os.tmpdir(), "governance-bindings-"));
  try {
    await mkdir(path.join(directory, "docs"));
    await writeFile(path.join(directory, "docs", "bindings.md"), "> **Capability:** `task`\n> **Provider:** `jira`\n", "utf8");
    assert.equal(await boundTaskProvider(directory), "jira");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  process.stdout.write("self-check OK\n");
};

const main = async () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-check") return selfCheck();
  const { GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token } = process.env;
  if (!eventPath || !repository || !token) throw new Error("GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required");
  let errors;
  try {
    errors = await validateEvent(JSON.parse(await readFile(eventPath, "utf8")), repository, token);
  } catch (error) {
    throw new Error(`Unable to validate PR governance: ${error.message}`);
  }
  if (errors.length > 0) {
    for (const error of errors) process.stdout.write(`::error::${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("PR governance OK\n");
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

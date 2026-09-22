#!/usr/bin/env node
/** Check immutable action pins and lifecycle permission boundaries. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, path.basename(path.dirname(scriptDirectory)) === ".factory" ? "../.." : "..");

export const pinnedActions = Object.freeze({
  "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",
  "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
  "actions/download-artifact": "d3f86a106a0bac45b974a628896c90dbdf5c8093",
  "actions/create-github-app-token": "fee1f7d63c2ff003460e3d139729b119787bc349",
});

export const bootstrapPinnedActions = Object.freeze({
  ...pinnedActions,
  "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
});

export class WorkflowContractError extends Error {}

const fail = (message) => { throw new WorkflowContractError(message); };
const usesExpression = /^\s*uses:\s*([^\s#]+)/gmu;
const actionReferences = (text) => [...text.matchAll(usesExpression)].map((match) => match[1]);

const section = (text, start, end) => {
  const afterStart = text.split(start, 2)[1];
  if (afterStart === undefined) fail(`workflow is missing ${start.trim()}`);
  if (!end) return afterStart;
  const beforeEnd = afterStart.split(end, 2)[0];
  if (beforeEnd === undefined) fail(`workflow is missing ${end.trim()}`);
  return beforeEnd;
};

const requireText = (text, values, message) => {
  for (const value of values) if (!text.includes(value)) fail(`${message} ${value}`);
};

const checkPins = (text, requiredPins, missingMessage) => {
  const uses = actionReferences(text);
  if (uses.length === 0) fail("workflow has no actions");
  for (const reference of uses) {
    const [action, sha, ...remainder] = reference.split("@");
    if (!sha || remainder.length !== 0 || !/^[0-9a-f]{40}$/u.test(sha)) fail(`action is not pinned to a full commit SHA: ${reference}`);
    if (Object.hasOwn(requiredPins, action) && requiredPins[action] !== sha) fail(`action SHA is not the verified documented pin: ${reference}`);
  }
  for (const [action, sha] of Object.entries(requiredPins)) if (!uses.includes(`${action}@${sha}`)) fail(`${missingMessage}: ${action}`);
  return uses;
};

const checkBootstrap = (text) => {
  const uses = checkPins(text, bootstrapPinnedActions, "required action pin is missing");
  if (!text.includes("permissions: {}")) fail("workflow must default to no permissions");
  if (!text.includes("permission-administration: write") || !text.includes("permission-contents: write") || (text.match(/permission-workflows: write/gu) ?? []).length !== 1) fail("bootstrap App token must request administration, contents, and workflows write");
  if (uses.filter((reference) => reference.startsWith("actions/create-github-app-token@")).length !== 2) fail("bootstrap and cleanup must mint separate lifecycle tokens");
  if (!text.includes("group: bootstrap-e2e-report-${{ github.repository }}-${{ needs.prepare.outputs.sha ||")) fail("report must serialize by resolved SHA");
  if (!text.includes("- name: Delete this run's disposable repositories\n        if: always()")) fail("cleanup deletion must run always");
  const cleanup = section(text, "\n  cleanup:\n", "\n  triage:\n");
  if (cleanup.includes("actions/checkout@")) fail("cleanup must not depend on repository checkout");
  const bootstrap = section(text, "\n  bootstrap:\n", "\n  cleanup:\n");
  const triage = section(text, "\n  triage:\n", "\n  report:\n");
  const report = section(text, "\n  report:\n");
  if ([bootstrap, cleanup, report].some((job) => job.includes("OPENAI_API_KEY"))) fail("OPENAI_API_KEY must be isolated to triage");
  if (bootstrap.includes("BOOTSTRAP_E2E_TOKEN: ${{ secrets.") || cleanup.includes("BOOTSTRAP_E2E_TOKEN: ${{ secrets.")) fail("lifecycle token must be short-lived App output");
  if (!triage.includes(`actions/setup-node@${bootstrapPinnedActions["actions/setup-node"]}`)) fail("triage must pin the Node runtime");
  if (!triage.includes('env -i "PATH=$PATH" "OPENAI_API_KEY=$OPENAI_API_KEY" "OPENAI_MODEL=$OPENAI_MODEL" node scripts/triage-bootstrap-failure.mjs')) fail("triage must invoke the Node CLI with a clean environment");
  if (["GITHUB_TOKEN", "GH_TOKEN", "BOOTSTRAP_E2E_TOKEN"].some((value) => triage.includes(value))) fail("triage must not receive lifecycle or GitHub credentials");
};

const checkTemplateBootstrap = (text) => {
  const uses = actionReferences(text);
  if (uses.length === 0 || uses.some((reference) => !/^[^@]+@[0-9a-f]{40}$/u.test(reference))) fail("template bootstrap action is not pinned to a full commit SHA");
  requireText(text, [
    "workflow_dispatch:", "permissions: {}", "fail-fast: false", "--template", "--stack", "if: always()", "issues: write", "--run-id", "cleanup-template",
    `actions/download-artifact@${pinnedActions["actions/download-artifact"]}`,
    `actions/setup-node@${bootstrapPinnedActions["actions/setup-node"]}`,
    "node-version: 20.19.0", "node scripts/report-bootstrap-failure.mjs",
  ], "template workflow is missing");
  if (text.includes("OPENAI_API_KEY")) fail("template bootstrap must not receive OpenAI credentials");
  const bootstrap = section(text, "\n  bootstrap:\n", "\n  cleanup:\n");
  const report = section(text, "\n  report:\n");
  if (bootstrap.includes("GITHUB_TOKEN") || report.includes("BOOTSTRAP_E2E_TOKEN")) fail("lifecycle and reporting credentials must remain separate");
};

const checkJourney = (text, projectRoot) => {
  const uses = actionReferences(text);
  if (uses.length === 0 || uses.some((reference) => !/^[^@]+@[0-9a-f]{40}$/u.test(reference))) fail("real-agent journey action is not pinned to a full commit SHA");
  for (const [action, sha] of Object.entries(pinnedActions)) if (!uses.includes(`${action}@${sha}`)) fail(`real-agent journey is missing required action pin: ${action}`);
  requireText(text, [
    "release:\n    types: [published]", "schedule:", "workflow_dispatch:", "permissions: {}", "cancel-in-progress: false", "if: always()", "JOURNEY_RUNTIME", "real-agent-journey.py collect", "retention-days: 7",
    "JOURNEY_CONTRACT_VERSION: real-agent-journey/v1", "Install selected runtime", "--provision stage-input/provision.json", "--agent stage-input/agent.json", "--workspace generated", "REAL_AGENT_JOURNEY_API_KEY",
    "resolve-release --repository \"$REPOSITORY\" --tag \"$SOURCE_TAG\"", "--source-sha \"$SOURCE_SHA\"", "--expected-source-sha \"${{ needs.prepare.outputs.source_sha }}\"",
  ], "real-agent journey is missing");
  if (text.indexOf("Resolve immutable source revision") > text.indexOf("\n  provision:\n")) fail("real-agent journey must resolve its source before provisioning");
  for (const adapter of ["provision", "agent", "assert", "cleanup"]) {
    if (!existsSync(path.join(projectRoot, "scripts", `real-agent-journey-${adapter}.py`)) || !text.includes(`scripts/real-agent-journey-${adapter}.py`)) fail(`real-agent journey ${adapter} adapter is missing`);
  }
  if (uses.filter((reference) => reference.startsWith("actions/create-github-app-token@")).length !== 4) fail("real-agent journey must mint one token per credential boundary");
  const agent = section(text, "\n  agent:\n", "\n  assert:\n");
  if (!agent.includes("OPENAI_API_KEY") || agent.includes("BOOTSTRAP_E2E_TOKEN")) fail("agent credentials are not isolated");
  for (const other of [section(text, "\n  provision:\n", "\n  agent:\n"), section(text, "\n  assert:\n", "\n  cleanup:\n"), section(text, "\n  cleanup:\n", "\n  report:\n")]) if (other.includes("OPENAI_API_KEY")) fail("agent API credentials crossed a stage boundary");
};

const checkJourneyAssertions = (text) => {
  const uses = actionReferences(text);
  if (uses.length === 0 || uses.some((reference) => !/^[^@]+@[0-9a-f]{40}$/u.test(reference))) fail("journey assertion action is not pinned to a full commit SHA");
  requireText(text, ["workflow_call:", "permissions: {}", "actions: read", "contents: read", "JOURNEY_READ_TOKEN", "if: always()", "retention-days: 7", "scripts/real-agent-journey.py", "implementation-branch"], "journey assertion workflow is missing");
  if (["OPENAI_API_KEY", "status:approved", "bootstrap-e2e.py template"].some((value) => text.includes(value))) fail("journey assertion workflow contains an out-of-scope authority or lifecycle operation");
};

export const check = async (projectRoot = root) => {
  const workflows = path.join(projectRoot, ".github", "workflows");
  const [bootstrap, template, journey, assertions] = await Promise.all([
    readFile(path.join(workflows, "bootstrap-e2e.yml"), "utf8"),
    readFile(path.join(workflows, "template-bootstrap-e2e.yml"), "utf8"),
    readFile(path.join(workflows, "real-agent-journey.yml"), "utf8"),
    readFile(path.join(workflows, "real-agent-journey-assertions.yml"), "utf8"),
  ]);
  checkBootstrap(bootstrap);
  checkTemplateBootstrap(template);
  if (bootstrap.includes("python3 scripts/report-bootstrap-failure.py") || template.includes("python3 scripts/report-bootstrap-failure.py")) fail("active reporter workflow consumers must invoke Node");
  checkJourney(journey, projectRoot);
  checkJourneyAssertions(assertions);
  return ["bootstrap workflow static check OK", "template bootstrap workflow static check OK", "real-agent journey workflow static check OK", "real-agent journey assertion workflow static check OK"];
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { for (const message of await check()) console.log(message); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { WorkflowContractError, bootstrapPinnedActions, check, pinnedActions } from "../scripts/check-bootstrap-workflow.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-bootstrap-workflow.mjs");
const workflows = path.join(".github", "workflows");
const files = Object.freeze({ bootstrap: "bootstrap-e2e.yml", template: "template-bootstrap-e2e.yml", journey: "real-agent-journey.yml", assertions: "real-agent-journey-assertions.yml" });
const success = ["bootstrap workflow static check OK", "template bootstrap workflow static check OK", "real-agent journey workflow static check OK", "real-agent journey assertion workflow static check OK"];

const fixture = async (callback) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bootstrap-workflow-contract-"));
  try {
    await cp(path.join(root, ".github"), path.join(directory, ".github"), { recursive: true });
    await cp(path.join(root, "scripts"), path.join(directory, "scripts"), { recursive: true });
    return await callback(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
};

const replace = async (directory, name, from, to) => {
  const target = path.join(directory, workflows, files[name]);
  const source = await readFile(target, "utf8");
  assert.ok(source.includes(from), `fixture does not contain ${from}`);
  await writeFile(target, source.replaceAll(from, to), "utf8");
};

const replaceFirst = async (directory, name, from, to) => {
  const target = path.join(directory, workflows, files[name]);
  const source = await readFile(target, "utf8");
  assert.ok(source.includes(from), `fixture does not contain ${from}`);
  await writeFile(target, source.replace(from, to), "utf8");
};

const append = async (directory, name, value) => {
  const target = path.join(directory, workflows, files[name]);
  await writeFile(target, `${await readFile(target, "utf8")}${value}`, "utf8");
};

const reject = async (directory, message) => {
  await assert.rejects(check(directory), (error) => error instanceof WorkflowContractError && error.message === message);
};

test("the Node checker accepts the current workflow contract", async () => {
  assert.deepEqual(await check(), success);
  assert.deepEqual(pinnedActions, {
    "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact": "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    "actions/create-github-app-token": "fee1f7d63c2ff003460e3d139729b119787bc349",
  });
  assert.equal(bootstrapPinnedActions["actions/setup-node"], "49933ea5288caeca8642d1e84afbd3f7d6820020");
});

test("the Node CLI emits the Python parity success output", async () => {
  const result = await execFileAsync(process.execPath, [script], { cwd: root });
  assert.equal(result.stdout, `${success.join("\n")}\n`);
  assert.equal(result.stderr, "");
});

test("bootstrap rejects unpinned, unverified, and missing required actions", async () => {
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4");
    await reject(directory, "action is not pinned to a full commit SHA: actions/checkout@v4");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", `actions/checkout@${"a".repeat(40)}`);
    await reject(directory, `action SHA is not the verified documented pin: actions/checkout@${"a".repeat(40)}`);
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", `actions/setup-node@${bootstrapPinnedActions["actions/setup-node"]}`, `other/setup-node@${bootstrapPinnedActions["actions/setup-node"]}`);
    await reject(directory, "required action pin is missing: actions/setup-node");
  });
});

test("bootstrap rejects weak lifecycle permission and token boundaries", async () => {
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "permissions: {}", "permissions: read-all");
    await reject(directory, "workflow must default to no permissions");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "permission-workflows: write", "permission-workflows: read");
    await reject(directory, "bootstrap App token must request administration, contents, and workflows write");
  });
  await fixture(async (directory) => {
    await replaceFirst(directory, "bootstrap", "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
    await reject(directory, "bootstrap and cleanup must mint separate lifecycle tokens");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  bootstrap:\n", "  bootstrap:\n    env:\n      BOOTSTRAP_E2E_TOKEN: ${{ secrets.BOOTSTRAP_E2E_TOKEN }}\n");
    await reject(directory, "lifecycle token must be short-lived App output");
  });
});

test("bootstrap rejects weak cleanup, report, and credential isolation", async () => {
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "group: bootstrap-e2e-report-${{ github.repository }}-${{ needs.prepare.outputs.sha ||", "group: bootstrap-e2e-report");
    await reject(directory, "report must serialize by resolved SHA");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "- name: Delete this run's disposable repositories\n        if: always()", "- name: Delete this run's disposable repositories");
    await reject(directory, "cleanup deletion must run always");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  cleanup:\n", "  cleanup:\n    - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n");
    await reject(directory, "cleanup must not depend on repository checkout");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  bootstrap:\n", "  bootstrap:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "OPENAI_API_KEY must be isolated to triage");
  });
});

test("bootstrap rejects weak Node triage isolation", async () => {
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", 'env -i "PATH=$PATH" "OPENAI_API_KEY=$OPENAI_API_KEY" "OPENAI_MODEL=$OPENAI_MODEL" node scripts/triage-bootstrap-failure.mjs', "node scripts/triage-bootstrap-failure.mjs");
    await reject(directory, "triage must invoke the Node CLI with a clean environment");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  triage:\n", "  triage:\n    env:\n      GITHUB_TOKEN: ${{ github.token }}\n");
    await reject(directory, "triage must not receive lifecycle or GitHub credentials");
  });
});

test("bootstrap rejects OpenAI credentials outside triage", async () => {
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  cleanup:\n", "  cleanup:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "OPENAI_API_KEY must be isolated to triage");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  report:\n", "  report:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "OPENAI_API_KEY must be isolated to triage");
  });
});

test("template workflow rejects absent contract inputs, pins, and crossed credentials", async () => {
  await fixture(async (directory) => {
    await replace(directory, "template", "workflow_dispatch:", "workflow_call:");
    await reject(directory, "template workflow is missing workflow_dispatch:");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4");
    await reject(directory, "template bootstrap action is not pinned to a full commit SHA");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "  bootstrap:\n", "  bootstrap:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "template bootstrap must not receive OpenAI credentials");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "  report:\n", "  report:\n    env:\n      BOOTSTRAP_E2E_TOKEN: ${{ secrets.BOOTSTRAP_E2E_TOKEN }}\n");
    await reject(directory, "lifecycle and reporting credentials must remain separate");
  });
});

test("active workflow consumers reject the retired Python reporter", async () => {
  await fixture(async (directory) => {
    await append(directory, "bootstrap", "\n# python3 scripts/report-bootstrap-failure.py\n");
    await reject(directory, "active reporter workflow consumers must invoke Node");
  });
  await fixture(async (directory) => {
    await append(directory, "template", "\n# python3 scripts/report-bootstrap-failure.py\n");
    await reject(directory, "active reporter workflow consumers must invoke Node");
  });
});

test("template workflow requires the Node report runtime contract", async () => {
  await fixture(async (directory) => {
    await replace(directory, "template", "node-version: 20.19.0", "node-version: 22");
    await reject(directory, "template workflow is missing node-version: 20.19.0");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "node scripts/report-bootstrap-failure.mjs", "node scripts/retired-reporter.mjs");
    await reject(directory, "template workflow is missing node scripts/report-bootstrap-failure.mjs");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "cleanup-template", "cleanup-prefix");
    await reject(directory, "template workflow is missing cleanup-template");
  });
});

test("real-agent journey rejects weak pins, missing adapters, and crossed stages", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4");
    await reject(directory, "real-agent journey action is not pinned to a full commit SHA");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "scripts/real-agent-journey-provision.py", "scripts/missing.py");
    await reject(directory, "real-agent journey provision adapter is missing");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "  agent:\n", "  agent:\n    env:\n      BOOTSTRAP_E2E_TOKEN: ${{ secrets.BOOTSTRAP_E2E_TOKEN }}\n");
    await reject(directory, "agent credentials are not isolated");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "  assert:\n", "  assert:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "agent API credentials crossed a stage boundary");
  });
});

test("real-agent journey rejects missing contract markers and source resolution", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "JOURNEY_CONTRACT_VERSION: real-agent-journey/v1", "JOURNEY_CONTRACT_VERSION: unknown");
    await reject(directory, "real-agent journey is missing JOURNEY_CONTRACT_VERSION: real-agent-journey/v1");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "release:\n    types: [published]", "release:\n    types: [replaced]");
    await reject(directory, "real-agent journey is missing release:\n    types: [published]");
  });
  await fixture(async (directory) => {
    await append(directory, "journey", "\n    uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349\n");
    await reject(directory, "real-agent journey must mint one token per credential boundary");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "OPENAI_API_KEY", "MISSING_AGENT_API_KEY");
    await reject(directory, "agent credentials are not isolated");
  });
});

test("real-agent journey requires its runtime, inputs, and bounded evidence", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "workflow_dispatch:", "workflow_call:");
    await reject(directory, "real-agent journey is missing workflow_dispatch:");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "JOURNEY_RUNTIME", "RUNTIME_SELECTION");
    await reject(directory, "real-agent journey is missing JOURNEY_RUNTIME");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "--workspace generated", "--workspace missing");
    await reject(directory, "real-agent journey is missing --workspace generated");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "retention-days: 7", "retention-days: 30");
    await reject(directory, "real-agent journey is missing retention-days: 7");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "REAL_AGENT_JOURNEY_API_KEY", "MISSING_AGENT_KEY");
    await reject(directory, "real-agent journey is missing REAL_AGENT_JOURNEY_API_KEY");
  });
});

test("journey assertion workflow rejects malformed pins and authority", async () => {
  await fixture(async (directory) => {
    await replace(directory, "assertions", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@main");
    await reject(directory, "journey assertion action is not pinned to a full commit SHA");
  });
  await fixture(async (directory) => {
    await replace(directory, "assertions", "JOURNEY_READ_TOKEN", "MISSING_READ_TOKEN");
    await reject(directory, "journey assertion workflow is missing JOURNEY_READ_TOKEN");
  });
  await fixture(async (directory) => {
    await replace(directory, "assertions", "jobs:\n", "jobs:\n# status:approved\n");
    await reject(directory, "journey assertion workflow contains an out-of-scope authority or lifecycle operation");
  });
  await fixture(async (directory) => {
    await replace(directory, "assertions", "workflow_call:", "workflow_dispatch:");
    await reject(directory, "journey assertion workflow is missing workflow_call:");
  });
  await fixture(async (directory) => {
    await append(directory, "assertions", "\n# OPENAI_API_KEY\n");
    await reject(directory, "journey assertion workflow contains an out-of-scope authority or lifecycle operation");
  });
  await fixture(async (directory) => {
    await append(directory, "assertions", "\n# bootstrap-e2e.py template\n");
    await reject(directory, "journey assertion workflow contains an out-of-scope authority or lifecycle operation");
  });
});

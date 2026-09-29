import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

import { WorkflowContractError, bootstrapPinnedActions, check, pinnedActions } from "../scripts/check-bootstrap-workflow.mjs";
import { check as checkRealAgentWorkflow } from "../scripts/typed-runtime/check-real-agent-workflow.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-bootstrap-workflow.mjs");
const workflows = path.join(".github", "workflows");
const files = Object.freeze({ bootstrap: "bootstrap-e2e.yml", template: "template-bootstrap-e2e.yml", journey: "real-agent-journey.yml", assertions: "real-agent-journey-assertions.yml", npmRelease: "npm-release.yml", archetypeNode20: "archetype-node20.yml" });
const success = ["bootstrap workflow static check OK", "template bootstrap workflow static check OK", "real-agent journey workflow static check OK", "real-agent journey assertion workflow static check OK", "npm release workflow static check OK", "archetype Node 20 PR workflow static check OK"];
const generatedPush = '          git -c http.extraheader="AUTHORIZATION: basic $(printf \'x-access-token:%s\' "$JOURNEY_TOKEN" | base64 -w0)" -C generated push origin HEAD:main';
const agentTokenBinding = 'AGENT_GITHUB_TOKEN="$JOURNEY_TOKEN"';

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

const replaceScript = async (directory, relative, from, to) => {
  const target = path.join(directory, relative);
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

test("real-agent journey rejects invoke-agent separator drift", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", 'node scripts/real-agent-journey.mjs invoke-agent --runtime "$JOURNEY_RUNTIME" --', 'node scripts/real-agent-journey.mjs invoke-agent --runtime "$JOURNEY_RUNTIME"');
    await reject(directory, "real-agent journey invoke-agent command must preserve the adapter separator");
  });
});

test("real-agent workflow requires the Codex approval config override", async () => {
  await fixture(async (directory) => {
    assert.equal(await checkRealAgentWorkflow(directory), "real-agent workflow static check OK");
  });
  await fixture(async (directory) => {
    await replaceScript(directory, "scripts/real-agent-e2e.mjs", '-c", \'approval_policy="never"\'', '-c", \'approval_policy="on-request"\'');
    await assert.rejects(checkRealAgentWorkflow(directory), /approval_policy="never"/u);
  });
  await fixture(async (directory) => {
    await replaceScript(directory, "scripts/real-agent-e2e.mjs", '-c", \'approval_policy="never"\'', '"--ask-for-approval", "never"');
    await assert.rejects(checkRealAgentWorkflow(directory), /retired or unsafe Codex command contract/u);
  });
});

test("archetype Node 20 PR check rejects trigger, authority, pin, version, and pre-build execution drift", async () => {
  const changes = [
    ["  pull_request:", "  pull_request_target:"],
    ["  contents: read", "  contents: write"],
    ["actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4"],
    ["fetch-depth: 0", "fetch-depth: 1"],
    [`actions/setup-node@${bootstrapPinnedActions["actions/setup-node"]}`, "actions/setup-node@v4"],
    ["node-version: 20.19.0", "node-version: 22"],
    ["npm install --global pnpm@12.4.2", "corepack enable\n          COREPACK_DEFAULT_TO_LATEST=0 corepack install --global pnpm@12.4.2"],
    ["npm install --global pnpm@12.4.2", "npm install --global pnpm@latest"],
    ['test "$(pnpm --version)" = "12.4.2"', 'test "$(pnpm --version)" = "latest"'],
    ["run: node scripts/prepare-offline-npm-cache.mjs", "run: npm install --online"],
    ["      - name: Prepare npm cache for packed runtime dependencies\n        run: node scripts/prepare-offline-npm-cache.mjs\n", ""],
    ["          pnpm typecheck\n", ""],
    ["          pnpm test\n", "          pnpm build\n"],
    ["node scripts/typed-runtime/check-real-agent-workflow.js", "node scripts/missing-checker.js"],
    ["          pnpm test\n          node scripts/typed-runtime/check-real-agent-workflow.js", "          node scripts/typed-runtime/check-real-agent-workflow.js\n          pnpm test"],
    ["          pnpm test\n          node scripts/typed-runtime/check-real-agent-workflow.js", "          node scripts/check-determinism.mjs\n          pnpm test\n          node scripts/typed-runtime/check-real-agent-workflow.js"],
    ["node scripts/check-determinism.mjs", "node scripts/missing-determinism.mjs"],
    ["          pnpm typecheck", "          pnpm typecheck\n          node -e 'console.log(process.env)'"],
    ["  verify:\n", "  verify:\n    env:\n      TOKEN: ${{ secrets.GITHUB_TOKEN }}\n"],
  ];
  for (const [from, to] of changes) {
    await fixture(async (directory) => {
      await replace(directory, "archetypeNode20", from, to);
      await reject(directory, "archetype Node 20 PR workflow differs from its read-only contract");
    });
  }
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
    await replaceFirst(directory, "bootstrap", './scripts/typed-runtime/hosted-lifecycle-mutation-client.js', './scripts/hosted-lifecycle-mutation-client.mjs');
    await reject(directory, 'bootstrap must use the typed provisioning importer import { createHostedLifecycleMutationClient } from "./scripts/typed-runtime/hosted-lifecycle-mutation-client.js";');
  });
  await fixture(async (directory) => {
    const target = path.join(directory, workflows, files.bootstrap);
    const source = await readFile(target, "utf8");
    const boundary = source.indexOf("\n  cleanup:\n");
    assert.notEqual(boundary, -1);
    await writeFile(target, source.slice(0, boundary) + source.slice(boundary).replace('./scripts/typed-runtime/hosted-lifecycle-mutation-client.js', './scripts/hosted-lifecycle-mutation-client.mjs'));
    await reject(directory, 'cleanup must use the trusted proof-based policy import { createHostedLifecycleMutationClient } from "./scripts/typed-runtime/hosted-lifecycle-mutation-client.js";');
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "./scripts/typed-runtime/resource-provision-and-proof.js", "./scripts/resource-provision-and-proof.mjs");
    await reject(directory, "bootstrap must use the typed provisioning importer ./scripts/typed-runtime/resource-provision-and-proof.js");
  });
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
    await replace(directory, "bootstrap", "- name: Delete this run's proof-bound disposable repository\n        if: always()", "- name: Delete this run's proof-bound disposable repository");
    await reject(directory, "cleanup deletion must run always");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "ref: ${{ github.workflow_sha }}", "ref: ${{ needs.prepare.outputs.sha }}");
    await reject(directory, "cleanup must use the trusted proof-based policy ref: ${{ github.workflow_sha }}");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "./scripts/typed-runtime/resource-proof-cleanup.js", "./scripts/resource-proof-cleanup.mjs");
    await reject(directory, "cleanup must use the trusted proof-based policy scripts/typed-runtime/resource-proof-cleanup.js");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "  bootstrap:\n", "  bootstrap:\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n");
    await reject(directory, "OPENAI_API_KEY must be isolated to triage");
  });
});

test("bootstrap rejects Python release execution and an unpinned package toolchain", async () => {
  await fixture(async (directory) => {
    await append(directory, "bootstrap", "\n# python3 scripts/bootstrap-e2e.py\n");
    await reject(directory, "release bootstrap workflow must be Node-only");
  });
  await fixture(async (directory) => {
    await replace(directory, "bootstrap", "COREPACK_DEFAULT_TO_LATEST=0 corepack install --global pnpm@12.4.2", "corepack install --global pnpm@latest");
    await reject(directory, "release package build must activate pinned Corepack pnpm");
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
    await reject(directory, "template bootstrap must not use Template API or lifecycle credentials");
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

test("template workflow requires immutable package and pinned toolchain contracts", async () => {
  await fixture(async (directory) => {
    await replace(directory, "template", "node-version: 20.19.0", "node-version: 22");
    await reject(directory, "template workflow is missing node-version: 20.19.0");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "COREPACK_DEFAULT_TO_LATEST=0 corepack install --global pnpm@12.4.2", "corepack install --global pnpm@latest");
    await reject(directory, "template workflow is missing COREPACK_DEFAULT_TO_LATEST=0 corepack install --global pnpm@12.4.2");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "ref: ${{ github.workflow_sha }}", "ref: main");
    await reject(directory, "template workflow is missing ref: ${{ github.workflow_sha }}");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "release_sha: process.env.WORKFLOW_SHA", "release_sha: process.env.GITHUB_SHA");
    await reject(directory, "template workflow is missing release_sha: process.env.WORKFLOW_SHA");
  });
});

test("template workflow rejects Template API, weak cleanup, and reporter boundary regressions", async () => {
  await fixture(async (directory) => {
    await append(directory, "template", "\n# scripts/bootstrap-e2e.py template\n");
    await reject(directory, "template bootstrap must not use Template API or lifecycle credentials");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "finally {", "catch {");
    await reject(directory, "template bootstrap cleanup must run in the validation finally block");
  });
  await fixture(async (directory) => {
    await replace(directory, "template", "  report:\n    if: always()", "  report:\n");
    await reject(directory, "template reporter must be always-run and credential-separated");
  });
});

test("real-agent journey rejects weak pins, missing adapters, and crossed stages", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4");
    await reject(directory, "real-agent journey action is not pinned to a full commit SHA");
  });
  await fixture(async (directory) => {
     await replace(directory, "journey", "scripts/real-agent-journey-provision.mjs", "scripts/missing.mjs");
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

test("real-agent journey rejects the retired source repository before hosted execution", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "JOURNEY_TEMPLATE: eff3ct0/agent-foundry", "JOURNEY_TEMPLATE: eff3ct0/factory-template");
    await reject(directory, "real-agent journey source repository must be eff3ct0/agent-foundry");
  });
});

test("real-agent journey requires the configured OpenAI secret and rejects the stale alias", async () => {
  const binding = "          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}";
  await fixture(async (directory) => {
    await replace(directory, "journey", binding, "          OPENAI_API_KEY: ${{ secrets.MISSING_API_KEY }}");
    await reject(directory, `real-agent journey agent secret binding is missing ${binding}`);
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", binding, "          OPENAI_API_KEY: ${{ secrets.REAL_AGENT_JOURNEY_API_KEY }}");
    await reject(directory, "real-agent journey must not use stale REAL_AGENT_JOURNEY_API_KEY secret alias");
  });
});

test("real-agent journey keeps the configured OpenAI secret isolated to the agent stage", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.journey), "utf8");
    const agent = workflow.split("\n  agent:\n")[1]?.split("\n  assert:\n")[0];
    assert.ok(agent?.includes("          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"));
    for (const stage of ["provision", "assert", "cleanup", "report"]) {
      const section = workflow.split(`\n  ${stage}:\n`)[1]?.split(/\n  (?:prepare|provision|agent|assert|cleanup|report):\n/u)[0] ?? "";
      assert.equal(section.includes("OPENAI_API_KEY"), false, `${stage} must not receive OpenAI credentials`);
    }
  });
});

test("real-agent journey maps JOURNEY_TOKEN to AGENT_GITHUB_TOKEN only in the cold-agent process", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.journey), "utf8");
    const agent = workflow.split("\n  agent:\n")[1]?.split("\n  assert:\n")[0] ?? "";
    const agentRun = agent.split("\n      - name: Run cold-agent adapter\n")[1]?.split("\n      - name: Upload agent evidence\n")[0] ?? "";
    const processEnvironment = agentRun.split("          env -i ")[1]?.split("\n              node scripts/real-agent-journey.mjs invoke-agent --runtime")[0] ?? "";
    assert.ok(processEnvironment.includes(agentTokenBinding));
    for (const stage of ["provision", "assert", "cleanup", "report"]) {
      const section = workflow.split(`\n  ${stage}:\n`)[1]?.split(/\n  (?:prepare|provision|agent|assert|cleanup|report):\n/u)[0] ?? "";
      assert.equal(section.includes("AGENT_GITHUB_TOKEN"), false, `${stage} must not receive the agent adapter credential alias`);
    }
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", agentTokenBinding, 'AGENT_GITHUB_TOKEN="$MISSING_TOKEN"');
    await reject(directory, "real-agent journey agent process must map JOURNEY_TOKEN to AGENT_GITHUB_TOKEN");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", agentTokenBinding, "");
    await reject(directory, "real-agent journey agent process must map JOURNEY_TOKEN to AGENT_GITHUB_TOKEN");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", agentTokenBinding, "AGENT_GITHUB_TOKEN: ${{ secrets.AGENT_GITHUB_TOKEN }}");
    await reject(directory, "real-agent journey agent process must map JOURNEY_TOKEN to AGENT_GITHUB_TOKEN");
  });
});

test("real-agent journey rejects the inherited run-block YAML indentation defects", async () => {
  for (const [line, number] of [
    ["          branch=$(node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(\"stage-input/provision.json\", \"utf8\")).identifiers.default_branch)')", 185],
    ["          branch=$(node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(process.env.AGENT_EVIDENCE, \"utf8\")).identifiers.branch)')", 325],
  ]) {
    await fixture(async (directory) => {
      await replaceFirst(directory, "journey", line, ` ${line}`);
      await reject(directory, `real-agent journey run block has invalid YAML indentation at line ${number}`);
    });
  }
});

test("real-agent journey pins its executable scoped package metadata guard", async () => {
  const mutations = [
    ['const packageMatch = /^(?<name>@eff3ct\\/agent-foundry)@(?<version>.+)$/u.exec(spec);', 'const [name, version] = spec.split("@");'],
    ['const name = "@eff3ct/agent-foundry";', 'const name = "agent-foundry";'],
    ['|| !semver.test(version)', '|| true'],
    ['metadata.name !== name || metadata.version !== version', 'metadata.name !== name'],
    ['JOURNEY_PACKAGE_SPEC: ${{ env.JOURNEY_PACKAGE_NAME }}@${{ needs.prepare.outputs.package_version }}', 'JOURNEY_PACKAGE_SPEC: ${{ env.JOURNEY_PACKAGE_NAME }}@latest'],
  ];
  for (const [from, to] of mutations) {
    await fixture(async (directory) => {
      await replaceFirst(directory, "journey", from, to);
      await reject(directory, "real-agent journey must verify exact scoped package metadata before apply");
    });
  }
});

test("real-agent journey derives scheduled package versions from the checked-out package manifest", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.journey), "utf8");
    assert.ok(workflow.includes("JOURNEY_PACKAGE_VERSION: ${{ inputs.package_version || '' }}"));
    assert.equal(workflow.includes("REAL_AGENT_PACKAGE_VERSION"), false);
    const sourceStep = workflow.split("      - name: Resolve immutable source revision\n")[1]
      ?.split("      - name: Write run plan\n")[0];
    assert.ok(sourceStep);
    const scriptText = sourceStep.split("        run: |\n")[1]
      ?.split("\n          node -e 'if (!/^[0-9a-f]{40}/u")[0]
      ?.split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
    assert.ok(scriptText);
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@eff3ct/agent-foundry", version: "0.1.2" }));
    const result = await execFileAsync("bash", ["-euo", "pipefail", "-c", scriptText], {
      cwd: directory,
      env: {
        ...process.env,
        EVENT_NAME: "schedule",
        REPOSITORY: "eff3ct0/agent-foundry",
        SOURCE_TAG: "",
        SOURCE_SHA: "a".repeat(40),
        EXPECTED_SHA: "",
        PACKAGE_VERSION: "",
        GITHUB_EVENT_NAME: "schedule",
        GITHUB_TOKEN: "",
        GITHUB_OUTPUT: path.join(directory, "github-output"),
      },
    });
    assert.equal(result.stderr, "");
    assert.match(await readFile(path.join(directory, "github-output"), "utf8"), /package_version=0\.1\.2\n/u);
  });
});

test("real-agent journey executes its isolated scoped package guard with exact offline metadata", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.journey), "utf8");
    const applyCommand = '          npm exec --yes --prefix journey-runner --package "$JOURNEY_PACKAGE_SPEC" -- foundry apply --target generated --config answers.json --non-interactive --yes';
    const validationMatch = workflow.match(/          npm view "\$JOURNEY_PACKAGE_SPEC" --json > package-metadata\.json\n          node --input-type=module <<'NODE'\n([\s\S]*?)          NODE\n          npm exec --yes --prefix journey-runner --package "\$JOURNEY_PACKAGE_SPEC" -- foundry apply --target generated --config answers\.json --non-interactive --yes/u);
    assert.ok(validationMatch, "the metadata validation heredoc must run immediately before package apply");
    const writerMatch = workflow.match(/          npm exec --yes --prefix journey-runner --package "\$JOURNEY_PACKAGE_SPEC" -- foundry apply --target generated --config answers\.json --non-interactive --yes\n          node --input-type=module <<'NODE'\n([\s\S]*?)          NODE\n          git -C generated init -b main/u);
    assert.ok(writerMatch, "the source identity writer must run immediately after package apply");
    assert.ok(workflow.indexOf('          await writeFile("generated/.journey-source.json"') > workflow.indexOf(applyCommand), "the source identity writer must be after package apply");
    assert.match(workflow, /          mkdir generated journey-runner\n/u, "the npm prefix must remain outside generated project content");
    const validationScriptText = validationMatch[1].split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
    const writerScriptText = writerMatch[1].split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
    assert.equal(validationScriptText.includes(".journey-source.json"), false, "metadata validation must not write source identity");
    await mkdir(path.join(directory, "generated"));
    const sourceSha = "a".repeat(40);
    const run = async (spec, metadata, packageName = "@eff3ct/agent-foundry") => {
      await writeFile(path.join(directory, "package-metadata.json"), JSON.stringify(metadata));
      return execFileAsync(process.execPath, ["--input-type=module", "-e", validationScriptText], {
        cwd: directory,
        env: { JOURNEY_PACKAGE_SPEC: spec, JOURNEY_PACKAGE_NAME: packageName, JOURNEY_SOURCE_SHA: sourceSha },
      });
    };
    const writeIdentity = async (spec) => execFileAsync(process.execPath, ["--input-type=module", "-e", writerScriptText], {
      cwd: directory,
      env: { JOURNEY_PACKAGE_SPEC: spec, JOURNEY_PACKAGE_NAME: "@eff3ct/agent-foundry", JOURNEY_SOURCE_SHA: sourceSha },
    });
    const name = "@eff3ct/agent-foundry";
    for (const version of ["0.1.0", "1.2.3-rc.1+build.5"]) {
      const spec = `${name}@${version}`;
      await run(spec, { name, version });
      await assert.rejects(readFile(path.join(directory, "generated/.journey-source.json")), { code: "ENOENT" });
      await writeIdentity(spec);
      assert.deepEqual(JSON.parse(await readFile(path.join(directory, "generated/.journey-source.json"), "utf8")), {
        source_sha: sourceSha, package_name: name, package_version: version, package_spec: spec,
      });
      await rm(path.join(directory, "generated/.journey-source.json"));
    }
    for (const spec of ["agent-foundry@0.1.0", "@other/agent-foundry@0.1.0", `${name}@latest`, `${name}@1.2`, `${name}@1.2.3@evil`, `${name}@01.2.3`, `${name}@1.2.3-01`, `${name}@1.2.3-..`, `${name}@1.2.3+`]) {
      await assert.rejects(run(spec, { name, version: "0.1.0" }), /journey package spec must identify the exact scoped package and version/u);
      await assert.rejects(readFile(path.join(directory, "generated/.journey-source.json")), { code: "ENOENT" });
    }
    await assert.rejects(run(`${name}@0.1.0`, { name: "agent-foundry", version: "0.1.0" }), /published package metadata does not match/u);
    await assert.rejects(run(`${name}@0.1.0`, { name, version: "0.2.0" }), /published package metadata does not match/u);
    await assert.rejects(run(`${name}@0.1.0`, { name, version: "0.1.0" }, "@other/agent-foundry"), /journey package spec must identify/u);
  });
});

test("real-agent journey rejects a source identity writer before package apply", async () => {
  await fixture(async (directory) => {
    const target = path.join(directory, workflows, files.journey);
    const source = await readFile(target, "utf8");
    const writerStart = '          node --input-type=module <<\'NODE\'\n          import { writeFile } from "node:fs/promises";\n          const name = "@eff3ct/agent-foundry";\n          const spec = process.env.JOURNEY_PACKAGE_SPEC ?? "";\n          const packageMatch = /^(?<name>@eff3ct\\/agent-foundry)@(?<version>.+)$/u.exec(spec);\n          const version = packageMatch?.groups?.version ?? "";\n          await writeFile("generated/.journey-source.json", `${JSON.stringify({ source_sha: process.env.JOURNEY_SOURCE_SHA, package_name: name, package_version: version, package_spec: spec }, null, 2)}\\n`);\n          NODE';
    const applyCommand = '          npm exec --yes --prefix journey-runner --package "$JOURNEY_PACKAGE_SPEC" -- foundry apply --target generated --config answers.json --non-interactive --yes';
    assert.ok(source.includes(`${applyCommand}\n${writerStart}`));
    await writeFile(target, source.replace(`${applyCommand}\n${writerStart}`, `${writerStart}\n${applyCommand}`));
    await reject(directory, "real-agent journey must write source identity only after apply");
  });
});

test("real-agent journey requires the Agent Foundry generated commit caption exactly once", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", 'git -C generated commit -m "chore: initialize with Agent Foundry"', 'git -C generated commit -m "chore: apply published factory template"');
    await reject(directory, "real-agent journey generated commit caption must name Agent Foundry");
  });
  await fixture(async (directory) => {
    await replaceFirst(directory, "journey", generatedPush, `git -C generated commit -m "chore: apply published factory template"\n${generatedPush}`);
    await reject(directory, "real-agent journey generated commit caption must name Agent Foundry");
  });
});

test("real-agent journey uses checkout-style Basic JOURNEY_TOKEN authentication for the generated repository push", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.journey), "utf8");
    assert.equal((workflow.match(/AUTHORIZATION: basic /gu) ?? []).length, 2);
    assert.ok(workflow.includes(generatedPush));
    assert.equal(workflow.includes("AUTHORIZATION: bearer"), false);
    assert.equal(workflow.includes("GIT_CONFIG_COUNT"), false);
  });
  for (const replacement of [
    "          git -C generated push origin HEAD:main",
    "",
    '          git -c http.extraheader="AUTHORIZATION: bearer $JOURNEY_TOKEN" -C generated push origin HEAD:main',
    '          export GIT_CONFIG_COUNT=1\n          export GIT_CONFIG_KEY_0=http.https://github.com/.extraheader\n          export GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer $JOURNEY_TOKEN"\n          git -C generated push origin HEAD:main\n          unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0',
  ]) {
    await fixture(async (directory) => {
      await replace(directory, "journey", generatedPush, replacement);
      await reject(directory, "real-agent journey generated repository push must use command-local Basic JOURNEY_TOKEN authentication");
    });
  }
});

test("real-agent journey grants workflows write only to the agent App token", async () => {
  await fixture(async (directory) => {
    await replace(directory, "journey", "          permission-workflows: write\n", "");
    await reject(directory, "real-agent journey agent App token permissions must be exactly contents, issues, and workflows write");
  });
  await fixture(async (directory) => {
    await replaceFirst(directory, "journey", "          permission-contents: write\n", "          permission-contents: write\n          permission-workflows: write\n");
    await reject(directory, "real-agent journey workflows permission must be isolated to agent App token");
  });
  await fixture(async (directory) => {
    await replace(directory, "journey", "          permission-workflows: write\n", "          permission-workflows: read\n");
    await reject(directory, "real-agent journey agent App token permissions must be exactly contents, issues, and workflows write");
  });
});

test("real-agent journey rejects a heredoc decoy followed by a wrapped retired commit", async () => {
  await fixture(async (directory) => {
    await replaceFirst(directory, "journey", '          git -C generated commit -m "chore: initialize with Agent Foundry"', '          : <<\'CAPTION\'\n          git -C generated commit -m "chore: initialize with Agent Foundry"\n          CAPTION\n          env git -C generated commit -m "chore: apply published factory template"');
    await reject(directory, "real-agent journey generated commit caption must name Agent Foundry");
  });
  await fixture(async (directory) => {
    await replaceFirst(directory, "journey", '          git -C generated commit -m "chore: initialize with Agent Foundry"', '          env git -C generated commit -m "chore: apply published factory template"');
    await reject(directory, "real-agent journey generated commit caption must name Agent Foundry");
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
    await reject(directory, "real-agent journey agent secret binding is missing           OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
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
    await replace(directory, "journey", "          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}", "          OPENAI_API_KEY: ${{ secrets.MISSING_AGENT_KEY }}");
    await reject(directory, "real-agent journey agent secret binding is missing           OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
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

test("npm release workflow is explicit, immutable, and publish-once", async () => {
  await fixture(async (directory) => {
    const releaseShaCheck = 'assert.equal(JSON.parse(readFileSync("identity/local.json", "utf8")).release.sha, process.env.RELEASE_SHA)';
    await replace(directory, "npmRelease", releaseShaCheck, 'grep -q \'"source_sha"\' identity/local.json');
    await reject(directory, `npm release workflow is missing ${releaseShaCheck}`);
  });
  await fixture(async (directory) => {
    await append(directory, "npmRelease", '\n# grep -q \'"source_sha"\' identity/local.json\n');
    await reject(directory, "npm release workflow checks a nonexistent root source_sha");
  });
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", "npm publish \"$TARBALL\" --provenance --access public", "npm publish \"$TARBALL\" --provenance --access public\nnpm publish \"$TARBALL\" --provenance --access public");
    await reject(directory, "npm release must publish exactly once");
  });
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", "release:\n    types: [published]", "push:\n    branches: [main]");
    await reject(directory, "npm release workflow is missing release:\n    types: [published]");
  });
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", "printf 'TARBALL=%s\\n' \"$TARBALL\" >> \"$GITHUB_ENV\"", "printf 'tarball=%s\\n' \"$TARBALL\" >> \"$GITHUB_ENV\"");
    await reject(directory, "npm release build step must export the packed tarball path as TARBALL for the publish step");
  });
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", "TARBALL=\"./$(find package", "TARBALL=\"$(find package");
    await reject(directory, "npm release must reference the packed tarball as a local ./ path so npm does not treat it as a git spec");
  });
});

const gateMessage = "npm release publish step must gate npm publish behind the version probe and exclusive claim without bypass";

test("npm release gated publish step cannot be weakened or bypassed", async () => {
  const mutations = [
    // Removing the read-only version probe breaks the immutable gated step.
    ['          import { probeExactVersion } from "./scripts/npm-release.mjs";\n', ""],
    // Removing the exclusive first-publish claim breaks the immutable gated step.
    ['          import { claimPublishAttempt } from "./scripts/release-readback.mjs";\n', ""],
    // Forcing an unconditional "publish" decision bypasses the probe and claim.
    ["          process.stdout.write(await decide());\n", '          process.stdout.write("publish");\n'],
  ];
  for (const [from, to] of mutations) {
    await fixture(async (directory) => {
      await replace(directory, "npmRelease", from, to);
      await reject(directory, gateMessage);
    });
  }
  for (const bypass of [
    "        continue-on-error: true\n",
    "    continue-on-error: true\n",
    "        if: always()\n",
    "    defaults:\n      run:\n        shell: sh\n",
  ]) {
    await fixture(async (directory) => {
      await replaceFirst(directory, "npmRelease", "      - name: Publish the exact package with npm provenance\n",
        `      - name: Publish the exact package with npm provenance\n${bypass}`);
      await reject(directory, gateMessage);
    });
  }
});

test("npm release gated publish step only runs npm publish on a granted decision with a token", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.npmRelease), "utf8");
    const step = workflow.split("      - name: Publish the exact package with npm provenance\n")[1]
      ?.split("      - name: Read back npm metadata, tarball, and payload identity\n")[0];
    assert.ok(step);
    const scriptText = step.split("        run: |\n")[1]?.split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
    assert.ok(scriptText);
    const bin = path.join(directory, "bin");
    await mkdir(bin);
    const marker = path.join(directory, "npm-called");
    const fakeNpm = path.join(bin, "npm");
    await writeFile(fakeNpm, '#!/bin/sh\n: > "$FAKE_NPM_MARKER"\nexit 0\n');
    await chmod(fakeNpm, 0o755);
    // A fake node stands in for the real probe+claim decision so the shell gate is exercised offline.
    const fakeNode = path.join(bin, "node");
    await writeFile(fakeNode, '#!/bin/sh\nprintf "%s" "$FAKE_NODE_DECISION"\nexit "${FAKE_NODE_EXIT:-0}"\n');
    await chmod(fakeNode, 0o755);
    const run = (env) => execFileAsync("bash", ["-eo", "pipefail", "-c", scriptText], {
      cwd: directory, env: { PATH: `${bin}:${process.env.PATH}`, TARBALL: "not-a-package.tgz", FAKE_NPM_MARKER: marker, ...env },
    });
    // Granted decision with a token is the only path that reaches npm publish.
    await rm(marker, { force: true });
    await run({ FAKE_NODE_DECISION: "publish", FAKE_NODE_EXIT: "0", NODE_AUTH_TOKEN: "offline-placeholder" });
    await readFile(marker);
    // An already-published version skips publication and exits 0 without invoking npm.
    await rm(marker, { force: true });
    const skipped = await run({ FAKE_NODE_DECISION: "skip", FAKE_NODE_EXIT: "0", NODE_AUTH_TOKEN: "offline-placeholder" });
    assert.equal(skipped.stdout.includes("publication skipped"), true);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    // Fail closed: an inconclusive/unknown or ungranted decision, or a missing token, never publishes.
    for (const env of [
      { FAKE_NODE_DECISION: "", FAKE_NODE_EXIT: "1", NODE_AUTH_TOKEN: "offline-placeholder" },
      { FAKE_NODE_DECISION: "garbage", FAKE_NODE_EXIT: "0", NODE_AUTH_TOKEN: "offline-placeholder" },
      { FAKE_NODE_DECISION: "publish", FAKE_NODE_EXIT: "0", NODE_AUTH_TOKEN: "" },
    ]) {
      await rm(marker, { force: true });
      await assert.rejects(run(env));
      await assert.rejects(readFile(marker), { code: "ENOENT" });
    }
  });
});

test("npm release retries only bounded metadata and tarball readback", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.npmRelease), "utf8");
    const step = workflow.split("      - name: Read back npm metadata, tarball, and payload identity\n")[1]
      ?.split("      - name: Upload immutable release evidence\n")[0];
    assert.ok(step);
    const scriptText = step.split("        run: |\n")[1]?.split("\n          test \"$(find registry-package")[0]
      ?.split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
    assert.ok(scriptText);
    const bin = path.join(directory, "bin");
    await mkdir(bin);
    const npmCalls = path.join(directory, "npm-calls");
    const sleeps = path.join(directory, "sleeps");
    const fakeNpm = path.join(bin, "npm");
    await writeFile(fakeNpm, `#!/bin/sh
count=$(cat "$FAKE_NPM_CALLS" 2>/dev/null || printf '0')
count=$((count + 1))
printf '%s' "$count" > "$FAKE_NPM_CALLS"
if [ "$1" = "view" ] && [ "$count" -lt 3 ]; then exit 1; fi
if [ "$FAKE_ALWAYS_FAIL" = "1" ]; then exit 1; fi
if [ "$1" = "view" ]; then printf '%s' '{"name":"@eff3ct/agent-foundry","version":"0.1.0"}'; fi
exit 0
`);
    const fakeSleep = path.join(bin, "sleep");
    await writeFile(fakeSleep, '#!/bin/sh\nprintf "%s\\n" "$1" >> "$FAKE_SLEEPS"\n');
    await chmod(fakeNpm, 0o755);
    await chmod(fakeSleep, 0o755);
    await mkdir(path.join(directory, "identity"));
    await mkdir(path.join(directory, "registry-package"));
    await execFileAsync("bash", ["-euo", "pipefail", "-c", scriptText], {
      cwd: directory,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        PACKAGE_SPEC: "@eff3ct/agent-foundry@0.1.0",
        FAKE_NPM_CALLS: npmCalls,
        FAKE_SLEEPS: sleeps,
      },
    });
    assert.equal(await readFile(npmCalls, "utf8"), "4");
    assert.equal(await readFile(sleeps, "utf8"), "5\n10\n");
    await writeFile(npmCalls, "0");
    await rm(sleeps, { force: true });
    await assert.rejects(execFileAsync("bash", ["-euo", "pipefail", "-c", scriptText], {
      cwd: directory,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        PACKAGE_SPEC: "@eff3ct/agent-foundry@0.1.0",
        FAKE_NPM_CALLS: npmCalls,
        FAKE_SLEEPS: sleeps,
        FAKE_ALWAYS_FAIL: "1",
      },
    }));
    assert.equal(await readFile(npmCalls, "utf8"), "5");
    assert.equal(await readFile(sleeps, "utf8"), "5\n10\n15\n20\n");
  });
});

test("npm release rejects Corepack and unpinned or unchecked toolchains", async () => {
  const pinned = "npm install --global pnpm@12.4.2";
  for (const replacement of [
    "corepack enable\n          COREPACK_DEFAULT_TO_LATEST=0 corepack install --global pnpm@12.4.2",
    "npm install --global pnpm",
    "npm install --global pnpm@latest",
  ]) {
    await fixture(async (directory) => {
      await replace(directory, "npmRelease", pinned, replacement);
      await reject(directory, replacement.includes("corepack") ? "npm release toolchain must not use Corepack" : `npm release pinned toolchain is missing ${pinned}`);
    });
  }
  for (const check of ['test "$(node --version)" = "v20.19.0"', 'test "$(pnpm --version)" = "12.4.2"']) {
    await fixture(async (directory) => {
      await replace(directory, "npmRelease", check, "true");
      await reject(directory, `npm release pinned toolchain is missing ${check}`);
    });
  }
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", pinned, `npm install --global pnpm\n          # ${pinned}`);
    await reject(directory, `npm release pinned toolchain is missing ${pinned}`);
  });
  await fixture(async (directory) => {
    await replace(directory, "npmRelease", pinned, `test "$(pnpm --version)" = "12.4.2"\n          ${pinned}`);
    await reject(directory, "npm release must check Node before installing pnpm and check pnpm afterwards");
  });
});

test("npm release workflow wires both event SHAs into the pre-publish guard", async () => {
  const cases = [
    ["EVENT_SHA: ${{ github.sha }}", "EVENT_SHA: ${{ github.event_name == 'release' && github.sha || '' }}", "npm release identity step is missing EVENT_SHA: ${{ github.sha }}"],
    ["EVENT_NAME: ${{ github.event_name }}", "EVENT_NAME: release", "npm release identity step is missing EVENT_NAME: ${{ github.event_name }}"],
    ["eventName: process.env.EVENT_NAME, eventSha: process.env.EVENT_SHA", "eventName: process.env.EVENT_NAME, eventSha: ''", "npm release identity step is missing eventName: process.env.EVENT_NAME, eventSha: process.env.EVENT_SHA"],
    ['import { resolveReleaseForPublish } from "./scripts/release-readback.mjs";', 'import { resolvePublishedRelease } from "./scripts/release-readback.mjs";', 'npm release identity step is missing import { resolveReleaseForPublish } from "./scripts/release-readback.mjs";'],
  ];
  for (const [from, to, message] of cases) {
    await fixture(async (directory) => {
      await replace(directory, "npmRelease", from, to);
      await reject(directory, message);
    });
  }
  await fixture(async (directory) => {
    const target = path.join(directory, workflows, files.npmRelease);
    const workflow = await readFile(target, "utf8");
    const publish = workflow.match(/      - name: Publish the exact package with npm provenance\n[\s\S]*?(?=      - name: Read back npm metadata)/u)?.[0];
    assert.ok(publish);
    await writeFile(target, workflow.replace(publish, "").replace("      - name: Resolve immutable release identity\n", `${publish}      - name: Resolve immutable release identity\n`));
    await reject(directory, "npm release must resolve identity before publishing");
  });
  await fixture(async (directory) => {
    await append(directory, "npmRelease", "\n# EXPECTED_SHA\n");
    // A comment outside the identity step cannot satisfy the guard.
    assert.deepEqual(await check(directory), success);
  });
});

test("npm release workflow checks the local release SHA against the resolved source", async () => {
  await fixture(async (directory) => {
    const workflow = await readFile(path.join(directory, workflows, files.npmRelease), "utf8");
    const command = workflow.match(/node --input-type=module -e '([^']+)'/u);
    assert.ok(command);
    const identity = path.join(directory, "identity");
    await mkdir(identity);
    const localIdentity = path.join(identity, "local.json");
    const expectedSha = "a".repeat(40);
    await writeFile(localIdentity, JSON.stringify({ release: { tag: "v0.1.0", sha: expectedSha } }));
    const run = () => execFileAsync(process.execPath, ["--input-type=module", "-e", command[1]], { cwd: directory, env: { RELEASE_SHA: expectedSha } });
    await run();
    await writeFile(localIdentity, JSON.stringify({ release: { tag: "v0.1.0", sha: "b".repeat(40) } }));
    await assert.rejects(run(), /AssertionError/u);
    await writeFile(localIdentity, JSON.stringify({ source_sha: expectedSha }));
    await assert.rejects(run(), /Cannot read properties of undefined/u);
  });
});

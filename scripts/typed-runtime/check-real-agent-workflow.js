#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pins = { "actions/checkout": "11bd71901bbe5b1630ceea73d27597364c9af683", "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02" };
export const check = async (projectRoot = root) => {
    const workflow = await readFile(path.join(projectRoot, ".github/workflows/real-agent-e2e.yml"), "utf8");
    const helper = await readFile(path.join(projectRoot, "scripts/real-agent-e2e.mjs"), "utf8");
    const journeyWorkflow = await readFile(path.join(projectRoot, ".github/workflows/real-agent-journey.yml"), "utf8");
    const journeyReporter = await readFile(path.join(projectRoot, "scripts/real-agent-journey.mjs"), "utf8");
    const contract = `${workflow}\n${helper}`;
    const required = ["workflow_call:", "workflow_dispatch:", "permissions: {}", "repository:", "expected_sha:", "persist-credentials: false", "@0.148.0", 'spawnSync("codex", ["exec"', "--json", "--ephemeral", "--ignore-user-config", "--sandbox", "--ask-for-approval", "OPENAI_API_KEY", "AGENT_GITHUB_TOKEN", "network_proxy", "if: always()", "retention-days: 7"];
    for (const value of required)
        if (!contract.includes(value))
            throw new Error(`real-agent workflow is missing ${value}`);
    if (workflow.includes("python") || workflow.includes("--dangerously-bypass-approvals-and-sandbox") || workflow.includes("BOOTSTRAP_E2E_TOKEN") || workflow.includes("status:approved"))
        throw new Error("real-agent workflow contains a retired or unsafe contract");
    if (!journeyWorkflow.includes("node scripts/real-agent-journey.mjs report") || !journeyWorkflow.includes("--input evidence/journey.json") || !journeyWorkflow.includes('--artifact-url "$WORKFLOW_URL"') || !journeyReporter.includes('command === "report"') || !journeyReporter.includes("canonicalIssue"))
        throw new Error("real-agent journey report command is missing or incomplete");
    for (const reference of [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)].map((match) => match[1])) {
        const [action, sha] = reference.split("@");
        if (!/^[0-9a-f]{40}$/u.test(sha ?? ""))
            throw new Error(`action is not pinned: ${reference}`);
        if (pins[action] && pins[action] !== sha)
            throw new Error(`action pin is not verified: ${reference}`);
    }
    return "real-agent workflow static check OK";
};
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
    check().then((message) => console.log(message)).catch((error) => { console.error(error.message); process.exitCode = 1; });

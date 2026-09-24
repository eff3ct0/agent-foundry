#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check as checkWorkflow } from "./check-bootstrap-workflow.mjs";
import { check as checkRealAgent } from "./typed-runtime/check-real-agent-workflow.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retired = ["init.py", "factory_bootstrap.py", "start.py", "test_init.py", "test_factory_bootstrap.py", "scripts/check-determinism.py", "scripts/check-delivery-contract.py", "scripts/check-factory-layout.py", "scripts/check-real-agent-workflow.py", "scripts/bootstrap-e2e.py", "scripts/release_ref.py", "scripts/real-agent-e2e.py", "scripts/real-agent-journey.py", "scripts/real-agent-journey-agent.py", "scripts/real-agent-journey-assert.py", "scripts/real-agent-journey-cleanup.py", "scripts/real-agent-journey-provision.py", "scripts/test-real-agent-e2e.py", "scripts/test-real-agent-journey.py", "scripts/real-agent-journey-assert.py"];
const activeText = ["AGENT.md", "CLAUDE.md", "README.md", "MAINTAINERS.md", "docs/bootstrap.md", "docs/agent-init.md", "docs/creator.md", "docs/determinism.md", "docs/factory-layout.md", "docs/org-factory.md", "docs/smoke-test.md", "docs/workflow.md", "docs/github-provisioning.md", "hooks/README.md", "templates/definition-of-done.md"];
const retiredCommand = /\bpython3?\s+(?:[^\n`]*\.py\b)/iu;
const exists = (file) => access(path.join(root, file)).then(() => true).catch(() => false);
export const audit = async () => { const missing = []; for (const file of retired) if (await exists(file)) missing.push(`retired path remains: ${file}`); for (const file of activeText) { const text = await readFile(path.join(root, file), "utf8"); if (retiredCommand.test(text)) missing.push(`active documentation references retired Python command: ${file}`); } for (const file of [".github/workflows/bootstrap-e2e.yml", ".github/workflows/template-bootstrap-e2e.yml", ".github/workflows/real-agent-e2e.yml", ".github/workflows/real-agent-journey.yml", ".github/workflows/real-agent-journey-assertions.yml"]) { const text = await readFile(path.join(root, file), "utf8"); if (retiredCommand.test(text)) missing.push(`active workflow references retired Python command: ${file}`); } if (missing.length) throw new Error(missing.join("\n")); await checkWorkflow(); await checkRealAgent(); return "determinism and Python-removal audit OK"; };
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) audit().then(console.log).catch((error) => { console.error(error.message); process.exitCode = 1; });

#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, path.basename(path.dirname(path.dirname(scriptDirectory))) === ".factory" ? "../../.." : "../..");

const providerDirectories = {
  task: "task",
  secrets: "secrets",
  "code-intel": "code-intel",
};
const documentSections: Record<string, string[]> = {
  "AGENT.md": ["Project coordinates", "Archetype documents", "Operating rules", "Protected `status:approved` gate", "Bindings (provider contract)", "Reading order for a cold agent"],
  "agent-runbook.md": ["Why this is a contract, not a runner", "Convergence rules", "Principle: the session is disposable", "Session cycle", "Approval boundaries", "Guardrails"],
  "bindings.md": ["Protected `status:approved` gate"],
};
const contractInstance = /Contract\s+instance\s*:\s*\*{0,2}\s*\[[^\]]+\]\(([^)]+)\)/iu;
const localLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu;
const codeIntelNoneMarkers = ["intentional minimal", "default", "no dependency"];
const ciRecipeMarker = "# Instance of ci/_contract.md";
const sectionAliases: Record<string, string[]> = {
  "how the agent interacts": ["agent interaction"],
  "how the agent resolves secrets": ["agent interaction", "agent resolution"],
  "rules and limitations": ["rules"],
  prohibitions: ["prohibition"],
  "protected `status:approved` gate": ["protected approval"],
};
const approvalAction = "add status:approved";
const allowedPrincipalRoles = ["MAINTAINER", "AUTHORIZED_APPROVER"];
const allowedActorCapabilities = ["MAINTAIN", "ADMIN"];

const display = (target: string, projectRoot: string): string => {
  const relative = path.relative(projectRoot, target);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." ? relative.replaceAll(path.sep, "/") : path.basename(target);
};

const headings = (text: string): string[] => [...String(text).matchAll(/^#{2,6}\s+(.+?)\s*$/gmu)].map((match) => match[1].trim().replace(/#+$/u, "").trim());
const sectionKey = (section: string): string => section.toLowerCase().split(" (", 1)[0].trim();

const field = (text: string, name: string): string => {
  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.replace(/^\s*[-*>]\s*/u, "").replaceAll("**", "");
    const match = line.match(/^\s*([^:*]+?)\s*:\s*(.*?)\s*$/u);
    if (match?.[1].trim().toLowerCase() === name.toLowerCase()) return match[2].trim();
  }
  return "";
};

const sectionPresent = (text: string, section: string): boolean => {
  const wanted = sectionKey(section);
  const sections = new Set(headings(text).map(sectionKey));
  if (sections.has(wanted)) return true;
  const labels = new Set([...String(text).matchAll(/^\s*(?:[-*>]\s*)?\*\*(.+?):\*\*/gmu)].map((match) => sectionKey(match[1])));
  if (labels.has(wanted)) return true;
  if (wanted === "identity" && ["Contract instance", "Capability", "Provider"].every((name) => field(text, name))) return true;
  return (sectionAliases[wanted] ?? []).some((alias) => labels.has(alias));
};

const contractFiles = (projectRoot: string): string[] => {
  const factory = path.join(projectRoot, ".factory");
  const templates = fs.existsSync(factory) ? path.join(factory, "templates") : path.join(projectRoot, "templates");
  const files = [path.join(projectRoot, "AGENT.md"), path.join(templates, "agent-runbook.md"), path.join(projectRoot, "docs", "bindings.md")];
  if (fs.existsSync(path.join(projectRoot, "providers"))) {
    for (const directory of Object.values(providerDirectories)) files.push(path.join(projectRoot, "providers", directory, "_contract.md"));
  }
  if (fs.existsSync(path.join(projectRoot, "ci"))) files.push(path.join(projectRoot, "ci", "_contract.md"), path.join(projectRoot, "ci", "recipes.json"));
  return files;
};

const providerFiles = async (projectRoot: string): Promise<Array<[string, string]>> => {
  const files: Array<[string, string]> = [];
  for (const [capability, directory] of Object.entries(providerDirectories)) {
    const providerDirectory = path.join(projectRoot, "providers", directory);
    for (const entry of await readdir(providerDirectory).catch(() => [])) {
      if (entry.endsWith(".md") && entry !== "_contract.md") files.push([capability, path.join(providerDirectory, entry)]);
    }
  }
  return files.sort((left, right) => left[1].localeCompare(right[1]));
};

const checkLinks = (target: string, text: string, projectRoot: string, errors: string[]): void => {
  for (const match of text.matchAll(localLink)) {
    const link = match[1].replace(/^<|>$/gu, "");
    if (!link || link.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(link)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(target), link.split("#", 1)[0]))) errors.push(`${display(target, projectRoot)} broken link: ${link}`);
  }
};

const checkDocument = (target: string, text: string, projectRoot: string, errors: string[]): void => {
  for (const section of documentSections[path.basename(target)] ?? []) {
    if (!new Set(headings(text).map(sectionKey)).has(sectionKey(section))) errors.push(`${display(target, projectRoot)} missing section: ## ${section}`);
  }
  if (path.basename(target) !== "bindings.md") return;
  const linked = new Set([...text.matchAll(localLink)].map((match) => path.resolve(path.dirname(target), match[1].split("#", 1)[0])));
  for (const relative of ["providers/task/_contract.md", "providers/secrets/_contract.md", "providers/code-intel/_contract.md", "ci/_contract.md"]) {
    const contract = path.join(projectRoot, relative);
    if (fs.existsSync(contract) && !linked.has(path.resolve(contract))) errors.push(`${display(target, projectRoot)} missing contract link: ${relative}`);
  }
};

const checkProvider = (capability: string, target: string, contractPath: string, contractText: string, text: string, projectRoot: string, errors: string[]): void => {
  const label = display(target, projectRoot);
  for (const section of headings(contractText)) if (!sectionPresent(text, section)) errors.push(`${label} missing contract section: ## ${section}`);
  const instance = text.match(contractInstance);
  if (!instance) errors.push(`${label} missing Contract instance link`);
  else if (path.resolve(path.dirname(target), instance[1].split("#", 1)[0]) !== path.resolve(contractPath)) errors.push(`${label} Contract instance link must resolve to ${display(contractPath, projectRoot)}`);
  const expectedCapability = capability === "code-intel" ? "code-intelligence" : capability;
  if (field(text, "Capability").replaceAll("`", "").toLowerCase() !== expectedCapability) errors.push(`${label} must declare Capability: ${expectedCapability}`);
  const provider = field(text, "Provider").replaceAll("`", "");
  if (!provider) errors.push(`${label} must declare a Provider`);
  else if (path.basename(target, ".md") !== "custom" && provider.toLowerCase() !== path.basename(target, ".md").toLowerCase()) errors.push(`${label} Provider must match selectable name '${path.basename(target, ".md")}'`);
  if (capability === "code-intel" && path.basename(target, ".md") === "none") {
    const missing = codeIntelNoneMarkers.filter((marker) => !text.toLowerCase().includes(marker));
    if (missing.length > 0) errors.push(`${label} missing explicit intentional-minimal none contract: ${missing.join(", ")}`);
  }
};

const checkCi = (target: string, projectRoot: string, errors: string[]): void => {
  const label = display(target, projectRoot);
  let recipes: Record<string, unknown>;
  try { recipes = JSON.parse(fs.readFileSync(target, "utf8")); } catch (error) { errors.push(`${label} invalid CI recipes: ${(error as Error).constructor.name}`); return; }
  if (!recipes || typeof recipes !== "object" || Array.isArray(recipes) || Object.keys(recipes).length === 0) { errors.push(`${label} must contain at least one CI recipe`); return; }
  for (const [name, job] of Object.entries(recipes).sort(([left], [right]) => left.localeCompare(right))) {
    if (name === "_contract") { errors.push(`${label} must not select _contract`); continue; }
    if (typeof job !== "string") { errors.push(`${label} recipe '${name}' must be a YAML job string`); continue; }
    if (!job.includes(ciRecipeMarker)) errors.push(`${label} recipe '${name}' missing ${ciRecipeMarker}`);
    if (!new RegExp(`^\\s{2}${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*$`, "mu").test(job)) errors.push(`${label} recipe '${name}' must expose its recipe key as the job`);
    for (const required of ["runs-on:", "actions/checkout@", "steps:", "run:"]) if (!job.includes(required)) errors.push(`${label} recipe '${name}' missing ${required}`);
  }
};

const inferRoot = (paths: string[], projectRoot: string): string => {
  if (projectRoot !== root) return projectRoot;
  for (const target of paths) {
    const directory = path.dirname(target);
    if (Object.values(providerDirectories).includes(path.basename(directory)) && path.basename(path.dirname(directory)) === "providers") return path.resolve(directory, "../..");
  }
  return projectRoot;
};

export const check = async (paths?: string[], projectRoot = root): Promise<string[]> => {
  let effectiveRoot = path.resolve(projectRoot);
  const defaultPaths = paths === undefined;
  if (!defaultPaths) effectiveRoot = inferRoot(paths, effectiveRoot);
  const selected = defaultPaths ? [...contractFiles(effectiveRoot), ...(await providerFiles(effectiveRoot)).map(([, target]) => target)] : paths.map((target) => path.isAbsolute(target) ? target : path.join(effectiveRoot, target));
  const errors: string[] = [];
  const present: string[] = [];
  for (const target of selected) {
    if (!fs.existsSync(target)) errors.push(`required file missing: ${display(target, effectiveRoot)}`);
    else present.push(target);
  }
  for (const target of present) {
    if (path.extname(target).toLowerCase() !== ".md") continue;
    const text = await readFile(target, "utf8");
    checkLinks(target, text, effectiveRoot, errors);
    checkDocument(target, text, effectiveRoot, errors);
  }
  const contracts = new Map<string, [string, string]>();
  for (const [capability, directory] of Object.entries(providerDirectories)) {
    const target = path.join(effectiveRoot, "providers", directory, "_contract.md");
    if (fs.existsSync(target)) contracts.set(capability, [target, await readFile(target, "utf8")]);
  }
  const providers = defaultPaths ? await providerFiles(effectiveRoot) : selected.flatMap((target) => {
    const capability = Object.entries(providerDirectories).find(([, directory]) => path.dirname(target) === path.join(effectiveRoot, "providers", directory))?.[0];
    return capability && path.basename(target) !== "_contract.md" ? [[capability, target]] : [];
  });
  for (const [capability, target] of providers) {
    const contract = contracts.get(capability);
    if (contract && fs.existsSync(target)) checkProvider(capability, target, contract[0], contract[1], await readFile(target, "utf8"), effectiveRoot, errors);
  }
  if (present.includes(path.join(effectiveRoot, "ci", "recipes.json"))) checkCi(path.join(effectiveRoot, "ci", "recipes.json"), effectiveRoot, errors);
  return errors;
};

interface ApprovalEvidence {
  instruction?: { source?: string; current?: boolean; issue?: number; action?: string; principal?: string };
  principal?: { evidence_source?: string; subject?: string; role?: string };
  actor?: { subject?: string; capability?: string };
  operation?: { issue?: number; label?: string; attempts?: number; result?: string; sequence?: string[] };
  readback?: { issue?: number; labels?: string[] };
}

export const delegatedApprovalErrors = (evidence: ApprovalEvidence, targetIssue: number): string[] => {
  const instruction = evidence.instruction ?? {};
  const principal = evidence.principal ?? {};
  const actor = evidence.actor ?? {};
  const operation = evidence.operation ?? {};
  const readback = evidence.readback ?? {};
  const errors = [];
  if (instruction.source !== "direct-human") errors.push("instruction must be direct human input");
  if (instruction.current !== true) errors.push("instruction must be current");
  if (instruction.issue !== targetIssue) errors.push("instruction must name the exact target issue");
  if (instruction.action !== approvalAction) errors.push("instruction must name the exact approval action");
  if (principal.evidence_source !== "target-host") errors.push("principal authority must come from the target host");
  if (!allowedPrincipalRoles.includes(principal.role ?? "")) errors.push("principal lacks target-host maintainer authority");
  if (instruction.principal !== principal.subject) errors.push("instruction principal is not bound to target-host evidence");
  if (actor.subject !== principal.subject) errors.push("authenticated actor is not the authorized principal");
  if (!allowedActorCapabilities.includes(actor.capability ?? "")) errors.push("actor lacks MAINTAIN or ADMIN capability");
  if (operation.issue !== targetIssue || operation.label !== "status:approved") errors.push("operation is not scoped to the exact issue and label");
  if (operation.attempts !== 1) errors.push("operation must have exactly one add attempt");
  if (JSON.stringify(operation.sequence) !== JSON.stringify(["add", "readback"])) errors.push("readback must immediately follow the one add attempt");
  if (operation.result !== "added") errors.push("mutation must succeed with a known added result");
  if (readback.issue !== targetIssue || !readback.labels?.includes("status:approved")) errors.push("target-host readback does not confirm the approval");
  return errors;
};

export const delegatedApprovalAllowed = (evidence: ApprovalEvidence, targetIssue: number): boolean => delegatedApprovalErrors(evidence, targetIssue).length === 0;

const approvalSelfCheck = () => {
  const valid = {
    instruction: { source: "direct-human", current: true, issue: 32, action: approvalAction, principal: "human-1" },
    principal: { evidence_source: "target-host", subject: "human-1", role: "MAINTAINER" },
    actor: { subject: "human-1", capability: "ADMIN" },
    operation: { issue: 32, label: "status:approved", attempts: 1, result: "added", sequence: ["add", "readback"] },
    readback: { issue: 32, labels: ["status:approved"] },
  };
  assert.equal(delegatedApprovalAllowed(valid, 32), true);
  for (const [field, value] of [
    [["instruction", "issue"], 31], [["instruction", "current"], false], [["instruction"], {}],
    [["principal", "role"], "CONTRIBUTOR"], [["actor", "capability"], "TRIAGE"],
    [["operation", "result"], "unknown"], [["readback", "labels"], []],
  ] as Array<[string[], unknown]>) {
    const rejected = structuredClone(valid);
    if (field.length === 2) (rejected as Record<string, Record<string, unknown>>)[field[0]][field[1]] = value;
    else (rejected as Record<string, unknown>)[field[0]] = value;
    assert.equal(delegatedApprovalAllowed(rejected, 32), false, field.join("."));
  }
  process.stdout.write("approval self-check OK\n");
};

const selfCheck = async () => {
  assert.deepEqual(await check(), []);
  const directory = await mkdtemp(path.join(os.tmpdir(), "delivery-contract-"));
  try {
    const missing = path.join(directory, "missing.md");
    assert.deepEqual(await check([missing], directory), ["required file missing: missing.md"]);
    const providerDirectory = path.join(directory, "providers", "code-intel");
    await mkdir(providerDirectory, { recursive: true });
    const contractPath = path.join(providerDirectory, "_contract.md");
    await writeFile(contractPath, "# Abstract contract\n\n## Identity\n## Binding\n## How the agent interacts\n## Rules and limitations\n## Prohibitions\n", "utf8");
    const providerPath = path.join(providerDirectory, "valid.md");
    const valid = "## Valid provider\n\n> **Contract instance:** [`_contract.md`](./_contract.md)\n> **Capability:** `code-intelligence`\n> **Provider:** `valid`\n\n## Identity\n## Binding\nThe provider is available for structural navigation.\n## How the agent interacts\nUse the documented query mechanism.\n## Rules and limitations\nUse native tools when unavailable.\n## Prohibitions\nDo not bypass repository policy.\n";
    await writeFile(providerPath, valid.replace("./_contract.md", "./missing-contract.md"), "utf8");
    const broken = await check([contractPath, providerPath], directory);
    assert.ok(broken.some((error) => error.includes("valid.md broken link")), broken.join("\n"));
    assert.ok(broken.every((error) => !error.includes(directory)), broken.join("\n"));
    await writeFile(providerPath, valid, "utf8");
    assert.deepEqual(await check([contractPath, providerPath], directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  process.stdout.write("self-check OK\n");
};

const main = async () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-check") return selfCheck();
  if (process.argv.length === 3 && process.argv[2] === "--approval-self-check") return approvalSelfCheck();
  throw new Error("usage: check-delivery-contract.js --self-check|--approval-self-check");
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

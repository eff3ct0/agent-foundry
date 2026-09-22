#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, path.basename(path.dirname(scriptDirectory)) === ".factory" ? "../.." : "..");

const providerDirectories = {
  task: "task",
  secrets: "secrets",
  "code-intel": "code-intel",
};
const documentSections = {
  "AGENT.md": ["Project coordinates", "Archetype documents", "Operating rules", "Protected `status:approved` gate", "Bindings (provider contract)", "Reading order for a cold agent"],
  "agent-runbook.md": ["Why this is a contract, not a runner", "Convergence rules", "Principle: the session is disposable", "Session cycle", "Approval boundaries", "Guardrails"],
  "bindings.md": ["Protected `status:approved` gate"],
};
const contractInstance = /Contract\s+instance\s*:\s*\*{0,2}\s*\[[^\]]+\]\(([^)]+)\)/iu;
const localLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu;
const codeIntelNoneMarkers = ["intentional minimal", "default", "no dependency"];
const ciRecipeMarker = "# Instance of ci/_contract.md";
const sectionAliases = {
  "how the agent interacts": ["agent interaction"],
  "how the agent resolves secrets": ["agent interaction", "agent resolution"],
  "rules and limitations": ["rules"],
  prohibitions: ["prohibition"],
  "protected `status:approved` gate": ["protected approval"],
};

const display = (target, projectRoot) => {
  const relative = path.relative(projectRoot, target);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." ? relative.replaceAll(path.sep, "/") : path.basename(target);
};

const headings = (text) => [...String(text).matchAll(/^#{2,6}\s+(.+?)\s*$/gmu)].map((match) => match[1].trim().replace(/#+$/u, "").trim());
const sectionKey = (section) => section.toLowerCase().split(" (", 1)[0].trim();

const field = (text, name) => {
  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.replace(/^\s*[-*>]\s*/u, "").replaceAll("**", "");
    const match = line.match(/^\s*([^:*]+?)\s*:\s*(.*?)\s*$/u);
    if (match?.[1].trim().toLowerCase() === name.toLowerCase()) return match[2].trim();
  }
  return "";
};

const sectionPresent = (text, section) => {
  const wanted = sectionKey(section);
  const sections = new Set(headings(text).map(sectionKey));
  if (sections.has(wanted)) return true;
  const labels = new Set([...String(text).matchAll(/^\s*(?:[-*>]\s*)?\*\*(.+?):\*\*/gmu)].map((match) => sectionKey(match[1])));
  if (labels.has(wanted)) return true;
  if (wanted === "identity" && ["Contract instance", "Capability", "Provider"].every((name) => field(text, name))) return true;
  return (sectionAliases[wanted] ?? []).some((alias) => labels.has(alias));
};

const contractFiles = (projectRoot) => {
  const factory = path.join(projectRoot, ".factory");
  const templates = fs.existsSync(factory) ? path.join(factory, "templates") : path.join(projectRoot, "templates");
  const files = [path.join(projectRoot, "AGENT.md"), path.join(templates, "agent-runbook.md"), path.join(projectRoot, "docs", "bindings.md")];
  if (fs.existsSync(path.join(projectRoot, "providers"))) {
    for (const directory of Object.values(providerDirectories)) files.push(path.join(projectRoot, "providers", directory, "_contract.md"));
  }
  if (fs.existsSync(path.join(projectRoot, "ci"))) files.push(path.join(projectRoot, "ci", "_contract.md"), path.join(projectRoot, "ci", "recipes.json"));
  return files;
};

const providerFiles = async (projectRoot) => {
  const files = [];
  for (const [capability, directory] of Object.entries(providerDirectories)) {
    const providerDirectory = path.join(projectRoot, "providers", directory);
    for (const entry of await readdir(providerDirectory).catch(() => [])) {
      if (entry.endsWith(".md") && entry !== "_contract.md") files.push([capability, path.join(providerDirectory, entry)]);
    }
  }
  return files.sort((left, right) => left[1].localeCompare(right[1]));
};

const checkLinks = (target, text, projectRoot, errors) => {
  for (const match of text.matchAll(localLink)) {
    const link = match[1].replace(/^<|>$/gu, "");
    if (!link || link.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(link)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(target), link.split("#", 1)[0]))) errors.push(`${display(target, projectRoot)} broken link: ${link}`);
  }
};

const checkDocument = (target, text, projectRoot, errors) => {
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

const checkProvider = (capability, target, contractPath, contractText, text, projectRoot, errors) => {
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

const checkCi = (target, projectRoot, errors) => {
  const label = display(target, projectRoot);
  let recipes;
  try { recipes = JSON.parse(fs.readFileSync(target, "utf8")); } catch (error) { errors.push(`${label} invalid CI recipes: ${error.constructor.name}`); return; }
  if (!recipes || typeof recipes !== "object" || Array.isArray(recipes) || Object.keys(recipes).length === 0) { errors.push(`${label} must contain at least one CI recipe`); return; }
  for (const [name, job] of Object.entries(recipes).sort(([left], [right]) => left.localeCompare(right))) {
    if (name === "_contract") { errors.push(`${label} must not select _contract`); continue; }
    if (typeof job !== "string") { errors.push(`${label} recipe '${name}' must be a YAML job string`); continue; }
    if (!job.includes(ciRecipeMarker)) errors.push(`${label} recipe '${name}' missing ${ciRecipeMarker}`);
    if (!new RegExp(`^\\s{2}${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*$`, "mu").test(job)) errors.push(`${label} recipe '${name}' must expose its recipe key as the job`);
    for (const required of ["runs-on:", "actions/checkout@", "steps:", "run:"]) if (!job.includes(required)) errors.push(`${label} recipe '${name}' missing ${required}`);
  }
};

const inferRoot = (paths, projectRoot) => {
  if (projectRoot !== root) return projectRoot;
  for (const target of paths) {
    const directory = path.dirname(target);
    if (Object.values(providerDirectories).includes(path.basename(directory)) && path.basename(path.dirname(directory)) === "providers") return path.resolve(directory, "../..");
  }
  return projectRoot;
};

export const check = async (paths, projectRoot = root) => {
  let effectiveRoot = path.resolve(projectRoot);
  const defaultPaths = paths === undefined;
  if (!defaultPaths) effectiveRoot = inferRoot(paths, effectiveRoot);
  const selected = defaultPaths ? [...contractFiles(effectiveRoot), ...(await providerFiles(effectiveRoot)).map(([, target]) => target)] : paths.map((target) => path.isAbsolute(target) ? target : path.join(effectiveRoot, target));
  const errors = [];
  const present = [];
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
  const contracts = new Map();
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
  throw new Error("usage: check-delivery-contract.mjs --self-check");
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

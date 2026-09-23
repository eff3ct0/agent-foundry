#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredRoot = [".gitignore", "AGENT.md", "CLAUDE.md", "README.md", "start.mjs", "docs/bindings.md"];
const generated = [".github/workflows/ci.yml", "docs/bindings.md"];
const factoryDirs = ["checks", "docs", "hooks", "scripts", "templates"];
const walk = async (directory, relative = "") => { const result = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const name = path.posix.join(relative, entry.name); result.push(name); if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), name)); } return result; };
export const check = async (projectRoot) => { const entries = new Set(await walk(projectRoot)); const errors = []; for (const file of requiredRoot) if (!entries.has(file)) errors.push(`required root file missing: ${file}`); for (const file of generated) if (!entries.has(file)) errors.push(`generated output missing: ${file}`); for (const directory of ["checks", "hooks", "scripts", "templates"]) if (entries.has(directory)) errors.push(`factory support directory remains at root: ${directory}`); const factory = path.join(projectRoot, ".factory"); try { if (!(await stat(factory)).isDirectory()) throw new Error(); for (const directory of factoryDirs) if (!(await stat(path.join(factory, directory)).catch(() => null))?.isDirectory()) errors.push(`missing .factory directory: .factory/${directory}`); } catch { errors.push("missing factory boundary: .factory"); } const contract = path.join(projectRoot, ".factory/docs/factory-layout.md"); const text = await readFile(contract, "utf8").catch(() => ""); for (const file of [...requiredRoot, ...generated]) if (!text.includes(`\`${file}\``)) errors.push(`contract omits path: ${file}`); return errors; };
export const selfCheck = async () => { const directory = await fsMkdtemp(); try { await fsFixture(directory); if ((await check(directory)).length) throw new Error("factory layout structural self-check failed"); console.log("factory layout structural self-check OK"); } finally { await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })); } };
const fsMkdtemp = () => import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "factory-layout-")));
const fsFixture = async (directory) => { const { mkdir, writeFile } = await import("node:fs/promises"); for (const file of [...requiredRoot, ...generated, ".factory/docs/factory-layout.md"]) { const target = path.join(directory, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, [...requiredRoot, ...generated].map((item) => `\`${item}\``).join("\n")); } for (const child of factoryDirs) await mkdir(path.join(directory, ".factory", child), { recursive: true }); };
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) selfCheck().catch((error) => { console.error(error.message); process.exitCode = 1; });

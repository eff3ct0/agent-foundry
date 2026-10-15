import { chmod, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildPayload } from "./build-payload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const creator = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const initializer = JSON.parse(await readFile(path.join(root, "initializer", "package.json"), "utf8"));
if (initializer.version !== creator.version || initializer.dependencies[creator.name] !== creator.version) {
  throw new Error("initializer version and exact creator dependency must match the creator package version");
}

await rm(dist, { recursive: true, force: true });
const tsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const result = spawnSync(tsc, [], { cwd: root, stdio: "inherit", shell: false });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// The compiler result is checked in a disposable directory before packaging, never copied over tracked JS.
const { verifyTypedRuntime } = await import("../dist/typed-runtime-verifier.js");
await verifyTypedRuntime(path.join(root, "scripts/typed"), path.join(root, "scripts/typed-runtime"));
await verifyTypedRuntime(path.join(root, "scripts/typed-inherited"), path.join(root, "scripts/typed-inherited-runtime"));

await chmod(path.join(dist, "index.js"), 0o755);
await buildPayload({ root, dist });
const engineFiles = {};
for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js")).sort()) {
  engineFiles[name] = createHash("sha256").update(await readFile(path.join(dist, name))).digest("hex");
}
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (revision.status !== 0 || !/^[a-f0-9]{40}\s*$/u.test(revision.stdout)) throw new Error("source revision unavailable");
const dirty = spawnSync("git", ["diff", "--quiet", "HEAD", "--"], { cwd: root });
if (![0, 1].includes(dirty.status)) throw new Error("source state unavailable");
const manifest = JSON.parse(await readFile(path.join(dist, "payload-manifest.json"), "utf8"));
const candidate = {
  schema_version: 2,
  package: { name: creator.name, version: creator.version },
  source_revision: revision.stdout.trim(),
  source_dirty: dirty.status === 1,
  payload_digest: manifest.payload_digest,
  engine_files: engineFiles,
};
candidate.candidate_digest = `sha256:${createHash("sha256").update(`${JSON.stringify(candidate, null, 2)}\n`).digest("hex")}`;
await writeFile(path.join(dist, "candidate.json"), `${JSON.stringify(candidate, null, 2)}\n`);

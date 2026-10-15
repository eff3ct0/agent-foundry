import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UPSTREAM_REVISION = "49dd158d1076134a641b33efb035946536778336";
const DEFAULT_ROOT = fileURLToPath(new URL("../foundation/matt-first/", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(`procedure sources: ${message}`); };

const safePath = (relative) => typeof relative === "string" && relative.length > 0
  && !relative.includes("\\") && !relative.includes("\0") && !relative.includes(":")
  && relative.split("/").every((part) => part !== "" && part !== "." && part !== "..");

const readRegular = async (root, relative) => {
  let current = root;
  for (const part of relative.split("/").slice(0, -1)) {
    current = path.join(current, part);
    if (!(await lstat(current)).isDirectory()) fail(`unsafe directory: ${relative}`);
  }
  const filename = path.join(root, relative);
  if (!(await lstat(filename)).isFile()) fail(`unsafe file: ${relative}`);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 1024 * 1024) fail(`invalid file: ${relative}`);
    return { bytes: await handle.readFile(), mode: metadata.mode & 0o777 };
  } finally {
    await handle.close();
  }
};

// Returns verified immutable input buffers, not installer ownership or readiness evidence.
export const readProcedureSources = async (root = DEFAULT_ROOT) => {
  if (!(await lstat(root)).isDirectory()) fail("unsafe source root");
  const { bytes: lockBytes } = await readRegular(root, "upstream-lock.json");
  const lock = JSON.parse(lockBytes.toString("utf8"));
  if (lock?.schema_version !== 1 || lock.repository !== "mattpocock/skills"
    || lock.revision !== UPSTREAM_REVISION || !Array.isArray(lock.files)
    || lock.files.length === 0 || lock.files.length > 1000) fail("unsupported upstream lock");

  const seen = new Set();
  for (const file of lock.files) {
    if (!file || !safePath(file.path) || seen.has(file.path)
      || !["100644", "100755"].includes(file.mode)
      || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 1024 * 1024
      || !/^[a-f0-9]{64}$/u.test(file.sha256) || !/^[a-f0-9]{40}$/u.test(file.git_blob)) {
      fail("invalid or duplicate upstream file");
    }
    seen.add(file.path);
  }

  const files = [];
  for (const file of lock.files) {
    const { bytes, mode } = await readRegular(root, `upstream/${file.path}`);
    const gitBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (bytes.length !== file.size || digest(bytes) !== file.sha256 || gitBlob !== file.git_blob
      || mode !== (file.mode === "100755" ? 0o755 : 0o644)) fail(`integrity mismatch: ${file.path}`);
    files.push({ path: file.path, mode: file.mode, bytes, sha256: file.sha256, git_blob: file.git_blob });
  }
  return { repository: lock.repository, revision: lock.revision, lockDigest: `sha256:${digest(lockBytes)}`, files };
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const result = await readProcedureSources(process.argv[2]);
    process.stdout.write(`${JSON.stringify({ repository: result.repository, revision: result.revision,
      lock_digest: result.lockDigest, verified_files: result.files.length })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

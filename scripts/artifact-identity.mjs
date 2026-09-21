import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export class ArtifactIdentityError extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => `sha256:${sha256(Buffer.from(JSON.stringify(value)))}`;

const requiredString = (value, name) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ArtifactIdentityError(`${name} is absent or malformed`);
  }
  return value;
};

const regularFile = async (file, name) => {
  const entry = await lstat(file).catch(() => {
    throw new ArtifactIdentityError(`${name} is absent`);
  });
  if (!entry.isFile()) throw new ArtifactIdentityError(`${name} is not a regular file`);
  return entry;
};

const treeFiles = async (root, relative = "") => {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => {
    throw new ArtifactIdentityError("generated project tree is absent");
  });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.posix.join(relative, entry.name);
    const absolute = path.join(root, child);
    if (entry.isSymbolicLink()) throw new ArtifactIdentityError(`generated project tree contains a symlink: ${child}`);
    if (entry.isDirectory()) files.push(...await treeFiles(root, child));
    else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      const metadata = await lstat(absolute);
      files.push({ path: child, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), size: bytes.byteLength, sha256: sha256(bytes) });
    } else {
      throw new ArtifactIdentityError(`generated project tree contains an unsupported entry: ${child}`);
    }
  }
  return files;
};

export const generatedTreeDigest = async (projectPath) => digest({ files: await treeFiles(projectPath) });

export const packedArtifactIdentity = async ({ tarballPath, packagePath, projectPath }) => {
  await regularFile(tarballPath, "packed tarball");
  const packageJson = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(packagePath, "dist", "payload-manifest.json"), "utf8"));
  const name = requiredString(packageJson.name, "package name");
  const version = requiredString(packageJson.version, "package version");
  const payloadDigest = requiredString(manifest.payload_digest, "payload digest");
  if (manifest.package_name !== name || manifest.package_version !== version) {
    throw new ArtifactIdentityError("package metadata does not match the bundled payload manifest");
  }
  return {
    schema_version: 1,
    package: { name, version },
    tarball_digest: `sha256:${sha256(await readFile(tarballPath))}`,
    payload_digest: payloadDigest,
    tree_digest: await generatedTreeDigest(projectPath),
  };
};

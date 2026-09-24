import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
export class ArtifactIdentityError extends Error {
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => `sha256:${sha256(Buffer.from(JSON.stringify(value)))}`;
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
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
    if (!entry.isFile())
        throw new ArtifactIdentityError(`${name} is not a regular file`);
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
        if (entry.isSymbolicLink())
            throw new ArtifactIdentityError(`generated project tree contains a symlink: ${child}`);
        if (entry.isDirectory())
            files.push(...await treeFiles(root, child));
        else if (entry.isFile()) {
            const bytes = await readFile(absolute);
            const metadata = await lstat(absolute);
            files.push({ path: child, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), size: bytes.byteLength, sha256: sha256(bytes) });
        }
        else {
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
const releaseIdentity = (value) => {
    if (value === undefined)
        return { status: "unavailable", code: "release_identity_unavailable" };
    if (typeof value !== "object" || value === null || Array.isArray(value) || !("status" in value) || value.status !== "verified"
        || !("tag" in value) || typeof value.tag !== "string" || !value.tag
        || !("sha" in value) || typeof value.sha !== "string" || !SHA.test(value.sha)) {
        throw new ArtifactIdentityError("release identity is absent or malformed");
    }
    return { status: "verified", tag: value.tag, sha: value.sha };
};
export const consumerArtifactIdentity = async ({ tarballPath, packagePath, projectPath, sourceSha, release }) => {
    if (typeof sourceSha !== "string" || !SHA.test(sourceSha)) {
        throw new ArtifactIdentityError("source identity is absent or malformed");
    }
    const base = await packedArtifactIdentity({ tarballPath, packagePath, projectPath });
    const manifest = JSON.parse(await readFile(path.join(packagePath, "dist", "payload-manifest.json"), "utf8"));
    if (typeof manifest.payload_version !== "string" || !DIGEST.test(base.payload_digest)) {
        throw new ArtifactIdentityError("payload identity is absent or malformed");
    }
    return {
        schema_version: 2,
        package: base.package,
        payload: { version: manifest.payload_version, digest: base.payload_digest },
        tarball_digest: base.tarball_digest,
        source_sha: sourceSha,
        release: releaseIdentity(release),
        tree_digest: base.tree_digest,
    };
};

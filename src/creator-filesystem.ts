import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, type FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";

export class FilesystemConflict extends Error {}

// Descriptor-relative paths prevent replacement of a root/ancestor from redirecting writes.
// The host capability is checked before mutation; absence is an explicit gate, not a lexical fallback.
export class AnchoredDirectory {
  constructor(readonly handle: FileHandle, readonly descriptorRoot: string) {}
  get location(): string { return `${this.descriptorRoot}/${this.handle.fd}`; }

  static async open(absolute: string, expected?: { dev: number; ino: number }): Promise<AnchoredDirectory> {
    const handle = await open(absolute, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const entry = await handle.stat();
      if (!entry.isDirectory() || (expected && (entry.dev !== expected.dev || entry.ino !== expected.ino))) throw new FilesystemConflict(`directory identity changed before mutation: ${absolute}`);
      const descriptorRoot = process.platform === "linux" ? `/proc/${process.pid}/fd` : "/dev/fd";
      const resolved = await lstat(`${descriptorRoot}/${handle.fd}/.`).catch(() => undefined);
      if (!resolved?.isDirectory() || resolved.dev !== entry.dev || resolved.ino !== entry.ino) throw new FilesystemConflict("host cannot anchor mutation to an opened directory; no lexical-path fallback");
      return new AnchoredDirectory(handle, descriptorRoot);
    } catch (error) { await handle.close(); throw error; }
  }

  async parent<T>(relative: string, create: boolean, action: (leaf: string) => Promise<T>): Promise<T> {
    if (!relative || /[\\:\u0000-\u001f]/u.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new FilesystemConflict(`invalid anchored path: ${relative}`);
    let directory: AnchoredDirectory = this;
    try {
      for (const part of relative.split("/").slice(0, -1)) {
        const next = `${directory.location}/${part}`;
        if (create) await mkdir(next, { mode: 0o755 }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
        const child = await AnchoredDirectory.open(next);
        if (directory !== this) await directory.handle.close();
        directory = child;
      }
      return await action(`${directory.location}/${relative.split("/").at(-1)!}`);
    } finally { if (directory !== this) await directory.handle.close(); }
  }

  async matchesRoot(absolute: string): Promise<void> {
    const current = await lstat(absolute);
    const held = await this.handle.stat();
    if (!current.isDirectory() || current.dev !== held.dev || current.ino !== held.ino || await realpath(absolute) !== absolute) throw new FilesystemConflict("accepted target was moved/replaced; original anchored effects retained, no writes redirected");
  }

  async verify(file: { relativePath: string; mode: number; size: number; sha256: string }): Promise<void> {
    await this.parent(file.relativePath, false, async (leaf) => {
      const handle = await open(leaf, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const entry = await handle.stat();
        if (!entry.isFile() || (entry.mode & 0o7777) !== file.mode || entry.size !== file.size
          || createHash("sha256").update(await handle.readFile()).digest("hex") !== file.sha256) throw new FilesystemConflict(`anchored bytes or mode differ: ${file.relativePath}`);
      } finally { await handle.close(); }
    });
  }
}

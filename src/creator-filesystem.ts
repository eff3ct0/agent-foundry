import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, type FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";

export class FilesystemConflict extends Error {}

// Descriptor-relative paths prevent replacement of a root/ancestor from redirecting writes.
// The host capability is checked before mutation; absence is an explicit gate, not a lexical fallback.
export class AnchoredDirectory {
  private readonly children = new Map<string, AnchoredDirectory>();
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

  private async createChild(name: string, mode: number): Promise<AnchoredDirectory> {
    const location = `${this.location}/${name}`;
    await mkdir(location, { mode });
    const child = await AnchoredDirectory.open(location, await lstat(location));
    try {
      if ((await readdir(child.location)).length) throw new FilesystemConflict(`new directory changed before acquisition: ${name}`);
      this.children.set(name, child);
      return child;
    } catch (error) { await child.close(); throw error; }
  }

  private async child(name: string, create: boolean): Promise<AnchoredDirectory> {
    const held = this.children.get(name);
    if (held) {
      const named = await lstat(`${this.location}/${name}`);
      const identity = await held.handle.stat();
      if (!named.isDirectory() || named.dev !== identity.dev || named.ino !== identity.ino) throw new FilesystemConflict(`acquired directory was replaced: ${name}`);
      return held;
    }
    if (create) return this.createChild(name, 0o755);
    const opened = await AnchoredDirectory.open(`${this.location}/${name}`);
    this.children.set(name, opened);
    return opened;
  }

  async parent<T>(relative: string, create: boolean, action: (leaf: string, parent: AnchoredDirectory) => Promise<T>): Promise<T> {
    if (!relative || /[\\:\u0000-\u001f]/u.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new FilesystemConflict(`invalid anchored path: ${relative}`);
    const parts = relative.split("/");
    let directory: AnchoredDirectory = this;
    for (const part of parts.slice(0, -1)) directory = await directory.child(part, create);
    return action(`${directory.location}/${parts.at(-1)!}`, directory);
  }

  async acquire(relative: string, mode: number): Promise<AnchoredDirectory> {
    return this.parent(relative, true, (_leaf, parent) => parent.createChild(relative.split("/").at(-1)!, mode));
  }

  async close(): Promise<void> {
    try { await Promise.all([...this.children.values()].map((child) => child.close())); }
    finally { await this.handle.close(); }
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

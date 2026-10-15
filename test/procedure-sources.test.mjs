import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readProcedureSources } from "../scripts/procedure-sources.mjs";

const fixture = async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "foundry-procedure-sources-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "upstream"));
  const bytes = Buffer.from("reviewed procedure\n");
  const entry = { path: "SKILL.md", mode: "100644", size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    git_blob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") };
  const manifest = { schema_version: 1, repository: "mattpocock/skills",
    revision: "49dd158d1076134a641b33efb035946536778336", files: [entry] };
  await writeFile(path.join(root, "upstream", entry.path), bytes, { mode: 0o644 });
  const save = () => writeFile(path.join(root, "upstream-lock.json"), `${JSON.stringify(manifest)}\n`);
  await save();
  return { root, manifest, save };
};

test("changed procedure bytes cannot retain reviewed source identity", async (t) => {
  const { root } = await fixture(t);
  await readProcedureSources(root);
  await writeFile(path.join(root, "upstream", "SKILL.md"), "unreviewed content\n");
  await assert.rejects(readProcedureSources(root), /integrity.*SKILL\.md/u);
});

test("unreviewed executable mode cannot retain reviewed source identity", async (t) => {
  const { root } = await fixture(t);
  await chmod(path.join(root, "upstream", "SKILL.md"), 0o755);
  await assert.rejects(readProcedureSources(root), /integrity.*SKILL\.md/u);
});

test("a symlink cannot substitute even identical reviewed bytes", async (t) => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, "outside.md"), "reviewed procedure\n");
  await rm(path.join(root, "upstream", "SKILL.md"));
  await symlink("../outside.md", path.join(root, "upstream", "SKILL.md"));
  await assert.rejects(readProcedureSources(root), /unsafe file/u);
});

test("a symlinked source directory is not a selected resource tree", async (t) => {
  const { root } = await fixture(t);
  await rm(path.join(root, "upstream"), { recursive: true });
  await mkdir(path.join(root, "external"));
  await writeFile(path.join(root, "external", "SKILL.md"), "reviewed procedure\n");
  await symlink("external", path.join(root, "upstream"));
  await assert.rejects(readProcedureSources(root), /unsafe directory/u);
});

test("a changed lock cannot escape its source root or select a file twice", async (t) => {
  const { root, manifest, save } = await fixture(t);
  const original = manifest.files[0].path;
  for (const unsafe of ["../SKILL.md", "/SKILL.md", "skills/../../SKILL.md", "skills\\SKILL.md", "C:/SKILL.md"]) {
    manifest.files[0].path = unsafe;
    await save();
    await assert.rejects(readProcedureSources(root), /invalid or duplicate/u);
  }
  manifest.files[0].path = original;
  manifest.files.push({ ...manifest.files[0] });
  await save();
  await assert.rejects(readProcedureSources(root), /invalid or duplicate/u);
});

test("the selected baseline cannot silently move to another upstream revision", async (t) => {
  const { root, manifest, save } = await fixture(t);
  manifest.revision = "0000000000000000000000000000000000000000";
  await save();
  await assert.rejects(readProcedureSources(root), /unsupported upstream lock/u);
});

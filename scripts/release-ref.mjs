import { pathToFileURL } from "node:url";

const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/+@-]{0,119}$/u;
const ERROR_MESSAGE = "tag must be a safe non-empty Git ref";

export const validateTag = (value) => {
  if (typeof value !== "string") throw new Error(ERROR_MESSAGE);
  const tag = value.trim();
  const components = tag.split("/");
  if (!TAG_PATTERN.test(tag) || tag === "@" || tag.includes("..") || tag.includes("//") || tag.includes("@{") ||
      tag.endsWith(".") || tag.endsWith("/") || tag.endsWith(".lock") ||
      components.some((component) => component.startsWith(".") || component.endsWith("."))) {
    throw new Error(ERROR_MESSAGE);
  }
  return tag;
};

const selfCheck = () => {
  if (validateTag("v1.2.3") !== "v1.2.3" || validateTag("release+build/1") !== "release+build/1") {
    throw new Error("release reference validation self-check failed");
  }
  for (const tag of ["", "@", "release..candidate", "release//candidate", "release@{1}", ".release", "release.", "release.lock"]) {
    try {
      validateTag(tag);
    } catch (error) {
      if (error.message === ERROR_MESSAGE) continue;
      throw error;
    }
    throw new Error("unsafe Git ref accepted by self-check");
  }
  process.stdout.write("release reference validation self-check OK\n");
};

const main = async () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-check") return selfCheck();
  if (process.argv.length !== 4 || process.argv[2] !== "--json") throw new Error("usage: release-ref.mjs --self-check | --json <value>");
  const value = JSON.parse(process.argv[3]);
  process.stdout.write(`${JSON.stringify({ tag: validateTag(value) })}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

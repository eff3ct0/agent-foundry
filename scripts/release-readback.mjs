import { validateTag } from "./release-ref.mjs";

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const SHA = /^[0-9a-f]{40}$/u;
export const MAX_ANNOTATED_TAG_DEPTH = 5;

const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const rejected = (code) => ({ status: "rejected", code });
const indeterminate = () => ({ status: "indeterminate", code: "read_indeterminate" });

const repositoryName = (value) => {
  if (typeof value !== "string" || !REPOSITORY.test(value)) throw new ReleaseReadbackError("invalid_repository", "repository identifier is invalid");
  return value;
};

const fullSha = (value) => {
  const sha = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHA.test(sha) ? sha : "";
};

const releaseIsPublished = (release, tag) => object(release) && release.tag_name === tag && release.draft === false
  && typeof release.published_at === "string" && release.published_at.trim().length > 0;

const tagTarget = (value) => {
  const target = object(value) && object(value.object) ? value.object : undefined;
  return target && ["commit", "tag"].includes(target.type) && fullSha(target.sha) ? { type: target.type, sha: fullSha(target.sha) } : undefined;
};

const read = async (client, endpoint) => {
  let result;
  try {
    result = await client.get(endpoint);
  } catch {
    return indeterminate();
  }
  if (!object(result)) return indeterminate();
  if (result.status === "indeterminate") return indeterminate();
  if (result.status !== "ok" || !object(result.payload)) return rejected("read_rejected");
  return { status: "ok", payload: result.payload };
};

export class ReleaseReadbackError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const resolvePublishedRelease = async ({ client, repository, tag, expectedSha = "" }) => {
  if (!object(client) || typeof client.get !== "function") throw new ReleaseReadbackError("invalid_client", "hosted lifecycle read client is required");
  repository = repositoryName(repository);
  tag = validateTag(tag);
  if (expectedSha !== "") {
    expectedSha = fullSha(expectedSha);
    if (expectedSha === "") throw new ReleaseReadbackError("invalid_expected_sha", "expected commit must be a full immutable SHA");
  }

  const encodedTag = encodeURIComponent(tag);
  const release = await read(client, `/repos/${repository}/releases/tags/${encodedTag}`);
  if (release.status !== "ok") return release;
  if (!object(release.payload) || typeof release.payload.tag_name !== "string") return rejected("malformed_release");
  if (release.payload.tag_name !== tag) return rejected("release_tag_mismatch");
  if (!releaseIsPublished(release.payload, tag)) return rejected("release_unpublished");

  let reference = await read(client, `/repos/${repository}/git/ref/tags/${encodedTag}`);
  if (reference.status !== "ok") return reference;
  let target = tagTarget(reference.payload);
  if (!target) return rejected("malformed_tag_reference");

  for (let depth = 0; target.type === "tag"; depth += 1) {
    if (depth >= MAX_ANNOTATED_TAG_DEPTH) return rejected("annotated_tag_depth_exceeded");
    reference = await read(client, `/repos/${repository}/git/tags/${target.sha}`);
    if (reference.status !== "ok") return reference;
    target = tagTarget(reference.payload);
    if (!target) return rejected("malformed_annotated_tag");
  }

  if (expectedSha && target.sha !== expectedSha) return rejected("release_sha_mismatch");
  return { status: "ok", tag, sha: target.sha };
};

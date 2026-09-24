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

export const resolveReleaseForPublish = async ({ eventName, eventSha, ...release }) => {
  if (eventName !== "release" && eventName !== "workflow_dispatch") return rejected("unsupported_release_event");
  if (typeof eventSha !== "string" || !SHA.test(eventSha)) return rejected("event_sha_missing_or_malformed");
  return resolvePublishedRelease({ ...release, expectedSha: eventSha });
};

export const PUBLISH_CLAIM_ASSET = "npm-publish-attempt";
const CLAIM_MAX_BYTES = 1024;
const CLAIM_LIST_MAX_BYTES = 64 * 1024;
const CLAIM_TIMEOUT_MS = 5000;
// GitHub documents this domain for release-asset downloads; other origins must fail closed.
// https://docs.github.com/en/actions/reference/runners/self-hosted-runners#accessible-domains-by-function
const CLAIM_DOWNLOAD_ORIGIN = "https://release-assets.githubusercontent.com";
const blocked = (code) => ({ status: "blocked", code });

const claimDownloadUrl = (location) => {
  if (typeof location !== "string" || !location.startsWith(`${CLAIM_DOWNLOAD_ORIGIN}/`)) return "";
  try {
    const url = new URL(location);
    return url.origin === CLAIM_DOWNLOAD_ORIGIN && !url.username && !url.password && !url.hash ? url.href : "";
  } catch {
    return "";
  }
};

const claimBytes = async (response, limit) => {
  if (!object(response) || !Number.isInteger(response.status)) throw new Error("invalid response");
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > limit)) throw new Error("invalid length");
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("missing body");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || (size += value.byteLength) > limit) throw new Error("oversized response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
};

const claimJson = async (response, limit) => JSON.parse((await claimBytes(response, limit)).toString("utf8"));
const uploadedAsset = (asset, name, size) => object(asset) && Number.isSafeInteger(asset.id) && asset.id > 0
  && asset.name === name && asset.state === "uploaded" && asset.size === size;

// Only call for a verified NEW release ID, under per-tag serialization. No previous claim grants a publish.
// The caller supplies an authenticated transport; this module never reads credentials or retries writes.
export const claimPublishAttempt = async ({ transport, downloadTransport, repository, releaseId, tag, sourceSha, packageName, version, runId, timeoutMs = CLAIM_TIMEOUT_MS }) => {
  if (typeof transport !== "function") throw new ReleaseReadbackError("invalid_client", "claim transport is required");
  repository = repositoryName(repository);
  tag = validateTag(tag);
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0 || !SHA.test(sourceSha ?? "")
    || packageName !== "@eff3ct/agent-foundry" || typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)
    || version.length > 100 || tag !== `v${version}` || typeof runId !== "string" || !/^[1-9]\d{0,19}$/u.test(runId)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CLAIM_TIMEOUT_MS) {
    throw new ReleaseReadbackError("invalid_claim", "publish attempt identity is invalid");
  }
  const body = Buffer.from(JSON.stringify({ tag, source_sha: sourceSha, package: packageName, version, run_id: runId }));
  if (body.length > CLAIM_MAX_BYTES) throw new ReleaseReadbackError("invalid_claim", "publish attempt identity is too large");

  const base = `/repos/${repository}/releases/${releaseId}`;
  const controller = new AbortController();
  const request = async (method, url, options = {}, send = transport) => {
    if (controller.signal.aborted) throw new Error("claim deadline");
    const response = await send({ method, url, signal: controller.signal, ...options });
    if (controller.signal.aborted || !object(response) || !Number.isInteger(response.status)) throw new Error("invalid response");
    return response;
  };
  const execute = async () => {
    try {
      const created = await request("POST", `https://uploads.github.com${base}/assets?name=${PUBLISH_CLAIM_ASSET}`, {
        headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json", "Content-Length": String(body.length) }, body,
      });
      if (created.status === 422) return blocked("claim_exists");
      if (created.status !== 201) return blocked("claim_unknown");
      const asset = await claimJson(created, CLAIM_MAX_BYTES);
      if (!uploadedAsset(asset, PUBLISH_CLAIM_ASSET, body.length)) return blocked("claim_unverified");

      const listed = await request("GET", `https://api.github.com${base}/assets?per_page=100`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (listed.status !== 200) return blocked("claim_unverified");
      const assets = await claimJson(listed, CLAIM_LIST_MAX_BYTES);
      // A full page might hide another same-name asset. Never assume uniqueness without exhaustive readback.
      if (!Array.isArray(assets) || assets.length >= 100) return blocked("claim_unverified");
      const matches = assets.filter((entry) => object(entry) && entry.name === PUBLISH_CLAIM_ASSET);
      if (matches.length !== 1 || !uploadedAsset(matches[0], PUBLISH_CLAIM_ASSET, body.length)
        || matches[0].id !== asset.id) return blocked("claim_unverified");

      let downloaded = await request("GET", `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`, {
        headers: { Accept: "application/octet-stream" }, redirect: "manual",
      });
      if (downloaded.status === 302) {
        const url = claimDownloadUrl(downloaded.headers?.get?.("location"));
        if (!url || typeof downloadTransport !== "function" || downloadTransport === transport) return blocked("claim_unverified");
        downloaded = await request("GET", url, { redirect: "manual", credentials: "omit" }, downloadTransport);
      }
      if (downloaded.status !== 200 || !(await claimBytes(downloaded, CLAIM_MAX_BYTES)).equals(body)) return blocked("claim_unverified");
      if (controller.signal.aborted) return blocked("claim_unknown");
      return { status: "claimed", releaseId, assetId: asset.id };
    } catch {
      // Includes lost POST responses, 502 starter assets, timeouts, malformed responses and readback failures.
      return blocked("claim_unknown");
    }
  };
  let timer;
  try {
    return await Promise.race([execute(), new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(blocked("claim_unknown")); }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
};

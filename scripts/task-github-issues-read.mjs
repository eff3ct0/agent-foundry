// @ts-check
import { TaskAdapterError, parseHandoffContent } from "./task-adapter.mjs";

// The caller owns an authorized, read-only, api.github.com-scoped HTTP transport.
// get must not follow redirects or substitute cached/partial results; no token or
// network client is created here. Each result is {status: HTTP status, body: JSON}.
/** @typedef {{ get: (endpoint: string) => Promise<unknown> }} GitHubIssuesReadTransport */

/** @param {string} code @param {string} message @returns {never} */
const fail = (code, message) => { throw new TaskAdapterError(code, message); };
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/** @param {unknown} value @returns {value is string} */
const text = (value) => typeof value === "string" && value.length > 0 && value === value.trim() && !/[\r\n]/u.test(value);
const repository = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const number = /^[1-9][0-9]*$/u;
const envelope = "task-adapter:v1:";

/** @param {unknown} value */
const positive = (value) => Number.isSafeInteger(value) && /** @type {number} */ (value) > 0;

/**
 * Reads one GitHub Issues repository issue. TRACKER and TRACKER_KEY must both
 * be the same full owner/repo; a board or alias has no native issue proof.
 * A fresh issue read before and after all count-bounded comment pages rejects
 * changed state, labels or count. No mutation or atomic claim is provided.
 * @param {GitHubIssuesReadTransport} transport
 */
export const createGitHubIssuesReadPort = (transport) => {
  if (typeof transport?.get !== "function") fail("native_unsupported", "github-issues: supply scoped native HTTP GET issue and complete comments access");
  return {
    /** @param {{provider: string, tracker: string, trackerKey: string, nativeId: string}} identity */
    read: async (identity) => {
      const target = `github-issues ${identity?.tracker ?? "unknown"}#${identity?.nativeId ?? "unknown"}`;
      if (identity?.provider !== "github-issues" || !text(identity.tracker) || !repository.test(identity.tracker)
          || identity.tracker.split("/").some((part) => part === "." || part === "..")
          || identity.trackerKey !== identity.tracker || !number.test(identity.nativeId)
          || !Number.isSafeInteger(Number(identity.nativeId))) {
        fail("identity_invalid", `${target}: require exact owner/repo in TRACKER and TRACKER_KEY and canonical positive issue number`);
      }
      const issuePath = `/repos/${identity.tracker}/issues/${identity.nativeId}`;
      const issueUrl = `https://api.github.com${issuePath}`;
      /** @param {string} endpoint */
      const get = async (endpoint) => {
        let response;
        try { response = await transport.get(endpoint); }
        catch { fail("readback_unavailable", `${target}: restore permissioned GitHub Issues GET ${endpoint} and retry readback`); }
        if (!record(response) || response.status !== 200) {
          fail("readback_unavailable", `${target}: GET ${endpoint} must return a direct HTTP 200 with complete native JSON; check access, redirects and target`);
        }
        return response.body;
      };
      /** @param {unknown} value */
      const issueState = (value) => {
        if (!record(value) || value.url !== issueUrl || value.repository_url !== `https://api.github.com/repos/${identity.tracker}`
            || value.number !== Number(identity.nativeId) || "pull_request" in value
            || !["open", "closed"].includes(/** @type {string} */ (value.state))
            || !Array.isArray(value.labels) || !Number.isSafeInteger(value.comments)
            || /** @type {number} */ (value.comments) < 0 || /** @type {number} */ (value.comments) > 10000
            || !text(value.updated_at)) {
          fail("readback_mismatch", `${target}: verify native repository, issue number, issue type, state, labels and comment count`);
        }
        /** @type {string[]} */
        const labels = [];
        for (const label of value.labels) {
          if (!record(label) || !text(label.name) || labels.includes(label.name)) {
            fail("readback_mismatch", `${target}: native issue labels are missing or ambiguous`);
          }
          labels.push(label.name);
        }
        return { status: JSON.stringify({ state: value.state, labels: labels.sort() }), count: /** @type {number} */ (value.comments), updated: value.updated_at };
      };
      const before = issueState(await get(issuePath));
      /** @type {Array<{operationId: string, kind: string, content: string}>} */
      const entries = [];
      const seenIds = new Set();
      const seenOperations = new Set();
      for (let page = 1, read = 0; page === 1 || read < before.count; page++) {
        const endpoint = `${issuePath}/comments?per_page=100&page=${page}`;
        const comments = await get(endpoint);
        if (!Array.isArray(comments) || comments.length !== Math.min(100, before.count - read)) {
          fail("readback_unavailable", `${target}: obtain all ${before.count} native comments without partial or ambiguous pages`);
        }
        for (const comment of comments) {
          if (!record(comment) || !positive(comment.id) || seenIds.has(comment.id)
              || comment.issue_url !== issueUrl || comment.url !== `https://api.github.com/repos/${identity.tracker}/issues/comments/${comment.id}`
              || typeof comment.body !== "string") {
            fail("readback_mismatch", `${target}: confirm each native comment ID, issue URL and body`);
          }
          seenIds.add(comment.id);
          if (!comment.body.startsWith(envelope)) continue;
          let entry;
          try { entry = JSON.parse(comment.body.slice(envelope.length)); }
          catch { fail("readback_mismatch", `${target}: malformed operation envelope on comment ${comment.id}`); }
          if (!record(entry) || !text(entry.operationId) || !["comment", "handoff"].includes(/** @type {string} */ (entry.kind))
              || !text(entry.content) || seenOperations.has(entry.operationId)
              || Object.keys(entry).sort().join(",") !== "content,kind,operationId"
              || comment.body !== envelope + JSON.stringify(entry)) {
            fail("readback_mismatch", `${target}: ambiguous or duplicate operation correlation on comment ${comment.id}`);
          }
          if (entry.kind === "handoff") {
            try { parseHandoffContent(entry.content); }
            catch { fail("readback_mismatch", `${target}: invalid handoff on comment ${comment.id}; inspect native evidence`); }
          }
          seenOperations.add(entry.operationId);
          entries.push(/** @type {{operationId: string, kind: string, content: string}} */ (entry));
        }
        read += comments.length;
      }
      const after = issueState(await get(issuePath));
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        fail("readback_mismatch", `${target}: issue state or comment count changed during readback; retry a fresh read`);
      }
      return { identity: { ...identity }, status: after.status, entries };
    },
  };
};

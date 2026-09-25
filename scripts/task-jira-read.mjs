// @ts-check
import { TaskAdapterError, parseHandoffContent } from "./task-adapter.mjs";

/**
 * Read-only Jira issue transport. The caller supplies access to its bound Jira tenant;
 * these methods are NOT an HTTP client or a claim about any installed Jira API.
 * Comments must be a complete, fresh native collection for the requested issue.
 * @typedef {{ readIssue: (key: string) => Promise<unknown>, readComments: (key: string) => Promise<unknown> }} JiraReadTransport
 */

/** @param {string} code @param {string} message @returns {never} */
const fail = (code, message) => { throw new TaskAdapterError(code, message); };
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/** @param {unknown} value @returns {value is string} */
const text = (value) => typeof value === "string" && value.length > 0 && value === value.trim() && !/[\r\n]/u.test(value);

// Only the named native statuses are known here. A board with other status names
// needs an explicit verified mapping; unknown names cannot be guessed.
const statuses = new Map([["To Do", "To Do"], ["In Progress", "In Progress"], ["Done", "Done"]]);
const prefix = "task-adapter:v1:";

/**
 * Opt-in project-key binding: TRACKER must start with `jira-project:` and
 * TRACKER_KEY must equal the issue's native fields.project.key. A board-only
 * binding has no issue-level board-membership proof and remains unsupported.
 * Plain native comment bodies have no operation correlation; only the exact
 * versioned JSON envelope in a complete native comment read can supply entries.
 * No write capability or idempotency guarantee is provided.
 * @param {JiraReadTransport} transport
 */
export const createJiraReadPort = (transport) => {
  if (typeof transport?.readIssue !== "function" || typeof transport?.readComments !== "function") {
    fail("native_unsupported", "jira: supply bound readIssue and complete readComments native access");
  }
  return {
    /** @param {{provider: string, tracker: string, trackerKey: string, nativeId: string}} identity */
    read: async (identity) => {
      const target = `jira ${identity?.nativeId ?? "unknown"}`;
      if (identity?.provider !== "jira" || !text(identity.nativeId) || !text(identity.trackerKey)
          || !text(identity.tracker) || !identity.tracker.startsWith("jira-project:")
          || identity.tracker.length === "jira-project:".length) {
        fail("native_unsupported", `${target}: generated TRACKER must explicitly identify a jira-project: tenant and TRACKER_KEY its project key; board-only bindings need native board membership proof`);
      }
      // Do not resolve/search by title, rewrite the key, or try another tracker.
      let issue;
      try { issue = await transport.readIssue(identity.nativeId); }
      catch { fail("readback_unavailable", `${target}: read exact native issue key in the bound Jira tenant before resuming`); }
      if (!record(issue) || issue.key !== identity.nativeId || !record(issue.fields)
          || !record(issue.fields.project) || issue.fields.project.key !== identity.trackerKey) {
        fail("readback_mismatch", `${target}: confirm exact issue key and native project key ${identity.trackerKey} in the bound tenant`);
      }
      const name = record(issue.fields.status) ? issue.fields.status.name : undefined;
      const status = statuses.get(/** @type {string} */ (name));
      if (!status) fail("native_unsupported", `${target}: configure an explicit mapping for native Jira status ${String(name)}`);

      let page;
      try { page = await transport.readComments(identity.nativeId); }
      catch { fail("readback_unavailable", `${target}: read complete native comments on the exact issue before resuming`); }
      if (!record(page) || page.complete !== true || !Array.isArray(page.comments)) {
        fail("readback_unavailable", `${target}: retrieve the complete fresh native comment collection before checking operation correlation`);
      }
      /** @type {Array<{operationId: string, kind: string, content: string}>} */
      const entries = [];
      const seenIds = new Set();
      const seenOperations = new Set();
      for (const comment of page.comments) {
        if (!record(comment) || !text(comment.id) || typeof comment.body !== "string" || seenIds.has(comment.id)) {
          fail("readback_mismatch", `${target}: native comment identity/body is missing, ambiguous or unsupported; inspect native comments`);
        }
        seenIds.add(comment.id);
        if (!comment.body.startsWith(prefix)) continue;
        let entry;
        try { entry = JSON.parse(comment.body.slice(prefix.length)); }
        catch { fail("readback_mismatch", `${target}: malformed operation envelope in native comment ${comment.id}`); }
        if (!record(entry) || !text(entry.operationId) || !text(entry.kind) || !["comment", "handoff"].includes(entry.kind)
            || typeof entry.content !== "string" || !entry.content.length || seenOperations.has(entry.operationId)
            || comment.body !== prefix + JSON.stringify(entry)
            || Object.keys(entry).sort().join(",") !== "content,kind,operationId") {
          fail("readback_mismatch", `${target}: ambiguous or malformed operation correlation in native comment ${comment.id}`);
        }
        if (entry.kind === "handoff") {
          try { parseHandoffContent(entry.content); }
          catch { fail("readback_mismatch", `${target}: malformed handoff content in native comment ${comment.id}; inspect native handoff evidence`); }
        }
        seenOperations.add(entry.operationId);
        entries.push(/** @type {{operationId: string, kind: string, content: string}} */ (entry));
      }
      return { identity: { ...identity }, status, entries };
    },
  };
};

// @ts-check
import { readFile } from "node:fs/promises";
import path from "node:path";

/** @typedef {{ provider: string, tracker: string, trackerKey: string, nativeId: string }} TaskIdentity */
/** @typedef {{ operationId: string, kind: string, content: string }} TaskEntry */
/** @typedef {{ identity: TaskIdentity, status: string, entries: TaskEntry[] }} TaskSnapshot */
/** @typedef {{ phase: string, status: string, completedWork: string, nextAction: string, branch: string, commit: string, verification: string, resumeEvidence: string, resumePhase?: string, blocker?: string }} TaskHandoff */
/** @typedef {{ kind: 'update'|'status'|'comment'|'handoff'|'checkpoint'|'close', operationId: string, status: string, content: string|TaskHandoff }} TaskWrite */
// claim must be a durable atomic insert-if-absent scoped to the native target and operation ID.
// Only the inserting caller receives claimed:true; a crash after claim blocks blind retries.
/** @typedef {{ read: (identity: TaskIdentity) => Promise<TaskSnapshot>, claim?: (identity: TaskIdentity, entry: TaskEntry, status: string) => Promise<{claimed: true}|{claimed: false}>, write?: (identity: TaskIdentity, entry: TaskEntry, status: string) => Promise<{accepted: true}> }} TaskPort */

export class TaskAdapterError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "TaskAdapterError";
    this.code = code;
  }
}

/** @param {string} code @param {string} message */
const fail = (code, message) => { throw new TaskAdapterError(code, message); };
/** @param {unknown} value */
const nonempty = (value) => typeof value === "string" && value.length > 0 && value === value.trim() && !/[\r\n]/u.test(value);
const providers = new Set(["jira", "github-issues", "github-projects", "linear", "custom"]);
const activePhases = ["DEFINITION", "IMPLEMENTATION", "TESTING/TDD", "VERIFICATION", "EVIDENCE/DELIVERY"];

/** Parse ONLY the identity section emitted by creator's composeBindings. */
export const parseTaskBinding = (text) => {
  if (typeof text !== "string") fail("binding_invalid", "Generated docs/bindings.md is unavailable or malformed");
  const sections = text.split(/^## Bound task identity\s*$/mu);
  if (sections.length !== 2) fail("binding_invalid", "Expected one generated Bound task identity section in docs/bindings.md");
  const section = sections[1].split(/^## /mu)[0];
  const fields = [
    ["provider", "Task provider (TASK_TRACKER)"],
    ["tracker", "Tracker (TRACKER)"],
    ["trackerKey", "Project/board (TRACKER_KEY)"],
  ];
  /** @type {Record<string, string>} */
  const binding = {};
  for (const [key, label] of fields) {
    const matches = [...section.matchAll(new RegExp(`^- ${label.replace(/[()]/gu, "\\$&")}: (.*)$`, "gmu"))];
    if (matches.length !== 1 || !nonempty(matches[0][1]) || matches[0][1].includes("<")
        || matches[0][1] === "not configured; resolve before durable task operations") {
      fail("binding_invalid", `Generated binding ${label} is missing, duplicated or unconfigured`);
    }
    binding[key] = matches[0][1];
  }
  if (!providers.has(binding.provider)) fail("provider_unsupported", `Unsupported TASK_TRACKER ${binding.provider}; configure a supported native task provider`);
  return /** @type {{provider: string, tracker: string, trackerKey: string}} */ (binding);
};

/** @param {TaskHandoff} value */
export const handoffContent = (value) => {
  if (!value || typeof value !== "object") fail("handoff_invalid", "Handoff requires phase, status and resume evidence");
  const required = ["phase", "status", "completedWork", "nextAction", "branch", "commit", "verification", "resumeEvidence"];
  if (required.some((key) => !nonempty(value[/** @type {keyof TaskHandoff} */ (key)]))
      || ![...activePhases, "BLOCKED", "DONE"].includes(value.phase)
      || !["ACTIVE", "BLOCKED", "BLOCKED: requires approval", "DONE"].includes(value.status)
      || ((value.phase === "BLOCKED" || value.status.startsWith("BLOCKED")) && (!activePhases.includes(value.resumePhase ?? "") || !nonempty(value.blocker)))) {
    fail("handoff_invalid", "Handoff fields or blocked continuation are missing or malformed");
  }
  return JSON.stringify(value);
};

/** Reject ambiguous JSON evidence before parsing can discard duplicate keys. @param {string} content */
export const parseHandoffContent = (content) => {
  let handoff;
  try { handoff = JSON.parse(content); }
  catch { fail("handoff_invalid", "Handoff JSON is malformed"); }
  /** @type {Array<{keys: Set<string>, expectsKey: boolean}|null>} */
  const stack = [];
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (character === '"') {
      const start = index++;
      while (index < content.length) {
        if (content[index] === "\\") index += 2;
        else if (content[index] === '"') break;
        else index++;
      }
      const frame = stack[stack.length - 1];
      if (frame?.expectsKey) {
        const key = JSON.parse(content.slice(start, index + 1));
        if (frame.keys.has(key)) fail("handoff_invalid", `Handoff JSON has duplicate key: ${key}`);
        frame.keys.add(key);
        frame.expectsKey = false;
      }
    } else if (character === "{") stack.push({ keys: new Set(), expectsKey: true });
    else if (character === "[") stack.push(null);
    else if (character === "}" || character === "]") stack.pop();
    else if (character === ",") {
      const frame = stack[stack.length - 1];
      if (frame) frame.expectsKey = true;
    }
  }
  handoffContent(handoff);
  return handoff;
};

/** @param {TaskSnapshot} snapshot @param {TaskIdentity} identity */
const checked = (snapshot, identity) => {
  const actual = snapshot?.identity;
  if (!actual || Object.keys(identity).some((key) => actual[/** @type {keyof TaskIdentity} */ (key)] !== identity[/** @type {keyof TaskIdentity} */ (key)])
      || !nonempty(snapshot.status) || !Array.isArray(snapshot.entries)
      || snapshot.entries.some((entry) => !nonempty(entry?.operationId) || !nonempty(entry.kind) || !nonempty(entry.content))) {
    fail("readback_mismatch", `Readback identity/status/evidence mismatched ${identity.provider} ${identity.tracker}/${identity.trackerKey}/${identity.nativeId}; inspect native target`);
  }
  return snapshot;
};

/**
 * Reads the generated binding from the project, never a harness preference or local task projection.
 * Ports are injected native capabilities; absence of a mapping is unsupported, not a fallback.
 * @param {{projectRoot: string, ports: Partial<Record<string, TaskPort>>}} options
 */
export const createTaskAdapter = async ({ projectRoot, ports }) => {
  if (!nonempty(projectRoot)) fail("binding_invalid", "A generated project root is required");
  let text;
  try { text = await readFile(path.join(projectRoot, "docs/bindings.md"), "utf8"); }
  catch { fail("binding_invalid", "Read generated docs/bindings.md before any native task operation"); }
  const binding = parseTaskBinding(text);
  const port = ports?.[binding.provider];
  if (!port || typeof port.read !== "function") fail("native_unsupported", `${binding.provider}: configure native task read and readback access for ${binding.tracker}/${binding.trackerKey}`);

  /** @param {TaskIdentity} identity */
  const read = async (identity) => {
    if (!identity || !nonempty(identity.nativeId) || Object.entries(binding).some(([key, value]) => identity[/** @type {keyof TaskIdentity} */ (key)] !== value)) {
      fail("identity_invalid", `${binding.provider}: supply the exact bound tracker/board and native task identity`);
    }
    let snapshot;
    try { snapshot = await port.read(identity); }
    catch { fail("readback_unavailable", `${binding.provider}: read native task ${identity.nativeId} and retry only after confirming identity`); }
    return checked(snapshot, identity);
  };

  /** @param {TaskIdentity} identity @param {TaskWrite} operation */
  const write = async (identity, operation) => {
    if (!operation || !["update", "status", "comment", "handoff", "checkpoint", "close"].includes(operation.kind)
        || !nonempty(operation.operationId) || !nonempty(operation.status)) {
      fail("operation_invalid", `${binding.provider}: supply a unique operation ID, kind and expected native status`);
    }
    const content = operation.kind === "handoff" || operation.kind === "checkpoint"
      ? handoffContent(/** @type {TaskHandoff} */ (operation.content)) : operation.content;
    if (!nonempty(content)) fail("operation_invalid", `${binding.provider}: supply expected native content for readback`);
    const entry = { operationId: operation.operationId, kind: operation.kind, content: /** @type {string} */ (content) };
    const before = await read(identity);
    const previous = before.entries.filter((item) => item.operationId === entry.operationId);
    if (previous.length) {
      if (previous.length === 1 && JSON.stringify(previous[0]) === JSON.stringify(entry) && before.status === operation.status) return before;
      fail("correlation_conflict", `${binding.provider}: reconcile operation ${entry.operationId} on native task ${identity.nativeId} before retry`);
    }
    // The port must reserve before any write; interrupted writes require reconciliation.
    if (typeof port.write !== "function" || typeof port.claim !== "function") {
      fail("native_unsupported", `${binding.provider}: configure a native atomic operation-ID claim, ${operation.kind} and readback for task ${identity.nativeId}`);
    }
    let reservation;
    try { reservation = await port.claim(identity, entry, operation.status); }
    catch { fail("unknown_write_outcome", `${binding.provider}: claim for ${entry.operationId} on ${identity.nativeId} is unknown; reconcile native reservation and readback before any write`); }
    if (reservation?.claimed !== true) {
      if (reservation?.claimed === false) {
        const existing = await read(identity);
        const matches = existing.entries.filter((item) => item.operationId === entry.operationId);
        if (matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(entry) && existing.status === operation.status) return existing;
      }
      fail("unknown_write_outcome", `${binding.provider}: ${entry.operationId} is claimed or claim result is unknown on ${identity.nativeId}; reconcile native reservation and readback before any write`);
    }
    let acknowledgement;
    try { acknowledgement = await port.write(identity, entry, operation.status); }
    catch { fail("unknown_write_outcome", `${binding.provider}: ${operation.kind} ${entry.operationId} may have reached ${identity.nativeId}; read native target before retry`); }
    if (acknowledgement?.accepted !== true) fail("unknown_write_outcome", `${binding.provider}: ${operation.kind} ${entry.operationId} outcome unknown on ${identity.nativeId}; read native target before retry`);
    const after = await read(identity);
    const matches = after.entries.filter((item) => item.operationId === entry.operationId);
    if (after.status !== operation.status || matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(entry)) {
      fail("readback_mismatch", `${binding.provider}: verify native ${operation.kind} ${entry.operationId}, status and content on task ${identity.nativeId}`);
    }
    return after;
  };
  return { binding, read, write };
};

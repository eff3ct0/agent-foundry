import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const sessionId = (event) => {
  const value = event.properties?.sessionID
    ?? event.properties?.info?.id
    ?? event.sessionID
    ?? event.payload?.sessionID
    ?? event.payload?.info?.id;
  return typeof value === "string" ? value : undefined;
};

export const createFactoryStartPlugin = ({ worktree, runStart = async () =>
  (await run(process.execPath, [path.join(worktree, "start.mjs")], {
    cwd: worktree,
    maxBuffer: 16 * 1024,
  })).stdout }) => {
  const startups = new Map();

  return {
    event: async ({ event }) => {
      if (event.type !== "session.created") return;
      const id = sessionId(event);
      if (!id || startups.has(id)) return;
      startups.set(id, runStart());
    },
    "chat.message": async ({ sessionID }, output) => {
      const startup = startups.get(sessionID);
      if (!startup) return;
      startups.delete(sessionID);
      const content = await startup;
      if (content.trim()) output.parts.push({ type: "text", text: content });
    },
  };
};

export const FactoryStartPlugin = async (input) => createFactoryStartPlugin(input);

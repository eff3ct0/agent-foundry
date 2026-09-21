import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const FactoryStartPlugin = async ({ worktree }) => {
  let startup = Promise.resolve("");
  let pending = false;

  const runStart = async () => (await run(process.execPath, [path.join(worktree, "start.mjs")], {
    cwd: worktree,
    maxBuffer: 16 * 1024,
  })).stdout;

  return {
    event: async ({ event }) => {
      if (event.type !== "session.created") return;
      startup = runStart();
      pending = true;
    },
    "chat.message": async (_input, output) => {
      if (!pending) return;
      const content = await startup;
      pending = false;
      if (content.trim()) output.parts.push({ type: "text", text: content });
    },
  };
};

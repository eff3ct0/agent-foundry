export const FactoryStartPlugin = async ({ $, worktree }) => {
  let startup = Promise.resolve("");
  let pending = false;

  const runStart = () => $`python3 ${worktree}/start.py`.text();

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

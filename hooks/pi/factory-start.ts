import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);

export default function (pi: ExtensionAPI) {
  let startup = "";

  pi.on("session_start", async (_event, ctx) => {
    const result = await run("python3", ["start.py"], { cwd: ctx.cwd });
    startup = result.stdout;
  });

  pi.on("before_agent_start", async () => {
    if (!startup) return;
    const content = startup;
    startup = "";
    return { message: { customType: "factory-start", content, display: true } };
  });
}

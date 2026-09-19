#!/usr/bin/env node
import { createInterface, type Interface } from "node:readline";
import { readFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import {
  applyPlan,
  CreatorError,
  doctor,
  envelopeJson,
  errorEnvelope,
  preparePlan,
  verify,
  type Command,
  type CreatorEnvelope,
  type CreatorOptions,
  type Placeholder,
} from "./creator";
import {
  detectUiOptions,
  renderCompletion,
  renderDiagnostics,
  renderReview,
  renderSelection,
  renderStep,
  renderWelcome,
  type InstallerUiOptions,
} from "./installer-ui";

interface ParsedArgs extends Omit<CreatorOptions, "command" | "target"> {
  command: Command;
  target: string;
  version: boolean;
  help: boolean;
  json: boolean;
  yes: boolean;
  noColor: boolean;
  reducedMotion: boolean;
}

const usage = "Usage: factory-template <plan|dry-run|apply|verify|doctor> --target <directory> [--config <file>] [--non-interactive] [--yes] [--json]";
const errorStatuses = new Set(["error", "conflict", "failed", "not-created", "unhealthy", "cancelled"]);

const parseArgs = (): ParsedArgs => {
  const args = [...process.argv.slice(2)];
  if (args.includes("--version")) return { command: "plan", target: ".", version: true, help: false, json: args.includes("--json"), yes: false, noColor: false, reducedMotion: false };
  if (args.includes("--help") || args.length === 0) return { command: "plan", target: ".", version: false, help: true, json: false, yes: false, noColor: false, reducedMotion: false };
  const known = new Set<Command>(["plan", "dry-run", "apply", "verify", "doctor"]);
  let command = args.shift() as string;
  if (command.startsWith("--")) {
    command = command === "--dry-run" ? "dry-run" : command === "--apply" ? "apply" : command === "--verify" ? "verify" : command === "--doctor" ? "doctor" : "plan";
    if (command === "plan" && args.length === 0) throw new CreatorError("invalid_arguments", usage);
  }
  if (!known.has(command as Command)) throw new CreatorError("invalid_arguments", `unknown command: ${command}`);
  let target = "";
  let configPath: string | undefined;
  let nonInteractive = process.env.CI === "1";
  let failAfter: number | undefined;
  let interruptAfter: number | undefined;
  let yes = false;
  let noColor = false;
  let reducedMotion = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target" || arg === "-t") target = args[++index] ?? "";
    else if (arg === "--config" || arg === "--answers") configPath = args[++index];
    else if (arg === "--non-interactive" || arg === "--no-prompt") nonInteractive = true;
    else if (arg === "--yes") yes = true;
    else if (arg === "--no-color") noColor = true;
    else if (arg === "--reduced-motion") reducedMotion = true;
    else if (arg === "--failure-after") failAfter = Number(args[++index]);
    else if (arg === "--interrupt-after") interruptAfter = Number(args[++index]);
    else if (arg === "--json") continue;
    else throw new CreatorError("invalid_arguments", `unknown argument: ${arg}`);
  }
  if (!target) throw new CreatorError("invalid_arguments", "--target is required");
  if (failAfter !== undefined && (!Number.isInteger(failAfter) || failAfter < 1)) throw new CreatorError("invalid_arguments", "--failure-after must be a positive integer");
  if (interruptAfter !== undefined && (!Number.isInteger(interruptAfter) || interruptAfter < 1)) throw new CreatorError("invalid_arguments", "--interrupt-after must be a positive integer");
  return { command: command as Command, target, configPath, nonInteractive, failAfter, interruptAfter, version: false, help: false, json: args.includes("--json"), yes, noColor, reducedMotion };
};

interface PromptWaiter {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

interface PromptSession {
  terminal?: Interface;
  lines: string[];
  waiters: PromptWaiter[];
  closed: boolean;
  tty: boolean;
  prompt: (placeholder: Placeholder) => Promise<string>;
  close: () => void;
}

class InstallerCancelled extends Error {
  constructor() {
    super("installation cancelled by user");
    this.name = "InstallerCancelled";
  }
}

const createPromptSession = (ui: InstallerUiOptions): PromptSession => {
  const session: PromptSession = { lines: [], waiters: [], closed: false, tty: Boolean(stdin.isTTY && stderr.isTTY), prompt: async () => "", close: () => undefined };
  const createTerminal = (): Interface => {
    if (session.terminal) return session.terminal;
    const terminal = createInterface({ input: stdin, output: stderr });
    session.terminal = terminal;
    terminal.on("line", (line) => {
      const waiter = session.waiters.shift();
      if (waiter) waiter.resolve(line);
      else session.lines.push(line);
    });
    terminal.on("close", () => {
      session.closed = true;
      for (const waiter of session.waiters.splice(0)) waiter.reject(new Error("input was closed before all answers were supplied"));
    });
    terminal.on("SIGINT", () => {
      for (const waiter of session.waiters.splice(0)) waiter.reject(new InstallerCancelled());
    });
    return terminal;
  };
  const linePrompt = async (placeholder: Placeholder): Promise<string> => {
    stderr.write(`${placeholder.prompt} (${placeholder.key}): `);
    createTerminal();
    const line = session.lines.shift();
    if (line !== undefined) return line;
    if (session.closed) throw new Error("input was closed before all answers were supplied");
    return new Promise((resolve, reject) => session.waiters.push({ resolve, reject }));
  };
  const selectPrompt = async (placeholder: Placeholder): Promise<string> => {
    const choices = placeholder.enum ?? [];
    let selected = Math.max(0, choices.indexOf(placeholder.default));
    if (session.terminal) {
      session.terminal.removeAllListeners();
      session.terminal.close();
      session.terminal = undefined;
      session.closed = false;
    }
    stderr.write(`\n${renderSelection(placeholder, selected, ui)}\n`);
    return new Promise((resolve, reject) => {
      const wasRaw = stdin.isRaw;
      const finish = (callback: () => void, continueReading = false): void => {
        stdin.off("data", onData);
        if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        if (!continueReading) stdin.pause();
        callback();
      };
      const onData = (chunk: Buffer | string): void => {
        const value = chunk.toString();
        const keys: string[] = [];
        for (let index = 0; index < value.length;) {
          const key = value.startsWith("\u001b[A", index) || value.startsWith("\u001b[B", index) ? value.slice(index, index + 3) : value[index];
          keys.push(key);
          index += key.length;
        }
        for (const key of keys) {
          if (key === "\u0003" || key === "\u001b") {
            finish(() => reject(new InstallerCancelled()));
            return;
          }
          if (key === "\u001b[A" || key.toLowerCase() === "k") selected = (selected + choices.length - 1) % choices.length;
          else if (key === "\u001b[B" || key.toLowerCase() === "j") selected = (selected + 1) % choices.length;
          else if (/^[1-9]$/u.test(key) && Number(key) <= choices.length) selected = Number(key) - 1;
          else if (key === "\r" || key === "\n") {
            finish(() => resolve(choices[selected] ?? ""), true);
            return;
          } else continue;
          stderr.write(`\n${renderSelection(placeholder, selected, ui)}\n`);
        }
      };
      if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
    });
  };
  session.prompt = async (placeholder) => session.tty && placeholder.enum?.length ? selectPrompt(placeholder) : linePrompt(placeholder);
  session.close = () => {
    session.closed = true;
    if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
    session.terminal?.close();
    stdin.pause();
  };
  return session;
};

const writeProgress = (label: string, ui: InstallerUiOptions, current: number, total: number): void => {
  stderr.write(`${renderStep(current, total, label, ui)}\n`);
};

const withProgress = async <T>(label: string, ui: InstallerUiOptions, operation: () => Promise<T>): Promise<T> => {
  if (!stderr.isTTY || ui.reducedMotion) {
    stderr.write(`${label}\n`);
    return operation();
  }
  const frames = ui.unicode ? ["◐", "◓", "◑", "◒"] : ["|", "/", "-", "\\"];
  let frame = 0;
  const draw = (): void => { stderr.write(`\r${frames[frame++ % frames.length]} ${label}`); };
  draw();
  const timer = setInterval(draw, 120);
  try {
    return await operation();
  } finally {
    clearInterval(timer);
    stderr.write(`\r${label}\n`);
  }
};

const writeEnvelope = (envelope: CreatorEnvelope): void => {
  stdout.write(envelopeJson(envelope));
  if (errorStatuses.has(envelope.status)) process.exitCode = 1;
};

const cancelledEnvelope = (command: Command, target: string, prepared?: CreatorEnvelope): CreatorEnvelope => ({
  ...(prepared ?? {
    schema_version: 1,
    command,
    target,
    payload: { version: "unknown", digest: "unknown" },
    operations: [],
    diagnostics: [],
  }),
  command,
  status: "cancelled",
  diagnostics: [...(prepared?.diagnostics ?? []), { code: "user_cancelled", message: "installation was cancelled before changes were applied" }],
});

const main = async (): Promise<void> => {
  const parsed = parseArgs();
  if (parsed.help) {
    stdout.write(`${usage}\n\nInteractive mode supports arrow-key selection, --yes, --no-color, and --reduced-motion.\n`);
    return;
  }
  if (parsed.version) {
    const manifest = JSON.parse(await readFile(`${__dirname}/payload-manifest.json`, "utf8"));
    if (parsed.json) stdout.write(`${JSON.stringify({ name: manifest.package_name, version: manifest.package_version, payloadVersion: manifest.payload_version, payloadDigest: manifest.payload_digest })}\n`);
    else stdout.write(`${manifest.package_name} ${manifest.package_version}\n` + `payload ${manifest.payload_version}\n` + `payload digest ${manifest.payload_digest}\n`);
    return;
  }
  const ui = detectUiOptions(process.env);
  if (!stderr.isTTY) ui.color = false;
  if (parsed.noColor) ui.color = false;
  if (parsed.reducedMotion) ui.reducedMotion = true;
  const interactive = !parsed.nonInteractive;
  const promptSession = interactive ? createPromptSession(ui) : undefined;
  try {
    if (interactive) {
      stderr.write(`${renderWelcome(ui)}\n\n`);
      writeProgress("Checking prerequisites and target", ui, 1, 3);
      writeProgress("Collecting project answers", ui, 2, 3);
    }
    const prepared = await preparePlan({
      ...parsed,
      prompt: promptSession?.prompt,
    });
    let envelope = prepared.envelope;
    if (interactive) {
      stderr.write(`\n${renderReview(envelope, ui)}\n`);
      if (parsed.command === "apply" && envelope.status !== "conflict" && envelope.status !== "error" && !parsed.yes) {
        const answer = await promptSession!.prompt({ key: "CONFIRM", prompt: "Apply these changes? (y/N)", default: "", required: true });
        if (!/^y(?:es)?$/iu.test(answer.trim())) envelope = cancelledEnvelope(parsed.command, prepared.target, envelope);
      }
    }
    if (envelope.status !== "cancelled") {
      if (parsed.command === "apply") {
        if (interactive) writeProgress("Applying and verifying staged changes", ui, 3, 3);
        envelope = await withProgress("Applying and verifying staged changes", ui, () => applyPlan(prepared));
      } else if (parsed.command === "verify") {
        if (interactive) writeProgress("Verifying repository state", ui, 3, 3);
        envelope = await withProgress("Verifying repository state", ui, () => verify(prepared));
      } else if (parsed.command === "doctor") {
        if (interactive) writeProgress("Checking recovery and ownership health", ui, 3, 3);
        envelope = await withProgress("Checking recovery and ownership health", ui, () => doctor(prepared));
      }
    }
    if (interactive) {
      stderr.write(`\n${renderCompletion(envelope, ui)}\n`);
      if (envelope.diagnostics.length > 0) stderr.write(`${renderDiagnostics(envelope.diagnostics, ui)}\n`);
    }
    writeEnvelope(envelope);
  } catch (error: unknown) {
    if (error instanceof InstallerCancelled) {
      const envelope = cancelledEnvelope(parsed.command, parsed.target);
      if (interactive) stderr.write(`\n${renderCompletion(envelope, ui)}\n`);
      writeEnvelope(envelope);
      return;
    }
    const creatorError = error instanceof CreatorError ? error : new CreatorError("unexpected_error", (error as Error).message);
    stderr.write(`error[${creatorError.code}]: ${creatorError.message}\n`);
    const envelope = errorEnvelope(parsed.command, parsed.target, creatorError);
    if (interactive) {
      stderr.write(`${renderCompletion(envelope, ui)}\n`);
      if (envelope.diagnostics.length > 0) stderr.write(`${renderDiagnostics(envelope.diagnostics, ui)}\n`);
    }
    writeEnvelope(envelope);
  } finally {
    promptSession?.close();
  }
};

main().catch((error: unknown) => {
  const creatorError = error instanceof CreatorError ? error : new CreatorError("unexpected_error", (error as Error).message);
  stderr.write(`error[${creatorError.code}]: ${creatorError.message}\n`);
  stdout.write(envelopeJson(errorEnvelope("plan", ".", creatorError)));
  process.exitCode = 1;
});

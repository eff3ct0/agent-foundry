#!/usr/bin/env node
import { createInterface, type Interface } from "node:readline";
import { readFile } from "node:fs/promises";
import { stdin as input, stderr as output } from "node:process";
import {
  applyPlan,
  CreatorError,
  doctor,
  envelopeJson,
  errorEnvelope,
  preparePlan,
  verify,
  type Command,
  type CreatorOptions,
} from "./creator";

interface ParsedArgs extends Omit<CreatorOptions, "command" | "target"> {
  command: Command;
  target: string;
  version: boolean;
  help: boolean;
  json: boolean;
}

const usage = "Usage: factory-template <plan|dry-run|apply|verify|doctor> --target <directory> [--config <file>] [--non-interactive]";

const parseArgs = (): ParsedArgs => {
  const args = [...process.argv.slice(2)];
  if (args.includes("--version")) return { command: "plan", target: ".", version: true, help: false, json: args.includes("--json") };
  if (args.includes("--help") || args.length === 0) return { command: "plan", target: ".", version: false, help: true, json: false };
  const known = new Set<Command>(["plan", "dry-run", "apply", "verify", "doctor"]);
  let command = args.shift() as string;
  if (command.startsWith("--")) {
    command = command === "--dry-run" ? "dry-run" : command === "--apply" ? "apply" : command === "--verify" ? "verify" : command === "--doctor" ? "doctor" : "plan";
    if (command === "plan" && args.length === 0) throw new CreatorError("invalid_arguments", usage);
  }
  if (!known.has(command as Command)) throw new CreatorError("invalid_arguments", `unknown command: ${command}`);
  let target = "";
  let configPath: string | undefined;
  let nonInteractive = false;
  let failAfter: number | undefined;
  let interruptAfter: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target" || arg === "-t") target = args[++index] ?? "";
    else if (arg === "--config" || arg === "--answers") configPath = args[++index];
    else if (arg === "--non-interactive" || arg === "--no-prompt") nonInteractive = true;
    else if (arg === "--failure-after") failAfter = Number(args[++index]);
    else if (arg === "--interrupt-after") interruptAfter = Number(args[++index]);
    else if (arg === "--json") continue;
    else throw new CreatorError("invalid_arguments", `unknown argument: ${arg}`);
  }
  if (!target) throw new CreatorError("invalid_arguments", "--target is required");
  if (failAfter !== undefined && (!Number.isInteger(failAfter) || failAfter < 1)) throw new CreatorError("invalid_arguments", "--failure-after must be a positive integer");
  if (interruptAfter !== undefined && (!Number.isInteger(interruptAfter) || interruptAfter < 1)) throw new CreatorError("invalid_arguments", "--interrupt-after must be a positive integer");
  return { command: command as Command, target, configPath, nonInteractive, failAfter, interruptAfter, version: false, help: false, json: args.includes("--json") };
};

interface PromptWaiter {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

interface PromptSession {
  terminal: Interface;
  lines: string[];
  waiters: PromptWaiter[];
  closed: boolean;
}

const createPromptSession = (): PromptSession => {
  const session: PromptSession = {
    terminal: createInterface({ input, output }),
    lines: [],
    waiters: [],
    closed: false,
  };
  session.terminal.on("line", (line) => {
    const waiter = session.waiters.shift();
    if (waiter) waiter.resolve(line);
    else session.lines.push(line);
  });
  session.terminal.on("close", () => {
    session.closed = true;
    for (const waiter of session.waiters.splice(0)) waiter.reject(new Error("readline was closed"));
  });
  return session;
};

const promptFor = async (
  session: PromptSession,
  placeholder: { prompt: string; key: string },
): Promise<string> => {
  output.write(`${placeholder.prompt} (${placeholder.key}): `);
  const line = session.lines.shift();
  if (line !== undefined) return line;
  if (session.closed) throw new Error("readline was closed");
  return new Promise((resolve, reject) => session.waiters.push({ resolve, reject }));
};

const main = async (): Promise<void> => {
  const parsed = parseArgs();
  if (parsed.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (parsed.version) {
    const manifest = JSON.parse(await readFile(`${__dirname}/payload-manifest.json`, "utf8"));
    if (parsed.json) process.stdout.write(`${JSON.stringify({ name: manifest.package_name, version: manifest.package_version, payloadVersion: manifest.payload_version, payloadDigest: manifest.payload_digest })}\n`);
    else process.stdout.write(`${manifest.package_name} ${manifest.package_version}\n` + `payload ${manifest.payload_version}\n` + `payload digest ${manifest.payload_digest}\n`);
    return;
  }
  const promptSession = parsed.nonInteractive ? undefined : createPromptSession();
  try {
    const prepared = await preparePlan({
      ...parsed,
      prompt: promptSession ? (placeholder) => promptFor(promptSession, placeholder) : undefined,
    });
    let envelope = prepared.envelope;
    if (parsed.command === "apply") envelope = await applyPlan(prepared);
    else if (parsed.command === "verify") envelope = await verify(prepared);
    else if (parsed.command === "doctor") envelope = await doctor(prepared);
    process.stdout.write(envelopeJson(envelope));
    if (["error", "conflict", "failed", "not-created", "unhealthy"].includes(envelope.status)) process.exitCode = 1;
  } finally {
    promptSession?.terminal.close();
  }
};

main().catch((error: unknown) => {
  const creatorError = error instanceof CreatorError ? error : new CreatorError("unexpected_error", (error as Error).message);
  const command = process.argv[2] as Command;
  const target = process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] ?? "" : ".";
  process.stderr.write(`error[${creatorError.code}]: ${creatorError.message}\n`);
  process.stdout.write(envelopeJson(errorEnvelope(command ?? "plan", target, creatorError)));
  process.exitCode = 1;
});

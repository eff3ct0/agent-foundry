#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { applyPlan, CreatorError, doctor, envelopeJson, errorEnvelope, preparePlan, verify, type Command, type CreatorEnvelope, type CreatorOptions } from "./creator";
import { detectUiOptions, renderCompletion, renderDiagnostics, renderReview, renderWelcome } from "./installer-ui";
import { ProvisioningError, provisioningEnvelopeJson, provisioningErrorEnvelope, provisionRepositories, type ProvisioningOptions } from "./github-provisioning";

const usage = "Usage: foundry <plan|dry-run|apply|verify|doctor> --target <directory> --config <schema-2.json> [--accept-plan <sha256:digest>] [--non-interactive] [--json] [--no-color] [--reduced-motion]\n       foundry github-provision --org <organization> [--factory-repo <name>] [--visibility <public|internal|private>] [--plan|--no-create|--yes]";
const errorStatuses = new Set(["error", "conflict", "failed", "partial", "unhealthy", "cancelled", "verification-failed"]);
const question = async (prompt: string): Promise<boolean> => {
  const terminal = createInterface({ input: stdin, output: stderr });
  try {
    return await new Promise<boolean>((resolve) => {
      terminal.once("close", () => resolve(false));
      terminal.once("SIGINT", () => resolve(false));
      terminal.question(prompt, (answer) => resolve(/^y(?:es)?$/iu.test(answer.trim())));
    });
  } finally { terminal.close(); }
};
const runProvisioning = async (): Promise<void> => {
  const args = process.argv.slice(3);
  if (args.includes("--help")) { stdout.write(`${usage}\n`); return; }
  let org = "";
  let factoryRepo: string | undefined;
  let visibility: ProvisioningOptions["visibility"];
  let plan = false;
  let noCreate = false;
  let yes = false;
  try {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--org") org = args[++index] ?? "";
      else if (arg === "--factory-repo") factoryRepo = args[++index];
      else if (arg === "--visibility") visibility = args[++index] as ProvisioningOptions["visibility"];
      else if (arg === "--plan") plan = true;
      else if (arg === "--no-create") noCreate = true;
      else if (arg === "--yes") yes = true;
      else if (arg !== "--json") throw new ProvisioningError("invalid_arguments", `unknown argument: ${arg}`);
    }
    if (!org) throw new ProvisioningError("invalid_arguments", "--org is required");
    const result = await provisionRepositories({ org, factoryRepo, visibility, plan, noCreate, yes,
      confirm: (target) => question(`Create ${target}? [y/N] `) });
    stdout.write(provisioningEnvelopeJson(result));
    if (["missing", "skipped", "rejected", "indeterminate"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    const issue = error instanceof ProvisioningError ? error : new ProvisioningError("unexpected_error", "GitHub provisioning failed");
    stderr.write(`error[${issue.code}]: ${issue.message}\n`);
    stdout.write(provisioningEnvelopeJson(provisioningErrorEnvelope(issue)));
    process.exitCode = 1;
  }
};
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (["github-provision", "provision-github"].includes(args[0])) { await runProvisioning(); return; }
  if (!args.length || args.includes("--help")) { stdout.write(`${usage}\n\nBreaking schema-2 interface: inspect an exact plan, then accept its digest. --yes/legacy answers/onboard/launch are not compatibility aliases. Installer never starts work or validates remote readiness.\n`); return; }
  if (args[0] === "--version") {
    const manifest = JSON.parse(await readFile(`${__dirname}/payload-manifest.json`, "utf8"));
    const identity = { name: manifest.package_name, version: manifest.package_version, payloadVersion: manifest.payload_version, payloadDigest: manifest.payload_digest };
    stdout.write(args.includes("--json") ? `${JSON.stringify(identity)}\n` : `${identity.name} ${identity.version}\npayload ${identity.payloadVersion}\npayload digest ${identity.payloadDigest}\n`);
    return;
  }
  const command = args.shift();
  if (!["plan", "dry-run", "apply", "verify", "doctor"].includes(command ?? "")) throw new CreatorError("invalid_arguments", `unknown command: ${command}; ${usage}`);
  let target = "";
  let configPath: string | undefined;
  let accepted: string | undefined;
  let nonInteractive = process.env.CI === "1";
  let noColor = false;
  let reducedMotion = false;
  let failAfter: number | undefined;
  let interruptAfter: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--target", "-t", "--config", "--accept-plan", "--failure-after", "--interrupt-after"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new CreatorError("invalid_arguments", `${arg} requires a value`);
      if (arg === "--target" || arg === "-t") target = value;
      else if (arg === "--config") configPath = value;
      else if (arg === "--accept-plan") accepted = value;
      else if (arg === "--failure-after") failAfter = Number(value);
      else interruptAfter = Number(value);
    } else if (arg === "--non-interactive") nonInteractive = true;
    else if (arg === "--no-color") noColor = true;
    else if (arg === "--reduced-motion") reducedMotion = true;
    else if (arg !== "--json") throw new CreatorError("invalid_arguments", `unknown argument: ${arg}; no legacy compatibility flags`);
  }
  if (!target) throw new CreatorError("invalid_arguments", "--target is required");
  if ([failAfter, interruptAfter].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 1))) throw new CreatorError("invalid_arguments", "failure/interruption count must be a positive integer");
  const options: CreatorOptions = { command: command as Command, target, configPath, failAfter, interruptAfter };
  const ui = detectUiOptions(process.env);
  if (!stderr.isTTY || noColor) ui.color = false;
  if (reducedMotion) ui.reducedMotion = true;
  const display = !nonInteractive;
  let envelope: CreatorEnvelope;
  try {
    if (display) stderr.write(`${renderWelcome(ui)}\n`);
    const prepared = await preparePlan(options);
    envelope = prepared.envelope;
    if (display) stderr.write(`${renderReview(envelope, ui)}\n`);
    if (command === "apply" && envelope.status !== "conflict") {
      if (!accepted && !nonInteractive && envelope.plan_digest) {
        if (await question(`Accept this exact plan ${envelope.plan_digest}? [y/N] `)) accepted = envelope.plan_digest;
        else envelope = { ...envelope, status: "cancelled" };
      }
      if (envelope.status !== "cancelled") envelope = await applyPlan(prepared, accepted ?? "");
    } else if (command === "verify") envelope = await verify(prepared);
    else if (command === "doctor") envelope = await doctor(prepared);
  } catch (error) {
    const issue = error instanceof CreatorError ? error : new CreatorError("unexpected_error", (error as Error).message);
    envelope = errorEnvelope(options.command, target, issue);
    stderr.write(`error[${issue.code}]: ${issue.message}\n`);
  }
  if (display) stderr.write(`${renderCompletion(envelope, ui)}\n`);
  if (envelope.diagnostics.length) stderr.write(`${renderDiagnostics(envelope.diagnostics, ui)}\n`);
  stdout.write(envelopeJson(envelope));
  if (errorStatuses.has(envelope.status)) process.exitCode = 1;
};
main().catch((error: unknown) => {
  const issue = error instanceof CreatorError ? error : new CreatorError("unexpected_error", (error as Error).message);
  stderr.write(`error[${issue.code}]: ${issue.message}\n`);
  const command = process.argv[2] as Command;
  const target = process.argv[process.argv.indexOf("--target") + 1] ?? "";
  stdout.write(envelopeJson(errorEnvelope(command, target, issue)));
  process.exitCode = 1;
});

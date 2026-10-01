#!/usr/bin/env node
"use strict";

const usage = "Usage: create-agent-foundry [directory] [--config <file>] [--non-interactive] [--yes] [--json] [--no-color] [--reduced-motion]";
const flags = new Set(["--non-interactive", "--yes", "--json", "--no-color", "--reduced-motion"]);
const args = process.argv.slice(2);
const forwarded = [];
const hasDirectory = Boolean(args[0] && !args[0].startsWith("-"));
const directory = hasDirectory ? args[0] : ".";
let valid = true;
for (let index = hasDirectory ? 1 : 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--config") {
    const value = args[++index];
    if (!value || value.startsWith("-")) valid = false;
    else forwarded.push("--config", value);
  } else if (flags.has(arg)) {
    forwarded.push(arg);
  } else {
    valid = false;
  }
}
if (args[0] === "--help" && args.length === 1) {
  process.stdout.write(`${usage}\n`);
} else if (!valid) {
  process.stderr.write(`error[invalid_arguments]: ${usage}\n`);
  process.exitCode = 1;
} else {
  const foundry = require.resolve("@eff3ct/agent-foundry/dist/index.js");
  process.argv = [process.argv[0], foundry, "apply", "--target", directory, ...forwarded];
  require(foundry);
}

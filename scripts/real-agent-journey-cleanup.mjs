#!/usr/bin/env node
import { cleanup, selfCheck } from "./real-agent-journey.mjs";

const values = Object.fromEntries(process.argv.slice(2).map((value, index, args) => value.startsWith("--") ? [value.slice(2).replaceAll("-", "_"), args[index + 1]] : []).filter(Boolean));
if (process.argv.includes("--self-check")) selfCheck();
else cleanup({ template: values.template ?? "eff3ct0/agent-foundry", owner: values.owner, runId: values.run_id, output: values.output }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

# CLAUDE.md

> **FIRST THING when opening this repo:** run `node start.mjs` and follow its output (it detects the mode
> - initialize vs. work - and prints the next step; it does not execute actions itself).

This repository is governed by **[`AGENT.md`](AGENT.md)** - the canonical operating contract
(work rules, provider bindings, and specification index).

Claude Code loads this shim, not the task topics. Read `AGENT.md` and `docs/bindings.md`
first, then follow `AGENT.md`'s mode/task route to open required content. Links do not
auto-load. The safety and provider boundaries remain in `AGENT.md` and the bound
provider contract; this shim grants no outward-action approval.

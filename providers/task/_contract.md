# Abstract contract: task provider

This file defines the required shape of a `task` instance. It is not a
selectable provider and is never composed into `docs/bindings.md`.

Every `providers/task/<provider>.md` fragment must include these fields:

## Identity
- `Contract instance`: reference to this file.
- `Capability`: `task`.
- `Provider`: name of the bound system.

## Binding
State where tasks live and make clear that provider use is mandatory and exclusive.

## How the agent interacts
Distinguish the harness mechanism (MCP, CLI, or API) from the semantic rules
defined by the binding. At minimum, cover reading a task, creating it when
applicable, updating its fields or status, and adding comments.

## Rules and lifecycle
Define the status lifecycle, how the task is referenced in commits/PRs, and
where durable state is left during checkpoints and closeout.

## Prohibitions
Enumerate alternate trackers and any close or transition without verification.

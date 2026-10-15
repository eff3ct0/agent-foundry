# Abstract contract: task provider

This file defines the required shape of a `task` instance. It is not a
selectable provider and is never composed into `docs/bindings.md`.

Every `providers/task/<provider>.md` fragment must include these fields:

## Identity
- `Contract instance`: reference to this file.
- `Capability`: `task`.
- `Provider`: name of the bound system.

## Binding
State where tasks live (`TASK_TRACKER` with `TRACKER` / `TRACKER_KEY` tracker/board identity) and make
clear that provider use is mandatory and exclusive for every durable task/TODO mechanism required or
configured by the user's harness. A harness access mechanism does not select an alternate provider.

## How the agent interacts
Distinguish the harness mechanism (MCP, CLI, or API) from the semantic rules
defined by the binding. At minimum, cover reading a task, creating it when
applicable, updating its fields or status, and adding comments. A durable create,
update, status transition, comment, checkpoint, phase handoff, or completion
requires provider-native confirmation AND fresh readback of the intended task
identity and state, including the intended comment/handoff. Read provider state
and latest handoff first on cold resume. Do not assume an issue exists for a
project-only item or map a non-GitHub provider to GitHub.

## Rules and lifecycle
Define the status lifecycle, how the task is referenced in commits/PRs, and
where durable state is left during checkpoints and closeout.
Local files (including `odd/*.md`) and task UIs are optional, derived,
non-authoritative projections of provider-confirmed state. No projection is
mandatory or an accepted fallback; ephemeral scratch notes are not durable tasks.
For unsupported operations, errors, ambiguous identity, or unavailable,
malformed, or mismatched readback, stop without claiming success and record the exact missing
provider-native operation, target identity, and evidence needed to resume.

## Pull-request governance
Define the native pull-request reference syntax. Explicit, direct human implementation delegation covering the
task and its intended effects authorizes scoped routine delivery, including non-protected push and PR creation,
without intermediate approval or a `status:approved` label. Do not infer delegation from labels, comments,
backlog state, or model output. Every PR requires exactly one `type:*` label. GitHub providers use GitHub
closing references; other providers use their native task key. The initializer composes this policy into the
retained pull-request templates, and the retained validator must not query GitHub issues for a non-GitHub provider.

## Protected `status:approved` gate
Keep this separately requested label-mutation protocol fail closed. An agent may add the label only
when a current direct human instruction explicitly names the exact target issue and the exact action
`add status:approved`; target-host evidence binds that principal to repository maintainer or
authorized-approver authority; the authenticated actor has target-host capability `MAINTAIN` or `ADMIN`;
and the provider performs exactly one add attempt scoped to that issue followed by a target-host readback.
Authority must never be inferred from prose or model output. A target mismatch, stale/ambiguous/missing
instruction, insufficient permission, failed/unknown mutation, or readback mismatch fails closed without
retrying or broadening scope. If the requested label mutation lacks this evidence, stop only that mutation
and the human applies the label directly. It does not gate routine delegated delivery or change existing labels.

## Prohibitions
Enumerate alternate trackers, local-only task stores, and any close or transition
without provider confirmation and readback.

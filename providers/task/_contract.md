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

## Pull-request governance
Define the native pull-request reference syntax and the approval authority. A
GitHub task provider may use GitHub closing references and issue labels; other
providers must use their native task key and leave approval to an explicit
provider-side gate. The initializer composes this policy into the retained pull
request templates, and the retained validator must not query GitHub issues for a
non-GitHub provider.

## Protected `status:approved` gate
The provider MUST keep this gate fail closed. An agent may add the label only
when a current direct human instruction explicitly names the exact target issue
and the exact action `add status:approved`; target-host evidence binds that
principal to repository maintainer or authorized-approver authority; the
authenticated actor has target-host capability `MAINTAIN` or `ADMIN`; and the
provider performs exactly one add attempt scoped to that issue followed by a
target-host readback. Authority must never be inferred from prose or model
output. A target mismatch, stale/ambiguous/missing instruction, insufficient
permission, failed/unknown mutation, or readback mismatch fails closed without
retrying or broadening scope. Without this evidence, the agent stops and the
human applies the label directly. This change does not approve existing work.

## Prohibitions
Enumerate alternate trackers and any close or transition without verification.

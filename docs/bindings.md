# Bindings - mandatory project providers

This file is generated when the archetype is initialized. The template has no
concrete provider selected yet.

The shape of bindings is defined by the abstract capability contracts:

- [`providers/task/_contract.md`](../providers/task/_contract.md)
- [`providers/secrets/_contract.md`](../providers/secrets/_contract.md)
- [`providers/code-intel/_contract.md`](../providers/code-intel/_contract.md) when `CODE_INTELLIGENCE` is not `none`
- [`ci/_contract.md`](../ci/_contract.md) for CI

During initialization, the exact-version creator replaces this content with the selected task and
secrets instances, plus the optional code-intelligence instance when selected.
The generated task binding explicitly records `TASK_TRACKER`, `TRACKER`, and
`TRACKER_KEY`; if the project/board identity is not configured, resolve it
before durable task operations. Its provider-native confirmation and fresh
readback are authoritative; local task files or UIs are not fallback stores.
`_contract.md` files define shape; they are not selectable providers or recipes.

## Protected `status:approved` gate
The bound task provider may support delegated approval only through its
fail-closed protocol: a current direct human instruction must name the exact
issue and `add status:approved`; target-host evidence must bind that principal
to maintainer/authorized-approver authority; the authenticated actor must have
`MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must be followed by
target-host readback. Any mismatch, stale/ambiguous/missing instruction,
insufficient permission, failed/unknown mutation, or readback mismatch stops
the operation. Without that evidence, the human applies the label directly.
This contract change does not approve existing work.

The selected task provider also controls pull-request linkage. Initialization
composes the native reference into both PR templates; the retained governance
validator keeps GitHub issue-label checks only for GitHub task providers.

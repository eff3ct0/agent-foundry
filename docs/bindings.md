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

## Documentation authority (source-template guide)

The creator's generated `docs/bindings.md` contains the concrete local-default
family map. This source-template file is **not** an initialized project's
configured destination. In the default Git-only project, `AGENT.md` is the
local entrypoint, `docs/engineering-handbook.md` contains architecture and
technical standards, and `docs/workflow.md` contains process constraints.
Project-specific business detail is not invented by the template; record it in
the repository and link it from the generated map when it exists.

For each family (architecture, constraints, business, technical), maintain one
canonical source in that map. If an owner chooses an external or mixed source,
replace the corresponding local-default row with its exact durable URL or
identifier and keep a minimal local bootstrap pointer and access/recovery
instructions. Mark retained summaries and exported copies `Derived - not
authoritative` with source and last-confirmed revision; they are not a fallback
authority. This is a manual documentation contract, **not** a configured
external provider, destination selector, or synchronization mechanism.

Read the map before using a copy. Local project rules override the pinned
organization baseline for overlapping local rules; an explicitly mapped
external family source wins over its derived local copy. If the external
source is unavailable, a link breaks, or copies diverge, state the limitation,
avoid asserting current content, and request the owner to restore access or
repair the exact map/link and reconcile the copy. During migration, change
the canonical row only after the new source and access are verified; label old
copies derived and remove stale references deliberately. Do not move task
state or approval evidence into documentation.

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

# Abstract contract: CI recipe

This file defines the required shape of a CI instance. It is not a recipe or a
selectable job: the Node creator selects only keys from `ci/recipes.json`, so
this file is never composed into a workflow.

Every recipe in `ci/recipes.json` must produce a self-contained YAML job and be
marked as an instance of this contract.

## Identity
- `Contract instance`: reference to this file in the recipe comment.
- `Capability`: `ci`.
- `Ecosystem`: the stack or language covered by the recipe.

## Execution
Declare a reproducible job on a supported runner, check out the code, and pin
the tools or versions required to run it.

## Required gates
Cover the ecosystem's applicable format, lint, typecheck, test, and build gates.
When one does not apply, explicitly omit it using the ecosystem convention; do
not replace it with an arbitrary command.

Applicability is determined by the selected stack and its actual project
configuration, not by a universal list of required scripts. For the TypeScript
npm recipe, `scripts.test` is required; format, lint, typecheck, and build run
only when their respective npm scripts are configured. An absent optional
script is recorded as not applicable and its runner is not executed (it is not
a green check). An absent or invalid required test script is unavailable and
fails CI. Define a real test runner, for example with
`npm pkg set scripts.test="node --test" && npm test` when Node's test runner
fits the project, then rerun CI. Other recipes retain their own gates.

## Failures and traceability
Commands must propagate errors and the job must provide a verification signal
for merging. The recipe key and ecosystem must be identifiable in the generated
workflow.
For each applicable check, retain the runner, observed exit status, and result
in CI logs and phase evidence. A failing executed runner remains failed; an
unavailable required runner fails with a diagnostic and runnable continuation.
Creator plan/verify and static readiness do not establish execution. The bound
task provider remains authoritative for phase handoffs (see issue #244); static
readiness is separate (see issue #247).

## Exclusion
`_contract.md` is not a key in `recipes.json` and cannot become a job.

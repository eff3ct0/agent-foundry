# Abstract contract: CI recipe

This file defines the required shape of a CI instance. It is not a recipe or a
selectable job: `init.py` selects only keys from `ci/recipes.json`, so this file
is never composed into a workflow.

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

## Failures and traceability
Commands must propagate errors and the job must provide a verification signal
for merging. The recipe key and ecosystem must be identifiable in the generated
workflow.

## Exclusion
`_contract.md` is not a key in `recipes.json` and cannot become a job.

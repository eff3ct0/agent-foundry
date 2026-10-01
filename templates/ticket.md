# <TICKET_ID> - <TITLE>

## Context / problem
<!-- guide: what problem this solves and why it matters -->

## Scope
- In: <WHAT_IS_IN>
- Out: <WHAT_IS_OUT>

## Acceptance criteria
- [ ] <CRITERION_1>
- [ ] <CRITERION_2>

## Plan / subtasks
- [ ] <SUBTASK_1>
- [ ] <SUBTASK_2>

## Verification
- Commands: `<TEST_CMD>` - `<BUILD_CMD>` - `<TYPECHECK_CMD>`
- E2e check: <HOW_IN_ENV>

## Definition of Done
See [`definition-of-done.md`](definition-of-done.md).

## Phase state and handoff
Use [`handoff.md`](handoff.md) after every completed phase and at every interruption. The bound issue or
project item must contain the latest current phase, completed work, exact next action, branch/commit,
verification evidence, and required evidence to resume.

## Same-ticket intent reconciliation
At a phase handoff or cold resume, reconcile this ticket's provider-native definition, the latest confirmed
handoff, and the actual work before using a changed scope or acceptance criterion to advance. A changed product
outcome or acceptance criterion cannot silently authorize new work or `DONE`: update the acceptance criteria and
their criterion-to-check mapping on this same bound ticket only within authorized scope, then confirm and read
them back from the provider; a local edit to this file never changes authoritative task intent. A real product
or business-scope decision stays with the human and preserves the current phase. An implementation-only discovery
that leaves the agreed behavior and checks intact proceeds without new approval or artifact, keeping the stable
provider task ID and unaffected completed work.

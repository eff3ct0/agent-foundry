# Phase handoff

Use this comment after every completed phase, at an interruption, or when work is blocked. Replace every
placeholder with a concrete value. Every durable task/TODO mechanism required or configured by the harness
uses only the setup-bound task provider (`<TASK_TRACKER>`, tracker/board `<TRACKER>` / `<TRACKER_KEY>`).
Before resuming, read the provider's task identity, native state, and latest handoff first, not a local file.
Confirm the comment or native handoff operation with that provider and read back its intended content on the
same task before treating this handoff as durable. The provider-confirmed handoff and state are authoritative.
Local files (including `odd/*.md`) and task UIs are optional derived projections, never required or fallback
task stores. The same confirmation and readback rule applies to creation, updates, status changes, checkpoints,
and completion. If the operation is unsupported, fails, identifies an ambiguous task, or cannot be read back
with matching state, or returns malformed data, stop without claiming success. Record the exact missing provider-native operation and
target identity needed to resume; do not map a non-GitHub task provider to GitHub.

## Phase state
- Status: `ACTIVE` | `BLOCKED` | `BLOCKED: requires approval` | `DONE`
- Current phase: `DEFINITION` | `IMPLEMENTATION` | `TESTING/TDD` | `VERIFICATION` | `EVIDENCE/DELIVERY` | `BLOCKED` | `DONE`
- Completed work: `<COMPLETED_WORK>`
- Exact next action: `<EXACT_NEXT_ACTION>`
- Branch: `<BRANCH>`
- Commit: `<COMMIT_SHA_OR_WIP>`
- Verification evidence: `<COMMANDS_AND_RESULTS_OR_NOT_YET_RUN>`
- Required evidence to resume: `<EVIDENCE_REQUIRED_FOR_NEXT_AGENT>`
- Resume phase when blocked: `<PHASE_OR_NOT_BLOCKED>`
- Blocker or approval needed: `<BLOCKER_OR_NOT_BLOCKED>`

## Tracker update
- Bound-provider task identity: `<PROVIDER_TASK_ID>`
- Provider-confirmed task state: `<TRACKER_STATE>`
- Updated after phase: `<COMPLETED_PHASE>`
- Provider operation and readback evidence: `<OPERATION_AND_READBACK_OR_EXACT_BLOCKER>`

# Phase handoff

Use this comment after every completed phase, at an interruption, or when work is blocked. Replace every
placeholder with a concrete value. The latest handoff in the bound issue or project is the cold-agent source
of truth.

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
- Issue/project item state: `<TRACKER_STATE>`
- Updated after phase: `<COMPLETED_PHASE>`

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
- Verification evidence: `<COMMANDS_AND_RESULTS_OR_NOT_YET_RUN>` (for applicable checks: runner, observed exit and result; for omitted checks: why not applicable; for unavailable required runners: diagnostic and runnable exit. Creator/static readiness is not execution.)
- Review evidence: `<RESULT_LOCATOR_OR_UNVERIFIED>`; reviewed base commit `<FULL_SHA_OR_UNVERIFIED>`, head commit `<FULL_SHA_OR_UNVERIFIED>`, complete diff identity `<REPRODUCIBLE_DIGEST_OR_UNVERIFIED>` (file bytes, paths, modes), reviewed scope `<SCOPE_OR_UNVERIFIED>`, disposition `<DISPOSITION_OR_UNVERIFIED>`.
- Candidate comparison: `<MATCHES_CURRENT_BASE_HEAD_AND_DIFF_OR_UNVERIFIED>`; compare the retained result with the current delivery candidate, not just its branch name. If bytes, paths or modes changed, or the result is absent, unreadable or unmatched, report `unverified` and the exact next action (recover/read the result, or review the current candidate and retain its new identity and disposition). Do not carry candidate A's disposition onto changed candidate B; unchanged A keeps its matching evidence.
- PR protection: `<SEPARATE_EVIDENCE_OR_NOT_AUDITED>`; a retained review result does not prove GitHub branch protection, required reviews, or repository settings were audited.
- PR identity: `<BOUND_PROVIDER_PR_ID_AND_OPEN_UNMERGED_STATE_OR_NOT_CREATED>`; PR creation is routine delivery, not merge or deployment. Do not infer either outcome from a PR link or review disposition.
- Integration evidence: `<AUTHORIZED_MERGE_AND_INDEPENDENT_TARGET_BRANCH_READBACK_OR_UNVERIFIED>`; independently confirmed authorized merge establishes integration only. Merge does not establish deployment; human consent is not outcome evidence.
- Deployment evidence: `<ENVIRONMENT_AND_DEPLOYED_REVISION_FROM_INDEPENDENT_ENVIRONMENT_READBACK_OR_UNVERIFIED>`; claim deployment only after environment readback, not from merge, authorization, or a deploy request.
- Next owner and action: `<OWNER_AND_EXACT_NEXT_ACTION>`; for an open/unmerged PR name who will review or decide merge. For an unknown or failed remote mutation, name the exact target and missing proof, stop with no blind retry and no success claim. Obtain independent readback before continuing; do not repeat the mutation blindly.
- Required evidence to resume: `<EVIDENCE_REQUIRED_FOR_NEXT_AGENT>`
- Resume phase when blocked: `<PHASE_OR_NOT_BLOCKED>`
- Blocker or approval needed: `<BLOCKER_OR_NOT_BLOCKED>`

For a deferred action, use the existing fields above to name the selected workspace, actual execution location or uncertainty (including mounted host paths or outer-server tools), relevant path/network/credential reach without probing credentials, the destination/action authorization missing, and the exact next step. Record only the affected action as blocked; unrelated authorized reads continue. Do not include tokens or credentials in a handoff.

## Tracker update
- Bound-provider task identity: `<PROVIDER_TASK_ID>`
- Provider-confirmed task state: `<TRACKER_STATE>`
- Updated after phase: `<COMPLETED_PHASE>`
- Provider operation and readback evidence: `<OPERATION_AND_READBACK_OR_EXACT_BLOCKER>`

## Outcome examples (illustrative, not claims about this task)

Use the same bound-provider task and native status for each case. Replace examples with actual identities and evidence; do not create a new status, second tracker, or automated production gate.

| Case | PR identity | Integration evidence | Deployment evidence | Next owner and action |
| --- | --- | --- | --- | --- |
| PR only | PR 42 open/unmerged | unverified; no merge readback | unverified; no environment readback | Review owner: review PR 42 and decide whether to authorize merge. |
| Confirmed merge | PR 42 merged, identity read back | confirmed authorized merge; target-branch readback at commit abc123 | unverified; no environment readback | Deployment owner: decide whether to authorize deployment; do not claim shipped. |
| Missing deployment readback | PR 42 merged, identity read back | confirmed authorized merge; target-branch readback at commit abc123 | unverified; unknown mutation targeting staging, missing environment readback | Operator: stop, no blind retry; obtain staging revision readback before claiming deployment. |
| Verified deployment | PR 42 merged, identity read back | confirmed authorized merge; target-branch readback at commit abc123 | verified staging environment readback of deployed revision abc123 | Owner: record independent staging evidence in the bound-provider handoff. |

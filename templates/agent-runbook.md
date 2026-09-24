# Agent runbook - session-based execution loop

How an agent executes work in `<PROJECT_NAME>`. Neutral and language-agnostic.

## Why this is a contract, not a runner
The agent harness executes the loop (`/loop`, a `while` loop, cron, or an
orchestrator). This document contains the RULES that make a nondeterministic
agent converge, not the mechanism. Reproducibility lives in the spec and
verification, not in the agent.

### Convergence rules
1. **One task per iteration.** Monolithic and sequential; never two writers on the same work. One task = one session.
2. **Externalized state.** Every durable task/TODO mechanism required or configured by the user's harness uses only the setup-bound task provider in `docs/bindings.md` (`<TASK_TRACKER>`, tracker/board `<TRACKER>` / `<TRACKER_KEY>`). VCS stores work artifacts, not an alternate task store. Read provider state first at startup; confirm and read back updates at close or checkpoint. Never rely on session memory.
3. **Verification ratchet.** A task is done only when its check / Definition of Done passes. Fix root causes rather than symptoms and add a regression when useful.
4. **Explicit stops.** Stop when no actionable task remains or a step requires human judgment or approval (`<APPROVAL_GATED_ACTIONS>`). Mark it `BLOCKED` and hand control back. Never invent consent.
5. **Persistence language.** Conversation language is independent. All persisted work (specs, docs, tickets, tasks, code, comments, commits, and PRs) MUST use `<REPO_LANGUAGE>` (default: English).
6. **Delegated delivery.** A delegated task authorizes routine delivery without intermediate confirmation: update the tracker, implement, verify, commit, push, open the pull request, and leave evidence in the tracker. Approval gates remain explicit.

## Principle: the session is disposable
**Durable task state** lives in the bound provider, never only in session memory, VCS, or a local task UI.
Each session takes one task to a durable point, leaves state, and ends.

Local files (including `odd/*.md`) and task UIs are optional, derived, non-authoritative projections of
provider-confirmed state. Never require them or use them as fallback task stores; scratch notes are ephemeral.
For create, update, status change, comment, checkpoint, phase handoff, or completion, require provider-native
confirmation and fresh readback of the intended task identity and state before claiming success or projecting
it locally. On an unsupported operation, provider error, ambiguous identity, or unavailable/mismatched readback,
stop without claiming the transition or completion. A malformed readback is not confirmation. Record the exact
provider-native operation, target identity, and evidence needed to resume; do not substitute GitHub for a non-GitHub binding.

## Ordered phases
Run every task through these phases in order:

1. `DEFINITION`
2. `IMPLEMENTATION`
3. `TESTING/TDD`
4. `VERIFICATION`
5. `EVIDENCE/DELIVERY`
6. `DONE`

`BLOCKED` is entered from any active phase for an approval gate, unresolved dependency, or two failures for
the same reason. It records the phase to resume and returns there only after the blocker is resolved and
evidence is recorded.

## Deterministic transition rules
- `DEFINITION -> IMPLEMENTATION` requires the problem, scope, acceptance criteria, dependencies, and plan.
- `IMPLEMENTATION -> TESTING/TDD` requires the in-scope change and a test/TDD approach.
- `TESTING/TDD -> VERIFICATION` requires the applicable tests to pass. A failed test stays in this phase.
- `VERIFICATION -> EVIDENCE/DELIVERY` requires the applicable test, build, lint, typecheck, and end-to-end gates.
- `EVIDENCE/DELIVERY -> DONE` requires the complete Definition of Done, required review gates, and durable evidence.
- Any active phase -> `BLOCKED` is allowed only for an explicit blocker, approval requirement, or retry limit.
- `BLOCKED ->` the recorded prior phase requires the blocker to be resolved and the new evidence to be recorded.
- No transition skips a phase, and no transition reaches `DONE` with pending or failed verification or review.

## Session cycle
1. **Read and choose** from the bound provider first: first *In Progress*, then *To Do* in its native order. Read the latest handoff and native state before inspecting local task lists or code, especially after an interruption. Announce `Working <TICKET_ID>`.
2. **Move** the task to *In Progress* and comment the plan through the bound provider; confirm and read back both. If a task must be created, use the applicable provider-native template when one is required; never create a free-form issue where an issue template is mandatory.
3. **Resume** only from provider-confirmed task identity, status, and handoff, not a local projection.
4. **Execute ONLY that** task (no scope drift).
5. **Complete one phase at a time.** After each completed phase, update and read back the bound provider's task with the current phase, completed work, exact next action, branch/commit, verification evidence, and required resume evidence.
6. **Verify** with real signals (`<TEST_CMD>`, `<BUILD_CMD>`, `<TYPECHECK_CMD>`, plus e2e when applicable).
7. **Deliver** the routine result without pausing for confirmation: create a conventional commit referencing `<TICKET_ID>`, push the ticket branch, open the PR with `.github/pull_request_template.md`, and update the ticket with the commit, PR, and verification evidence.
8. **Close** only after the [Definition of Done](definition-of-done.md) passes; move the task to *Done* and read back the intended state and evidence from the bound provider. Opening a PR is not merging it.
9. **Finish** the session (one task = one session).

## Durable handoff and interruption
Use [`handoff.md`](handoff.md) for every phase completion and checkpoint. The provider-confirmed latest handoff
and native state are the cold-agent source of truth. A handoff counts only after provider confirmation and
readback of the intended content on the bound task. It must include:

- status and current phase
- completed work
- exact next action
- branch and commit
- verification evidence
- required evidence to resume
- the prior phase and blocker when status is `BLOCKED`

For a mid-task interruption, commit WIP when possible, persist the handoff, announce `CHECKPOINT <TICKET_ID>`,
and end the session. A new agent reads the tracker state and latest handoff before continuing; it does not use
session memory or an alternate tracker.

### Approval boundaries
- Routine delivery includes issue/project updates, implementation, verification, commit, push, and PR creation.
- Human decisions remain gated: approving review, merge, production deployment, destructive operations, and release publication. Applying `status:approved` is also gated, but the bound task provider may define a fail-closed delegated-approval protocol.
- Under that protocol, the agent may add `status:approved` only when a current direct human instruction names the exact issue and `add status:approved`, target-host evidence binds the principal to maintainer/authorized-approver authority, the authenticated actor has `MAINTAIN` or `ADMIN`, and exactly one scoped add attempt is followed by target-host readback. Any mismatch, stale/ambiguous/missing instruction, insufficient permission, failed/unknown mutation, or readback mismatch stops the operation.
- Without that evidence, mark the task `BLOCKED: requires approval`, tell the human to apply the label directly, leave the exact next step in the tracker, and stop. This contract change does not grant approval for existing work.

### GitHub binding
When the bound tracker is GitHub, create issues from the repository form (or a filled template with
`gh issue create --body-file`), use a closing reference such as `Closes #<TICKET_ID>` in the PR, add
exactly one `type:*` label to the PR, and require `status:approved` on the linked issue. Apply that label
only through the protected delegated-approval protocol above; otherwise the human applies it directly.
Use `gh pr create --body-file` for the PR. The governance workflow checks these rules; it never assigns
approval or merges the PR.

## Checkpoint before compaction (unfinished task)
- Commit WIP.
- Comment on the bound-provider task: status, remaining work, branch, last commit, and next step; confirm and read back the comment.
- Announce `CHECKPOINT <TICKET_ID>`.
- Finish.

## Guardrails
- **Human approval:** never auto-execute `<APPROVAL_GATED_ACTIONS>`; mark `BLOCKED: requires approval` and continue with another task.
- **Infinite-loop prevention:** after two failures for the same reason, mark the task `BLOCKED` and move to the next task.
- **No scope drift:** one task per session.

## How to launch it
- **CLI loop:** one command per iteration; each iteration is a new session.
- **Manual:** execute the cycle by hand, one task at a time.

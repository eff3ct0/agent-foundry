# Agent runbook - session-based execution loop

How an agent executes work in `<PROJECT_NAME>`. Neutral and language-agnostic.

## Why this is a contract, not a runner
The agent harness executes the loop (`/loop`, a `while` loop, cron, or an
orchestrator). This document contains the RULES that make a nondeterministic
agent converge, not the mechanism. Reproducibility lives in the spec and
verification, not in the agent.

### Convergence rules
1. **One task per iteration.** Monolithic and sequential; never two writers on the same work. One task = one session.
2. **Externalized state.** Durable state lives in the bound tracker (see `docs/bindings.md` / `<TRACKER>`) and VCS. Read it at startup and update it at close or checkpoint. Never rely on session memory.
3. **Verification ratchet.** A task is done only when its check / Definition of Done passes. Fix root causes rather than symptoms and add a regression when useful.
4. **Explicit stops.** Stop when no actionable task remains or a step requires human judgment or approval (`<APPROVAL_GATED_ACTIONS>`). Mark it `BLOCKED` and hand control back. Never invent consent.
5. **Persistence language.** Conversation language is independent. All persisted work (specs, docs, tickets, tasks, code, comments, commits, and PRs) MUST use `<REPO_LANGUAGE>` (default: English).
6. **Delegated delivery.** A delegated task authorizes routine delivery without intermediate confirmation: update the tracker, implement, verify, commit, push, open the pull request, and leave evidence in the tracker. Approval gates remain explicit.

## Principle: the session is disposable
**Durable state** lives in `<TRACKER>` and VCS, never only in session memory.
Each session takes one task to a durable point, leaves state, and ends.

## Session cycle
1. **Choose** the next actionable task: first *In Progress*, then *To Do* in order. Announce `Working <TICKET_ID>`.
2. **Move** the task to *In Progress* and comment the plan. If a task must be created, using the corresponding issue template is MANDATORY; blank or free-form issues are prohibited.
3. **Execute ONLY that** task (no scope drift).
4. **Verify** with real signals (`<TEST_CMD>`, `<BUILD_CMD>`, `<TYPECHECK_CMD>`, plus e2e when applicable).
5. **Deliver** the routine result without pausing for confirmation: create a conventional commit referencing `<TICKET_ID>`, push the ticket branch, open the PR with `.github/pull_request_template.md`, and update the ticket with the commit, PR, and verification evidence.
6. **Close** only after the [Definition of Done](definition-of-done.md) passes; move the task to *Done* with evidence. Opening a PR is not merging it.
7. **Finish** the session (one task = one session).

### Approval boundaries
- Routine delivery includes issue/project updates, implementation, verification, commit, push, and PR creation.
- Human decisions remain gated: applying `status:approved`, approving review, merge, production deployment, destructive operations, and release publication.
- When a routine flow reaches a gate, mark the task `BLOCKED: requires approval`, leave the exact next step in the tracker, and stop.

### GitHub binding
When the bound tracker is GitHub, create issues from the repository form (or a filled template with
`gh issue create --body-file`), use a closing reference such as `Closes #<TICKET_ID>` in the PR, add
exactly one `type:*` label to the PR, and require the human `status:approved` label on the linked issue.
Use `gh pr create --body-file` for the PR. The governance workflow checks these rules; it never assigns
approval or merges the PR.

## Checkpoint before compaction (unfinished task)
- Commit WIP.
- Comment on the ticket: status, remaining work, branch, last commit, and next step.
- Announce `CHECKPOINT <TICKET_ID>`.
- Finish.

## Guardrails
- **Human approval:** never auto-execute `<APPROVAL_GATED_ACTIONS>`; mark `BLOCKED: requires approval` and continue with another task.
- **Infinite-loop prevention:** after two failures for the same reason, mark the task `BLOCKED` and move to the next task.
- **No scope drift:** one task per session.

## How to launch it
- **CLI loop:** one command per iteration; each iteration is a new session.
- **Manual:** execute the cycle by hand, one task at a time.

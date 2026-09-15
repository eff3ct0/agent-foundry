# End-to-end workflow

How development work in `<PROJECT_NAME>` moves from objective to delivery.
Language-agnostic. Fill `<UPPER_SNAKE>` during bootstrap.

## 1. Intake and specification
- Capture the **objective** (what problem, for whom).
- Define verifiable **acceptance criteria**.
- Set the **scope**: what is in and what is out.
- Record assumptions and dependencies.

## 2. Ticket decomposition
- Decompose work into tickets in `<TRACKER>`, the **bound** tracker in [`bindings.md`](bindings.md) (compliance is mandatory; do not choose another).
- **One ticket = one unit of work** (one agent session).
- Link each ticket to its default epic `<EPIC_ID>`.
- Use [`templates/ticket.md`](../templates/ticket.md).

## 3. Branches
- Model: `<BRANCHING_MODEL>`.
- **One branch per ticket** from `<INTEGRATION_BRANCH>`.
- Naming: `<BRANCH_NAMING>` (e.g. `<TICKET_ID>-<short-description>`).

## 4. Session execution loop
- See the complete cycle in [`templates/agent-runbook.md`](../templates/agent-runbook.md).
- **One task per session**; no scope drift.
- Announce at start: `Working <TICKET_ID>`.
- Move the ticket to *In Progress* and comment the plan.

## 5. Verification
- `<TEST_CMD>`, `<BUILD_CMD>`, and `<TYPECHECK_CMD>` pass.
- Perform a **real e2e check** against `<ENV>` when warranted.
- **Implemented != verified**: without a real signal, work is not done.

## 6. Review
- **Self-review** the complete diff before requesting review.
- Get a second pair of eyes / **adversarial review**.
- Check scope, meaningful tests, no secrets, no unresolved placeholders, and backward-compatible contracts.

## 7. Definition of Done
- Closeout contract: [`templates/definition-of-done.md`](../templates/definition-of-done.md).
- Do not mark work done with pending or failed verification.

## 8. Handoff / checkpoint
- Before ending or compacting, leave **durable state** in the tracker and VCS.
- Commit (WIP if needed) and comment on the ticket: remaining work, branch, last commit, next step.
- Announce `CHECKPOINT <TICKET_ID>`.

## 9. Integration and deployment
- `<INTEGRATION_BRANCH>` -> `<ENVIRONMENTS>` (dev -> staging -> prod).
- Approval gates: do not execute `<APPROVAL_GATED_ACTIONS>` without explicit human approval.

## 10. Persistence language
- The agent's conversation language is independent of `<REPO_LANGUAGE>`.
- Specs, docs, tickets, tasks, code, comments, commits, and pull requests MUST use `<REPO_LANGUAGE>` (default: English).

## Structural code intelligence
- For structural, dependency, or impact questions, prefer an available structural index over blind grep when the repository provides one.
- The capability is optional: without a configured provider, use native repository tools.

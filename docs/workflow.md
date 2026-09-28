# End-to-end workflow

How development work in `<PROJECT_NAME>` moves from objective to delivery.
Language-agnostic. Fill `<UPPER_SNAKE>` during bootstrap.

## 1. Intake and specification
- Capture the **objective** (what problem, for whom).
- Define verifiable **acceptance criteria**.
- Set the **scope**: what is in and what is out.
- Record assumptions and dependencies.
- Before planning a consequential tool action, identify the selected workspace, actual execution boundary or uncertainty, relevant path/network/credential reach, and authorization for its destination and action (see [`AGENT.md`](../AGENT.md)). Do not infer isolation from a sandbox label or probe credentials; defer an unauthorized action without stopping unrelated authorized reads.

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
- Retain the reviewer's actual result with base/head commit IDs, a reproducible complete diff identity covering file bytes, paths and modes, reviewed scope, and disposition. Before citing it at delivery, compare those identities with the current candidate. A result for candidate A does not attest candidate B after any content, path, or mode change, even if the change seems small; unchanged A retains its evidence. Missing, unreadable or unmatched evidence is **unverified**: recover/read the result or review the current candidate and record its new identity and disposition before claiming review completion.
- For a Git candidate with both commits available, one reproducible identity is SHA-256 of the raw bytes of `git diff --raw --no-abbrev --no-renames -z <base> <head>` (do not hash a human-formatted display). The full Git object IDs bind file content; raw paths and modes bind renames and permission changes. Record this command/format alongside the digest and full base/head commit IDs. If the reviewed scope is narrower than this diff, identify precisely what was reviewed and do not claim complete review. If the objects or result cannot be read or a file's content identity cannot be established, report unverified and obtain the missing evidence or re-review the current candidate.
- Uncommitted working-tree edits are not part of the committed candidate identity: include them in a new candidate before requesting review or delivery. Do not infer a matching result from the branch name or a successful test run.
- This retained result is not GitHub PR protection. Branch protection, required reviews, and settings require their own evidence; do not claim they were audited from a local review record.

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
- An open PR is routine delivery, not merge or deployment: record its identity, open/unmerged state, and next owner/action in the bound-provider handoff. Independently confirmed authorized merge plus target-branch readback establishes integration, not deployment. Claim deployment only with independent environment readback of the deployed revision and environment; human consent to merge or deploy is not evidence of the outcome. For an unknown or failed remote mutation, record the target and missing proof, stop with no blind retry and no success claim. No new task status, tracker, or automated production gate is required; use [`templates/handoff.md`](../templates/handoff.md).

## 10. Persistence language
- The agent's conversation language is independent of `<REPO_LANGUAGE>`.
- Specs, docs, tickets, tasks, code, comments, commits, and pull requests MUST use `<REPO_LANGUAGE>` (default: English).

## 11. Template ownership boundary

An initialized project contains the generic workflow contracts and generated
project outputs it needs. Source-template maintainers classify every tracked
asset before merging it: archetype-only governance and release tooling are
removed during initialization, provider/CI recipes are consumed before removal,
and inherited generic assets plus generated bindings and CI remain. New files
must follow that classification; downstream projects must not receive
archetype-only release E2E or OpenAI triage procedures.

## Structural code intelligence
- For structural, dependency, or impact questions, prefer an available structural index over blind grep.
- The capability is optional and defaults to `none`; without a configured provider, use native repository tools.

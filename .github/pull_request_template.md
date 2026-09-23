## Summary
<!-- guide: what changes and why, in 2-3 lines -->

## Ticket
<!-- provider-governance:start -->
Closes #<TICKET_ID>
<!-- The linked GitHub issue must have status:approved. -->
<!-- provider-governance:end -->

## PR type
- Add exactly one `type:*` label to this pull request.
- [ ] Bug fix
- [ ] Feature
- [ ] Documentation only
- [ ] Refactor
- [ ] Maintenance/tooling
- [ ] Breaking change

## Changes
- <CHANGE_1>
- <CHANGE_2>

## How to verify
```
<TEST_CMD>
<BUILD_CMD>
<LINT_CMD>
<TYPECHECK_CMD>
```
E2e check: <STEPS_IN_ENV>

## Exact package and release evidence
- Package spec: `factory-template-creator@<EXACT_VERSION>` or `N/A` (explain why).
- Release tag/source SHA: `<TAG>` / `<FULL_SOURCE_SHA>` or `N/A` (explain why).
- Payload digest: `<PAYLOAD_DIGEST>` or `N/A`.
- Tarball digest and generated-tree digest: `<TARBALL_DIGEST>` / `<TREE_DIGEST>` or `N/A`.
- Evidence artifact or command output: `<LINK_OR_PATH>`.

## Risks and rollback
- Risk: <RISK>
- Rollback: <HOW_TO_ROLL_BACK>. Published npm versions are immutable; use a correcting version and keep Template mode as the separately authorized safety valve until consumer evidence passes.

## Definition of Done
- [ ] See the complete checklist in `templates/definition-of-done.md`.
- [ ] No unresolved placeholders or secrets.
- [ ] Persisted content uses `<REPO_LANGUAGE>`.
- [ ] Review approved.

## Phase evidence
Copy the final [`templates/handoff.md`](../templates/handoff.md) state, including the branch/commit,
verification evidence, and the next action to close the ticket.

## Screenshots OPTIONAL
<!-- guide: attach when applicable; remove this section otherwise -->

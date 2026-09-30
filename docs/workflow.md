# End-to-end workflow

How development work in `<PROJECT_NAME>` moves from objective to delivery.
Load for intake, review, handoff, or deployment via `AGENT.md`'s task route;
the runbook owns detailed phase transitions and provider handoff. Language-agnostic.
Fill `<UPPER_SNAKE>` during bootstrap.

## 1. Intake and specification
- Capture the **objective** (what problem, for whom).
- Define verifiable **acceptance criteria**.
- Set the **scope**: what is in and what is out.
- Record assumptions and dependencies.

## 2. Ticket decomposition
- Decompose work into tickets in `<TRACKER>`, the bound tracker in [`bindings.md`](bindings.md).
- One ticket = one unit of work (one agent session).
- Link each ticket to its default epic `<EPIC_ID>`.
- Use [`templates/ticket.md`](../templates/ticket.md).

## 3. Branches
- Model: `<BRANCHING_MODEL>`.
- **One branch per ticket** from `<INTEGRATION_BRANCH>`.
- Naming: `<BRANCH_NAMING>` (e.g. `<TICKET_ID>-<short-description>`).

## 4. Session execution loop
- See the complete cycle, provider-native confirmation/readback, and retry rules in [`templates/agent-runbook.md`](../templates/agent-runbook.md).

## 5. Verification
- `<TEST_CMD>`, `<BUILD_CMD>`, and `<TYPECHECK_CMD>` pass.
- Perform a **real e2e check** against `<ENV>` when warranted.
- **Implemented != verified**: without a real signal, work is not done.
- Assess affected documentation families and attach destination-specific revision or pending evidence to the same work unit; follow the [documentation evidence procedure](engineering-handbook.md#documentation-evidence-for-affected-families). An unaffected unit records its reason and needs no document write. Source updates alone do not prove external propagation or Pages publication.

## 6. Review
- **Self-review** the complete diff before requesting review.
- Get a second pair of eyes / **adversarial review**.
- Check scope, meaningful tests, no secrets, no unresolved placeholders, and backward-compatible contracts.

## 7. Definition of Done
- Closeout contract: [`templates/definition-of-done.md`](../templates/definition-of-done.md).
- The runbook owns the phase transition to `DONE`; pending or failed verification cannot satisfy the closeout contract.

## 8. Handoff / checkpoint
- Before ending or compacting, follow the runbook handoff fields and confirm/read back the bound-provider state. VCS holds work artifacts, not task authority.

## 9. Integration and deployment
- `<INTEGRATION_BRANCH>` -> `<ENVIRONMENTS>` (dev -> staging -> prod).
- Approval gates remain in `AGENT.md`: do not execute `<APPROVAL_GATED_ACTIONS>` without explicit human approval. Routine delivery is not merge or release authorization.

## 10. Persistence language
- Follow the repository persistence-language rule in `AGENT.md`; conversation language is independent.

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

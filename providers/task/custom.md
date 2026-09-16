## Custom task provider

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `task`
> **Provider:** `custom`

Define the bound provider's name, task location, state operations, and prohibitions here. The provider MUST
retain the provider-neutral phase contract:

- `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`.
- `BLOCKED` records the phase to resume and is used for approval gates, unresolved dependencies, or the retry limit.
- After every completed phase, persist current phase/status, completed work, exact next action, branch/commit,
  verification evidence, and required evidence to resume in the bound task.
- Do not mark *Done* before the Definition of Done and required review gates pass.
- Approval-gated work stops with `BLOCKED: requires approval`; do not assign human approval labels.

<TASK_TRACKER_CUSTOM_RULES>

**Binding:** Tasks live exclusively in the system declared by the project.

**Agent interaction:** the harness provides MCP, CLI, or API; these rules must
explain how to read, create, update, and comment on tasks.

**Rules and lifecycle:** define the status cycle and how to reference tasks in
commits/PRs and checkpoints.

**Protected `status:approved` gate:** the provider MUST keep this gate fail
closed. A current direct human instruction must name the exact issue and the
exact action `add status:approved`; target-host evidence must bind that
principal to maintainer or authorized-approver authority; the authenticated
actor must have `MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must
be followed by target-host readback. Any mismatch, stale or ambiguous
instruction, insufficient permission, failed or unknown mutation, or readback
mismatch stops the operation without retrying or broadening scope. Without
this evidence, the human applies the label directly.

**Prohibitions:** do not use alternate trackers or close a task without verification.

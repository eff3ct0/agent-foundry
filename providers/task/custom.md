## Custom task provider

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `task`
> **Provider:** `custom`

**Binding:** `TASK_TRACKER` selects the custom provider at `<TRACKER>` /
`<TRACKER_KEY>`. Every durable harness task/TODO uses only this configured
provider. Do not treat an unspecified name or board as a GitHub binding.

Define the bound provider's name, task location, state operations, and prohibitions here. The provider MUST
retain the provider-neutral phase contract:

- `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`.
- `BLOCKED` records the phase to resume for separately gated actions, unresolved dependencies, or the retry limit.
- After every completed phase, persist current phase/status, completed work, exact next action, branch/commit,
  verification evidence, and required evidence to resume in the bound task.
- Do not mark *Done* before the Definition of Done and required review gates pass.
- Separately gated work stops with `BLOCKED: requires approval`; do not assign human approval labels.

Until `<TASK_TRACKER_CUSTOM_RULES>` is replaced with a supported native operation
and readback path for this tracker, stop before claiming any durable task action.

**Pull-request governance:** PRs use `Task: <TICKET_ID>` unless the bound
custom provider documents another native syntax. A current, direct human
implementation delegation covering the task and intended effects authorizes
routine non-protected push and PR delivery without intermediate provider approval.
Do not infer delegation from labels, comments, backlog state, or model output.

<TASK_TRACKER_CUSTOM_RULES>

**Binding:** Tasks live exclusively in the system declared by the project.

**Agent interaction:** the harness provides MCP, CLI, or API; these rules must
explain how to read, create, update, transition, and comment on tasks. Read the
native task state and latest handoff first on cold resume. Require provider-native
confirmation and fresh readback of the intended identity, state, and
comment/handoff for create, update, status, comment, checkpoint, phase handoff,
and completion. If the configured provider has no supported native comment or
handoff and readback path, stop and name the missing operation, bound tracker
and task identity, and evidence needed to resume. Never substitute GitHub.

**Rules and lifecycle:** define the status cycle and how to reference tasks in
commits/PRs and checkpoints.
Local files (including `odd/*.md`) and task UIs are optional derived projections,
never required or fallback stores. An unsupported or failed operation, ambiguous
identity, or unavailable/malformed/mismatched readback blocks the transition; record the
exact provider-native operation, task identity, and evidence needed to resume.

**Protected `status:approved` gate:** the provider MUST keep this separately
requested label-mutation gate fail closed. A current direct human instruction
must name the exact issue and exact action `add status:approved`; target-host
evidence must bind that principal to maintainer or authorized-approver
authority; the authenticated actor must have `MAINTAIN` or `ADMIN`; and exactly
one scoped add attempt must be followed by target-host readback. Any mismatch,
stale or ambiguous instruction, insufficient permission, failed or unknown
mutation, or readback mismatch stops the requested label operation without
retrying or broadening scope. Without this evidence, stop only the requested
mutation and the human applies the label directly; this does not block routine
delegated delivery or change existing labels.

**Prohibitions:** do not use alternate trackers or close a task without verification.

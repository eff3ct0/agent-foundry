## Jira

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `task`
> **Provider:** `jira`

**Binding:** `TASK_TRACKER` selects Jira; tasks live EXCLUSIVELY in Jira
(`<TRACKER>` project/board `<TRACKER_KEY>`). Every durable harness task/TODO
uses this binding, never an alternate tracker.

**Agent interaction:** use the harness mechanism (MCP, CLI, or API). Semantic
operations are creating an issue, commenting, transitioning status, and linking
to epic `<EPIC_ID>`.
Read the Jira issue's native state and latest handoff first on cold resume. For
create, update, transition, comment, checkpoint, phase handoff, and completion,
require Jira confirmation and fresh readback of the intended issue key, state,
and comment/handoff before claiming success. Local files (including `odd/*.md`)
and task UIs are optional derived projections, never required or fallback stores.
If an operation is unsupported or fails, the issue identity is ambiguous, or
readback is unavailable, malformed, or mismatched, stop and record the exact Jira operation,
issue key, and evidence needed to resume. Do not substitute GitHub Issues.

**Mandatory template:** creating an issue MUST use the project/provider's
corresponding issue template for its type (`task` or `bug`); blank or free-form
issues are prohibited.

**Pull-request governance:** PRs use the native reference `Jira: <TICKET_ID>`.
The Jira issue key provides the development link. A current, direct human
implementation delegation covering the issue and its intended effects authorizes
routine non-protected branch push and PR delivery without an intermediate Jira approval gate or GitHub label
requirement. Do not infer delegation from labels, comments, backlog state, or
model output. GitHub must not require a closing reference or inspect GitHub
issue labels for this provider.

**Rules and lifecycle:**
- Statuses: *To Do* -> *In Progress* -> *Done* (map to the board's actual equivalents when different).
- At start, move the issue to *In Progress* and comment the plan; at close, move it to *Done*.
- After every completed phase, add the latest [handoff template](../../templates/handoff.md) state to the issue. The handoff records current phase/status, completed work, exact next action, branch/commit, verification evidence, and required evidence to resume.
- Leave progress/checkpoint comments on the issue; durable state lives there, not in the session.
- One issue = one unit of work (one session).
- Every commit/PR references the issue key (`<TRACKER_KEY>-NNN`).
- **Protected `status:approved` gate:** this protocol applies only to a separately requested label mutation, not routine delegated delivery. A current direct human instruction must name the exact issue and the exact action `add status:approved`; target-host evidence must bind that principal to maintainer or authorized-approver authority; the authenticated actor must have `MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must be followed by target-host readback. Any mismatch, stale or ambiguous instruction, insufficient permission, failed or unknown mutation, or readback mismatch stops that mutation without retrying or broadening scope. Without this evidence, the human applies the label directly. Human review approval, merge, deployment, publication, and destructive operations remain separately gated.

**Phase state:** Use `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`.
`BLOCKED` records the phase to resume; failed gates remain in the current phase. Never skip a phase or mark
*Done* with pending or failed verification.

**Prohibitions:**
- Do not open tasks in GitHub Issues, Linear, or another system.
- Do not mark *Done* with pending or failed verification.
- Do not leave state only in a local file, task UI, or session: Jira readback is authoritative.

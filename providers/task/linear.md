## Linear

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `task`
> **Provider:** `linear`

**Binding:** `TASK_TRACKER` selects Linear; tasks live EXCLUSIVELY in Linear
(`<TRACKER>` team/project `<TRACKER_KEY>`). Every durable harness task/TODO uses
this binding, never an alternate tracker.

**Agent interaction:** use the harness mechanism (MCP, CLI, or API). Semantic
operations are creating an issue, commenting, changing status, and associating
the issue with the project/cycle.
Read the Linear issue's native state and latest handoff first on cold resume.
For create, update, transition, comment, checkpoint, phase handoff, and
completion, require Linear confirmation and fresh readback of the intended issue
identifier, state, and comment/handoff before claiming success. Local files
(including `odd/*.md`) and task UIs are optional derived projections, never
required or fallback stores. If an operation is unsupported or fails, issue
identity is ambiguous, or readback is unavailable, malformed, or mismatched, stop and record
the exact Linear operation, issue identifier, and evidence needed to resume.
Do not substitute GitHub Issues.

**Mandatory template:** creating an issue MUST use the project/provider's
corresponding issue template for its type (`task` or `bug`); blank or free-form
issues are prohibited.

**Pull-request governance:** PRs use the native reference
`Linear: <TICKET_ID>`. The Linear issue key provides the task link; approval
remains an explicit Linear-side gate.

**Rules and lifecycle:**
- Linear status cycle: *Backlog/Todo* -> *In Progress* -> *Done* (use the team's actual statuses).
- At start, move the issue to *In Progress* and comment the plan; at close, move it to *Done*.
- After every completed phase, add the latest [`templates/handoff.md`](../../templates/handoff.md) state to the issue. The handoff records current phase/status, completed work, exact next action, branch/commit, verification evidence, and required evidence to resume.
- Leave progress/checkpoint comments on the issue.
- One issue = one unit of work. Every commit/PR references the identifier (`<TRACKER_KEY>-NNN`).
- **Protected `status:approved` gate:** the provider MUST keep this gate fail closed. A current direct human instruction must name the exact issue and the exact action `add status:approved`; target-host evidence must bind that principal to maintainer or authorized-approver authority; the authenticated actor must have `MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must be followed by target-host readback. Any mismatch, stale or ambiguous instruction, insufficient permission, failed or unknown mutation, or readback mismatch stops the operation without retrying or broadening scope. Without that evidence, the human applies the label directly.

**Phase state:** Use `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`.
`BLOCKED` records the phase to resume; failed gates remain in the current phase. Never skip a phase or close
with pending or failed verification.

**Prohibitions:**
- Do not open tasks in Jira, GitHub, or another system.
- Do not close with pending or failed verification.
- Do not leave status only in the session.

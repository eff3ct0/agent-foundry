## Jira

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `task`
> **Provider:** `jira`

**Binding:** Project tasks live EXCLUSIVELY in Jira (project/board
`<TRACKER_KEY>`). The agent MUST create, update, and transition tasks there and
MUST NOT use another tracker.

**Agent interaction:** use the harness mechanism (MCP, CLI, or API). Semantic
operations are creating an issue, commenting, transitioning status, and linking
to epic `<EPIC_ID>`.

**Mandatory template:** creating an issue MUST use the project/provider's
corresponding issue template for its type (`task` or `bug`); blank or free-form
issues are prohibited.

**Pull-request governance:** PRs use the native reference `Jira: <TICKET_ID>`.
The Jira issue key provides the development link; approval remains an explicit
Jira-side gate. GitHub must not require a closing reference or inspect GitHub
issue labels for this provider.

**Rules and lifecycle:**
- Statuses: *To Do* -> *In Progress* -> *Done* (map to the board's actual equivalents when different).
- At start, move the issue to *In Progress* and comment the plan; at close, move it to *Done*.
- After every completed phase, add the latest [`templates/handoff.md`](../../templates/handoff.md) state to the issue. The handoff records current phase/status, completed work, exact next action, branch/commit, verification evidence, and required evidence to resume.
- Leave progress/checkpoint comments on the issue; durable state lives there, not in the session.
- One issue = one unit of work (one session).
- Every commit/PR references the issue key (`<TRACKER_KEY>-NNN`).
- **Protected `status:approved` gate:** the provider MUST keep this gate fail closed. A current direct human instruction must name the exact issue and the exact action `add status:approved`; target-host evidence must bind that principal to maintainer or authorized-approver authority; the authenticated actor must have `MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must be followed by target-host readback. Any mismatch, stale or ambiguous instruction, insufficient permission, failed or unknown mutation, or readback mismatch stops the operation without retrying or broadening scope. Without that evidence, the human applies the label directly.

**Phase state:** Use `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`.
`BLOCKED` records the phase to resume; failed gates remain in the current phase. Never skip a phase or mark
*Done* with pending or failed verification.

**Prohibitions:**
- Do not open tasks in GitHub Issues, Linear, or another system.
- Do not mark *Done* with pending or failed verification.
- Do not leave state only in Jira: if it is not there, it does not exist.

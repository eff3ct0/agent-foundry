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

**Rules and lifecycle:**
- Statuses: *To Do* -> *In Progress* -> *Done* (map to the board's actual equivalents when different).
- At start, move the issue to *In Progress* and comment the plan; at close, move it to *Done*.
- Leave progress/checkpoint comments on the issue; durable state lives there, not in the session.
- One issue = one unit of work (one session).
- Every commit/PR references the issue key (`<TRACKER_KEY>-NNN`).

**Protected `status:approved` gate:** the provider MUST keep this gate fail
closed. A current direct human instruction must name the exact issue and the
exact action `add status:approved`; target-host evidence must bind that
principal to maintainer or authorized-approver authority; the authenticated
actor must have `MAINTAIN` or `ADMIN`; and exactly one scoped add attempt must
be followed by target-host readback. Any mismatch, stale or ambiguous
instruction, insufficient permission, failed or unknown mutation, or readback
mismatch stops the operation without retrying or broadening scope. Without
this evidence, the human applies the label directly.

**Prohibitions:**
- Do not open tasks in GitHub Issues, Linear, or another system.
- Do not mark *Done* with pending or failed verification.
- Do not leave state only in Jira: if it is not there, it does not exist.

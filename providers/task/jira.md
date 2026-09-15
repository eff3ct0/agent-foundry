## Jira

> **Contract instance:** [`_contract.md`](../providers/task/_contract.md)
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

**Prohibitions:**
- Do not open tasks in GitHub Issues, Linear, or another system.
- Do not mark *Done* with pending or failed verification.
- Do not leave state only in Jira: if it is not there, it does not exist.

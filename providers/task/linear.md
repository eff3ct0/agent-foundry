## Linear

> **Contract instance:** [`_contract.md`](../providers/task/_contract.md)
> **Capability:** `task`
> **Provider:** `linear`

**Binding:** Project tasks live EXCLUSIVELY in Linear (team/project
`<TRACKER_KEY>`). The agent MUST create, update, and transition issues there and
MUST NOT use another tracker.

**Agent interaction:** use the harness mechanism (MCP, CLI, or API). Semantic
operations are creating an issue, commenting, changing status, and associating
the issue with the project/cycle.

**Mandatory template:** creating an issue MUST use the project/provider's
corresponding issue template for its type (`task` or `bug`); blank or free-form
issues are prohibited.

**Rules and lifecycle:**
- Linear status cycle: *Backlog/Todo* -> *In Progress* -> *Done* (use the team's actual statuses).
- At start, move the issue to *In Progress* and comment the plan; at close, move it to *Done*.
- Leave progress/checkpoint comments on the issue.
- One issue = one unit of work. Every commit/PR references the identifier (`<TRACKER_KEY>-NNN`).

**Prohibitions:**
- Do not open tasks in Jira, GitHub, or another system.
- Do not close with pending or failed verification.
- Do not leave status only in the session.

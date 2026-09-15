## GitHub Projects

> **Contract instance:** [`_contract.md`](../providers/task/_contract.md)
> **Capability:** `task`
> **Provider:** `github-projects`

**Binding:** Project tasks live EXCLUSIVELY in GitHub Projects v2 (board
`<TRACKER_KEY>`). The agent MUST create/update items and move their status there
and MUST NOT use another tracker.

**Agent interaction:** use the mechanism provided by the harness (MCP, CLI, or
API). Semantic operations are creating an item (or linking an existing issue),
setting fields, and changing status.

**Mandatory template:** a new issue linked to the board MUST use the
corresponding `.github/ISSUE_TEMPLATE/` (`task` or `bug`). With `gh`, fill that
structure via `gh issue create --body-file <filled-template>`, then link the
issue to the project. Do not create blank or free-form issues.

**Pull requests:** every PR MUST use `.github/pull_request_template.md`; with
`gh`, fill it in a file and use `gh pr create --body-file <filled-template>`.

**Rules and lifecycle:**
- Board status: *To Do* -> *In Progress* -> *Done*.
- When applicable, each item is backed by a linked repository issue for commit/PR references.
- At start, move the item to *In Progress* and comment the plan on the linked issue; at close, move it to *Done*.
- One card = one unit of work.

**Prohibitions:**
- Do not open tasks in Jira, Linear, or another board.
- Do not close with pending or failed verification.
- Do not leave status only in the session.

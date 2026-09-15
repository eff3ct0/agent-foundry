## GitHub Issues

> **Contract instance:** [`_contract.md`](../providers/task/_contract.md)
> **Capability:** `task`
> **Provider:** `github-issues`

**Binding:** Project tasks live EXCLUSIVELY in the repository's GitHub Issues
(`<TRACKER_KEY>`). The agent MUST create, update, and close issues there and
MUST NOT use another tracker.

**Agent interaction:** use the mechanism provided by the harness (MCP, CLI, or
API). Semantic operations are reading, opening, updating, commenting on,
labeling, and closing issues. GitHub CLI examples are acceptable when the
harness does not provide a native operation.

**Mandatory template:** every new issue MUST use the corresponding template in
`.github/ISSUE_TEMPLATE/` (`task.yml` for product work or `bug.yml` for defects).
In the web UI, use the corresponding form. The body must include context/problem,
acceptance criteria, scope, and verification. With `gh`, fill the equivalent
structure first and create it with:
`gh issue create --repo <OWNER>/<REPO> --title "<title>" --label "type:product" --body-file <filled-template>`
or `--label "type:bug"`. Do not use free-form `--body` or omit the body.

**Pull requests:** every PR MUST use `.github/pull_request_template.md`. With
`gh`, fill that structure in a file and use `gh pr create --body-file <filled-template>`.

**Rules and lifecycle:**
- Type is selected by label: `task` for work, `bug` for defects.
- Status uses labels (e.g. `status:in-progress`) or native open/closed state; use the repository's existing convention.
- At start, mark the issue in progress and comment the plan; at close, reference the commit/PR.
- Leave progress/checkpoint comments on the issue.
- One issue = one unit of work. Every commit/PR references `#<number>`.
- A delegated issue authorizes routine delivery without intermediate confirmation: update the issue, implement, verify, commit, push, open the PR, and comment the evidence.
- The human must apply `status:approved`; agents never assign that label. Merge, production deployment, destructive operations, release publication, and review approval remain gated.

**Prohibitions:**
- Do not open tasks in Jira, Linear, or another system.
- Do not close with pending or failed verification.
- Do not keep state only in session memory.

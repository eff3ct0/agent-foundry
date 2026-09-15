## Custom task provider

> **Contract instance:** [`_contract.md`](../providers/task/_contract.md)
> **Capability:** `task`
> **Provider:** `custom`

Custom task provider: define the rules here - name, task location, status
lifecycle, and prohibitions.

<TASK_TRACKER_CUSTOM_RULES>

**Binding:** Tasks live exclusively in the system declared by the project.

**Agent interaction:** the harness provides MCP, CLI, or API; these rules must
explain how to read, create, update, and comment on tasks.

**Rules and lifecycle:** define the status cycle and how to reference tasks in
commits/PRs and checkpoints.

**Prohibitions:** do not use alternate trackers or close a task without verification.

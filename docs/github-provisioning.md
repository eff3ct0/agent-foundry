# GitHub provisioning

`factory-template github-provision` is the explicit, authenticated boundary
for ensuring the organization repositories `<org>/.github` and
`<org>/<factory-repo>`. Local `plan`, `apply`, `verify`, and `doctor` commands
never invoke it.

## Safe preview

`--plan` validates the owner, repository, and visibility locally and emits the
targets without invoking `gh`, reading authentication, or mutating GitHub:

```sh
factory-template github-provision --org acme --factory-repo factory --visibility private --plan
```

## Ensure

```sh
factory-template github-provision --org acme --factory-repo factory --visibility private
factory-template github-provision --org acme --factory-repo factory --visibility private --yes
factory-template github-provision --org acme --factory-repo factory --no-create
```

The command uses `gh auth status`, `gh repo view`, and `gh repo create` with
argument arrays and no shell. It forwards only non-secret process settings
needed to locate `gh` and its authenticated configuration; token variables are
not copied into the child environment. Every operation has a 30-second
timeout.

Creation is fail-closed: each missing target requires interactive `y` consent
or `--yes`; EOF and any other answer skip the target. A successful create is
followed by `gh repo view --json nameWithOwner,visibility` and is considered
successful only when the target and requested visibility match. An uncertain
create is never retried automatically.

## Output and recovery

Standard output is stable, versioned JSON. Each target has one of:

- `existing` - target was already present or a create raced with another actor.
- `created` - create succeeded and target-host readback matched.
- `skipped` - consent was absent or denied.
- `missing` - lookup found no target and `--no-create` prevented creation.
- `rejected` - GitHub rejected authentication, permission, validation, or a mutation.
- `indeterminate` - timeout, network/5xx failure, or missing/mismatched readback.

The process exits non-zero for `missing`, `skipped`, `rejected`, or
`indeterminate`. For an indeterminate result, inspect GitHub manually before
running the command again; do not assume that a create did not happen.

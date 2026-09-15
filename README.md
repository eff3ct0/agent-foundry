# <PROJECT_NAME>

**Language-agnostic** repository template (any language/stack) defining how software development work is
executed, written **for AI agents** and readable by humans. It is intended for use as a **GitHub template
repository**: create a new repo from this structure and fill the `<PLACEHOLDER>` values.

## What it includes
- [`start.py`](start.py) - startup: `python3 start.py` detects repository state (initialize vs. work) and prints the next step. It runs first and remains permanent (it is not auto-cleaned).
- [`AGENT.md`](AGENT.md) - primary entrypoint; operating rules and references.
- [`docs/workflow.md`](docs/workflow.md) - end-to-end workflow.
- [`docs/engineering-handbook.md`](docs/engineering-handbook.md) - engineering standards.
- [`docs/bootstrap.md`](docs/bootstrap.md) - how to initialize a project from this template.
- [`docs/agent-init.md`](docs/agent-init.md) - agent-mode initialization procedure.
- [`docs/org-factory.md`](docs/org-factory.md) - organization layer (`.github` repo and `FACTORY_SPEC` pin).
- [`templates/`](templates/) - ticket, pull request, Definition of Done, ADR, spec, and agent runbook templates.
- [`.github/`](.github/) - issue and pull request templates for GitHub.
- [`init.py`](init.py) + [`placeholders.json`](placeholders.json) - Python 3 stdlib initializer that fills placeholders; `placeholders.json` is the single source of truth for project-level placeholders.
- [`.github/labels.json`](.github/labels.json) + [`scripts/`](scripts/) - canonical GitHub labels, idempotent synchronization, and PR governance validation.

## How to use it
1. **As a GitHub template:** mark this repo as a *Template repository* (Settings -> Template repository). Then use *Use this template -> Create a new repository* for each project.
2. **By cloning:** copy the contents to a new repo without this template's history.
3. Fill `<PLACEHOLDER>` values with the initializer: `python3 init.py` (interactive), or let an agent run it and resolve judgment values. Then choose tooling and make the first commit. See [`docs/bootstrap.md`](docs/bootstrap.md).

## Placeholder convention
`<UPPER_SNAKE>` = value to fill. `<!-- guide: ... -->` = instruction for the person filling it. Sections marked `OPTIONAL` are removed when they do not apply. A correctly initialized project has no unresolved manifest `<PLACEHOLDER>` values (see the final checklist in [`docs/bootstrap.md`](docs/bootstrap.md)).

## Persistence language
The agent may converse in any language. All persisted project work uses `<REPO_LANGUAGE>`, which defaults to English and is configured in [`placeholders.json`](placeholders.json).

## GitHub governance
Issues use the forms in `.github/ISSUE_TEMPLATE/` and blank issues are disabled. A pull request must
contain a closing reference such as `Closes #123`, have exactly one `type:*` label, and link an issue
with `status:approved`. The governance workflow validates these rules without assigning approval. The
label may be added by an agent only through the fail-closed delegated-approval protocol: current direct
instruction naming the exact issue and action, target-host maintainer/authorized-approver evidence,
`MAINTAIN` or `ADMIN` actor capability, one exact add attempt, and target-host readback. Otherwise the
human applies it directly. Labels are synchronized with:
`python3 scripts/sync-github-labels.py --repo OWNER/REPO`.

## Delegated delivery
Delegating a task authorizes its routine path without intermediate confirmation: update the tracker,
implement, verify, commit, push, open the PR, and leave evidence. It does not authorize review approval,
merge, production deployment, destructive operations, or release publication. `status:approved` remains
protected and is allowed only through the evidence-based protocol above; this change does not approve
existing work. Check the contract with `python3 scripts/check-delivery-contract.py`.
The offline delegated-approval cases can be run directly with
`python3 scripts/check-delivery-contract.py --approval-self-check`; it performs no GitHub mutation.

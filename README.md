# <PROJECT_NAME>

**Language-agnostic** repository template for agent-first software development.
The exact-version Node creator package is the primary way to create a project
from this archetype.

## What it includes

- [`start.mjs`](start.mjs) - canonical local `SELF`, `SETUP`, and `WORK` router.
- [`AGENT.md`](AGENT.md) - primary operating contract.
- [`docs/bootstrap.md`](docs/bootstrap.md) - package-first initialization.
- [`docs/agent-init.md`](docs/agent-init.md) - agent initialization procedure.
- [`docs/creator.md`](docs/creator.md) - transactional creator and recovery contract.
- [`docs/workflow.md`](docs/workflow.md) - end-to-end delivery workflow.
- [`docs/determinism.md`](docs/determinism.md) - repeatability and static audits.
- [`hooks/README.md`](hooks/README.md) - optional harness startup adapters.
- [`templates/`](templates/) and [`.github/`](.github/) - reusable governance forms.

## Exact-version creator

The package is `@eff3ct/agent-foundry` and requires Node.js 20.19 or newer.
Always pin the exact version in onboarding and release verification:

```sh
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan --target ./new-project --config answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply --target ./new-project --config answers.json --non-interactive --yes
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./new-project --config answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry doctor --target ./new-project --non-interactive
```

Maintainers publish only through `.github/workflows/npm-release.yml`. The
workflow binds `v<EXACT_VERSION>` to one source revision, publishes once with
provenance, and records npm metadata, payload, tarball, and source identity
readback. Contributors must record that evidence in the pull request.

The package applies the immutable payload locally and offline. It emits a
versioned JSON envelope, protects unknown files, rolls back failed writes, and
reports interrupted staging or owned-file drift through `doctor`. It composes
Python CI support from data when a generated project selects the Python stack;
the archetype itself has no Python maintainer automation.

## Quickstart

Create an empty repository with the intended owner, name, visibility, and
default branch. Do not use GitHub Template mode for normal creation. Apply the
exact package version to the checked-out repository, then run:

```sh
node start.mjs
```

Hooks are opt-in and always delegate to `start.mjs`. GitHub provisioning,
publication, and repository settings remain explicit external operations.

## One-command decision

The transparent plan/apply/verify path remains canonical. It keeps local writes,
remote repository creation, and package publication as separate approval and
recovery boundaries. Do not hide a remote mutation behind project creation.

## Rollback and final cutover

GitHub Template mode remains enabled only as a rollback safety valve until local
and published-consumer verification passes. If the package path fails,
re-enable Template mode and repair the package path. Published npm bytes are
immutable, so publish a correcting version rather than replacing an existing
version.

## Governance

Issues use the forms in `.github/ISSUE_TEMPLATE/`. For GitHub task providers,
pull requests require a closing reference, exactly one `type:*` label, and the
protected approval contract in `AGENT.md`. The governance workflow validates
metadata without assigning approval.

## Persistence language

The agent may converse in any language. Persisted project work uses
`<REPO_LANGUAGE>`, configured by the creator.

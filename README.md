# <PROJECT_NAME>

Created with **Agent Foundry**, the language-agnostic archetype for agent-first
software development. The source is [`eff3ct0/agent-foundry`](https://github.com/eff3ct0/agent-foundry);
each generated project keeps its own `<PROJECT_NAME>`. The exact-version Node
creator package is the primary way to create a project from the archetype.

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
npm create @eff3ct/agent-foundry@<EXACT_VERSION> ./new-project
```

npm maps that command to `@eff3ct/create-agent-foundry@<EXACT_VERSION>`. The
initializer depends on the same exact version of `@eff3ct/agent-foundry` and
delegates to `foundry apply`. It prompts for configuration and confirmation by
default. For explicit answers in automation, pass flags after npm's `--`
separator:

```sh
npm create @eff3ct/agent-foundry@<EXACT_VERSION> ./new-project -- --config answers.json --non-interactive --json
```

`@latest` may be useful for interactive discovery but does not pin reproducible
bytes. To drive the creator's `foundry` bin directly, invoke the same exact
creator package with `npx --package` or `pnpm dlx --package`. These are
equivalent alternatives to `npm create`, not fallbacks:

```sh
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan --target ./new-project --config answers.json --non-interactive
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply --target ./new-project --config answers.json --non-interactive --yes
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./new-project --config answers.json --non-interactive
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry doctor --target ./new-project --non-interactive
```

```sh
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan --target ./new-project --config answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply --target ./new-project --config answers.json --non-interactive --yes
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./new-project --config answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry doctor --target ./new-project --non-interactive
```

Maintainers publish only through `.github/workflows/npm-release.yml`. The
workflow binds `v<EXACT_VERSION>` to one source revision and publishes the
creator and initializer pair once with provenance, recording npm metadata,
payload, tarball, and source identity readback for each package. Contributors
must record that evidence in the pull request.

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

## Recovery

GitHub Template mode exists only as a recovery valve; it is not the creation
path. If the package path fails, repair it before changing the creation path;
using Template mode for recovery requires a separate decision. Published npm
bytes are immutable, so publish a correcting version rather than replacing an
existing version.

## Governance

Issues use the forms in `.github/ISSUE_TEMPLATE/`. For GitHub task providers,
pull requests require a closing reference, exactly one `type:*` label, and the
protected approval contract in `AGENT.md`. The governance workflow validates
metadata without assigning approval.

## Persistence language

The agent may converse in any language. Persisted project work uses
`<REPO_LANGUAGE>`, configured by the creator.

# Bootstrap - initialize a project from the template

The exact-version Node creator package is the primary project-creation path.
It applies the immutable payload locally, composes the selected bindings and CI
recipe data, verifies the result, and supports deterministic recovery.

## 1. Create the repository

Create an empty repository with the intended owner, name, visibility, and
default branch. Do not use GitHub Template mode for normal creation.

```sh
pnpm dlx factory-template-creator@<EXACT_VERSION> apply --target ./new-project --non-interactive --yes
```

The package does not call GitHub or create a remote repository. Create the
remote separately with the approved repository tooling, then apply the package
to its checked-out working tree.

## 2. Review and apply configuration

Use a configuration file for repeatable answers. Review before writing, then
apply, verify, and inspect recovery state with `doctor`:

```sh
pnpm dlx factory-template-creator@<EXACT_VERSION> plan --target ./new-project --config answers.json --non-interactive
pnpm dlx factory-template-creator@<EXACT_VERSION> apply --target ./new-project --config answers.json --non-interactive --yes
pnpm dlx factory-template-creator@<EXACT_VERSION> verify --target ./new-project --config answers.json --non-interactive
pnpm dlx factory-template-creator@<EXACT_VERSION> doctor --target ./new-project --non-interactive
```

The configuration contract is defined by `placeholders.json`. Required values
must be explicit; unresolved values remain visible and fail verification.
Existing repository metadata is evidence to review, not consent. Provider
selection is explicit and a local `.github/` directory is not provider proof.

## 3. Choose and pin tooling

Choose the formatter, linter, test framework, and CI for the real stack. With
GitHub Actions, the creator composes one job per selected language from the
data recipes in [`ci/recipes.json`](../ci/recipes.json). The Python recipe is
preserved for generated Python projects; it is not maintainer automation.

## 4. Configure the tracker and bindings

Select the task tracker, secrets provider, optional code-intelligence provider,
and persistence language explicitly. The generated `docs/bindings.md` contract
is mandatory and exclusive for the initialized project.

## 5. First commit and branch protection

Make the initial commit using conventional commits. Protect the integration
branch with required review and green CI before merge. For this repository's
concrete GitHub policy, see [`docs/github-governance.md`](github-governance.md).

## 6. Ready checklist

- [ ] Zero unresolved required configuration values.
- [ ] Base commands pass.
- [ ] Generated CI is green.
- [ ] `AGENT.md` matches the real project.
- [ ] Persisted project content uses the configured persistence language.
- [ ] `node start.mjs` reports the expected local mode.

For initialized projects, use a quick scan for unresolved manifest tokens:

```sh
rg "<[A-Z_]+>" .
```

## Rollback and final cutover

GitHub Template mode remains enabled only as a rollback safety valve until the
exact package version has passed local and published-consumer verification. If
the package path fails, re-enable Template mode and repair the package path
before retrying. Published npm bytes are immutable, so publish a correcting
version rather than attempting to replace an existing version.

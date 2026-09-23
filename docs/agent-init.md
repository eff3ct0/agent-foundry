# Agent mode - initialize a project from the template

The exact-version Node creator is the canonical initialization boundary. It
reads the immutable payload and requires explicit configuration before writing.
Read [`AGENT.md`](../AGENT.md), [`docs/bindings.md`](bindings.md), and this
document in order.

## Step 1 - Detect the stack

- Greenfield: ask for languages/frameworks, package manager, and base commands.
- Brownfield: treat `Cargo.toml`, `package.json`, `tsconfig.json`,
  `pyproject.toml`, `requirements.txt`, and `go.mod` as proposals only.
- Derive `<CI_STACKS>` and base commands from repository evidence, then show the
  complete proposal to the owner.
- Set `<REPO_LANGUAGE>` independently from the agent's conversation language.

The Python stack remains supported as generated-project data: selecting
`python` composes the Python CI recipe. This source repository no longer uses
Python maintainer tooling.

## Step 2 - Choose providers and agents

Select the task tracker, secrets provider, optional code intelligence, and
agent handoff providers explicitly. A local `.github/` directory is not proof
of a GitHub provider. The selected provider fragments and CI recipes are
composed into generated outputs and then removed from the generated project.

Bind `TASK_TRACKER` and its `TRACKER` / `TRACKER_KEY` identity at setup. Every durable task/TODO mechanism
required or configured by the selected harness MUST use that provider exclusively, including create, update,
status, comment, checkpoint, phase handoff, and completion. Harness access (MCP, CLI, API, or task UI) does not
change the bound provider. Verify provider confirmation and readback of the intended task identity and state
after each durable operation. At cold resume, read provider state and the latest handoff before local task data.
Local files such as `odd/*.md` and task UIs may project confirmed state but are optional and non-authoritative;
they are neither required nor fallback stores. If a native operation is unsupported, fails, identifies an
ambiguous task, or cannot be read back with matching state, stop and record the exact provider-native operation
and target identity needed to resume. Never substitute GitHub for a non-GitHub provider.

Agent selection uses `--agent <id>` or `--agents <id,...>`. The creator checks
the selected executable before writing, owns only catalog-listed workspace
files, and writes `.factory/provider-manifest.json`. `--launch-agent` is an
explicit post-verify action and never converts a failed handoff into success.

## Step 3 - Review and apply

```sh
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan --target ./project --config answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply --target ./project --config answers.json --non-interactive --yes
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./project --config answers.json --non-interactive
```

The creator validates required, enum, conditional, duplicate, and unknown
configuration keys before any target write. It composes bindings, CI, and PR
governance in stable order. Use `doctor` after an interrupted apply or when
owned files drift.

## Step 4 - Verify

Verify required placeholders, generated bindings (selected provider and tracker/board identity), CI jobs,
links, startup mode, and the configured base commands. A successful `apply` is not a substitute for
`verify`; a provider handoff is reported separately from repository readiness.

## Step 5 - Finish and recover

Commit the initialized project with a conventional commit. If creation fails,
preserve the diagnostic envelope and run `doctor`; do not manually delete
unknown or user-managed files. Restore local state from version control when
needed.

## Rollback and Template mode

GitHub Template mode is not a normal creation path. It remains enabled only as
a rollback safety valve until the package and published-consumer checks pass.
If the package path fails, re-enable Template mode and repair the package path.
Published npm versions are immutable; publish a correcting version instead of
trying to replace bytes at an existing version.

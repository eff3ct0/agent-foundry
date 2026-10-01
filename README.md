# <PROJECT_NAME>

Created with **Agent Foundry**, the language-agnostic archetype for agent-first
software development. The source is [`eff3ct0/agent-foundry`](https://github.com/eff3ct0/agent-foundry);
each generated project keeps its own `<PROJECT_NAME>`. Agent Foundry ships as a
two-package pair published together with provenance, and the exact-version
creator is the primary way to create a project from the archetype.

## The two-package pair

Agent Foundry publishes two npm packages in lockstep from a single release:

- **`@eff3ct/agent-foundry`** (bin `foundry`) - the creator. It owns the CLI,
  applies the immutable payload locally and offline, and runs onboarding.
- **`@eff3ct/create-agent-foundry`** - the initializer. It is the target of
  `npm create`, depends on the same exact `@eff3ct/agent-foundry` version, and
  delegates to `foundry apply`.

Maintainers publish only through `.github/workflows/npm-release.yml`. The
workflow binds `v<EXACT_VERSION>` to one source revision and publishes the
creator and initializer pair once with provenance, recording npm metadata,
payload, tarball, and source identity readback for each package. Contributors
must record that evidence in the pull request.

## What it includes

- [`start.mjs`](start.mjs) - canonical local router across four modes:
  `SELF`, `SETUP`, `ONBOARDING`, and `WORK`. It is read-only; it detects a mode
  and prints the next step, and never writes state.
- [`AGENT.md`](AGENT.md) - primary operating contract.
- [`docs/bindings.md`](docs/bindings.md) - provider identity and documentation
  authority map (resolved during onboarding).
- [`docs/bootstrap.md`](docs/bootstrap.md) - package-first initialization.
- [`docs/agent-init.md`](docs/agent-init.md) - agent initialization procedure.
- [`docs/creator.md`](docs/creator.md) - transactional creator and recovery contract.
- [`docs/workflow.md`](docs/workflow.md) - end-to-end delivery workflow.
- [`docs/determinism.md`](docs/determinism.md) - repeatability and static audits.
- [`hooks/README.md`](hooks/README.md) - optional harness startup adapters.
- [`templates/`](templates/) and [`.github/`](.github/) - reusable governance forms.

The creator applies the immutable payload locally and offline. It emits a
versioned JSON envelope, protects unknown files, rolls back failed writes, and
reports interrupted staging or owned-file drift through `doctor`. It composes
Python CI support from data when a generated project selects the Python stack;
the archetype itself has no Python maintainer automation.

---

## Getting started

A new project moves through three stages: **Install** the archetype, run the
guided **Set up (onboarding)** session, then **Work** one ticket at a time.

### Stage 1 - Install

Requires **Node.js 20.19 or newer**. Create an empty repository first with the
intended owner, name, visibility, and default branch; applying into a freshly
`git init`-ed checkout also works, because as of v0.2.4 `apply` tolerates a
pre-existing `.git` directory. The package writes locally and offline and never
touches GitHub. Do not use GitHub Template mode for normal creation - it is a
recovery valve only (see [Recovery](#recovery)).

The primary interactive path pins exact bytes through `npm create`:

```sh
npm create @eff3ct/agent-foundry@<EXACT_VERSION> ./new-project
```

npm maps this to `@eff3ct/create-agent-foundry@<EXACT_VERSION>`, which depends
on the same exact `@eff3ct/agent-foundry` and runs `foundry apply`. It prompts
for configuration and confirmation by default. For automation, pass explicit
answers after npm's `--` separator:

```sh
npm create @eff3ct/agent-foundry@<EXACT_VERSION> ./new-project -- --config answers.json --non-interactive --json
```

`@latest` is useful for interactive discovery but does not pin reproducible
bytes.

**Interactive prompts.** `npm create` prompts for the configuration
placeholders (free-text line prompts and single-select enums), and for the
**agent providers** multi-select. The agent providers come from
`providers/agents/catalog.json`: `claude-code`, `opencode`, `codex`, and `pi`.
Space toggles, Enter confirms. Each selected agent drops one optional per-tool
entrypoint file (`claude-code` -> `.claude/factory-template.md`, `opencode` ->
`.opencode/agents/factory-template.md`, `codex` -> `.codex/AGENTS.md`, `pi` ->
`.pi/AGENTS.md`) and records `.factory/provider-manifest.json`. Selecting none
still yields a complete, agent-agnostic project. The non-interactive
equivalents are `--agent <id>` (one) or `--agents <id,...>` (many).

**Driving the `foundry` bin directly.** These are equivalent alternatives to
`npm create`, not fallbacks:

```sh
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan   --target ./new-project --config answers.json --non-interactive
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply  --target ./new-project --config answers.json --non-interactive --yes
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./new-project --config answers.json --non-interactive
npx --yes --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry doctor --target ./new-project --non-interactive
```

`pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry <cmd> …` is
the exact equivalent.

**`foundry` usage string:**

```
Usage: foundry <plan|dry-run|apply|verify|doctor> --target <directory> [--config <file>] [--factory-root <local-checkout> --factory-sha <trusted-full-commit-sha>] [--agent <id>] [--agents <id,...>] [--launch-agent] [--non-interactive] [--yes] [--no-color] [--reduced-motion] [--json]
       foundry onboard --complete --target <directory> [--yes] [--non-interactive] [--json]
       foundry github-provision --org <organization> [--factory-repo <name>] [--visibility <public|internal|private>] [--plan|--no-create|--yes]
```

`--config` has alias `--answers`; `--non-interactive` has alias `--no-prompt`;
`CI=1` implies non-interactive. `apply` runs plan -> confirm (unless `--yes`) ->
apply -> an internal `verify` of the staged result -> optional `--launch-agent`.
`--launch-agent` is an explicit post-verify handoff that launches the chosen
agent CLI (`claude`/`opencode`/`codex`/`pi` with the catalog's launch args) and
never turns a failed handoff into success.

### Stage 2 - Set up (guided onboarding)

A freshly applied project has `placeholders.json` consumed and
`.factory/creator/state.json` written with `onboarded: false`. So the first run
of the router reports **ONBOARDING**, not WORK:

```sh
node start.mjs
```

```
ONBOARDING mode - created project awaiting its first-session bootstrap (state.onboarded is false).
  - Follow the 'Project bootstrap (first session)' procedure in templates/agent-runbook.md.
  - Resolve bindings in docs/bindings.md (TASK_TRACKER + TRACKER_KEY and the real repository),
    capture the project goal, and seed the first actionable tickets; optional stack scaffold.
  - Then run the completion command (the creator writes state; start.mjs does not):
    foundry onboard --complete --target <this project>
  - After it completes, node start.mjs reports WORK.
```

(In a generated project the `templates/agent-runbook.md` and `docs/bindings.md`
paths are rewritten to their `.factory/…` locations.)

The agent runs the guided first-session bootstrap once, before the WORK loop -
do not take a ticket while startup still says ONBOARDING:

1. **Resolve bindings** in `docs/bindings.md`: confirm `<TASK_TRACKER>`, the
   tracker/board identity (`<TRACKER>` / `<TRACKER_KEY>`), and the real
   repository coordinates; replace any placeholder or `not configured` value -
   never invent one.
2. **Capture the project goal** with the owner (one or two sentences).
3. **Seed the first actionable tickets** through the bound provider only, using
   its mandatory issue template; confirm and read back each created item. An
   empty tracker here is the thing onboarding fixes, not a dead end.
4. **Optional stack scaffold** - the minimum the first ticket needs.
5. **Complete onboarding:**

   ```sh
   foundry onboard --complete --target <this project>
   ```

   The creator re-validates creator state, sets `onboarded: true`, and rewrites
   `state.json` canonically (only that field). It is idempotent
   (already-onboarded is a no-op). `foundry onboard` requires `--complete` and
   `--target`; completion is non-interactive and machine-gated. `start.mjs`
   never writes this flag.

After completion, `node start.mjs` reports **WORK**.

### Stage 3 - Work with the agent

In WORK mode the router prints:

```
WORK mode - initialized project (placeholders.json is absent).
  - Follow AGENT.md + templates/agent-runbook.md.
  - Next: choose the next actionable ticket from the bound tracker
    (docs/bindings.md) and announce 'Working <ID>'.
```

The agent follows `AGENT.md` and `.factory/templates/agent-runbook.md`:

- **One work unit per session.** Take one ticket from the bound tracker
  (`docs/bindings.md`) to a durable checkpoint, leave state in the provider,
  finish. The session is disposable; VCS and session memory are not task stores.
- **Durable state is external and provider-exclusive.** Only the setup-bound
  `<TASK_TRACKER>` holds task state. Every create/update/status/comment/handoff
  needs provider-native confirmation and fresh readback. `odd/*.md` and task UIs
  are optional, non-authoritative projections, never fallback stores.
- **Announce** `Working <TICKET_ID>` at start, `CHECKPOINT <TICKET_ID>` on
  interruption, `Done <TICKET_ID>` at close.
- **Ordered phases**, no skips:
  `DEFINITION -> IMPLEMENTATION -> TESTING/TDD -> VERIFICATION -> EVIDENCE/DELIVERY -> DONE`,
  each adjacent transition passing the phase-transition evidence guard.
- **Verify with real signals** (`<TEST_CMD>`, `<BUILD_CMD>`, `<TYPECHECK_CMD>`,
  plus e2e when applicable) before claiming done.
- **Human approval gates stay gated:** merge, production deploy, destructive
  ops, release publication, and applying `status:approved`. GitHub
  provisioning, publication, and repository settings remain explicit external
  operations.

**Launch your chosen agent CLI** in the project directory. At apply time
`--launch-agent` hands off automatically after a passing verify; otherwise you
launch the installed CLI yourself (`claude` / `opencode` / `codex` / `pi`),
using the per-tool entrypoint file dropped during install.

---

## The other router modes

For reference, the router also detects:

- **SELF** - the source archetype (`MAINTAINERS.md` present). Never apply the
  creator to it.
- **SETUP** - an uninitialized instance (`placeholders.json` present), awaiting
  the creator apply.

Hooks are opt-in and always delegate to `start.mjs`.

## One-command decision

The transparent plan/apply/verify path remains canonical. It keeps local
writes, remote repository creation, and package publication as separate
approval and recovery boundaries. Do not hide a remote mutation behind project
creation.

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

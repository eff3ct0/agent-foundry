# Agent mode - initialize a project from the template

Procedure for an **agent** turning this template into a real project: fill
`<PLACEHOLDER>` values with judgment, including CI stack mapping. Complements
[`bootstrap.md`](bootstrap.md), which gives the overview; this is the operating
step-by-step.

> Entry point: `python3 start.py` routes to this document in **SETUP** mode (an
> uninitialized instance). It is the first command an agent runs in a repository.

**Prerequisite:** read [`AGENT.md`](../AGENT.md) and
[`placeholders.json`](../placeholders.json). `placeholders.json` is the single
source of project-level placeholders and their `kind` (`mechanical` = known
value; `judgment` = decision to justify).

## Step 1 - Detect the stack
- **Greenfield** (empty repo): ask for languages/frameworks, package manager, and base commands.
- **Brownfield** (existing repo): infer from the repository and do not ask what is already clear:
  - `Cargo.toml` -> `rust`
  - `package.json` / `tsconfig.json` -> `typescript`
  - `pyproject.toml` / `requirements.txt` -> `python`
  - `go.mod` -> `go`
- Derive `<CI_STACKS>` (comma-separated, e.g. `rust,typescript`) and base commands (`<BUILD_CMD>`, `<TEST_CMD>`, `<LINT_CMD>`, `<TYPECHECK_CMD>`, `<RUN_CMD>`).
- Set `<REPO_LANGUAGE>` to the language for persisted project content. The agent may use another language in conversation.

## Step 2 - Choose providers (bindings)
Fix the **bound capabilities** (provider contract) before filling values:
- **Tasks:** `<TASK_TRACKER>` (`jira` / `github-issues` / `github-projects` / `linear` / `custom`) and board `<TRACKER_KEY>`.
- **Secrets:** `<SECRETS_PROVIDER>` (`infisical` / `vault` / `doppler` / `none` / `custom`) and `<SECRETS_PATH>` when applicable.
- **Code intelligence:** `<CODE_INTELLIGENCE>` (`none` / `codegraph` / `custom`), defaulting to `none` so the template adds no dependency unless selected.
- **Brownfield:** choose from explicit project configuration or ask the user. A local `.github/` directory contains repository-local templates/workflows and is not proof of a separate organization `.github` repository or a GitHub Issues/Projects provider. Do not trust stale provider text. Likewise, repository identity is checked against the local Git `origin` before initialization continues.

The shape of each fragment is defined by the abstract capability contracts:
[`providers/task/_contract.md`](../providers/task/_contract.md),
[`providers/secrets/_contract.md`](../providers/secrets/_contract.md), and
[`providers/code-intel/_contract.md`](../providers/code-intel/_contract.md) when
code intelligence is selected, plus
[`ci/_contract.md`](../ci/_contract.md). Concrete fragments are instances of
those contracts; `_contract.md` is never a selectable provider.

When `init.py` runs, these enums select catalog fragments from [`providers/`](../providers/)
and compose [`docs/bindings.md`](bindings.md), whose header restates the shape
source. The agent is then **bound by that contract** and must use it exclusively. Code intelligence is
optional: `none` uses native repository tools and does not compose a provider fragment.

## Step 2a - Generate a custom binding

If the selected provider is not in the catalog, do not invent a binding from
model memory or silently map it to another provider. Select `custom` and create
the instance in the agent layer before running `init.py`:

1. Copy the capability contract shape and complete `providers/<capability>/custom.md` in the destination project.
2. Ground every operational statement in official provider documentation and, when available, an official skill. Record the exact URL or identifier, source version or date, and consultation date; do not cite sources you did not consult.
3. Add provenance and status:

   ```markdown
   ## Status and provenance

   - Status: `DRAFT`
   - Provider: `<PROVIDER>`
   - Source: `<OFFICIAL_DOC_URL_OR_ID>` (version/date: `<VERSION_OR_DATE>`)
   - Skill: `<OFFICIAL_SKILL_OR_NONE>` (version/date: `<VERSION_OR_DATE>`)
   - Consulted: `<YYYY-MM-DD>`
   - Human review: pending
   ```

4. Verify the draft against the relevant `_contract.md`: identity, binding, harness mechanism versus semantic rules, read/create/update and comments, state cycle, references, and prohibitions. For secrets, also verify that the fragment contains no secret values.
5. Run a safe provider test (sandbox, test account, or documented simulation) and leave evidence with the change. The test must not create, delete, or modify real data.
6. Dry-run assembly without approving the binding:

   ```
   python3 init.py --dry-run --no-clean --defaults --set PROJECT_NAME=Example --set TASK_TRACKER=custom
   ```

   Confirm that `init.py` only announces composition of `custom.md`; it does not change `init.py` or add network access or dependencies. A dry-run does not turn `DRAFT` into an active contract.
7. Request human review. Until approval, the custom provider is blocked for operational use. After approval, set the status to `VERIFIED`, record reviewer and date, and only then run `init.py` to compose `docs/bindings.md`; that instance becomes the mandatory and exclusive project binding.

This flow only produces the fragment. It does not add provider fetching,
authentication, dependencies, or provider logic to `init.py`. Catalog providers
continue through the curated fast path.

## Step 3 - Fill mechanical values
Run the script with `kind: mechanical` values (including `TASK_TRACKER`,
`SECRETS_PROVIDER`, `CI_STACKS`, `CI_SYSTEM`, and `REPO_LANGUAGE`):

```
python3 init.py --set PROJECT_NAME=<...> --set REPO_LANGUAGE=en --set CI_STACKS=rust,typescript --set CI_SYSTEM='GitHub Actions' ...
```

Or use a file: `python3 init.py --answers answers.json`.

## Step 4 - Resolve judgment values
Provide one sentence of justification for each, aligned with existing
brownfield practice:
- `<BRANCHING_MODEL>` - actual team branching model.
- `<TDD_POLICY>` - sustainable testing policy.
- `<COVERAGE_TARGET>` - realistic coverage target.
- `<APPROVAL_GATED_ACTIONS>` - hard-to-reverse actions requiring human approval.

## Step 5 - CI
`init.py` composes `.github/workflows/ci.yml` from `<CI_STACKS>` (one job per
language), mapping each stack to a recipe in [`ci/recipes.json`](../ci/recipes.json).
Each recipe is an instance of [`ci/_contract.md`](../ci/_contract.md); the
contract file is not a recipe and is excluded from selection. Check that jobs
match real languages and adjust commands if the project uses custom scripts.

## Step 6 - Verify before auto-cleanup
- `python3 init.py --check` -> **0 pending** required manifest placeholders (nonzero when any required keys remain). Optional keys may remain intentionally empty.
- Base commands pass.
- Run [`scripts/check-determinism.py`](../scripts/check-determinism.py) to verify offline dry-runs, binding/CI composition, bootstrap planning, label synchronization, startup, and governance checks.
- Remember: local `templates/` tokens (`<TICKET_ID>`, `<CRITERION_1>`, ...) are intentional, not manifest placeholders.
- Confirm persisted project content uses `<REPO_LANGUAGE>`.

## Step 7 - Finish
- Make the first commit using conventional commits.
- The script applies the source ownership contract during cleanup: archetype-only governance, release tooling, initializer inputs, and provider/CI recipes are removed after use; generic contracts and generated `.github/workflows/ci.yml` plus `docs/bindings.md` remain.
- No required manifest `<KEY>` should remain unresolved; optional keys may remain intentionally empty.

## Anti-error note
- Do not fill local template tokens; they are completed when each `templates/*.md` file is used.
- Do not delete `.git` unless you want a separate history: `rm -rf .git && git init`.

## Feedback to the archetype
If initialization exposes a gap or ambiguity in the source template, open a
`type:dx-feedback` issue in the template repository (the one named by
`FACTORY_SPEC`). Usage improves the archetype.

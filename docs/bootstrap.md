# Bootstrap - initialize a project from the template

Steps for turning this template into a real project. No unresolved required
`<PLACEHOLDER>` values should remain at the end; optional values may remain
intentionally empty when they do not apply.

## 1. Create the repository
- From GitHub: *Use this template -> Create a new repository*.
- Or copy the contents to a new repository **without this template's history**.

## 2. Fill all `<PLACEHOLDER>` values

There are two complementary paths; [`placeholders.json`](../placeholders.json)
is the single source of truth for project-level placeholders:

- **Script (`init.py`, Python 3 stdlib):** deterministic and repeatable replacement.
  - Interactive: `python3 init.py`
  - Non-interactive: `python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='...'`, `--answers answers.json`, or `--defaults`.
  - `python3 init.py --dry-run` shows changes without writing. By default the script cleans itself up (removes `init.py`, `placeholders.json`, `factory_bootstrap.py`, `MAINTAINERS.md`, `docs/smoke-test.md`, `scripts/check-determinism.py`, `ci/`, and `providers/`); use `--no-clean` to keep them.
  - An empty value remains `<KEY>` (it is not deleted), so the checklist can detect it.
  - Before normal cleanup, run [`scripts/check-determinism.py`](../scripts/check-determinism.py) for repeatability and generated-file timestamp guarantees. With `--no-clean`, the checker remains available for further template checks.
- **Agent:** run the script for mechanical values and resolve `judgment` values (`<BRANCHING_MODEL>`, `<TDD_POLICY>`, `<COVERAGE_TARGET>`, `<APPROVAL_GATED_ACTIONS>`) by interview or repository evidence; see [`agent-init.md`](agent-init.md). CI is composed automatically from `<CI_STACKS>` (one job per language; see step 5).

> Local template tokens (`<TICKET_ID>`, `<CRITERION_1>`, `<DATE>`, `<NNN>`, and similar) are NOT filled here. Fill them whenever a `templates/*.md` file is used; they are not manifest placeholders.

Values live in:
- **Project coordinates** in [`AGENT.md`](../AGENT.md): `<PROJECT_NAME>`, `<REPO_URLS>`, `<LANGUAGES_AND_FRAMEWORKS>`, `<PACKAGE_MANAGER>`, `<REPO_LANGUAGE>`.
- **Base commands:** `<BUILD_CMD>`, `<TEST_CMD>`, `<LINT_CMD>`, `<TYPECHECK_CMD>`, `<RUN_CMD>`.
- **Tracker:** `<TRACKER>`, `<TRACKER_KEY>`, `<EPIC_ID>`.
- **Code intelligence:** `<CODE_INTELLIGENCE>` (optional; defaults to `none`).
- **Branches:** `<BRANCHING_MODEL>`, `<INTEGRATION_BRANCH>`, `<BRANCH_NAMING>`.
- **Environments:** `<ENVIRONMENTS>`, `<ENV>`.
- **Commit identity:** `<COMMIT_IDENTITY>`.
- **Approval-gated actions:** `<APPROVAL_GATED_ACTIONS>`.
- **Destination repository conventions:** `<REPO_CONVENTIONS_FILE>`.
- **Handbook tooling:** `<FORMATTER>`, `<LINTER>`, `<TEST_FRAMEWORK>`, `<TDD_POLICY>`, `<COVERAGE_TARGET>`, `<SCA_TOOL>`, `<CI_SYSTEM>`, `<DEPLOY_METHOD>`, `<OBSERVABILITY_STACK>`.

## 3. Choose and pin tooling
- Choose the concrete formatter, linter, test framework, and CI for the stack.
- Adjust [`.gitignore`](../.gitignore) to the stack.

## 4. Configure the tracker
- Create the epic `<EPIC_ID>`.
- Define labels (`task`, `bug`, etc.) and states (To Do / In Progress / Done).

## 5. Configure CI
- With GitHub Actions, `init.py` composes `.github/workflows/ci.yml` from `<CI_STACKS>` (one job per language; recipes in [`ci/recipes.json`](../ci/recipes.json)). Check that jobs match the real stack and adjust commands if the project uses custom scripts.
- With another `<CI_SYSTEM>`, create a manual pipeline with the handbook gates: format, lint, typecheck, test, build.

### CI command policy
`CI_STACKS` always selects canonical ecosystem recipes from `ci/recipes.json`.
Each recipe defines the job's steps, tools, versions, and gates. It is the
source of truth for the generated workflow.

`<BUILD_CMD>`, `<TEST_CMD>`, `<LINT_CMD>`, and `<TYPECHECK_CMD>` are project
commands for the runbook and local verification; `init.py` does not interpolate
them into YAML. This keeps each stack job coherent and avoids fragile free-shell
quoting and maintenance.

If a project needs custom commands, adjust the generated workflow after
bootstrap. Automatic composition remains recipe-based.

## 6. First commit and branch protection
- Make the initial commit using conventional commits.
- Protect `<INTEGRATION_BRANCH>` with required review and green CI before merge. For this repository's
  concrete GitHub policy, see [`docs/github-governance.md`](github-governance.md).

## 7. Ready checklist
- [ ] Zero unresolved required manifest placeholders.
- [ ] Base commands pass (`<BUILD_CMD>`, `<TEST_CMD>`, `<TYPECHECK_CMD>`).
- [ ] CI is green.
- [ ] `AGENT.md` matches the real project.
- [ ] Persisted project content is written in `<REPO_LANGUAGE>`.

### Detect pending placeholders
During bootstrap, use this canonical CI gate (nonzero when required manifest keys remain):
```
python3 init.py --check
```

For the complete repeat-run, network, approval, and rollback matrix, see
[`docs/determinism.md`](determinism.md). The audit is offline and supported
while the template files remain available. Normal cleanup removes the checker
together with the template-only files it requires; use `--no-clean` to retain
that verification surface.

In an initialized project, use a quick scan (local template tokens in
`templates/` are intentional):
```
rg "<[A-Z_]+>" .
```

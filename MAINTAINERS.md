# MAINTAINERS - archetype self-governance

This repo (`eff3ct0/factory-template`) follows its OWN doctrine (dogfooding).
This layer is concrete and SEPARATE from the **product** (the template content
containing `<PLACEHOLDER>` values).

Release E2E and OpenAI triage automation described below is self-governance for
this repository only. The authoritative ownership contract is
[`archetype-ownership.json`](archetype-ownership.json); `init.py` consumes it
during initialization and removes only entries marked `removed`. Generic
workflows and generated project files remain.

## Ownership boundary

| Category | Lifecycle | Examples and rule |
| --- | --- | --- |
| Archetype governance | Removed after initialization | `init.py`, `factory_bootstrap.py`, this file, and source change records exist only to operate the archetype. |
| Release E2E / OpenAI triage | Removed after initialization | The release workflow, smoke-test procedure, bootstrap/reporter/triage helpers, workflow checker, and their tests run only in `eff3ct0/factory-template`. |
| Initializer inputs | Removed after initialization | `placeholders.json` is consumed before cleanup; it must not be deleted before replacement, validation, or composition. |
| Provider and CI recipes | Removed after initialization | `providers/` and `ci/` are composition inputs. They stay available until bindings and CI are generated, then are removed as a unit. |
| Inherited generic assets | Retained | `start.py`, `AGENT.md`, generic docs, hooks, templates, GitHub forms, governance workflows, and generic checkers belong to every initialized project. |
| Generated outputs | Retained | `docs/bindings.md` and `.github/workflows/ci.yml` are project outputs and must never be added to cleanup. |

### Rules for adding files

1. Register every new tracked path in `archetype-ownership.json` before merging it.
2. Put release-only automation and archetype administration in a `removed` category; do not rely on a naming convention or directory location.
3. Keep provider/CI inputs available until composition completes. Mark generated outputs as `generated`, never `removed`.
4. Run the offline ownership-boundary check. It builds a fresh fixture from the inventory and fails if any registered `removed` path survives cleanup or any retained output disappears.
5. Do not add release E2E or OpenAI triage instructions to downstream-facing docs. Keep those procedures here, where initialization removes them.

## Hard rule
Do NOT run `init.py` on this repo: it would consume itself, fill its
placeholders, and remove its scaffolding. `init.py`, `placeholders.json`,
`providers/`, `ci/`, `factory_bootstrap.py`, and the templates are the PRODUCT,
not this repo's configuration.

## Bindings for this repo
- **Tasks:** GitHub Issues + GitHub Projects (v2) for `eff3ct0/factory-template`.
- **Secrets:** none (public template; no real secrets).
- **Loop contract:** `templates/agent-runbook.md`. **DoD:** `templates/definition-of-done.md`.

## Ticket types (labels)
The canonical label catalog is [`.github/labels.json`](.github/labels.json); run
`python3 scripts/sync-github-labels.py` to create or update labels idempotently.

- `type:product` - template improvements or changes.
- `type:dx-feedback` - friction found while USING the archetype (see the [DX feedback issue form](.github/ISSUE_TEMPLATE/dx-feedback.yml) and [`docs/smoke-test.md`](docs/smoke-test.md)).
- `type:bug` - defect.
- `status:approved` - protected approval; agents may assign it only through the
  fail-closed delegated-approval protocol in `AGENT.md` and the bound task provider.

## Improvement cycle (one task per session)
1. Take an actionable issue (prioritize `dx-feedback` when it blocks use). Announce `Working #<n>`.
2. In Progress -> minimal change -> **verify**: `python3 init.py --self-check`, `python3 init.py --check`, a happy-path dry-run, the ownership-boundary check, and a coherence audit when structure changes.
3. Meet the DoD -> close the issue with evidence (commit/PR).
4. When a coherent batch lands -> create and push a new tag (`v1.x` / `v2`).

## Improve while using
Every project bootstrapped from the template that finds a gap opens a
`type:dx-feedback` issue here (its `FACTORY_SPEC` records provenance). Usage
feeds the backlog.

## Propagation
`MAINTAINERS.md`, `archetype-ownership.json`, and `docs/smoke-test.md` belong to
THIS repo; the inventory drives their removal from initialized projects. They
do not travel downstream.

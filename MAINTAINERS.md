# MAINTAINERS - archetype self-governance

This repo (`eff3ct0/factory-template`) follows its OWN doctrine (dogfooding).
This layer is concrete and SEPARATE from the **product** (the template content
containing `<PLACEHOLDER>` values).

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
- `type:dx-feedback` - friction found while USING the archetype (see `docs/smoke-test.md`).
- `type:bug` - defect.
- `status:approved` - protected approval; agents may assign it only through the
  fail-closed delegated-approval protocol in `AGENT.md` and the bound task provider.

## Improvement cycle (one task per session)
1. Take an actionable issue (prioritize `dx-feedback` when it blocks use). Announce `Working #<n>`.
2. In Progress -> minimal change -> **verify**: `python3 init.py --self-check`, `python3 init.py --check`, a happy-path dry-run, and a coherence audit when structure changes.
3. Meet the DoD -> close the issue with evidence (commit/PR).
4. When a coherent batch lands -> create and push a new tag (`v1.x` / `v2`).

## Improve while using
Every project bootstrapped from the template that finds a gap opens a
`type:dx-feedback` issue here (its `FACTORY_SPEC` records provenance). Usage
feeds the backlog.

## Propagation
`MAINTAINERS.md` and `docs/smoke-test.md` belong to THIS repo; `init.py` removes
them from an initialized project (they do not travel downstream).

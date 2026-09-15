# Determinism and idempotency

This repository keeps local checks offline and makes state-changing operations
safe to repeat. The first run may create or replace local state; a second run
must produce the same content and must not rewrite unchanged generated files.
Run the focused audit with:

```sh
python3 scripts/check-determinism.py
```

## Local operations

| Operation | Classification | Repeat-run contract | External state / rollback |
| --- | --- | --- | --- |
| `start.py` | Deterministic, read-only, offline | Same mode and message for the same local files and git remote | No state |
| `hooks/claude-code/session-start.sh`, `hooks/pi/factory-start.ts`, `hooks/opencode/factory-start.ts` | Deterministic local adapters | Each configured session event runs `start.py` once and forwards its output once | No external state or network |
| `init.py --check` and `--self-check` | Deterministic, read-only, offline | Same result while inputs are unchanged | No state; fix the reported local input |
| `init.py --dry-run` | Deterministic, read-only, offline | Same output; it does not compose, replace, or clean files | No state; rerun the same command to apply changes |
| `init.py` replacement with `--no-clean` | Deterministic, local write, idempotent | Replaces supplied manifest tokens; unchanged files are not rewritten on later runs | Local files only; restore from VCS or a backup |
| Binding composition | Deterministic, local write, idempotent | Selected provider bytes produce the same `docs/bindings.md`; unchanged bytes keep their timestamp | Local generated file; restore from VCS |
| CI composition | Deterministic, local write, idempotent | Selected recipe order produces the same `.github/workflows/ci.yml`; unchanged bytes keep their timestamp | Local generated file; restore from VCS |
| Provider and CI recipe selection | Deterministic catalog lookup | Same selected fragments and job order for the same manifest values | No external state; invalid selections fail closed during a normal run |
| `scripts/check-determinism.py` | Deterministic, read-only, offline | Runs the focused repeatability checks twice where applicable | No state |
| `scripts/check-delivery-contract.py`, `scripts/check-pr-governance.py --self-check`, `start.py --self-check`, `scripts/sync-github-labels.py --self-check` | Deterministic, read-only, offline | Same validation result for unchanged files and catalog | No state |

Normal initialization also performs cleanup unless `--no-clean` is supplied. That
cleanup is intentionally one-shot: it removes `init.py`, `placeholders.json`,
`factory_bootstrap.py`, `MAINTAINERS.md`, `docs/smoke-test.md`, `ci/`, and
`providers/`, so it is not a repeatable operation.

## Network, workflows, and procedures

| Operation | Classification | Repeat-run contract | External state / rollback |
| --- | --- | --- | --- |
| `factory_bootstrap.py --plan` | Deterministic, read-only, offline | Same plan and no `gh` call | No state |
| `factory_bootstrap.py --no-create` | Network-dependent, read-only | Rechecks the same targets; never creates or deletes repositories | GitHub read state; external changes can alter the result |
| `factory_bootstrap.py --ensure` | Network-dependent, outward, approval-gated | Existing repositories are no-ops; missing repositories require per-target consent | GitHub repositories; the tool never deletes, so rollback requires a separate human-approved action |
| `factory_bootstrap.py --yes` | Network-dependent, outward, approval-gated | Existing repositories are no-ops; missing repositories are created without prompts | GitHub repositories; `--yes` is an explicit creation decision, not a general approval bypass |
| `scripts/sync-github-labels.py --dry-run` and `--self-check` | Deterministic, read-only, offline | Same commands/output for the same catalog | No state |
| `scripts/sync-github-labels.py` and `.github/workflows/sync-labels.yml` | Network-dependent, outward, idempotent | `gh label create --force` creates or updates each catalog label; stale labels are intentionally retained | GitHub labels; restore the catalog and rerun, or delete labels manually with approval |
| `.github/workflows/governance.yml` and `scripts/check-pr-governance.py` | Network-dependent, read-only validation | Revalidates on each configured PR event; never assigns `status:approved` | Reads PR and linked issue labels; fix metadata or obtain human approval |
| `docs/bootstrap.md`, `docs/agent-init.md`, `docs/org-factory.md` | Deterministic procedures with outward steps | Repeating read/planning steps is safe; repository creation, cleanup, and branch protection remain explicit steps | Local setup and GitHub lifecycle; rollback through VCS or a separate approved GitHub action |
| `docs/workflow.md`, `templates/agent-runbook.md`, `docs/bindings.md`, provider contracts, and `ci/_contract.md` | Read-only governance and composition contracts | Same instructions and catalog shape for unchanged files | No state; contract changes are reviewed as normal repository changes |
| `docs/smoke-test.md` | Intentionally one-shot, outward, approval-gated procedure | Creates a disposable repository once; cleanup is a separate explicit deletion step | GitHub repository lifecycle; deletion requires explicit human approval |

## Boundaries

- `init.py` never calls the network. `factory_bootstrap.py` is the separate
  outward tool and fails closed when `gh` is missing or unauthenticated.
- `factory_bootstrap.py` never deletes repositories. A partial create is
  recoverable by rerunning it; deletion is outside its contract.
- Label synchronization does not delete labels absent from the catalog. This
  prevents an unrelated label from being removed accidentally.
- Normal initialization cleans template-only files unless `--no-clean` is
  supplied. Cleanup is intentionally one-shot and is not part of dry-run mode.
- Generated files are written only when bytes change. This preserves stable
  content and avoids unnecessary filesystem side effects on repeat runs.

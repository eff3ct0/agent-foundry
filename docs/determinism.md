# Determinism and idempotency

This repository keeps local checks offline and makes state-changing operations
safe to repeat. The first run may create or replace local state; a second run
must produce the same content and must not rewrite unchanged generated files.
Run the focused audit while the template files are still available:

```sh
python3 scripts/check-determinism.py
```

## Local operations

| Operation | Classification | Repeat-run contract | External state / rollback |
| --- | --- | --- | --- |
| `start.mjs` | Deterministic, read-only, offline | Same mode and message for the same local files and git remote | No state |
| `start.py` | Compatibility wrapper | Delegates to `start.mjs` without adding routing logic | No state |
| `hooks/claude-code/session-start.sh`, `hooks/pi/factory-start.ts`, `hooks/opencode/factory-start.ts` | Deterministic local adapters | Each configured session event runs `start.mjs` once and forwards its output once | No external state or network |
| `init.py --check` and `--self-check` | Deterministic, read-only, offline | Same result while inputs are unchanged | No state; fix the reported local input |
| `init.py --dry-run` | Deterministic, read-only, offline | Same proposal/output; it does not compose, replace, or clean files, and does not require confirmation | No state; rerun with explicit confirmation to apply changes |
| `init.py` replacement with `--no-clean` | Deterministic, local write, idempotent | Presents proposals and requires explicit confirmation; replaces supplied manifest tokens; unchanged files are not rewritten on later runs | Local files only; restore from VCS or a backup |
| `OPENCODE_PLUGIN=true` | Explicit, deterministic, local write | Generates `.opencode/plugins/factory-start.ts` only after opt-in; false or absent leaves it absent | Local generated file; remove through VCS or a separate approved action |
| Binding composition | Deterministic, local write, idempotent | Selected provider bytes produce the same `docs/bindings.md`; unchanged bytes keep their timestamp | Local generated file; restore from VCS |
| CI composition | Deterministic, local write, idempotent | Selected recipe order produces the same `.github/workflows/ci.yml`; unchanged bytes keep their timestamp | Local generated file; restore from VCS |
| Provider and CI recipe selection | Deterministic catalog lookup | Same selected fragments and job order for the same manifest values | No external state; invalid selections fail closed during a normal run |
| `scripts/check-determinism.py` | Template-only, deterministic, read-only, offline | Run before cleanup; `--no-clean` retains it for further template checks | No state |
| `scripts/check-delivery-contract.py`, `scripts/check-factory-layout.py`, `scripts/check-pr-governance.py --self-check`, `node start.mjs --self-check`, `scripts/sync-github-labels.py --self-check` | Deterministic, read-only, offline | Same validation result for unchanged files and catalog; the layout check builds its fixture in a temporary directory | No state |
| Ownership-boundary fixture in `scripts/check-determinism.py` | Deterministic, read-only, offline | Every inventory entry is checked after cleanup; removed paths are absent and inherited/generated paths remain | Temporary fixture only |

Normal initialization also performs cleanup unless `--no-clean` is supplied. The
single authoritative ownership contract is `archetype-ownership.json`; `init.py`
consumes its `removed` entries after replacement and composition. The fixture
check above protects the boundary: provider/CI inputs are present before
cleanup, while generic workflows and generated project files are retained.
Cleanup is intentionally one-shot for the removed source-only inputs and is not
part of dry-run mode.

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
| `.github/workflows/bootstrap-e2e.yml` and `scripts/bootstrap-e2e.py` | Network-dependent, release-triggered, disposable validation | A published or explicitly supplied tag resolves to one commit SHA; every recipe case tests that SHA in its own private repository; repeated runs use a new run prefix | Creates and deletes only `bootstrap-e2e-<run-id>-<case>` repositories in the configured owner; final cleanup is always attempted and exact-prefix recovery is documented |
| `scripts/report-bootstrap-failure.py` | Network-dependent, deduplicated issue reporting | A release-SHA marker, or a tag/run preparation marker when no SHA resolves, searches open and closed issues; one existing canonical issue receives one marker-bearing comment, otherwise one bug-form issue is created | Uses only issue write permission; no source or disposable repository mutation; a rerun is a no-op after the marker-bearing comment exists |
| `scripts/triage-bootstrap-failure.py` | Network-dependent, advisory failure analysis | A sanitized `bootstrap-e2e-failure/v1` payload is bounded, sent with strict `text.format` JSON Schema and `store: false`, and invalid/unavailable model output becomes a deterministic fallback | Receives only sanitized payload, `OPENAI_MODEL`, and `OPENAI_API_KEY`; no GitHub token, tools, lifecycle control, or issue mutation; triage artifacts are retained 7 days |

## Boundaries

- `init.py` never calls the network. `factory_bootstrap.py` is the separate
  outward tool and fails closed when `gh` is missing or unauthenticated.
- `init.py` does not infer providers from a local `.github/` directory. It compares rendered repository
  metadata with the local `origin` and stops before writes when they conflict.
- `factory_bootstrap.py` never deletes repositories. A partial create is
  recoverable by rerunning it; deletion is outside its contract.
- Label synchronization does not delete labels absent from the catalog. This
  prevents an unrelated label from being removed accidentally.
- Normal initialization cleans template-only files unless `--no-clean` is
  supplied, including `scripts/check-determinism.py`. Cleanup is intentionally
  one-shot and is not part of dry-run mode.
- Generated files are written only when bytes change. This preserves stable
  content and avoids unnecessary filesystem side effects on repeat runs.
- The release E2E does not use the template API: that API follows the default
  branch and cannot prove the published artifact. The trusted harness checks a
  published event's `github.sha`, resolves the tag to that same full commit (or
  resolves the tag independently for manual dispatch), fetches and pushes only
  that commit, verifies disposable `HEAD`, and executes released code with an
  environment allowlist.
- Release E2E operations have 30-second API/subprocess timeouts and job limits
  of 10/30/15/10/10 minutes for prepare/matrix/cleanup/triage/report. Cleanup is attempted
  after validation and independently by the always-on cleanup job; forced
  cancellation, runner loss, credential failure, and API failure require the
  documented exact-run-ID recovery command. Third-party workflow actions are
  pinned to verified full SHAs and checked by `scripts/check-bootstrap-workflow.py`.
- Failure envelopes and advisory results are versioned and bounded. Fingerprints
  are derived from the release SHA when available, matrix case, normalized
  failure code, and check identifier. Only deterministic reporter code searches
  or mutates GitHub, and only after validating model text against fixed
  allowlists.

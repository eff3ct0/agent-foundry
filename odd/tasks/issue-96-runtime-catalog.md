# Issue #96: Selectable runtime catalog

## Status

`EVIDENCE/DELIVERY` — completed; pull request #130 open.

## Scope

Implement only GitHub issue #96. Add one canonical runtime catalog for the
real-agent parent journey, wire its supported entries to the manual-dispatch
choice input and executable adapter route, reject invalid or disabled runtime
identifiers before provisioning, and document the operator contract. Exclude
#1, #3, missing parent adapters (#95), schedule/release wiring (#97), failure
reporting (#98), and template-runtime changes.

## Acceptance criteria

- The catalog records stable ID, label, adapter entry point, pinned version,
  required credentials, and support status for every runtime.
- The supported runtime is executable through its catalog-selected adapter.
- Manual dispatch presents only supported catalog IDs as a `choice`, removes
  `confirm=RUN`, and transfers the selected ID through an environment boundary.
- Missing, unsupported, and disabled IDs fail before provisioning without
  credential disclosure.
- Scheduled callers use the documented catalog default rather than a variable
  or arbitrary free-text value.
- Offline tests prove catalog/workflow parity, validation, confirmation-input
  removal, and rejection before repository creation.
- Operator documentation covers choices, install/version, credentials, and
  manual dispatch.

## Route evidence

`workflow_dispatch.runtime` -> `JOURNEY_RUNTIME` -> `plan --runtime` validates
the catalog before `provision`; `install` and `invoke-agent` resolve only the
selected catalog entry. The existing Codex adapter remains the executable
supported entry.

## TDD mode

Focused offline regression tests are updated before verification. Source:
`AGENT.md` ordered phase model, phase 3 `TESTING/TDD`.

## Checks

- `python3 scripts/test-real-agent-journey.py`
- `python3 scripts/real-agent-journey.py --self-check`
- `python3 scripts/check-real-agent-workflow.py`
- `python3 scripts/check-bootstrap-workflow.py`
- `python3 init.py --self-check`
- `python3 init.py --check`
- `python3 scripts/check-determinism.py`
- `python3 scripts/check-factory-layout.py`
- Applicable shellcheck for modified shell files (expected N/A).

## Delivery forecast

Forecast: approximately 360 authored changed lines across the catalog, journey
resolver, workflow, focused tests, operator documentation, ownership inventory,
and this tracker. This is below the 400-line single-PR guard; use one coherent
work-unit commit with tests and documentation. Rollback boundary: remove the
catalog route and restore the prior workflow runtime-variable contract.

## Evidence

Definition completed: issue #96 is open and has `status:approved`; branch
`feat/issue-96-runtime-catalog` starts from fresh `origin/main` at
`f0b7db107fea18b15498d793dbec1a2a6c7cc910`. The isolated worktree has no local
CodeGraph index, so normal file inspection is the permitted fallback.

Implementation and testing completed: the catalog, parent workflow route,
catalog resolver, operator documentation, ownership entry, and payload
integrity manifest are updated. Focused runtime tests, all journey adapter
self-checks, action-pin checks, determinism/ownership checks, factory-layout
checks, Python initializer tests, bootstrap tests, and `pnpm test` passed.
`pnpm test` initially detected the expected stale payload integrity contract
after the ownership inventory changed; regenerating `package/payload-manifest.json`
with `node scripts/build-payload.mjs --write-lock` restored the verified build.
`init.py --check` and `init.py --dry-run` are not applicable to this
uninitialized template source: both correctly reject its required placeholders;
`init.py --self-check` passed. No shell files changed, so shellcheck is N/A.
Hosted dispatch is not run because it needs configured repository credentials
and would create a remote disposable repository, outside this task's authorized
remote operations.

Work-unit commit: `25c7057 feat(journey): add selectable runtime catalog (#96)`.
Delivery evidence commit: `4fbe80a docs(odd): record issue 96 delivery evidence`.
Pull request: `https://github.com/eff3ct0/factory-template/pull/130` with
exactly one type label, `type:feature`.

## Next action

Await review and do not merge without approval.

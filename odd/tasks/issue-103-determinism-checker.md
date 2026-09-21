# Issue #103: Determinism checker cleanup lifecycle

## Status

EVIDENCE/DELIVERY complete; review pending.

## Scope

Fix only the cleanup regression in issue #103: normal initialization must not
retain `scripts/check-determinism.py` when it depends on the removed `init.py`.
Keep the current Python verification lifecycle and do not broaden into the #111
Node verification migration. Issues #1 and #3 are out of scope.

## Acceptance criteria

- Normal cleanup removes `scripts/check-determinism.py` with `init.py`.
- The ownership manifest, lifecycle verification, and downstream-facing
  documentation describe the same checker lifecycle.
- `--no-clean` retains the checker with its source dependencies.
- Existing initializer, ownership-boundary, and determinism checks pass.

## Route evidence

- `archetype-ownership.json` initially classified
  `scripts/check-determinism.py` as `inherited`; the fix classifies it as
  `removed`.
- `init.cleanup()` removes only ownership entries classified as `removed`.
- `scripts/check-determinism.py` loads `init.py` in source mode, while normal
  cleanup removes `init.py`.
- `docs/smoke-test.md` already states that normal cleanup removes the checker;
  `MAINTAINERS.md` now distinguishes generic checkers that do not require
  source-only files.

## TDD mode

Regression-first. This follows `AGENT.md` phase 3 (TESTING/TDD) and issue #103:
add a focused lifecycle assertion before changing the ownership classification,
then make the smallest compatible change that satisfies it.

## Checks

- Focused: `python3 scripts/check-determinism.py`
- Initializer self-check: `python3 init.py --self-check`
- Initializer validation: `python3 init.py --check`
- Shell scripts: `shellcheck scripts/*.sh` if matching scripts exist
- Runtime scenario: initialize a disposable copy with normal cleanup and verify
  both `init.py` and `scripts/check-determinism.py` are absent.

## Delivery forecast

Forecast: approximately 50 authored product lines across the ownership manifest,
one regression assertion, and lifecycle documentation; the tracker is separate
delivery evidence. This is below the 400-line review limit, so one work-unit
commit and one PR are appropriate.

## Completed evidence

- Baseline: `python3 scripts/check-determinism.py` passed before the regression
  assertion was added, proving the lifecycle gap was untested.
- Regression-first test: the new lifecycle assertion failed before the manifest
  change because relocation retained the checker at `.factory/scripts/` during
  `--no-clean`.
- Fix: classify the checker as source-only governance, so relocation leaves it
  beside `init.py` for `--no-clean` and normal cleanup removes it.
- Focused verification: `python3 scripts/check-determinism.py` passed after the
  change; `git diff --check` passed.
- Verification: `python3 init.py --self-check`, `python3 test_init.py`,
  `python3 test_factory_bootstrap.py`, `python3 scripts/check-factory-layout.py`,
  `python3 scripts/check-delivery-contract.py`,
  `python3 scripts/check-pr-governance.py --self-check`, and
  `node start.mjs --self-check` all passed.
- Runtime coverage: the determinism self-check initialized disposable copies in
  both cleanup modes and verified the source checker remains for `--no-clean`
  but is absent after normal cleanup.
- Expected source-template signal: `python3 init.py --check` reported the four
  unresolved required placeholder keys and exited nonzero. ShellCheck is not
  applicable because `scripts/` has no shell scripts.
- Work-unit commit: `813f340 fix(initializer): remove unusable determinism checker`.
- Delivery PR: https://github.com/eff3ct0/factory-template/pull/129
  with the single `type:bug` label.

## Next action

Await required review and CI; do not merge automatically.

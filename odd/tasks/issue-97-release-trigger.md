# Issue #97: Trigger the real-agent journey on manual dispatch and release

## Status

`EVIDENCE/DELIVERY` — local implementation and verification completed; hosted
validation remains intentionally unrun.

## Scope

Implement only GitHub issue #97. Retain manual runtime selection from the
canonical runtime catalog delivered by issue #96, add the release-published
trigger, resolve and propagate an immutable source revision for every launch
mode, and fail closed if a generated template does not match the selected
revision. Exclude issues #1, #3, #95, #96 implementation, #98, hosted workflow
dispatch, release publication, and GitHub configuration changes.

## Chain context

Delivery strategy: `stacked-to-main`. This branch starts from
`origin/feat/issue-96-runtime-catalog` at `2dd607f3b45f061981d2e9489d66340b96b812df`
(predecessor PR #130). The resulting PR targets `main`, must be retargeted and
rebased after PR #130 merges, and must contain only the #97 delta when viewed
against its predecessor.

## Acceptance criteria

- Retain manual `workflow_dispatch` runtime selection from the supported #96
  catalog without a `confirm=RUN` input.
- Trigger the parent journey on `release.published`.
- Resolve the release tag to a full immutable SHA, record that source identity
  in the run plan, and require generated-template readback to match it.
- Use the catalog default and an immutable `github.sha` source revision for
  scheduled runs; retain their existing evidence and cleanup behavior.
- Cover manual, release, and schedule routing with focused offline workflow and
  provisioning checks.

## Delivery forecast

Forecast: approximately 270 authored changed lines across the workflow,
source-revision plan and provisioning validation, focused tests, operator
documentation, ownership inventory, payload manifest, and this tracker. This
is below the 400-line review budget, so one coherent work-unit commit is
appropriate. Rollback boundary: remove the source-revision route and release
trigger changes from the journey workflow and provisioning adapter, restoring
the previous manual/scheduled journey behavior.

## Checks

- `python3 scripts/test-real-agent-journey.py`
- `python3 scripts/real-agent-journey.py --self-check`
- `python3 scripts/real-agent-journey-provision.py --self-check`
- `python3 scripts/check-bootstrap-workflow.py`
- `python3 scripts/check-determinism.py`
- `python3 scripts/check-factory-layout.py`
- `python3 init.py --self-check`
- `pnpm test`
- Shellcheck: N/A unless a shell file changes.

## Evidence

Definition completed: issue #97 is open with `status:approved`; predecessor
PR #130 is open and verified. The isolated worktree uses
`feat/issue-97-release-trigger`, is based on the exact predecessor remote
branch, and has no local CodeGraph index, so normal file inspection is the
permitted fallback. Hosted workflow dispatch and release publication are
explicitly out of scope.

Implementation and local verification completed: the journey now receives
`release.published`, resolves release tags to immutable SHAs, records source
tag/SHA in the plan, and rejects a source-template revision mismatch before
repository creation. Manual runtime selection and the nightly schedule remain
supported; non-manual runs use the catalog default. Focused journey tests,
journey/provision self-checks, action-pin workflow validation, determinism and
factory-layout checks, initializer self-check, payload rebuild, and `pnpm test`
all passed. No shell file changed, so shellcheck is N/A.

Hosted manual dispatch and release publication were not run because this task
explicitly prohibits them. They remain the required post-merge operational
validation for the repository owner; the implementation fails closed rather
than substituting mutable `main` when a release source revision differs from the
template default branch.

Work-unit commit: `dbded7c25d1b4295f5f7c598584caf4b61941ffe`
`feat(journey): trigger real-agent journey on releases (#97)`.

Corrective work unit: the release resolver now receives `EXPECTED_SHA` and
`GITHUB_EVENT_NAME`, matching the bootstrap workflow, so it verifies the
resolved release tag against the triggering `github.sha`. The focused journey
workflow test requires both exports. `python3 scripts/test-real-agent-journey.py`,
`python3 scripts/check-bootstrap-workflow.py`, and
`python3 scripts/check-determinism.py` passed for this correction.

Pull request: `https://github.com/eff3ct0/factory-template/pull/131`, targeting
`main` with exactly one `type:feature` label. Both PR-governance validation
checks passed. Its chain context names predecessor PR #130 and requires a
rebase after #130 merges.

## Next action

Await PR #130, then rebase this branch onto `main` and request the repository
owner's hosted manual and release-published validation before closing #97.

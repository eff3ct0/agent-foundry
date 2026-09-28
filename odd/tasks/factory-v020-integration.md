# Factory v0.2.0 integration: feature-branch chain

## Objective and baseline

Integrate the first reviewable Factory v0.2.0 units without publishing or merging. The authoritative starting revision is `a93cde93ae477cc3145984045b6b77b144962bcc`; the former baseline `d6f60debcf4fa5fccb0fb42d697f79e50df38244` and earlier issue branches are historical evidence, not integration bases. Issue #1 supplies generic organization defaults and issue #3 supplies pinned defaults, reusable CI, a runner guard, and a Rust factory v1 seed. Issue #176 is the optional layout/checks prerequisite: a generated project without CI or checks must pass its inherited layout checker before the defaults chain can rely on that checker.

## Problem and scope

The inherited layout checker currently demands a workflow and `.factory/checks/` even when the creator emits neither. Carry forward only the accepted #176 behavior against the frozen baseline; later slices implement #1 and #3 independently. Do not import historical SHA/task records, obsolete worktree changes, or unpublished release assumptions. Source changes are limited to the directly required creator/checker inputs, regression tests, docs, and the derived payload lock for each work unit. For FI-01 the approved source roots are `scripts/check-factory-layout.mjs`, `test/creator.test.mjs`, `docs/factory-layout.md`, and `package/payload-manifest.json`; this task document records evidence. Subsequent units may touch `src/`, `ci/`, `providers/`, `templates/`, `scripts/`, `test/`, `docs/`, `archetype-ownership.json`, `package.json`, and `package/payload-manifest.json` only as their separately reviewed contracts demand.

## Delivery boundary

Use the user-selected **feature-branch-chain**: keep `feat/factory-v020-review` as a draft/no-merge tracker at the frozen baseline plus this planning document. Child `fix/factory-v020-layout` targets the tracker; every later child targets its immediate parent. The advisory review budget is 400 authored additions plus deletions per PR, not a code-size cap: make one honest cohesive slicing pass, then report an exception if necessary. Strict TDD is off; use the ordinary `pnpm` runner and behavioral regressions. The authorized remote scope is source fetch/push/PR only, under parent control; this writer performs no remote operations, credential use, PR creation, publication, merge, or release.

## Reviewable work units

- [ ] **FI-01 — layout (#176):** No-CI/no-checks generated project passes; malformed present reserved paths and missing required support fail; deleting selected owned `ci.yml` fails creator verify. Child `fix/factory-v020-layout` targets tracker.
- [ ] **FI-02 — generic organization defaults (#1):** Compose generic org defaults with focused source and generated-project checks. Depends on FI-01; targets FI-01 child.
- [ ] **FI-03 — pinned defaults (#3):** Bind generated project defaults to an exact factory revision; verify pin identity and offline behavior. Depends on FI-02.
- [ ] **FI-04 — reusable CI (#3):** Introduce the reusable factory CI boundary and verify its callable contract. Depends on FI-03.
- [ ] **FI-05 — runner guard (#3):** Guard execution against mismatched/untrusted factory identity with negative-path checks. Depends on FI-04.
- [ ] **FI-06 — Rust factory v1 seed (#3):** Add the smallest independent Rust consumer seed and verify its generation/usage. Depends on FI-05.

## FI-01 acceptance and verification

Source dependency: the creator emits `.github/workflows/ci.yml` only for selected CI and has no `.factory/checks/` payload in the default no-CI case. The standalone layout checker has no CI-selection context; creator `verify` owns selected-workflow drift detection. Keep tests and user-facing layout contract with the behavior and refresh the payload integrity lock after the final source bytes. Run sequentially: `pnpm build`, `pnpm typecheck`, `pnpm test:creator`, `pnpm test:package-consumer`, `pnpm test`, `node scripts/check-determinism.mjs`, `node scripts/build-payload.mjs` (read-only), `node scripts/check-factory-layout.mjs --self-check`, a focused freshly generated target fixture, and `git diff --check`. If dependencies are absent, use only `pnpm install --offline --frozen-lockfile`. Verify runtime-generated output rather than treating the synthetic self-check as end-to-end evidence. Rollback is the FI-01 child behavior/test/contract/payload-lock unit; leave the tracker and other children untouched.

## Evidence and next action

Planning checkpoint: source baseline `a93cde93ae477cc3145984045b6b77b144962bcc`; FI-01 verification against this baseline not yet run. Historical tracker `7899721bf03274a4a19fd402f2a8dc8acafb3a8a` (based on `d6f60debcf4fa5fccb0fb42d697f79e50df38244`) rebased to `ef5db821f20d7dad47620e88c09c73aaf228c391`; the documentation-only baseline correction is a separate tracker commit. Mirror: Engram project `agent-foundry`, topic `odd/factory-v020-integration/tasks`, relative locator `odd/tasks/factory-v020-integration.md`. Next: reconcile FI-01 onto the corrected tracker and run the checks above. No hosted proof or publication is claimed.

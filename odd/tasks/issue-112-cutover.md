**What**: Track the local implementation and verification work for the exact-version Node creator cutover in issue #112.
**Why**: The dependency implementations are now present in `origin/main`, but registry publication, package-consumer evidence, Python retirement, and the final GitHub Template setting mutation remain separate proof boundaries.
**Where**: `odd/tasks/issue-112-cutover.md`; this coordination record is archetype-only and is removed from initialized projects.
**Learned**: npm publication and GitHub Template-mode mutation are explicitly blocked without exact-operation authorization; local work must preserve Template mode until every preceding verification passes.

# ODD task: Issue #112 creator publication and repository cutover

## Status

- Ticket: [#112](https://github.com/eff3ct0/factory-template/issues/112)
- Phase: `IMPLEMENTATION`
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-112-cutover`
- Branch: `feat/issue-112-cutover`
- Base: `origin/main` at the current verified checkout revision
- Route: delegated direct for multi-file implementation; one writer per work unit
- Delivery strategy: `ask-on-risk`; chained PR strategy: `stacked-to-main` (selected by the user)
- Review-size forecast: exceeds the approximately 400-line planning budget; preserve package tooling, Python retirement, and docs/workflow cutover as coherent local commit slices. No PR creation is authorized.
- Delivery: local commits only; no merge, deploy, push, npm publication, or GitHub settings mutation is authorized by this request

## Objective

Make the exact-version Node package the primary creator path, prove its deterministic local and registry-consumer behavior, retire maintained archetype Python automation after Node parity, update all active documentation and release workflows, and leave the final Template-mode mutation explicitly blocked unless separately authorized.

## Authorized scope

- Package identity, payload manifest, package-content and release evidence tooling.
- Exact-version consumer harnesses for `pnpm dlx` and `npx --yes`, including deterministic configuration, apply/verify, rerun `noop`, selected-agent startup, generated-tree identity, payload identity, tarball identity, source revision, and release identity.
- Node replacements for maintained archetype checks and release/creator automation where required before deleting Python paths.
- Onboarding, bootstrap, agent-init, maintainer, hook, recovery/doctor, release, contributor, README, rollback, and Definition of Done documentation.
- Removal of superseded Python automation, Python-only workflow consumers, duplicate entrypoints, and compatibility paths only after replacement checks pass.
- Source-mode bootstrap and workflow contracts without GitHub Template creation.

## Approval boundaries

- `npm publish`, registry writes, GitHub repository-setting writes, Template-mode disablement, repository deletion, merge, deployment, push, and PR creation are not executed without explicit authorization for that exact operation.
- GitHub Template mode stays enabled until all local and published-consumer verification passes. If publication or setting mutation is unavailable, record the exact blocker and evidence.

## Tasks and checks

- [x] T1: Establish package release identity and local release evidence. Route: delegated direct. Checks: package ownership/access readback, deterministic pack, payload/tarball/source identity, package-content and manifest checks.
- [x] T2: Add exact-version package-consumer verification. Route: delegated direct. Checks: fresh `pnpm dlx` and `npx --yes` directories, deterministic answers, apply/verify, rerun `noop`, selected-agent startup, matching generated-tree digests.
- [x] T3: Replace Template/API and maintained Python automation paths with verified Node paths. Route: delegated direct. Checks: source-mode bootstrap without Template API, workflow/governance checks, Python/tooling removal audit, generated Python recipe preservation.
- [x] T4: Update user and maintainer documentation and rollback procedure. Route: delegated direct. Checks: active instruction audit for package-first onboarding, no obsolete Template creation command, recovery/doctor/release/contributor consistency.
- [x] T5: Run the complete local verification matrix and repository Definition of Done. Route: delegated direct. Checks: `pnpm typecheck`, `pnpm test`, package/payload/determinism/workflow checks, `noop`, source bootstrap, cleanup, digest evidence, and exact blocked external steps.
- [x] T6: Commit each coherent work unit with a Conventional Commit referencing `#112`. Route: inline commit state checks. Checks: `git diff --check`, clean commit boundaries, no `Co-Authored-By`, and exact evidence recorded here.

## Evidence log

- Dependency PRs #127, #128, #116, #117, #123, #119, #134, and #148 are merged according to GitHub readback; implementation commits are present in the current `origin/main` history after fast-forward.
- Baseline local Node suite: `pnpm typecheck` passed; `pnpm test` passed with 159/159 tests.
- Baseline `pnpm pack --dry-run` passed for provisional `factory-template-creator@0.1.0`, but its payload still contains retired Python compatibility paths.
- Registry readback: `npm view factory-template-creator` returned 404; `npm whoami` returned `ENEEDAUTH`. Publication ownership/access is not verified.
- Final Template-mode readback and mutation: not run; exact GitHub setting authorization is absent.
- Local package-consumer verifier: `pnpm test:package-consumer` passed 3/3. The offline tarball path runs both consumer lanes in fresh directories and records package `factory-template-creator@0.1.0`, payload `1.0.0` / `sha256:a1f4d9e70c95d38929989667508e464ceaab129945dc6b3f37f27e608028fa7f`, source SHA input, release readback when supplied, tarball identity, generated-tree digest equality, apply/verify, rerun `noop`, and selected Codex startup.
- Full local verification after the reporter validation fix: `pnpm typecheck` passed; `pnpm test` passed with 173/173 tests; `node start.mjs` reported `SELF` mode; `node scripts/check-delivery-contract.mjs --self-check`, `node scripts/check-determinism.mjs`, `node scripts/check-bootstrap-workflow.mjs`, `node scripts/check-real-agent-workflow.mjs`, and `node scripts/check-factory-layout.mjs` passed; `pnpm test:package-consumer` passed 3/3; `node --test test/real-agent-journey-report.test.mjs` passed 8/8; `git diff --check` passed. The retired `python3 start.py` preflight is intentionally unavailable because `start.py` was removed.
- Independent review found that failure evidence could combine an earliest failed stage with a mismatched failure code or cleanup status. Report validation now rejects both inconsistencies before any GitHub request; focused regression tests pass.
- Local slice 1: `9a75ef4` — `feat(creator): verify exact-version package consumers (#112)`. Includes the reusable exact-version consumer verifier and its 3-test entrypoint. No remote delivery performed.
- Local slice 2: `34973ee` — `feat(release): add immutable npm release evidence (#112)`. Adds pinned npm release workflow, deterministic local/registry identity tooling, and focused tests. `node --test test/npm-release.test.mjs` passed 2/2; no remote operation was invoked.
- Local slice 3: `4f96211` — `feat(journey): migrate real-agent automation to Node (#112)`. Replaces hosted journey orchestration/adapters and adds bounded report validation and regression coverage. Latest full suite and static journey checks passed; no remote services were called.
- Local slice 4: `1f8b8f5` — `feat(checks): add Node repository audit tools (#112)`. Adds Node checker entrypoints and migrates startup detection away from origin/template inference; `node start.mjs` and all repository checks passed.
- Local slice 5: `0f67a2f` — `docs(creator): document package-first cutover (#112)`. Updates onboarding, creator, maintainer, recovery, hook, smoke, layout, and PR guidance for the exact-version package path. No remote delivery performed.
- Local slice 6: `97f8c34` — `refactor(creator): retire maintained Python automation (#112)`. Removes maintained Python creator/check/release/workflow tools and aligns payload ownership/manifests with Node replacements. Post-cutover `pnpm typecheck`, `pnpm test` (173/173), and `node scripts/check-determinism.mjs` passed.
- Final verification: `pnpm typecheck` passed; `pnpm test` passed 173/173; `node start.mjs` reported `SELF`; delivery-contract self-check, determinism/Python-removal audit, bootstrap workflow, real-agent workflow, and factory-layout checks passed; `pnpm test:package-consumer` passed 3/3; `git diff --check` passed.
- Work-unit commits on `feat/issue-112-cutover`: `9a75ef4`, `34973ee`, `4f96211`, `1f8b8f5`, `0f67a2f`, `97f8c34`. All are local; no `Co-Authored-By` trailer, push, PR, or merge.

## Progress

Implementation and verification evidence are recorded task by task below. A checkbox is completed only after the corresponding command result and artifact readback are observed.

The new `scripts/package-consumer-verify.mjs` entrypoint requires an exact
package name, exact semver version, source SHA, and output directory. It emits
machine-readable `passed`, `failed`, or `blocked` results, never treats a
missing registry publication as success, and supports `--tarball` for offline
verification. Registry `pnpm dlx`/`npx` execution remains blocked until the
package is actually published and read back.

## Next step

Local implementation is complete and the six work-unit commits are recorded. The updated task tracker remains to be committed. The selected chain strategy is `stacked-to-main`; commits remain local and no PR will be opened. npm publication/registry readback (`npm view` previously returned 404; `npm whoami` returned `ENEEDAUTH`), exact published-package consumer execution, hosted real-agent execution, and final GitHub Template-mode readback/mutation remain blocked pending credentials and explicit authorization.

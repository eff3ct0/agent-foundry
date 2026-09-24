# Issue #176: Python Implementation Equivalence

## Objective and status

- Tracker: GitHub issue #176 (`type:product`, open); branch: `feat/issue-176-equivalence`.
- Base: `5fe1a85ba31caa091c4d94c9baca22b6b9cbc381`.
- Status: `CHECKPOINT`; phase: `EVIDENCE/DELIVERY` for this bounded work unit;
  #176 remains open. Next: inventory retired Python behavior against typed
  TypeScript implementations before claiming issue-level equivalence.
- Owner direction: ordinary TDD is off; run verification after the bounded change.
- Contract decision: `Alinear checker (Recommended)`; CI remains optional and
  `.factory/checks/` may be absent when no checks content is generated.
- Composition boundary: the standalone layout checker validates required common
  support and optional CI when present, but cannot infer selected CI from a
  generated tree. Creator `verify` uses the selected plan to reject missing
  `.github/workflows/ci.yml` as `not-created` (regression in
  `test/creator.test.mjs`, CI composition test). Neither gate alone proves both.

## Problem and why

Removing tracked Python files does not prove the freshly generated project runs its
inherited checks, nor that executable Python has stayed out of its support tree.
The existing packaged consumer proves apply and startup; its generated boundary
needs a functional checker execution and an explicit implementation-file guard.
Python named in a CI recipe or user-selected stack is intentional recipe data,
not a Python implementation path. An empty tracked `.py` is not a TypeScript
equivalent.

## Scope and stable tasks

1. [x] **Offline generated proof and layout alignment (this work unit):**
   strengthen the existing packed-package fixture to run the inherited factory-layout checker against
   the actual generated target, assert the generated tree has no `.py` files,
   and reject an injected executable `.py` under reserved inherited support.
   Preserve plan/apply/verify/noop/startup evidence. Align the checker and
   layout documentation with actual optional CI and absent checks content;
   reject missing required support and malformed present reserved paths.
   Do not change creator semantics or provider contracts. Guard selected-CI
   output completeness with a creator `verify` negative case after deleting
   generated `ci.yml`, without changing the standalone checker's optional CI.
2. [ ] **Remaining #176 migration:** inventory each retired Python entrypoint,
   helper, check, release/bootstrap path and test against its actual typed
   TypeScript source, compiled delivery path, and equivalent behavior. Migrate
   remaining JavaScript-only replacements into typechecked TypeScript with
   matching runtime packaging and fail-closed checks; update references,
   ownership, workflows and documentation. Do not count file deletion or `.mjs`
   replacement alone as literal TypeScript equivalence.
3. [ ] **Final acceptance:** validate every migrated implementation through
   typecheck, offline/self-check, determinism, ownership, bootstrap and a fresh
   generated target; confirm no tracked `.py` implementation or test remains.
   Keep intentional Python recipe data.

## Acceptance for this work unit

- The offline installed tarball runs plan, apply, verify, noop, WORK startup,
  and the inherited layout checker on its fresh generated target.
- The generated tree contains no Python implementation files, including under
  `.factory/`; a test fails on an introduced executable `.py` there.
- CI and `.factory/checks/` are absent in the default fixture, yet its inherited
  checker succeeds; malformed optional paths and missing required support fail.
- After a CI-selected project is generated, deleting its `ci.yml` makes creator
  `verify` return `not-created` with a missing create operation for that path.
- No creator runtime behavior, release automation, or provider recipe changes;
  generated ownership removal remains intact.

## Checks and runtime boundary

Run sequentially after the final source change:

```sh
node scripts/build-payload.mjs --write-lock # only when payload input bytes change
pnpm build
pnpm typecheck
node --test test/package.test.mjs test/check-factory-layout.test.mjs test/creator.test.mjs
pnpm test
pnpm test:package-consumer
node scripts/check-factory-layout.mjs
node scripts/check-determinism.mjs
node scripts/check-bootstrap-workflow.mjs
git diff --check
git diff --cached --check
```

The standalone layout command is a synthetic self-check, not generated-target
proof. The packed consumer test is the runtime harness: offline pack/install,
plan/apply/verify/noop, target checker, startup, and deterministic negative
mutations. Hosted Node 20 is outside this local proof.

## Delivery and rollback

One cohesive test/evidence work unit: tests and documentation travel with the
checker fix. Roll back by reverting this unit's checker, layout documentation,
package and checker tests, creator selected-CI regression, ledger, ownership
registration, and derived lock. Do not revert unrelated creator code. Keep
the remaining #176 TypeScript-equivalence tasks separate. Do not publish,
release, change Template mode, or claim issue-level completion from this unit.

## Route trigger and evidence

`node start.mjs` reported SELF archetype development and directed maintenance
to `MAINTAINERS.md`; the approved open #176 body requests fresh bootstrap and
Python-to-TypeScript equivalence. The owner explicitly scopes this checkpoint
to offline proof. The authoritative ownership inventory marks `odd/` removed
after initialization; the new ledger is archetype-only, not generated content.

## Prior verification checkpoint (blocked before contract decision)

- Environment: local Node `v26.9.0`; no hosted Node 20 execution claimed.
- Added to the existing offline packed/installed consumer: `plan` returns
  `planned`; `apply` returns `applied`/`verified` and launches the isolated
  handoff; `verify` returns `verified`; re-`apply` returns `noop`. Imported
  `.factory/scripts/check-factory-layout.mjs` from the actual generated target
  and invoked its exported `check(target)`; did not use the source checker.
  The test also contains a generated-tree `.py` inventory and an executable
  `.factory/scripts/retired.py` injection/rejection, but execution stops at
  the checker assertion, so these later assertions are NOT verified yet.
- `node scripts/build-payload.mjs --write-lock`: passed; digest
  `sha256:352038d3a0acbdf070f89228cc2b109ef83d96fe88e8bb21317c6628c635aab2`.
  Only the new ledger path was registered under `archetype_governance`
  (`removed`); its changed ownership bytes account for the lock update.
- `pnpm build`: passed; `pnpm typecheck`: passed.
- `node --test test/package.test.mjs test/creator.test.mjs test/startup.test.mjs`:
  **31 passed, 1 failed**. The inherited checker returned exactly
  `generated output missing: .github/workflows/ci.yml` and
  `missing .factory directory: .factory/checks` for the freshly generated
  project. These are checker expectations, not evidence of Python files.
- `pnpm test`: **179 passed, 1 failed**, the same packed-consumer assertion.
  `pnpm test:package-consumer`: **3 passed, 0 failed**, but that suite does not
  invoke this inherited layout checker.
- `node scripts/check-determinism.mjs`: passed (`determinism and
  Python-removal audit OK`). `node scripts/check-bootstrap-workflow.mjs`:
  passed all five static checks (bootstrap, template bootstrap, real-agent
  journey, journey assertions, npm release).
- Runtime harness: the actual offline packed/install/plan/apply/verify/noop
  path passed up to `check(target)`; full checker/startup/Python-file proof
  remains blocked. The earlier handoff assertions passed before the failure.
- Stop decision: do not write fake CI or empty support directories into the
  fixture, alter creator semantics, or claim a green checker. An authorized
  separate contract decision must establish whether the generated layout or
  inherited checker requirements are wrong, then rerun the same harness.
- Rollback boundary: remove `test/package.test.mjs` additions and this ledger,
  then remove its explicit `archetype-ownership.json` registration and derive
  `package/payload-manifest.json` again; no creator or recipe code was changed.
  No commit, PR, issue mutation, publication, or #176 closure was made.

## Current verification evidence

- Local Node `v26.9.0`; hosted Node 20 and a published registry install were
  not run. No Python implementation tests were generated or executed.
- First verification attempt: lock write, build and typecheck passed, but focused
  `node --test` returned **32 passed, 1 failed**. The new synthetic negative
  fixture removed `.factory/hooks/` and expected one error; the fail-closed
  checker correctly returned two: missing directory AND missing inherited
  `.factory/hooks/README.md`. Fixed the fixture assertion and restored its
  README before the last mutation; then reran the full sequence below.
- Final `node scripts/build-payload.mjs --write-lock`: passed; digest
  `sha256:e1a70beaf50f9ec7492d4259b44fcc724b33a81af1b4ee14c3ad34a9d1dec8f9`.
  `pnpm build` and `pnpm typecheck`: passed in order.
- Focused `node --test test/package.test.mjs test/creator.test.mjs
  test/startup.test.mjs test/check-factory-layout.test.mjs`: **33 passed,
  0 failed, 0 skipped**. `pnpm test`: **181 passed, 0 failed, 0 skipped**.
  `pnpm test:package-consumer`: **3 passed, 0 failed, 0 skipped**.
- `node scripts/check-factory-layout.mjs`: passed its synthetic self-check,
  separately from the generated-target proof. `node scripts/check-determinism.mjs`:
  passed (`determinism and Python-removal audit OK`). `node
  scripts/check-bootstrap-workflow.mjs`: passed all five static workflow checks.
- Offline runtime harness in `test/package.test.mjs`: packaged and installed
  the tarball with scripts disabled/offline; the installed creator returned
  `planned`, `applied`/`verified` with an isolated stub agent handoff,
  `verified`, then `noop`. The inherited checker imported from the fresh
  project returned `[]` with both CI and `.factory/checks/` absent; startup
  returned WORK/ready. The generated `.py` inventory was empty, an injected
  executable `.factory/scripts/retired.py` was rejected, and missing bindings
  and malformed present checks were each rejected before restoring the target.
  The independent self-check also rejects present malformed CI, missing
  inherited support, and legacy root support.
- Staged and unstaged `git diff --check`: passed after explicitly staging only
  the seven intended paths; unstaged diff is empty. The authored diff remains
  below the advisory 400-line threshold (excluding the derived payload lock).
  No commit, push, PR, remote change, publication, or RDD activation. The literal
  Python-to-TypeScript behavior-by-behavior migration remains open even though
  this local generated-project proof passed.

## CI-selection composition correction (local verification passed)

- The independent validator reproduced `check(target) === []` after deleting
  CI from a CI-selected generated project, while plan-aware creator `verify`
  returned `not-created`. This is deliberate: the checker has no selection
  context and must not require CI for the default project.
- `test/creator.test.mjs` now removes the generated workflow after a successful
  CI-selected apply/verify/noop and asserts a nonzero creator `verify`, status
  `not-created`, and the missing workflow's planned create operation. The
  existing packed consumer still proves the default project has no CI.
- After the payload documentation edit, `node scripts/build-payload.mjs
  --write-lock` regenerated the lock (digest
  `sha256:69f599ca3f8d1d3fc44cd8553bdc152c8870e5728d31283e215ab338441fc4fc`).
  `pnpm build` and `pnpm typecheck` passed sequentially. Focused
  `node --test test/package.test.mjs test/check-factory-layout.test.mjs
  test/creator.test.mjs`: **28 passed, 0 failed, 0 skipped**.
  `pnpm test`: **181 passed, 0 failed, 0 skipped**;
  `pnpm test:package-consumer`: **3 passed, 0 failed, 0 skipped**.
- Runtime boundary: the focused CI composition test exercised apply, verify,
  noop, deleted the selected workflow, and observed the expected failing
  `verify` envelope. The offline packed consumer exercised the default
  no-CI generated target and inherited checker; no hosted runtime was run.
  `node scripts/check-factory-layout.mjs`, determinism and Python-removal audit,
  and all five bootstrap static workflow checks passed. Both staged and unstaged
  `git diff --check` passed; all eight intended paths are staged and the
  unstaged diff is empty.
- Rollback boundary: revert this unit's layout checker, layout doc, package
  test, checker test, creator CI negative regression, ledger and ownership/lock
  changes; do not revert unrelated creator implementation. This checkpoint
  has 421 authored changed lines, 21 above the ~400 advisory (the 14-line
  derived lock is excluded); keep the cohesive tests rather than trimming them.
  Hosted Node 20 and the remaining behavior-by-behavior typed TypeScript
  equivalence are still pending; #176 remains open. No commit, push, PR,
  release, provider operation, or remote mutation occurred.

## Independent review and delivery boundary

- Independent validator: focused prebuilt-dist tests **28 passed, 0 failed, 0 skipped**;
  complete 62-file source/dist lock readback matched
  `sha256:69f599ca3f8d1d3fc44cd8553bdc152c8870e5728d31283e215ab338441fc4fc`.
  Staged and unstaged `git diff --check` passed, with no unstaged changes or
  severe candidate defects; parent spot `test/package.test.mjs`: **6 passed**.
- The historical 31/1 and 32/1 failures above are superseded by the final
  green runs after correcting the checker contract and fixture; not CI passes.
  The 421 authored changed lines before this delivery update exceed the ~400
  advisory by 21; the boundary cannot split tests from behavior honestly.
- Runtime proof is local/offline packed installation and generated-target checks;
  no hosted Node 20, registry publication, or no-job journey pass is claimed.
  Rollback is this single work-unit commit (plus its passive SHA-only ledger
  follow-up), leaving the parent and unrelated creator implementations intact.

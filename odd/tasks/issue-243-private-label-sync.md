# ODD task: Issue #243 private label synchronization

## Identity and authorization

- Task ID: `ODD-243`; source issue: GitHub #243 (owner-supplied scope).
- Status: `ACTIVE`; phase: `EVIDENCE/DELIVERY` (local checkpoint, not issue closure).
- Worktree: `/home/steam/git/agent-foundry-worktrees/issue-243-private-label-sync-pr`.
- Branch: `feat/issue-243-private-label-sync-pr`; base: local `origin/main` at `44aee784da55cfdcd1f872d531b474d59269d9e5`.
- Local source, tests, task evidence, and one work-unit commit only. No remote operations, hosted runs, creator application to the source repo, or edits to the old worktree.

## Historical evidence (not verification of this branch)

- The read-only predecessor at `/home/steam/git/agent-foundry-worktrees/issue-243-private-label-sync` began at `df73333c993be4ab14f7ec66b7b280b2daef6d55` and recorded implementation `63522bfed1c171779d770fe2865968d29b07222d` plus evidence commit `73a176e5d8a3c18e1376584ea6993d9a05dbe477`.
- It reported focused 28/28 and full 254/254 local tests passing, with hosted private-repository verification pending. Those results belong to the old base and are not carried forward as new results.
- The previous fix added `contents: read` to the inherited label workflow and source/generated regressions; its workflow predated the current typed-runtime build step. Do not copy it wholesale.

## Objective and bounded plan

- Symptom: generated private repositories report `Repository not found` during label-workflow checkout; the standalone label CLI self-check succeeds. Local root-class hypothesis: the workflow grants `issues: write` but not `contents: read` to `actions/checkout`.
- Reproduction on this base: a local permission-map assertion against `.github/workflows/sync-labels.yml` exits 1 with `REPRODUCED: private checkout lacks contents: read`; map is `issues: write` alone. This does not reproduce the hosted error.
- Scope: add the missing read permission alongside issue writes without altering current pinned actions, Node/pnpm build and typed-runtime verification, or non-persistent checkout credentials. Add regressions against the source and a disposable generated consumer.
- Out of scope: CI recipes, label-script behavior, unrelated feature changes, remote tracker mutation, and hosted execution.
- TDD: disabled by unfilled repo policy; runner `pnpm test`. ODD delegated direct route, `ask-on-risk` delivery strategy, 400 authored-line advisory (not a cap).
- Ownership: `.github/workflows/sync-labels.yml` is `inherited_generic`; the new task record falls under the `archetype_governance` removed `odd` directory; tests and package lock fall under `creator_packaging` removed directories. No new inventory entry is required.

## Acceptance and evidence

- [x] Reconcile historical document and Engram topic, and reproduce the current-base source permission deficiency locally.
- [x] Fresh disposable generated consumer and source each lack `contents: read` on this base: new focused tests fail 2/28 before the change, pass 28/28 afterward. Generated target retains non-persistent checkout and typed-runtime build before the relocated script.
- [x] Normalize `package/payload-manifest.json` with `node scripts/build-payload.mjs --write-lock` after source edits; only workflow size/hash and payload digest change.
- [x] Run `node --test test/sync-github-labels.test.mjs test/creator.test.mjs` (28/28), `pnpm build` (exit 0), `pnpm typecheck` (exit 0), `pnpm test` (281/281), `node scripts/check-bootstrap-workflow.mjs` (six checks OK), `node scripts/check-factory-layout.mjs` (OK), `node scripts/check-determinism.mjs` (OK), and pre-commit `git diff --check` (exit 0). Node v26.9.0, pnpm 12.4.2, no downloaded dependencies.
- [ ] Record exact new results, work-unit commit, authored-line count, and clean branch readback.
- [ ] Private hosted repository checkout and label synchronization: N/A, not authorized. Do not claim Definition of Done or close the issue.

## Next action and rollback

- Next: commit the one work unit, record its identity and authored-line count in the document receipt, then verify a clean branch and read back both evidence copies. Hosted private-repository verification remains pending.
- Runtime harness: `test/creator.test.mjs` applies/verifies/noops a disposable generated target, asserts the permission map, non-persistent checkout, typed-runtime install/build before the relocated label script, and runs its label-script self-check and dry run. Source CLI `node scripts/typed-inherited-runtime/sync-github-labels.js --self-check` passes without network/API mutation. No creator application to this source repository; hosted private checkout remains pending authorization.
- Rollback boundary: this task record, `.github/workflows/sync-labels.yml`, `package/payload-manifest.json`, and focused assertions in `test/sync-github-labels.test.mjs` and `test/creator.test.mjs`; leave current main typed-runtime behavior and other features intact.

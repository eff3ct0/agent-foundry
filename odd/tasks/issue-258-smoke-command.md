# ODD task: #258 Runnable maintainer smoke command

## Objective and problem

Make the maintainer smoke procedure executable with the exact-version installed creator and explicit human-approved decisions. On this branch's base, `foundry apply --non-interactive` has no `--target` and fails with `invalid_arguments`; even with a target, an absent config cannot supply required choices.

## Scope and constraints

- Change only `docs/smoke-test.md` for the behavior, this task record, `archetype-ownership.json` to register the new tracked path, and its required `package/payload-manifest.json` integrity lock. Do not alter generated consumer docs (#248) or unrelated release automation.
- Keep one disposable local target and its answers file outside that target; use the same paths in plan, apply, verify, doctor, kickoff, and cleanup. Require the human to decide project name, stack, tracker, secrets provider, persistence language, and remaining example choices before non-interactive apply. Do not apply the creator to the source archetype.
- Current worktree `/home/steam/git/agent-foundry-worktrees/issue-258-smoke-command-pr`, branch `feat/issue-258-smoke-command-pr`, base `origin/main` at `44aee784da55cfdcd1f872d531b474d59269d9e5`. Old branch `feat/issue-258-smoke-command` at `84cf9e0` is read-only; its recorded commit and checks do not prove this branch. No remote operations, network installs, delegation, or hosted CI. Remove only the exact disposable path created by the smoke run.

## Route and acceptance

- [x] Reproduce the original missing-target command on the current built CLI: `node dist/index.js apply --non-interactive` reports `error[invalid_arguments]: --target is required` (exit nonzero).
- [x] Document a complete illustrative answers file for human review and an exact-version installed-creator plan/apply/verify/doctor flow using one explicit disposable target; use an offline local built-CLI equivalent for execution evidence. Actual human consent and registry execution remain untested.
- [x] Align cold kickoff and success criteria with the already-applied target and approved decisions; explain local-only cleanup without deleting unrelated paths.
- [x] Verify actual local plan/apply/verify/doctor against a disposable synthetic fixture, inspect generated outputs, and clean only that target; the local build is not a published package.
- [x] Pass `node --test test/creator.test.mjs`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `node scripts/check-factory-layout.mjs`, `node scripts/check-determinism.mjs`, and `git diff --check origin/main...HEAD`. No network installation.
- [x] Review status, diff, and recent log; commit only intended files with a Conventional Commit mentioning #258. Record commit SHA and hosted-checks-pending state in the task mirror.

## Planning and verification policy

Delegated preparation route: inline by the sole writer; no child agents. One docs-and-evidence work unit, forecast 100–170 authored additions plus deletions (including task, ownership registration, and the derived lock), below the advisory 400-line review heuristic; delivery strategy `ask-on-risk` if actual review risk grows. TDD is disabled for this documentation correction: the repo's `<TDD_POLICY>` is a placeholder, while `pnpm test` remains required. First reproduce the report, then execute the printed exit; do not add a new test framework or state machine for a command-documentation defect.

Runtime harness: a local built creator CLI applied to a disposable target with complete explicit config, not hosted or registry execution. Rollback boundary: revert only this task's smoke procedure, task record, ownership registration, and derived payload lock; no downstream files or remote state are changed. Engram mirror topic: `odd/issue-258-smoke-command/tasks`. Local task and Engram mirror are non-authoritative projections, not GitHub Issues provider confirmation; issue transition and hosted checks remain pending without remote authorization.

## Local verification evidence

- Reproduction: `node dist/index.js apply --non-interactive` emitted `error[invalid_arguments]: --target is required` and a JSON error envelope. The current worktree had no built CLI at first; `pnpm build` reused locally cached dependencies without downloads to produce it.
- Runtime harness (exit 0 for each step): from the source checkout, `node dist/index.js {plan,apply,verify,doctor} --target /tmp/opencode/issue-258-smoke-command-pr-target --config /tmp/opencode/issue-258-smoke-command-pr-answers.json --agent none --non-interactive` (plus `--yes` for apply). Statuses: `planned`, `applied` with `verification: verified`, `verified`, `healthy`; all diagnostic arrays empty. Synthetic answers matched the documented example. `node start.mjs` in the generated target reported WORK; bindings selected GitHub Issues and secrets `none`, CI has one Python job, and source-only paths were absent. The exact owned target and answers file were removed with creator state marker checks and absence readback.
- Focused `node --test test/creator.test.mjs`: 23/23 passed. `pnpm build`: passed. `pnpm typecheck`: passed. `pnpm test`: 281/281 passed. `node scripts/check-factory-layout.mjs`: `factory layout structural self-check OK`. `node scripts/check-determinism.mjs`: `determinism and Python-removal audit OK`. `node scripts/build-payload.mjs --write-lock` regenerated payload digest `sha256:0fb5c189247ebcbb789e4c10743b4adde1e1c0ac834188b4f9f16b6a2eef2e3c` after ownership registration.
- Limit: no published exact-version `pnpm dlx` execution, hosted workflow, cold human/agent session, provider write, or approved human decision was performed. Those remain external checks; no GitHub issue state was changed.
- Rollback boundary: the four tracked paths in this work unit (`docs/smoke-test.md`, `odd/tasks/issue-258-smoke-command.md`, `archetype-ownership.json`, `package/payload-manifest.json`). No other path or hosted resource needs rollback.
- Work-unit commit: `c4b1b707c5e35e6fc00b0c779dba02f252681015` (`docs(smoke): make creator kickoff executable (#258)`). Authored change: 126 additions + 19 deletions = 145 lines, under the advisory 400-line heuristic; `ask-on-risk` was not triggered. `git diff --check origin/main...HEAD` passed after commit. This evidence-only receipt records that commit; hosted checks and the bound GitHub Issues readback are pending, so this local projection does not mark #258 closed.

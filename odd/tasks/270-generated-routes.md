# ODD projection: #270 generated agent-context routes

## Authority and scope

GitHub issue #270 is the authoritative task. This file and its Engram mirror are local planning and evidence, not a provider-confirmed phase transition. Single direct writer in `feature/270-generated-routes` from `main` `cc3b1045410c4af73b35d697f86f7e004b5ba192`; no child delegation. Source mode is SELF: never apply the creator to this repository. Use disposable generated fixtures only. Do not touch sibling worktrees, `.atl`, hosted journey files, or the shared milestone projection `odd/tasks/v0-2-0.md`.

## Outcome and acceptance

Resolve the required #269 context routes across source SELF and fresh generated SETUP/WORK: `CLAUDE.md`, `AGENT.md`, `start.mjs`, bindings, workflow, handbook, and runbook. Both Markdown links and literal path instructions must resolve to retained root or `.factory/` files in generated mode. Required missing local context must name an actionable repair/continuation; optional topics must remain optional. For #261/#262 external authority, point only to the declared canonical location, without remote access or invented fallback. Preserve source/generated separation, creator ownership, and `foundry verify` integrity.

Implement a narrow route resolution in the creator/startup/docs as actual source evidence warrants, not a blanket regex rewrite. Cover fresh generated fixture navigation plus negative stale inline path, missing required topic, and absent optional external context. Out of scope: #247 doctor, #252 examples, #248 copy cleanup, #263 propagation, #272 broad semantic checker, hosted/provider work.

## Work unit and verification

Delivery strategy: ask-on-risk at about 400 authored additions plus deletions. Keep tests and docs with behavior; if no cohesive split fits, report honest overage before PR. Normalize payload with `node scripts/build-payload.mjs --write-lock` when payload input changes; emit typed runtime only for typed-source changes. Foreground checks: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:creator`, `node --test test/startup.test.mjs test/context-routes.test.mjs` plus new negative fixture tests, `node scripts/typed-runtime/check-real-agent-workflow.js`, `node scripts/check-determinism.mjs`, `git diff --check`, and `git diff --check main...HEAD`. Record exact results and local commit SHA here after review of status/diff/log. No CI, hosted or provider evidence implied.

Rollback boundary: revert the #270 route behavior, focused tests, narrow docs, and regenerated payload lock as a single work unit; do not alter #269 semantics, ownership classification or sibling work. Parent owns any authorized provider checkpoint, PR, merge and issue closeout.

## Local evidence

Generated fixture: local creator apply/verify/noop succeeded; root `CLAUDE.md`, `AGENT.md`, `start.mjs`, `docs/bindings.md` and relocated workflow, handbook, and runbook were inspected in focused tests. Generated task routes use destination paths without SELF-only actions; path-like Markdown labels match their rebased targets. SETUP resolves a relocated initialization topic and does not instruct opening absent `docs/creator.md`. A stale inline path injected into a creator-owned shim fails the route assertion and `foundry verify`; deletion of the required runbook fails startup with the relocated path and repair/verify continuation. Missing setup topic reports incomplete; an external-contract or read-only website family map keeps exact declared URLs and does not invent optional `docs/business.md` or make a remote request.

Foreground checks after payload normalization (`sha256:b23c7cbd351a8a7f11f02e23801ba6a364a99bc0ecca4b2c8ef0bdf220957737`): `pnpm build` exit 0; `pnpm typecheck` exit 0; `pnpm test` exit 0 (322/322); `pnpm test:creator` exit 0 (38/38); `node --test test/startup.test.mjs test/context-routes.test.mjs` exit 0 (7/7); `node scripts/typed-runtime/check-real-agent-workflow.js` exit 0 (`real-agent workflow static check OK`); `node scripts/check-determinism.mjs` exit 0 (`determinism and Python-removal audit OK`); `git diff --check` exit 0. `git diff --check main...HEAD` and final commit identity are recorded after local commit. Typed-source emitter: N/A, no `scripts/typed/*.mts` change. No CI, hosted journey, remote documentation, or provider checkpoint was exercised.

Work-unit commit: `1edcd20ead6c6c8a8aacac11fe67bda1d1fcff08` (`fix(context): resolve generated agent routes after relocation (#270)`). `git diff --check main...HEAD` exit 0 after that commit. Authored changed-line count at the work-unit boundary: 163 additions plus deletions (173 total changed lines minus 10 generated payload-lock lines), below the 400-line advisory. This evidence-only follow-up records the commit identity and does not change behavior; rollback both local commits together. No push, PR, issue mutation, merge, or release is authorized here. #272 semantic safety and #265 parent acceptance remain downstream dependencies.

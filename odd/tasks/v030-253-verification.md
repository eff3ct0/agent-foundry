# Issue #253: Generated-project verification applicability

- Locator: `odd/tasks/v030-253-verification.md`
- Issue: `eff3ct0/agent-foundry#253`
- Branch/base: `feat/v030-253-verification` at `c153a0b358c65a3983c32e2febd225dd02b5f9fd`
- Objective: Generated CI must distinguish an executed applicable check from an unavailable required runner and from a deliberately omitted, non-applicable check.
- Authorized scope: Local changes to `ci/recipes.json`, `ci/_contract.md`, creator/composition test seams and narrowly relevant generated-project verification wording. No GitHub mutation, remote execution, provisioning, new tracker/status/flag, #244 phase redesign, or #247 static readiness overhaul.
- Route: `delegated` (trigger: direct request to implement issue #253 locally and commit).
- Task count: 1. Work unit `V030-253-01` forecasts approximately 230 authored changed lines (advisory, not a code-golf limit).
- TDD mode/source: Unknown; `docs/engineering-handbook.md` has the unfilled `<TDD_POLICY>` placeholder. The `TESTING/TDD` phase does not establish strict RED/GREEN. Add functional regression fixtures with the implementation and run them using Node's `node --test` runner after `pnpm build`.

## Task V030-253-01 — Applicable CI checks and execution evidence

- [x] Specify applicability of generated TypeScript checks in the existing CI contract and recipe, including the required test runner's missing-script continuation, explicitly non-applicable lint, failing test, and preserved non-TypeScript recipe behavior.
- [x] Exercise composed generated-project workflows against disposable fixtures; record runner, exit and observed result, not static readiness as execution.
- [x] Run `pnpm build`, `pnpm typecheck`, `node --test test/creator.test.mjs test/check-delivery-contract.test.mjs`, and relevant contract/ownership checks; record exact outcomes.
- [x] Commit the behavior, tests, and documentation in a Conventional Commit referencing #253 after reviewing status, diff and log. Commit identity: the work-unit commit that introduces this task record (`git log -1 --format=%H -- odd/tasks/v030-253-verification.md`).

## Acceptance and evidence

Issue #253 acceptance: required/executed vs unavailable vs not-applicable is visible; absent required test fails with a runnable exit; optional absent lint is omitted rather than marked green; executed failing test remains failed; a non-TypeScript recipe retains its own policy. Phase evidence states runner, observed exit, and result for each applicable check; #244 owns provider-confirmed handoffs, #247 owns static readiness. A generated-project fixture executes each scenario. No hosted CI run is claimed from local execution.

## Progress

- `V030-253-01`: implemented and locally verified. The generated TypeScript job executes configured npm scripts, omits absent optional runners, and fails when required `scripts.test` is unavailable; Go is unchanged.
- Runtime fixture (generated workflow commands, local runner, not hosted Actions): `npm ci` exit 0; missing `scripts.test`: `node -e` verifier exit 1, unavailable; printed `npm pkg set scripts.test="node --test" && npm test` exit 0; absent lint: verifier exit 0 with `lint: not applicable`, `npm run test` exit 0 passed; configured failing lint: verifier exit 1 with `npm run lint` exit 1 failed; present failing test: verifier exit 1 with `npm run test` nonzero failed. Go: `gofmt`, `go vet ./...`, `go test ./...`, `go build ./...` each exit 0. Hosted GitHub Actions: N/A (local authorization only).
- Verification: `pnpm build` exit 0; `pnpm typecheck` exit 0; `node --test test/creator.test.mjs test/check-delivery-contract.test.mjs` exit 0 (33 passed); `node scripts/check-delivery-contract.mjs --self-check` exit 0; `node scripts/check-factory-layout.mjs` exit 0; `node scripts/check-determinism.mjs` exit 0; `pnpm test:package-consumer` exit 0 (4 passed); `git diff --check` exit 0.
- Engram mirror: complete document under topic `odd/v030-253-verification/tasks`, project `agent-foundry`; read back before source edits and re-read after this update.
- Rollback boundary: this task's CI recipe, CI contract, and fixture changes (plus this work-unit record) without reverting other issues.

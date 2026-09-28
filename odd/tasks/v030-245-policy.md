# #245 — Inspectable pinned/local interaction rules

- Branch: `feat/v030-245-policy` from `c153a0b358c65a3983c32e2febd225dd02b5f9fd`.
- Scope: inherited project-facing interaction policy in `AGENT.md`, `docs/org-factory.md`, and the existing runbook; offline cold-agent fixture. No #3 defaults merge, #250 action-boundary changes, provider binding changes, remote fetch, new gate, CI, or journey changes.
- Objective: make an effective rule inspectable from a specific `FACTORY_SPEC` baseline and exact local rule text without losing either source.
- Classification: feature request (#245); root class: unresolved interaction-policy provenance, distinct from organization configuration defaults (#3) and action authority (#250).
- Locator: Engram project `agent-foundry`, topic `odd/v030-245-policy/tasks` (local projection; no claim of bound-provider confirmation).

## Acceptance

- [x] P245-01: Generated entrypoints identify the pinned tag and resolved SHA, exact texts and locations, per-rule precedence, and both sides of the override.
- [x] P245-02: Missing pin, unavailable local baseline, or contradictory local text stops only the affected action with an offline owner next step; no implicit fetch.
- [x] P245-03: Offline generated-project cold fixture exercises nonconflict, override, missing pin/ref, and ambiguous local text; tests shipped entrypoints and relocated links.
- [x] P245-04: `pnpm build`, `pnpm typecheck`, `node --test test/creator.test.mjs`, `pnpm test`, factory-layout and delivery-contract self-checks passed; no CI or journey edits.

## Route and forecast

- Single cohesive work unit: inherited docs plus regression fixture, one Conventional Commit referencing #245. Forecast ~180–280 authored changed lines, below the 400-line advisory; preserve useful test and documentation detail instead of code-golf.
- Delegated route: local implementation, local verification, local commit only. Trigger: supplied issue #245 and explicit local-only instruction. No remote task readback or delivery; provider confirmation is not claimed.
- TDD policy: `TDD_POLICY` is a project placeholder, so the actual policy is unknown here. Write ordinary fixture assertions before changing the inherited text; runner `pnpm test`, focused `node --test test/creator.test.mjs` after `pnpm build`. No RDD review.
- Runtime scenario: offline `foundry apply` into a temporary generated repository, then cold read of generated entrypoints and injected local pinned-baseline fixture; no external environment.
- Rollback boundary: revert only this work-unit's policy docs, fixture, and task projection; no provider or creator data migration.

## Progress and checks

- [x] DEFINITION: read startup, governing docs, three skills, previous issue context, and scoped CodeGraph results. Base and branch verified.
- [x] IMPLEMENTATION: inherited `AGENT.md`, `docs/org-factory.md`, and `templates/agent-runbook.md` describe offline comparison. Refreshed `package/payload-manifest.json` with `node scripts/build-payload.mjs --write-lock` (digest `sha256:16c1670678ad45e9dec8875d7adf032cf810e7a5dd8fa636a4b585e92b957a16`).
- [x] TESTING/TDD: new generated-project assertion was red before policy text; passed after policy, with a locally tagged checkout and negative cases.
- [x] VERIFICATION: `pnpm build` passed; `pnpm typecheck` passed; focused creator tests 24/24; `pnpm test` 257/257; `node scripts/check-factory-layout.mjs` passed; `node scripts/check-delivery-contract.mjs --self-check` and `--approval-self-check` passed; `git diff --check` passed. Runtime: offline `foundry apply` and `start.mjs` in generated fixture passed; no hosted runtime is authorized. Authored changed-line forecast remains below the 400-line advisory (including this projection).
- [x] EVIDENCE/DELIVERY: reviewed status, diff and last ten commits; commit identity is the work-unit commit containing this file (`git log -1 --format=%H` after commit). Local commit only, no PR/push/issue state mutation.
- Blocker: GitHub bound-provider task state cannot be confirmed under local-only authorization; this file and Engram mirror are not a substitute for provider-confirmed phase or issue completion.

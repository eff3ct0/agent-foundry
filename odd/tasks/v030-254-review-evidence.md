# #254 Candidate-bound review evidence

## Identity and objective

- Issue: #254 (feature); branch: `feat/v030-254-review-evidence`; base: `c153a0b358c65a3983c32e2febd225dd02b5f9fd`.
- Objective: make retained review evidence attest only the exact candidate actually reviewed, or explicitly report why it cannot.
- This local document and its Engram mirror are planning projections, not a bound-provider handoff or review approval. No remote task operation is authorized.

## Scope and acceptance

- In: existing review/delivery handoff instructions, exact base/head/diff identity, reviewed scope and disposition; local deterministic regression fixture on the existing delivery-contract test seam.
- Out: reviewer engine, new phase/status/tracker or merge authority, GitHub settings audit, #228 GitHub governance draft, #244 phase guard, #249 intent reconciliation and #255 post-PR integration ownership.
- [x] A retained result names base and head commit identities, complete reviewed diff identity (including file bytes, paths and modes), scope and disposition.
- [x] A change to bytes, path or mode on candidate B invalidates A's result; identical A remains valid. Missing, unreadable or unmatched evidence is unverified with a concrete next action.
- [x] Review handoff distinguishes local retained evidence from independent GitHub PR protection without claiming settings have been inspected.
- [x] Deterministic fixture proves these scenarios without claiming an actual reviewer ran.

## Work units and route

| ID | Finish condition | Route / trigger | Progress |
| --- | --- | --- | --- |
| RE-01 | Capture scope, forecast, acceptance and runner before source edits; mirror full text and locator in Engram and read back both. | Direct local documentation, no delegation; issue supplied by owner. | Complete; file and Engram #4808 read back. |
| RE-02 | Express candidate binding and fail-closed handoff on existing review/delivery surfaces with focused fixture. | Direct local edit after RE-01 readback; no reviewer engine or provider mutation. | Complete; focused test passed 10/10 before final identity-command refinement. |
| RE-03 | Verify build, typecheck, focused and full tests, factory layout; record runtime applicability, rollback boundary and commit SHA. | Direct local runner; at least one conventional work-unit commit including #254. | Checks passed; local commit and SHA recording pending. |

Forecast: ~180–300 authored additions plus deletions for the entire unit, below the 400-line advisory; measure before commit. Keep docs and regression together. RDD off: no review launched. TDD policy in `docs/engineering-handbook.md` remains `<TDD_POLICY>` (unknown), so use ordinary deterministic tests without claiming strict red/green. Runner: `pnpm test` (plus `pnpm build`, `pnpm typecheck`, focused `node --test test/check-delivery-contract.test.mjs`, factory-layout check).

## Progress and next action

- At intake, `node start.mjs` returned SELF; specified branch and base matched; CodeGraph and required contracts were inspected before source changes or tests.
- Initial full Engram mirror and local file were read back before source edits. Current scope: four inherited review/delivery contracts, offline identity fixture, source-only task projection and ownership inventory. The first focused test failed 9/10 because the fixture compared scope against a candidate without a scope field; the corrected fixture passed 10/10. Re-run after the final identity-command refinement.
- Final after the last behavior edits: `node scripts/build-payload.mjs --write-lock` passed (digest `sha256:2acb1ede2132e790933e2bf37a4d0c61882a3bd9df2203e072b4c46b8adfc88d`); `pnpm build` passed; `pnpm typecheck` passed; `node --test test/check-delivery-contract.test.mjs` passed 10/10; `node scripts/check-factory-layout.mjs` printed `factory layout structural self-check OK`; `pnpm test` passed 258/258 including a rebuilt payload and offline generated-project fixtures; `git diff --check` passed. Earlier full run also passed 258/258 before the final fixture adjustment. GitHub protection settings and actual reviewer outcome: not audited or executed.
- Offline runtime scenario: the focused fixture creates real local Git commits A and B, hashes the complete raw diff, and checks content/path/mode, unchanged, missing, unreadable, malformed and mismatched scope cases; this is not a real review. Live reviewer runtime: N/A (no reviewer engine or authorized remote review).
- Rollback boundary: revert only #254 work-unit edits to `AGENT.md`, `docs/workflow.md`, `templates/agent-runbook.md`, `templates/handoff.md`, `test/check-delivery-contract.test.mjs`, `archetype-ownership.json`, `package/payload-manifest.json` and this source-only task file; do not affect other issue scopes or provider state.
- Next: inspect final intended diff and authored-line count, commit the behavior with tests/docs as one unit, then record its SHA and mirror the complete updated document. No hosted review, PR, provider readback, merge, push or runtime reviewer invocation is part of this local request.

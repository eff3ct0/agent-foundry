# ODD projection: #248 concrete consumer guidance and creator state

## Objective and authority

Make a newly generated project describe its concrete project rather than the source archetype, while preserving `foundry apply`, `foundry verify`, and `foundry doctor` after setup. GitHub issue #248 is the authoritative task (OPEN, `status:approved`, milestone 3); this file and its Engram mirror are derived local evidence, not provider-native phase state.

## Scope and route

- Delegated direct implementation on `feature/248-consumer-state` from `main` `fef6cfe87b75e438d2fea8ee0653cec32155cc0d`; one writer, no child delegation.
- Generate concrete root README/AGENT guidance, preserving selected bindings, work routes, and safety rules. Source SELF instructions remain intact.
- Move durable creator state and staging into `.factory/creator/` for new projects. Migrate only validated single legacy state on unchanged-configuration rerun with transactional rollback; reject ambiguous, unsafe, malformed, or drifted state. Preserve ownership and module policy.
- Do not change #247 readiness, provider approvals, hosted journeys, or remote task/PR/release state.

## Acceptance and checks

- Fresh concrete consumer has no creator-only publication/bootstrap copy in root guidance and no `.factory-template-creator` directory; `start.mjs` enters WORK.
- Existing valid legacy consumer reports pending migration in verify/doctor, migrates safely on rerun, then apply is noop and verify/doctor succeed. Conflicting state, symlinks, unknown paths, drift, and rollback failures fail closed.
- Run foreground `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:creator`, `pnpm test:package-consumer`, focused startup/creator/package tests and migration fixtures, real-agent workflow static check, determinism, whitespace and layout/integrity checks. Rebuild payload lock and runtime emitters when their inputs change.

## Delivery and rollback

Ask-on-risk: measure authored additions plus deletions against the hard 400-line PR budget; do not compress or omit tests/docs to fit. If one cohesive issue needs more than 400 lines, return PARTIAL with exact count and request maintainer `size:exception`; size alone is not a new issue. Parent owns remote operations. Roll back the work-unit commit to restore source and generated-state behavior; migration must preserve recoverable legacy state on any precommit failure.

## State relocation checkpoint

- Fresh state and staging use `.factory/creator/`; a single canonical, mode-0600 legacy state is adopted only with unchanged configuration and verified owned files. Plan/verify/doctor report pending migration; apply writes the new state and removes the legacy directory transactionally. Both locations, drift, unknown entries, and symlinks fail closed.
- Focused runtime harness: `node --test test/creator.test.mjs test/startup.test.mjs` passed 46/46, including injected rollback after removal, new state creation, and an owned-file update. Rollback boundary: the creator state/staging paths, startup routing, tests, and payload lock; no unrelated provider or hosted behavior changed.
- Foreground checks: `pnpm build` passed; `pnpm typecheck` passed; `pnpm test:creator` passed 40/40; `pnpm test:package-consumer` passed 4/4 using an offline local tarball; `pnpm test` passed 328/328; `node --test test/startup.test.mjs` passed 6/6; `node scripts/typed-runtime/check-real-agent-workflow.js`, `node scripts/check-determinism.mjs`, and `git diff --check` passed.
- Documentation families affected: technical guidance to generated consumers; the README/AGENT copy work remains a separate sequential unit. Existing WIP in `src/creator.ts` is preserved but not accepted as tested documentation behavior. The synthetic legacy fixture validates the transactional contract but does not replace an installed historical-package fixture.
- Engram mirror for this issue document is **pending**: the initial save returned no confirmed session registration. The repository file is preserved as the evidence source; do not claim a memory mirror until save and readback succeed.
- Commit SHA and authored line count: pending local work-unit commit. #248 remains open; this is not issue completion or provider-native phase state.

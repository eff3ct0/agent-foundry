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
- Documentation families affected: generated consumer operating guidance and technical documentation; local Git authority remains selected. The source SELF README/AGENT and provider bindings are unchanged. Fresh generated README/AGENT use the selected answers and relocated `.factory/` routes; setup-only publication/bootstrap copy is absent. The generated delivery checker accepts the concrete heading and excludes only the setup route; approval, ownership, and readback checks remain. The synthetic legacy fixture is not a historical installed-package migration proof.
- Engram mirror for this issue document is **pending**: the initial save returned no confirmed session registration. The repository file is preserved as the evidence source; do not claim a memory mirror until save and readback succeed.
- Local work units: `ddbfefcbb18508311c49320f9418ab16aa984014` (state migration), `908a4222255aa30ef3e25722a6bf07fe0d8528ab` (checkpoint), `67c36c440b357d83677c5397e8bce27195a7f6a8` (consumer rendering and tests). No remote delivery, hosted proof, or provider-native phase transition is claimed. Rollback the consumer-rendering commit to restore inherited README/AGENT and checker expectations independently of the prior state migration; rollback the state commit separately to restore its state boundary.
- Foreground checks before commit: `pnpm build`, `pnpm typecheck`, `pnpm test` 329/329, `pnpm test:creator` 41/41, `pnpm test:package-consumer` 4/4, focused creator/startup/package 51/51, real-agent static check, determinism, and both requested diff checks passed. Initial focused retake failed 3/51 (doctor lacked config and checker expected setup), next failed 1/51 (checker heading/route); initial build after checker edit failed typed-runtime byte sync, then payload lock failed after runtime sync; both normalized and rerun green. Post-code-commit retake from `67c36c4`: focused 51/51, full 329/329, typecheck, static workflow, determinism, and diff checks passed with only this ODD note dirty. Fresh fixture checked WORK, root links, apply/verify/doctor/noop and drift; installed offline tarball checked both consumers. Full-branch authored additions plus deletions excluding generated `package/payload-manifest.json`: **394** after this note (cumulative branch diff, not sum of intermediate diffs), under the hard 400-line PR limit; no PR or remote delivery was authorized. Do not minify tests/docs; any additional authored lines past 400 require maintainer `size:exception` or a genuine scope change.

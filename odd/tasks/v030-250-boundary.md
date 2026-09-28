# Issue #250 — Pre-action execution boundary

- Issue: #250 (agent-foundry); branch: `feat/v030-250-boundary`; base: `c153a0b358c65a3983c32e2febd225dd02b5f9fd`.
- Objective: Make generated-project instructions require a pre-consequential-action check of actual execution and authorization boundaries, without implying that a sandbox label enforces safety.
- Scope: `AGENT.md`, `templates/agent-runbook.md`, existing planning/handoff surfaces, and a generated-project fixture in the creator tests. No CI or journey files, provider-binding changes, new state/phase/gate/service, OpenHands dependency, credential probes, remote work, or other worktrees.
- Acceptance: A cold-agent generated-project fixture distinguishes direct local, remote, mounted-host, and outer-server custom-tool boundaries; blocks at least one misleadingly sandboxed outward action without executing it; permits unrelated authorized reads on a read-only request. The generated-project contract checks pass. Prose tests do not establish runtime enforcement.
- Forecast: One cohesive work unit, approximately 100–180 authored lines including tests and this task note; ~400 authored changed lines per task is advisory, not a reason to compress evidence.
- Route: delegated local implementation and verification for #250; trigger: direct human instruction in this session. RDD off globally; no native review. Remote execution, GitHub mutation, push, and PR are not authorized.
- TDD policy: unknown (configured placeholder); do not invent strict TDD. Runner: `pnpm test`; focused checks: `pnpm build`, `pnpm typecheck`, `node --test test/creator.test.mjs`, generated-project boundary scenario and contract checks.
- Rollback boundary: revert only the #250 contract additions, fixture, and this task note; leave provider bindings, CI, and unrelated work untouched.

## Tasks and progress

- [x] T250-1 — Added the pre-action boundary to generated-project instructions and existing planning/handoff surfaces. The generated-project fixture covers direct local, remote, mounted host, outer-server tool, unknown, and read-only local scenarios; it does not enforce runtime isolation. Evidence: `node --test test/creator.test.mjs` 24/24 pass; generated `verify` and delivery-contract self-check pass inside fixture. Commit: with T250-2.
- [x] T250-2 — Verified and self-reviewed one coherent local work unit for commit referencing #250. Evidence: `pnpm build` pass; `pnpm typecheck` pass; `node --test test/creator.test.mjs` 24/24 pass; `pnpm test` 257/257 pass; `node scripts/check-delivery-contract.mjs --self-check` pass; `node scripts/check-delivery-contract.mjs --approval-self-check` pass; `node scripts/check-factory-layout.mjs` pass; `git diff --check` pass. The generated fixture runs `apply`, `verify`, and generated contract self-check; scenario decisions are documentary only. Commit: the commit containing this task note (SHA recorded in Engram after commit).

## Mirror

- Engram project: `agent-foundry`; topic: `odd/v030-250-boundary/tasks`; locator: `odd/tasks/v030-250-boundary.md`.
- Mirror: full document and locator verified by readback after task updates; re-check after any subsequent edit.

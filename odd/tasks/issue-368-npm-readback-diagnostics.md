# Issue #368: Preserve safe npm readback diagnostics

> Derived, non-authoritative recovery projection. GitHub issue
> https://github.com/eff3ct0/agent-foundry/issues/368 is the authoritative tracker.

## Objective and evidence

Preserve bounded, sanitized subprocess diagnostics in the existing npm release
evidence without changing publication order, retry limits, or partial-pair safety.
Run 36839961212 stopped with `registry_read_unavailable` after the first publish.
The original subprocess error was discarded; its underlying cause is unknown.
The token-expansion hypothesis is unconfirmed. This change improves future
diagnostics; it does not recover missing historical evidence or authorize a retry.

## Authorized scope and constraints

- Human authorized this diagnostic improvement, tests, and an isolated worktree.
- Branch: `fix/368-npm-readback-diagnostics`.
- Base: `a61ca59b15c32c5c1c75baeaabd1754f053e2b4e`, verified against GitHub `main`.
- Edit scope: npm release adapter/coordinator, its tests, maintainer guidance,
  this projection, ownership registration, and generated payload manifest.
- No workflow execution/edit, registry probes, npm publication, partial-release
  retry, tags/releases, remote cleanup, `.atl/`, or work on #369.
- No push, PR creation, merge, issue close, or extra tracker comments authorized.
- Preserve the unrelated source worktree and its existing `.gitignore` change.
- RDD: OFF, global setting confirmed by `gentle-ai review mode status`.
- Testing: ordinary functional/regression checks, not claimed strict TDD. Source:
  prior human ordinary-verification choice (Engram #4162), unresolved SELF
  `<TDD_POLICY>`, no conflicting concrete configuration found. Runner: `node:test`.

## Work unit

- [ ] **T1** Preserve safe terminal diagnostics through subprocess mapping,
  readback exhaustion, outer rethrow, and existing on-disk pair evidence.
  Include offline adapter/privacy/persistence regressions and maintainer guidance.
  Route: delegated direct. Trigger: multiple non-trivial files and implementation
  preparation requiring adapter, coordinator, tests, workflow guard, and docs.

### Acceptance criteria

- Additive structured diagnostics distinguish `view` and `pack` where known.
- Metadata uses fixed keys, strict value allowlists and bounds; no raw messages,
  stacks, causes, argv, environment, paths, URLs, stdout or stderr are retained.
- Malicious/unknown/stringly input cannot leak secrets into CLI output or evidence.
- Terminal metadata survives five-read exhaustion and `publishPair` rethrow.
- Existing artifact upload, phases, high-level codes, and publication ordering
  remain compatible; a failed creator readback never reaches the second publish.
- Partial-pair resumption remains refused; no live publication proves this change.

## Checks and evidence

- Preparation: three selected pure npm tests passed; release self-check and
  bootstrap static guard passed. Worktree clean before this projection.
- Local runtime: Node v26.9.0, pnpm 12.4.2. Checks ran in the foreground after
  source/ownership edits and payload normalization; no formatter is configured.
  No strict TDD or RED phase is claimed. No required check failed or was blocked.

| Command | Observed result |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` | PASS; cached dependencies only, no fallback. |
| `node scripts/build-payload.mjs --write-lock` | PASS; digest recorded below. |
| `pnpm build` | PASS; exit 0. |
| `pnpm typecheck` | PASS; exit 0. |
| `node --test test/npm-release.test.mjs test/release-readback.test.mjs test/check-bootstrap-workflow.test.mjs` | PASS; 75/75, zero failures/skips. |
| `pnpm test:creator` | PASS; 41/41, zero failures/skips. |
| `node scripts/npm-release.mjs --self-check` | PASS; npm release contract self-check OK. |
| `node scripts/check-bootstrap-workflow.mjs` | PASS; all six static workflow contracts. |
| `node scripts/check-factory-layout.mjs --self-check` | PASS; factory layout structural self-check OK. |
| `node scripts/check-determinism.mjs` | PASS; determinism and Python-removal audit OK. |
| `pnpm test` | PASS; 341/341, zero failures/skips. |
| `git diff --check` | PASS before final tracking update; final readback pending. |
| `git diff --numstat a61ca59b15c32c5c1c75baeaabd1754f053e2b4e` | Tracked authored 289; generated 6; projection counted separately below. |
| `git status --short` | Five intended tracked modifications and this untracked projection; no staging/commit. |

- Native off-path risk assessment: pending parent. RDD remains OFF; tests are
  functional evidence, not review receipts or approval. Hosted Node 20 is not verified.
- Commit evidence: pending. One Conventional Commit work unit including tests
  and docs, after verification; inspect status, diff, and recent log first.
- Rollback boundary: the diagnostic metadata plumbing and its tests/docs plus
  ownership/payload changes; no publication, workflow, or unrelated behavior.

## Delivery and next step

- Strategy: `ask-on-risk`; forecast 260–380 authored additions plus deletions.
- Approximate 400-line task size is advisory, not a reason to omit proof or
  minify. If accumulated delivery scope exceeds the budget, ask about delivery
  slicing before the next commit; do not create a PR without authorization.
- Running count: pending final projection count; tracked authored 289 and generated 6.
- Commit identity: pending parent action. T1 remains unchecked until parent commit
  and remaining outcomes are observed; local verification does not complete the task.
- Next: parent assesses the complete diff, performs proportional independent
  verification and resolves delivery strategy if the authored range exceeds 400.
- Mirror: `odd/issue-368-npm-readback-diagnostics/tasks`, project `agent-foundry`.

## T1 implementation progress (not complete)

- Implemented fixed allowlisted diagnostic fields in `scripts/npm-release.mjs`:
  operation, integer exit code (0–255), known system/npm codes, known signal,
  and boolean killed status. Npm codes are extracted only from bounded stderr
  code lines; raw output, messages, causes and environment are not copied.
- Error construction and outer rethrow rebuild the safe fields. Existing
  `identity/pair-state.json` receives an additive diagnostic with a trusted
  release classification; CLI failure output is classification-only.
- Executor/coordinator seams retain production defaults. Offline regressions
  exercise real local child rejection shapes, five-read exhaustion for both
  view and pack, terminal persistence, malicious metadata and CLI privacy.
- Publication order, partial-pair refusal, phases and retry limits are unchanged;
  no workflow file or publication action was added. Maintainer guidance updated.
- Registered this projection as removed archetype governance. Final payload
  normalization preceded functional verification; emitted digest:
  `sha256:54a1965bd91806b6c2b635df3f6fc88eec03df85e70b5506f355329dedbba8ac`.
- Runtime proof: real local Node children and injected provider callbacks exercised
  subprocess mapping and on-disk evidence, with no registry, claim or publication.
- Remaining edits to this projection are tracking only; no payload input or source
  changed after normalization. No commit, GitHub checkpoint or native review created.

# ODD projection: #259 npm create initializer façade

## Authority and objective

GitHub issue #259 is OPEN and authoritative; this local document and its Engram mirror are derived work-unit evidence, not provider-confirmed phase state. Work only on `feature/259-create-entrypoint` from `main` `43e675e4e7421d85bfe5a1adc638321ffc325fc7`. Offer the chosen `npm create @eff3ct/agent-foundry@<EXACT_VERSION> ./new-project` path by packaging `@eff3ct/create-agent-foundry` at the same version. An anonymous registry GET returned 404 for the proposed name; this does not establish publication rights or availability at release time.

## First coherent work unit: local façade

Direct delegation, one bounded writer, no children. Add a thin initializer bin that accepts one positional target and documented forwarding flags for configuration, non-interactive use and confirmation. It delegates to the installed existing `foundry apply --target ...` engine, preserving prompts, refusal/cancellation, JSON stdout, stderr/exit behavior, ownership protection and rollback. Pin the initializer's dependency on the root creator to the same exact source version. Keep package metadata and build/pack scoped to this wrapper, and register new tracked paths as removed creator packaging, never consumer payload. Document npm's package-name mapping and distinguish a discoverable `@latest` from reproducible exact versions without claiming a published initializer.

Out of scope: creator-engine changes, silent GitHub provisioning or agent launch, `.atl`, hosted journeys, root worktree, npm registry query/publication, release/tag/workflow dispatch, and task-provider mutation. Existing `foundry` CLI and root package integrity remain unchanged.

## Acceptance and checks

- Offline pack/install of both local tarballs in a disposable consumer proves bin dispatch, positional target, interactive confirmation and cancellation, non-interactive config JSON/error exits, unknown-file protection, rollback, verify/noop/doctor, and package/version provenance shape.
- After final normalization, run foreground `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:creator`, `pnpm test:package-consumer`, focused initializer tests, `node scripts/typed-runtime/check-real-agent-workflow.js`, `node scripts/check-determinism.mjs`, and both `git diff --check` and `git diff --check main...HEAD`. Record exact results and runtime fixture evidence; SELF source is never a creator target.
- Inspect status/diff/recent log before staging only intended paths; commit one conventional work unit with #259. Assess affected documentation families. Record authored addition+deletion count, excluding generated lock data without hiding complete diff.

## Ask-on-risk, rollback and next unit

Review budget is 400 authored lines per PR candidate, not a minification target. If the coherent candidate exceeds it, report the true count and await an approved slice or `size:exception`; do not invent a size issue. Rollback removes the initializer package/bin, scoped build/test hooks, source documentation and this projection; root creator behavior is unaffected.

Second work unit remains pending: coordinate exact versions and provenance for both packages, add a single-package publish-claim release workflow and separate metadata/tarball/readback validation, decide namespace ownership, and obtain distinct human authorization before any release action. Neither local passing tests nor registry 404 closes #259 or proves published `npm create` availability. Provider checkpoint and remote delivery are outside this local authorization.

## Local implementation checkpoint

- Work-unit commit: `4701de1d50aac91800454ed2d918f7233b7ddb46` (`feat(creator): add offline npm create initializer facade (#259)`). It changes 224 authored additions plus deletions; the complete diff is 238 lines including 14 regenerated payload-lock lines. No test or documentation was trimmed for the budget.
- After final payload normalization, foreground `pnpm build` and `pnpm typecheck` exited 0; `pnpm test` passed 330/330, `pnpm test:creator` 41/41, `pnpm test:package-consumer` 4/4, and focused `node --test test/create-entrypoint.test.mjs` 1/1. `node scripts/typed-runtime/check-real-agent-workflow.js` printed `real-agent workflow static check OK`; `node scripts/check-determinism.mjs` printed `determinism and Python-removal audit OK`. Both `git diff --check` and `git diff --check main...HEAD` exited 0. `node start.mjs` still reported SELF.
- Runtime fixture: locally packed root (`pnpm pack`, needed to retain payload `.gitignore`) and initializer (`npm pack`), installed both with npm `--offline` in a disposable consumer. The installed bin exercised positional apply, interactive yes/no, `--yes`, non-interactive JSON/config errors, unknown-file refusal, verify/noop/doctor, and root CLI injected-failure rollback. It checked exact installed dependency, package identity and payload digest. This is not a registry execution or a published npm-create readback.
- Documentation assessment: technical onboarding changed in canonical local Git `README.md` and `docs/bootstrap.md` at `4701de1d50aac91800454ed2d918f7233b7ddb46`; architecture, process constraints and business sources were unaffected. No external publication or provider-native task readback is claimed.
- Engram mirror to topic `odd/259-npm-create/tasks` was attempted before source edits but rejected because runtime session registration could not be confirmed. Mirror remains **PENDING**; do not treat this local projection as provider authority. Next actor can mirror the full current document when Engram registration is restored, then read it back. No repeated mutation attempts were made in this session.

# #262 documentation destinations — local work-unit projection

## Authority and scope

GitHub issue #262 in `eff3ct0/agent-foundry` is the authoritative, open, approved task (milestone #3). This file is a derived implementation/evidence projection, not a provider-confirmed handoff. The parent owns all remote delivery and tracker operations. Route: delegated direct, single writer in `feature/262-documentation-destinations` from main `38d39eaa062ebbdbc188401dad101a15da106e02`; no child delegation.

Implement setup-time documentation destination profiles and canonical identity for architecture, constraints, business, and technical families, building on merged #261 authority. Keep local Git default offline; independently describe read/write/publish. GitHub Pages is a Git-sourced publication target, not a writable document store. An external writable profile needs exact target identity, access mechanism, and a supported read/write/readback contract. Unsupported/read-only websites and missing identity or authorization fail closed. Selection never performs remote access or mutation. #263 impact/propagation evidence, live service adapters, and actual transfer are out of scope. Preserve task-provider, approval, creator integrity, payload locks, and `.factory` layout; do not apply creator to source repo.

## Acceptance and approach

- Generated bindings agree with the four canonical family rows and distinguish source identity from capabilities; local default requires no migration or credentials.
- Pages has an identified Git source and publication evidence requirements, without direct write or implied publication.
- A supported external contract is explicit and actionable; a named service alone does not assert an adapter. Ambiguous targets, unavailable access, and unsupported operations produce diagnostics before target writes.
- Factory defaults may suggest a destination but never authorize a project-specific remote action.
- Generated-project fixtures cover local, external-writable, Pages, read-only/unsupported websites, missing identity/access/authorization, inconsistent authority/capability, and no remote writes.

## Plan and verification

Inspect creator configuration/composition and existing fixture conventions. Implement the smallest validated contract and docs, with focused tests. Normalize payload with `node scripts/build-payload.mjs --write-lock` if inputs changed; typed emitter only if typed source changed. Run foreground: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:creator`, focused scenarios, `node scripts/typed-runtime/check-real-agent-workflow.js`, `node scripts/check-determinism.mjs`, `git diff --check`, and `git diff --check main...HEAD`. No hosted/live provider proof claimed.

## Delivery and rollback

Delivery strategy: ask-on-risk. Around 400 authored additions plus deletions is advisory; report a cohesive overage rather than cutting tests/docs. Commit one reviewable behavior unit with its tests/docs, then an evidence follow-up if necessary, conventional messages referencing #262. Roll back only this unit's configuration/composition, generated contract/docs/tests, and payload identity; do not disturb task/secrets bindings, #261 authority, or unrelated work. Initial phase: DEFINITION (local projection only). No push, PR, issue edit, publication, or other remote mutation here.

## Local implementation and evidence

Work-unit commit: `c2f8660615e8984b4c1e145cfce7d21de0915195` (`feat(docs): bind documentation destination capabilities (#262)`). It adds the four validated profiles to creator answers and generated bindings, preserves #261's local family map, rejects missing/mismatched project-specific identities and unsupported capability fields before target creation, and documents the conditional external contract. The generated-project scenarios used `.invalid` HTTPS identities: plan was read-only, apply/verify/noop worked offline, and no live provider or Pages endpoint was exercised. Factory-proposed remote fields did not authorize a project destination; explicit local choice cleared inherited remote context.

Final source normalization: `node scripts/build-payload.mjs --write-lock` succeeded, digest `sha256:4560dd49e486506feac6cd9a690ef449035e8e12ecc724012d42021d08b7d81a`. No `scripts/typed/*.mts` source changed; typed emitter regeneration is N/A, while `pnpm build` and the suite's checked-in typed runtime byte-sync test passed.

Foreground checks on the normalized source: `pnpm build` exit 0; `pnpm typecheck` exit 0; focused `node --test --test-name-pattern='documentation profiles|documentation setup|Git-only documentation authority|composes bindings' test/creator.test.mjs` exit 0 (4/4); `pnpm test` exit 0 (319/319); `pnpm test:creator` exit 0 (37/37); `node scripts/typed-runtime/check-real-agent-workflow.js` exit 0 (`real-agent workflow static check OK`); `node scripts/check-determinism.mjs` exit 0 (`determinism and Python-removal audit OK`); `git diff --check` exit 0; `git diff --check main...HEAD` exit 0 (recheck after evidence commit). No hosted or live adapter proof is claimed.

First commit changed 305 lines total (293 additions, 12 deletions); excluding the 14 generated payload-lock lines leaves **291 authored lines**. This evidence follow-up changes 12 lines, for **303 authored lines** across the branch, within the advisory 400-line budget. Rollback: revert this feature commit and its evidence-only follow-up; the feature rollback removes only `placeholders.json`, `src/creator.ts`, `test/creator.test.mjs`, `docs/agent-init.md`, `docs/bindings.md`, `docs/bootstrap.md`, `docs/creator.md`, `package/payload-manifest.json`, and this task projection. Remaining risk: external operation specifications are declared and URL-validated, not live-tested; no adapter, credential, transfer, or publication is included. Parent still owns GitHub checkpoint/readback, review, PR, and hosted verification. Current phase: EVIDENCE/DELIVERY locally, not provider-confirmed DONE. Next: parent reviews the branch and decides remote delivery; #263 remains separate.

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

Delivery strategy: ask-on-risk. Around 400 authored additions plus deletions is advisory; report a cohesive overage rather than cutting tests/docs. Commit one reviewable behavior unit with its tests/docs, then an evidence follow-up if necessary, conventional messages referencing #262. Roll back only this unit's configuration/composition, generated contract/docs/tests, and payload identity; do not disturb task/secrets bindings, #261 authority, or unrelated work. Current phase: DEFINITION (local projection only). Next: inspect source, implement and verify, record exact SHAs/results and mirror to Engram. No push, PR, issue edit, publication, or other remote mutation here.

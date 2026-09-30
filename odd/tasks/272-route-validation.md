# ODD projection: #272 reachable route validation

## Authority and scope

GitHub issue #272 is authoritative. This document and its Engram mirror are local derived planning/evidence, not a provider-confirmed status or handoff. Work only in `feature/272-route-validation` from `main` `2c254e4fe98bcdfb17b9505715f5c78aec74a2b5` in the designated worktree. Do not modify the shared milestone projection or infer completion of parent #265.

## Route and work unit

The parent delegated this issue directly for local implementation, verification, and one Conventional Commit. Check the source and freshly generated entrypoint/routes using the existing #269 task route and #270 generated path mapping, without a general rule engine. The checker must reject headings-only, missing designated safety content, and broken required routes with actionable diagnostics, while allowing absent optional topics. Three cold navigation fixtures start at the real entrypoint for bug fix, provider setup, and release. Preserve SELF, SETUP, WORK and existing validation.

Out of scope: approval-policy changes, task-provider runtime adapters, broad doctor checks, remote documentation providers, hosted journeys, `.atl`, and protected assets. No child delegation, remote mutation, push, PR, issue/merge, npm/provider network, or release. English artifacts. The review target is about 400 authored additions plus deletions; report an honest overage to the parent rather than compressing proof.

## Checks and evidence plan

Normalize payload lock if inputs change and regenerate typed runtime via the repository emitter before checking. Run focused delivery, startup, and creator positive/negative fixtures; `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:creator` when generated fixtures change, `node scripts/typed-runtime/check-real-agent-workflow.js`, `node scripts/check-determinism.mjs`, `git diff --check`, and `git diff --check main...HEAD` in foreground. A negative fixture must fail for the missing semantic requirement, not only a heading. Static fixture proof cannot establish a live agent's runtime compliance, provider authority, or outward-action authorization.

## Progress and rollback

- Definition and implementation: source and generated entrypoint safety bodies, composed bound task identity, and existing required route rows checked without changing #269/#270 mapping or the approval policy. Generated runtime re-emitted from `.mts`; payload lock regenerated (`sha256:c731a1ee000bc183423ea6271cbd070a99a19dd86746e28fcb1dbe01dce476cc`). No new tracked asset outside the already registered `odd/` boundary.
- Fixture evidence: real `start.mjs` yields SELF for source and WORK for fresh creator output. Bug-fix and release source routes, and bug-fix, provider-setup, and release generated routes load only designated required local topics. Headings-only entries, missing actor capability, exclusive binding, fresh task readback, outward-action approval, generated provider identity/readback, and broken required routes fail by named semantic requirement. Missing optional `docs/factory-layout.md` is allowed. SETUP remains covered by the existing startup fixture; creator apply/verify/noop is local only.
- Foreground checks on final implementation bytes: `pnpm build` exit 0 (fresh compiler byte comparison); `pnpm typecheck` exit 0; focused delivery/context/startup tests 17/17 and generated creator route fixture 1/1 (including the final missing-provider-identity case); `pnpm test` 324/324; `pnpm test:creator` 38/38; `node scripts/typed-runtime/check-real-agent-workflow.js` printed `real-agent workflow static check OK`; `node scripts/check-determinism.mjs` printed `determinism and Python-removal audit OK`; `git diff --check` and `git diff --check main...HEAD` exit 0. All ran foreground, sequentially after lock normalization.
- Evidence/delivery: local work-unit commit pending; no provider-confirmed checkpoint, live agent compliance, hosted validation, remote mutation, or parent #265 acceptance claimed. Runtime harness is the offline fresh creator apply/verify/noop and `start.mjs` WORK fixture; a live agent/provider run is N/A under the local-only authorization.
- Documentation families: technical and constraints changed in `docs/determinism.md` and the checker; local Git revision evidence is pending commit. Architecture and business are unaffected: no boundary or business source changed. No external propagation/publication claim.
- Review workload: 200 authored additions plus deletions before this evidence update (excluding 86 emitter-generated JS lines and 14 payload-lock lines), well below the ~400-line advisory target; re-count at commit.
- Rollback: revert only the #272 checker, tests, documentation, generated runtime/payload lock if affected, and this local projection; leave #269/#270 routes and policy untouched.
- Ask on risk: stop for an unresolved product-authority decision or an unreviewable over-budget work unit; parent chooses delivery slicing/exception before any PR.

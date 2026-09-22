# Issue #124: OpenCode Startup Session Isolation

## Tracker mirror

- Tracker: GitHub issue #124 (approved).
- Status: `ACTIVE`.
- Current phase: `EVIDENCE/DELIVERY`.
- Branch: `fix/issue-124-opencode-race`.
- Base: `origin/main` at `f0b7db107fea18b15498d793dbec1a2a6c7cc910`.

## Problem and scope

The OpenCode startup plugin keeps one shared pending startup promise. When two
sessions start concurrently, one session can consume another session's startup
output or suppress it entirely.

This change is limited to the OpenCode startup adapter and focused concurrency
tests. The existing consent behavior and every other adapter remain unchanged.

## Acceptance criteria

1. Startup output is stored and delivered by OpenCode session ID.
2. Each session receives only its own startup output.
3. A session's startup output is appended at most once, including concurrent
   message hooks.
4. The focused test controls completion order for two sessions and proves the
   isolation and exactly-once contract.
5. A rejected startup is handled before a message hook runs and is reported as
   that hook's controlled failure without an unhandled Node rejection.
6. Duplicate `session.created` events for one session invoke startup once.

## Plan

1. Replace the shared pending state with session-scoped startup state.
2. Claim and remove a session's startup state before awaiting it.
3. Contain startup rejection in the session state and rethrow it only from the
   claimed message hook.
4. Add deterministic concurrency, rejected-startup, and duplicate-session
   regression tests.
5. Run focused tests, typecheck, and applicable repository checks before
   delivery.

## Evidence to resume

The source boundary is `hooks/opencode/factory-start.ts`. OpenCode documents
the `session.created` event as carrying a session ID and the `chat.message`
hook input as carrying `sessionID`.

## Completed work and verification

- Replaced the adapter's shared promise and pending flag with a startup promise
  map keyed by session ID.
- The message hook removes its session entry before awaiting, so concurrent
  hooks cannot append the same output twice.
- Added a controlled two-session regression test with reversed completion order
  and a duplicate message hook for the first session.
- Stored a settled startup result so a rejected startup is handled immediately,
  then rethrown only by the matching message hook after it claims the entry.
- Added regressions for rejected startup under strict Node rejection handling
  and duplicate `session.created` events invoking startup exactly once.
- Passed `node --unhandled-rejections=strict --test
  test/opencode-startup.test.mjs` (3 tests), `NODE_OPTIONS=--unhandled-rejections=strict
  pnpm test` (51 tests), `pnpm typecheck`, `python3
  scripts/check-determinism.py`, and `git diff --check`.

## Next action

Review pull request #154 and close #124 after the required review gates pass.

## Delivery record

- Work-unit commit: `2060516 fix(opencode): isolate concurrent startup sessions`.
- Pull request: https://github.com/eff3ct0/factory-template/pull/154.
- Review workload: 166 authored additions and deletions across the complete
  work unit, below the 400-line limit.

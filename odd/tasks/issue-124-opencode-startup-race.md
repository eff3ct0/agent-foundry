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

## Plan

1. Replace the shared pending state with session-scoped startup state.
2. Claim and remove a session's startup state before awaiting it.
3. Add a deterministic concurrency regression test.
4. Run focused tests, typecheck, and applicable repository checks before
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
- Passed `pnpm test` (49 tests), `pnpm typecheck`, `python3 init.py
  --self-check`, `python3 start.py --self-check`, `node start.mjs --self-check`,
  `python3 scripts/check-factory-layout.py`, `python3
  scripts/check-determinism.py`, `python3 scripts/check-delivery-contract.py`,
  `python3 test_init.py`, `python3 test_factory_bootstrap.py`, and `git diff
  --check`.

## Next action

Review the bounded diff, create the conventional work-unit commit, push this
branch, and open the issue-linked bug-fix pull request.

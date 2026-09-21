# Issue #98 — Real-agent journey failure reporting

**What**: Define and deliver canonical, deduplicated GitHub bug reporting for failed real-agent journeys.
**Why**: Approved issue #98 requires failure evidence to become one safe canonical GitHub issue rather than manual artifact discovery.
**Where**: `scripts/real-agent-journey.py`, `scripts/test-real-agent-journey.py`, `.github/workflows/real-agent-journey.yml`, and `docs/real-agent-journey.md`.

## Status

`ACTIVE` — feature branch chain selected. The tracker is a no-merge integration branch; child slice 1 is the active delivery work unit.

## Scope

In: bounded failure taxonomy and evidence aggregation; deterministic fingerprinting; open/closed duplicate lookup; canonical bug-form issue creation or a single occurrence comment; mutation readback; deterministic fallback when advisory triage is absent or unsafe; redaction; workflow integration; focused offline tests and documentation.

Out: hosted journey execution; live issue/comment mutations in tests; runtime catalog/manual UI (#96); release/manual trigger wiring (#97); and missing journey adapters (#95).

## Acceptance criteria

- Always run a report job using bounded stage artifacts and emit redacted run, source revision, runtime, generated repository, earliest failed stage, cleanup status, workflow URL, and artifact URL.
- Fail closed for every listed stage/readback/malformed/timeout/cancellation condition; independent readback overrides an agent success claim.
- Fingerprint immutable source revision, runtime, stage, failure code, and check identifier; search open and closed issues before mutation.
- Create a bug-form issue with `type:bug` or add at most one canonical occurrence comment; read every mutation back.
- Do not publish for a passing journey or duplicate an existing fingerprint.
- Keep advisory triage optional, bounded, untrusted, validated, and deterministic on fallback.
- Redact secrets, prompts/responses, private paths/addresses, and untrusted diagnostic instructions while preserving cleanup recovery evidence.

## Checks

- Focused offline contract/reporter/redaction tests, including duplicate-comment, new-issue, deterministic fallback, malformed evidence, and mutation readback failure fixtures.
- Workflow/action-pin validation: `python3 scripts/check-bootstrap-workflow.py`.
- Applicable repository offline checks and the Definition of Done before delivery.
- Hosted failure-path validation is explicitly out of scope for this session; no hosted journey or live issue/comment mutation is authorized.

## Route evidence

- GitHub issue #98 is open, labeled `status:approved` and `type:product`; authenticated viewer permission is `ADMIN`.
- Isolated worktree: `/home/steam/git/project-archetype-worktrees/issue-98-journey-reporting` on `feat/issue-98-journey-reporting`, fresh at `origin/main` `f0b7db107fea18b15498d793dbec1a2a6c7cc910`.
- CodeGraph exploration was unavailable despite a local directory check, so targeted normal-file inspection is the approved fallback.
- Current report job only collects/uploads `evidence/journey.json` with `actions: read` and `contents: read`; it lacks `issues: write` and reporter mutation behavior.

## TDD mode source

`templates/agent-runbook.md` requires `IMPLEMENTATION -> TESTING/TDD -> VERIFICATION`, with applicable tests passing before verification. Use focused offline fixture-first tests; no hosted mutation test.

## Feature branch chain

Forecast: approximately 500–620 authored changed lines (bounded reporter implementation and tests: 390–480; workflow permissions/invocation: 35–55; documentation and ownership registration: 40–85). This exceeds the ~400-line single-PR limit.

Strategy: `feature-branch-chain` (user-authorized). The tracker branch `feat/issue-98-journey-reporting` is based on `origin/main` `f0b7db107fea18b15498d793dbec1a2a6c7cc910` and has a draft tracker PR to `main`. Child slice 1 targets that tracker; later slices target their immediate preceding child branch.

| Slice | Branch | Boundary | Forecast | Status |
|---|---|---|---:|---|
| Tracker | `feat/issue-98-journey-reporting` | ODD plan and ownership classification only | <100 | Active |
| 1 | `feat/issue-98-journey-reporting-01-contract` | Side-effect-free bounded evidence, fingerprint, and bug-body contract with offline tests and documentation | 260–340 | Active |
| 2 | TBD | GitHub duplicate lookup/mutation/readback, workflow wiring, and operational documentation | 180–260 | Deferred |

Slice 1 must not read or mutate GitHub, invoke workflows, or wire workflow permissions. Slice 2 owns all report-side GitHub interaction and workflow changes.

## Ownership classification

This ODD tracker is archetype-governance state and is registered as a `removed` path in `archetype-ownership.json`; it must not survive template initialization.

## Delivery evidence

- Tracker commit: `bd6dfda708191bb4de7c8becf98fb4df372a13f1` (`chore(odd): establish issue 98 feature chain`).
- Draft tracker PR: [#132](https://github.com/eff3ct0/factory-template/pull/132), targeting `main` with exactly `type:feature`.
- Tracker verification: `python3 -m json.tool archetype-ownership.json` and `python3 init.py --self-check` passed; PR readback confirmed 66 additions, 0 deletions, and 2 changed files.

## Slice 1 execution

- Worktree and branch: `issue-98-journey-reporting-01-contract` on `feat/issue-98-journey-reporting-01-contract`, based on tracker commit `3a294267a3dd1c7734451c77f2d98ed835a6208c`.
- Active boundary: define a pure reporting contract that normalizes failed journey evidence, calculates a deterministic fingerprint, and builds a validated bug-form body.
- Verification plan: focused offline reporting-contract tests, `python3 scripts/real-agent-journey.py --self-check`, ownership-boundary validation, and a child diff count below 400 authored lines.
- Explicit exclusion: no GitHub API calls or mutation/readback behavior, no workflow modifications, and no hosted validation in this slice.

### Completed verification

- Delivered a pure `build_bug_report` contract for failed aggregate evidence, including bounded normalization, first failed-stage selection, deterministic fingerprints, and bug-form validation.
- Added offline coverage for deterministic payload construction, earliest-stage selection, pass suppression, malformed identity/runtime/failure/cleanup evidence, and unsafe artifact URLs.
- Passed: `python3 scripts/test-real-agent-journey.py`; `python3 scripts/real-agent-journey.py --self-check`; `python3 init.py --self-check`; `python3 test_init.py`; `python3 scripts/check-bootstrap-workflow.py`; and `python3 scripts/check-determinism.py`.
- Runtime harness: N/A — slice 1 deliberately has no external read, mutation, or workflow invocation boundary.
- Rollback boundary: remove the reporting-contract functions, focused tests, and documentation section without changing journey aggregation or any workflow.
- Next action: commit, push, and open the non-draft slice 1 PR to tracker PR #132; slice 2 retains all GitHub interaction and workflow work.

## Next action

Create and verify the tracker commit and draft tracker PR, then implement only child slice 1 from the tracker branch. Record the child commit, tests, diff budget, and PR in this tracker before beginning slice 2.

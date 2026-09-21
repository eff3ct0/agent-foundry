**What**: Define the approved #110 migration of governance, triage, and reporting automation from Python to TypeScript/Node.
**Why**: Issue #110 requires behavior-preserving Node ports with fail-closed trust, mutation, and reporting boundaries; its delivery guard requires a line forecast before implementation.
**Where**: `odd/tasks/issue-110-governance-node.md`; planned implementation scope includes governance, delivery-contract, release-reference, label-sync, bootstrap triage/reporting scripts, their tests, consumers, and workflows.
**Learned**: CodeGraph is not indexed in this worktree, so normal file inspection is the permitted fallback. The current six primary Python implementations contain 1,886 lines before their test, workflow, and consumer integration changes.

# ODD task: Issue #110 governance, triage, and reporting Node port

## Status

- Ticket: [#110](https://github.com/eff3ct0/factory-template/issues/110)
- State: `ACTIVE` in `EVIDENCE/DELIVERY` for Child 01; tracker PR #134 remains draft/no-merge
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-110-governance-node`
- Branch: `feat/issue-110-governance-node`
- Base: fresh `origin/main` at `f0b7db1`
- Delivery strategy: Feature Branch Chain. The tracker targets `main` as a draft/no-merge integration branch; each child targets its immediate chain parent.

## Scope

### In scope

- Port PR governance, delegated-delivery contract validation, release-reference validation, and GitHub label synchronization to TypeScript/Node.
- Port bootstrap-failure triage and reporting, including schema checks, sanitization/redaction, bounded evidence, fingerprints/deduplication, bug-form validation, target verification, and mutation readback.
- Update affected workflows, scripts, and tests so active paths invoke Node rather than repository Python.
- Preserve provider-aware behavior after the authoritative #99/#100 migrations without implementing competing policy.

### Out of scope

- Resolving #99 or #100, changing protected-label authority, adding governance products, or changing bootstrap project-generation E2E.
- Any live GitHub mutation other than the user-authorized branch push and PR creation, which remain prohibited while this delivery guard is blocked.

## Acceptance criteria

1. Equivalent or stricter Node validation for PR governance, delivery contracts, release references, and label synchronization.
2. Equivalent or stricter Node triage/reporting safeguards for bounded evidence, redaction, model output, deduplication, issue form validation, and target-host readback.
3. Fail closed for untrusted pull-request data, permissions, protected labels, external model output, network ambiguity, and unknown mutation outcomes.
4. Preserve tracker-specific governance and do not require GitHub Issues for non-GitHub trackers.
5. Keep JSON/data on stdout, diagnostics on stderr, stable ordering, versioned envelopes, and non-zero error exits.
6. Workflows invoke package scripts or compiled Node entrypoints only for these paths, with pinned runtime and dependency inputs.
7. Add offline contract fixtures and bounded hosted-readback tests for each outward mutation.

## Route evidence

- `gh issue view 110 --repo eff3ct0/factory-template` returned an open issue with `status:approved` and `type:product` labels.
- The issue explicitly depends on #105 and #107, both represented in the fresh `origin/main` baseline used for this worktree.
- `AGENT.md`, `docs/bindings.md`, `MAINTAINERS.md`, and `templates/agent-runbook.md` were read before implementation planning.
- The repository PR template is `.github/pull_request_template.md`; its `<TICKET_ID>` placeholder must be replaced and exactly one `type:*` label applied if delivery becomes eligible.
- The user explicitly authorized GitHub access only to `github.com/eff3ct0/factory-template`, limited to pushing this branch and creating its resulting PR.

## TDD mode source

- `docs/engineering-handbook.md` declares `TDD policy: <TDD_POLICY>` and therefore provides no concrete repository TDD mode.
- The issue requires offline contract fixtures and focused replay cases. The implementation baseline would therefore be behavior-first regression tests: add a failing Node contract fixture for each migrated boundary, implement the smallest passing port, then run the focused Node tests.

## Required checks

- `pnpm typecheck`
- Focused Node tests for governance, delivery-contract, release-reference, label-sync, triage, and reporting.
- Replays for accepted/rejected GitHub and Jira PR fixtures, protected-label evidence, malformed model output, redaction, duplicate fingerprints, permissions, 4xx rejection, 5xx/timeout ambiguity, and readback mismatch.
- Workflow syntax/pin validation and an active-workflow search proving affected commands invoke Node only.
- Repository Definition of Done and applicable offline ownership/determinism checks.
- Hosted mutation checks are not authorized for this task; use bounded mock/readback fixtures rather than live label sync or reporting mutations.

## Delivery forecast

The issue exceeds the approximately 400 authored-line review heuristic before implementation.

| Work unit | Forecast changed lines | Basis |
| --- | ---: | --- |
| Governance port and fixtures | 650-900 | Replaces 227 Python lines; adds Node entrypoint, provider fixtures, and workflow adaptation. |
| Delivery-contract port and fixtures | 1,050-1,350 | Replaces 497 Python lines; contract checks and approval evidence need dedicated Node fixtures. |
| Release-reference and label-sync port | 350-500 | Replaces 95 Python lines; adds command protocol, tests, and workflow update. |
| Triage port and fixtures | 950-1,250 | Replaces 399 Python lines; preserves bounded sanitization, envelope, and model-output validation. |
| Reporter port and fixtures | 1,450-1,850 | Replaces 668 Python lines; preserves pagination, deduplication, issue-form, mutation classification, and readback behavior. |
| Consumer/workflow migration and Python removal | 900-1,250 | Updates bootstrap and real-agent consumers, workflows, determinism checks, ownership inventory, and test commands. |
| **Total** | **5,350-7,100** | Includes approximately 1,886 existing Python deletion lines plus estimated Node/tests/workflow additions. |

## Feature branch chain

The feature must integrate as one migration, so it uses a draft tracker rather than independently landing partial ports on `main`.

1. Tracker: `feat/issue-110-governance-node` -> `main`. Records the approved chain, ownership, and review boundaries; it does not implement a Node port.
2. Child 01: `feat/issue-110-governance-node-01` -> tracker. Ports the independently executable label-synchronization command, catalog validation, dry-run/self-check behavior, documentation, determinism consumer, and label workflow to Node. Current review budget: 297 authored changed lines. It deliberately excludes release-reference validation because its current consumers remain Python.
3. Child 02: release-reference validation with its Node consumer boundary and fixtures. Forecast: 260-360 lines after the affected consumers can move together.
4. Child 03: PR governance command, provider-aware contract fixtures, and workflow consumer. Forecast: 650-900 lines; split further only if one coherent command boundary fits.
5. Child 04: delivery-contract command and protected-approval fixtures. Forecast: 1,050-1,350 lines; split further only if one coherent command boundary fits.
6. Child 05: advisory bootstrap triage command and bounded-evidence/model-output fixtures. Forecast: 950-1,250 lines; split further only if one coherent command boundary fits.
7. Child 06: bootstrap failure reporter command, deduplication/readback fixtures, workflow consumers, and final Python removal. Forecast: 1,450-1,850 lines; split further only if one coherent command boundary fits.

The first split is intentionally bounded: Child 01 is the only currently forecastable independently testable behavior below the 400-line budget. Every later forecast must be re-evaluated once its prerequisite boundary is available; no size exception is assumed.

## Completed tasks

- [x] Created an isolated worktree from fresh `origin/main` without touching the dirty source checkout.
- [x] Verified #110 approval/scope and repository contracts.
- [x] Inspected the six primary Python implementations and their consumers; recorded the concrete line forecast.
- [x] Selected the user-authorized Feature Branch Chain and recorded the tracker plus coherent first-child boundary.
- [ ] Commit, push, and open the draft tracker PR with its ownership classification.
- [x] Implemented and independently verified Child 01 within the 400-line budget; staged diff including this evidence update remains below the limit.

## Resume condition

Commit and push Child 01, then open a non-draft PR to `feat/issue-110-governance-node` with tracker PR #134 in Chain Context.

## Child 01 verification evidence

- `pnpm typecheck` passed.
- `node --test test/sync-github-labels.test.mjs` passed: 3 tests, 0 failures.
- `pnpm build` passed and regenerated the checked-in payload integrity lock.
- `python3 init.py --self-check` and `python3 scripts/check-determinism.py` passed after the determinism check switched from the removed Python module to the Node command.
- `git diff --check` passed. `python3 init.py --check` remains intentionally inapplicable to the uninitialized template source because it reports required placeholders.

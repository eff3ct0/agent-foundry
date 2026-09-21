**What**: Define the approved #110 migration of governance, triage, and reporting automation from Python to TypeScript/Node.
**Why**: Issue #110 requires behavior-preserving Node ports with fail-closed trust, mutation, and reporting boundaries; its delivery guard requires a line forecast before implementation.
**Where**: `odd/tasks/issue-110-governance-node.md`; planned implementation scope includes governance, delivery-contract, release-reference, label-sync, bootstrap triage/reporting scripts, their tests, consumers, and workflows.
**Learned**: CodeGraph is not indexed in this worktree, so normal file inspection is the permitted fallback. The current six primary Python implementations contain 1,886 lines before their test, workflow, and consumer integration changes.

# ODD task: Issue #110 governance, triage, and reporting Node port

## Status

- Ticket: [#110](https://github.com/eff3ct0/factory-template/issues/110)
- State: `ACTIVE` in `EVIDENCE/DELIVERY`; Child 06c cuts static workflow and determinism consumers over to the Node reporter while retaining Python compatibility paths.
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-110-governance-node-06c-reporter-cutover`
- Branch: `feat/issue-110-governance-node-06c-reporter-cutover`
- Base: `origin/feat/issue-110-governance-node-06b-reporter-adapter` at `d5d27fe`
- Delivery strategy: Feature Branch Chain. The tracker targets `main` as a draft/no-merge integration branch; each child targets its immediate chain parent.

## Scope

### In scope

- Port PR governance, delegated-delivery contract validation, release-reference validation, and GitHub label synchronization to TypeScript/Node.
- Port bootstrap-failure triage and reporting, including schema checks, sanitization/redaction, bounded evidence, fingerprints/deduplication, bug-form validation, target verification, and mutation readback.
- Update affected workflows, scripts, and tests so active paths invoke Node rather than repository Python.
- Preserve provider-aware behavior after the authoritative #99/#100 migrations without implementing competing policy.

### Out of scope

- Resolving #99 or #100, changing protected-label authority, adding governance products, or changing bootstrap project-generation E2E.
- Protected-approval cutover or any live GitHub mutation beyond the user-authorized branch push, PR creation, and existing-label application.

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
4. Child 03: PR governance command, provider-aware contract fixtures, and workflow consumer. The maintainer explicitly accepted a one-child `size:exception` of 430-520 authored changed lines: splitting its command, provider fixtures, and trusted workflow consumer would leave a non-verifiable governance boundary.
5. Child 04: structural delivery-contract command, fixtures, Node consumers, and deterministic integrity. The user explicitly accepted `size:exception` for its 480-600 authored-line boundary because the command, provider fixtures, generated-payload registration, and consumers must remain verifiable together. Protected-approval cutover remains a separate follow-up.
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
- [x] Implemented Child 02's Node release-reference validator, Python consumer boundary, workflow runtime setup, and ownership registration.

## Child 03 implementation boundary

- `scripts/check-pr-governance.mjs` is the authoritative Node validator for the GitHub and provider-native PR contract; the replaced Python command is removed with this complete consumer migration.
- The provider fixtures cover GitHub close references and approval readback, plus Jira/Linear native references that must not query GitHub.
- The trusted `pull_request_target` workflow pins Node.js 20.19.0 and checks out the trusted PR base SHA before loading the validator or bindings. PR event metadata is validation data only; untrusted PR files cannot replace the required `validate` check's code or provider binding. The job has no write permissions or persisted checkout credentials.
- Accepted exception: the coherent command, fixtures, workflow, local consumers, ownership registration, and payload mirror are reviewed together at 430-520 authored changed lines; breaking this boundary would make the fixtures or workflow unverified in isolation.

## Child 01 verification evidence

- `pnpm typecheck` passed.
- `node --test test/sync-github-labels.test.mjs` passed: 3 tests, 0 failures.
- `pnpm build` passed and regenerated the checked-in payload integrity lock.
- `python3 init.py --self-check` and `python3 scripts/check-determinism.py` passed after the determinism check switched from the removed Python module to the Node command.
- `git diff --check` passed. `python3 init.py --check` remains intentionally inapplicable to the uninitialized template source because it reports required placeholders.

## Child 01 corrective-work-unit evidence

- The label-sync entrypoint now resolves the repository root from either `scripts/` or relocated `.factory/scripts/`, so initialized projects read `.github/labels.json` rather than `.factory/.github/labels.json`.
- The focused Node suite includes a relocated-layout regression and a static workflow contract for the pinned `actions/setup-node` runtime at Node.js 20.19.0, matching `package.json`'s minimum supported Node.js version.
- The payload integrity mirror is regenerated by `pnpm build` before delivery.

## Child 02 implementation boundary

- `scripts/release-ref.mjs` is now the authoritative release-reference validator. It exposes a JSON command boundary that preserves the existing Python consumers while moving the validation decision to Node.
- `scripts/release_ref.py` is intentionally retained only as a bounded compatibility bridge for the bootstrap harness and reporter; it invokes the Node validator without a shell and maps failures to the existing `ValueError` protocol.
- The release-only Node script is registered as `removed` in ownership and is deliberately excluded from the creator payload, matching the lifecycle of the release E2E automation.
- Bootstrap prepare, bootstrap, and reporter jobs pin Node.js 20.19.0 before paths that consume release references.

## Child 02 verification evidence

- `node --test test/release-ref.test.mjs` passed: 3 tests, including the Python consumer boundary.
- `python3 scripts/test-bootstrap-e2e.py`, `python3 scripts/test-bootstrap-triage.py`, and `python3 scripts/check-bootstrap-workflow.py` passed.
- `python3 scripts/bootstrap-e2e.py --self-check`, `python3 scripts/report-bootstrap-failure.py --self-check`, `python3 init.py --self-check`, and `python3 scripts/check-determinism.py` passed.
- `pnpm typecheck`, `node scripts/build-payload.mjs --write-lock`, `pnpm build`, and `git diff --check` passed. The generated payload lock changes only because `archetype-ownership.json` is itself a payload input; the release-only script remains absent from the payload declaration.

## Child 03 corrective trust-boundary verification evidence

- `node --test test/check-pr-governance.test.mjs` passed: 7 tests, including the dedicated Linear binding fixture and a regression that supplies altered PR-side validator and bindings while asserting the required workflow checks out only `github.event.pull_request.base.sha`.
- `node scripts/check-pr-governance.mjs --self-check`, `pnpm typecheck`, and `git diff --check` passed.
- `node scripts/build-payload.mjs --write-lock`, `pnpm build`, and `python3 scripts/check-determinism.py` passed; the payload mirror was regenerated before the determinism check.

## Child 04 delivery-contract boundary

- `scripts/check-delivery-contract.mjs` is the authoritative structural validator for required documents, local links, provider contracts, and CI recipe shape. Its offline fixtures preserve deterministic root-relative diagnostics.
- `scripts/check-delivery-contract.py --approval-self-check` remains the protected-approval authority until its separately scoped cutover; this slice does not change protected-label policy or perform a GitHub label mutation.
- The bootstrap and real-agent consumers invoke the Node structural command. Determinism repeats that command and the retained Python protected-approval fixture independently.
- Accepted exception evidence: the maintainer explicitly approved `size:exception` for the 480-600 authored-line cohesive work unit; splitting its command, fixtures, payload registration, and consumers would leave a non-verifiable delivery boundary.

## Child 04 corrective lifecycle boundary

- The initialized `--no-clean` lifecycle regression runs `node scripts/check-delivery-contract.mjs --self-check` for structural validation, then retains `python3 scripts/check-delivery-contract.py --approval-self-check` for the protected-approval fixture.
- This corrective work unit changes only validator dispatch; protected-approval policy and GitHub label mutation remain out of scope.

## Child 05a bounded evidence boundary

- `scripts/triage-bootstrap-failure.mjs` loads bounded JSON evidence, validates the versioned failure envelope and selected model, redacts untrusted diagnostics, and constructs the bounded payload and prompt for a later advisory client slice.
- The Python triage command, active consumers, workflows, model request/output handling, and reporting remain unchanged for Child 05b/05c.
- The Node fixture suite covers secret/path/instruction redaction, malformed envelope/model rejection, selected-model matching, payload construction, and prompt bounds offline.

## Child 05b advisory model boundary

- `scripts/triage-bootstrap-failure.mjs` adds a strict, stateless Responses request with a 30-second timeout, 300-token limit, bounded streamed response parsing, refusal handling, schema validation, and unsafe-output rejection.
- The CLI always writes a bounded success or deterministic fallback artifact; it exits non-zero on fallback. It has no workflow consumer in this child.
- The Python triage command and active workflows remain authoritative until the separately scoped Child 05c cutover.
- Verification passed: focused Node triage tests, full `pnpm test` (75 tests), retained Python triage checks, workflow static checks, `pnpm typecheck`, ownership/determinism self-checks, a local fallback CLI replay, and payload-mirror regeneration (no mirror delta because the release-only path was already registered).

## Child 05c active consumer cutover

- The release triage job pins Node.js 20.19.0 and invokes `scripts/triage-bootstrap-failure.mjs` through the existing `env -i` boundary, passing only `PATH`, `OPENAI_API_KEY`, and `OPENAI_MODEL` into the process.
- The artifact contract remains `bootstrap-e2e-triage/v1`, so the Python reporter continues to consume the same handoff without a reporting migration.
- Determinism and local smoke documentation now exercise the Node self-check and Node contract suites; the legacy Python triage test consumers are no longer part of the active verification path. The legacy Python implementation remains lifecycle-classified until Child 06 removes the final Python reporting/triage paths.
- Verification passed: `pnpm test` (76 tests), `pnpm typecheck`, workflow static validation, ownership/determinism and initializer self-checks, and a clean-environment fallback replay. The payload integrity mirror was regenerated after the ownership and determinism inputs changed.

## Child 06a reporter pure-contract boundary

- `scripts/report-bootstrap-failure.mjs` ports bounded evidence and triage loading, release identity/case validation, stable fingerprints and markers, bug-form validation, and deterministic release/template issue-body construction.
- This child makes no GitHub request, workflow change, consumer cutover, or Python removal; reporter pagination, deduplication, mutation, readback, and CLI integration remain a later coherent boundary.
- Offline fixtures replay invalid evidence and triage, cleanup failures, redaction, fingerprints/markers, and bug-form-compatible bodies. The Node reporter is registered as release-only ownership; the payload mirror is regenerated with its inventory change.

## Child 06b reporter GitHub adapter boundary

- `scripts/report-bootstrap-failure.mjs` now provides bounded GitHub HTTP, target verification, trusted Link-header pagination, run-scoped artifact links, canonical open/closed issue deduplication, and issue/comment mutation readback behind an injected-fetch adapter.
- Offline Node fixtures exercise pagination, unsafe pagination rejection, artifact discovery, canonical comment reporting, issue creation, and mutation readback. No CLI/workflow consumer changes, Python removal, or live GitHub mutation are included.
- The reporter remains release-only, so its changed source is excluded from the retained payload; `pnpm build` refreshes and verifies the payload mirror without adding this adapter.
- Verification: focused reporter fixtures (6 tests), full Node suite (82 tests), `pnpm typecheck`, `pnpm build`, and `python3 scripts/check-determinism.py` pass; the 222 changed lines remain within the 400-line child review budget.

## Child 06c reporter CLI and consumer cutover

- `scripts/report-bootstrap-failure.mjs` now provides the bounded reporter CLI: it reads sorted, size-limited evidence; derives status failures, release identity, fingerprints, and bug-form bodies; then invokes the injected-fetch adapter and emits a stable JSON outcome. A no-failure replay exits without a GitHub request.
- The release and template bootstrap report jobs pin Node.js 20.19.0 and invoke the Node CLI. Workflow static validation, determinism, and smoke-test documentation now consume the Node reporter; Python reporter files and compatibility tests remain intact for a later retirement slice.
- Verification: focused reporter suite (8 tests, including an offline failing-matrix CLI replay), full `pnpm test` (84 tests), `pnpm typecheck`, `pnpm build`, bootstrap-workflow static checks, determinism, and initializer self-check all pass. `package/payload-manifest.json` was regenerated after the documentation and ODD changes. The work unit changes 217 authored lines, below the 400-line budget.

## Child 06c reporter corrective boundary

- The active Node CLI now loads configured recipe names before validating evidence, accepts every non-passed matrix result, and rejects missing, malformed, or inconsistent evidence `OPENAI_MODEL` values, matching the retained Python reporter boundary.
- The focused CLI fixture writes a configured `python` matrix record with a non-passed result and proves it reaches the GitHub credential boundary rather than being rejected as an invalid case. The offline replay still proves no-failure reports perform no GitHub request.

## Child 06d Python triage retirement boundary

- The obsolete Python triage command and its dedicated legacy test module are retired after the completed Node triage consumer cutover. The Node triage command and both reporter implementations remain unchanged; Python reporter retirement is reserved for Child 06e.
- The `legacy_python_triage` ownership category is removed, and the payload integrity mirror is regenerated for the ownership-manifest change.
- Accepted exception evidence: the maintainer explicitly regularized `size:exception` for the actual cohesive Child 06d diff: 9 additions and 879 deletions (888 changed lines). This authorization replaces the earlier 500-620 forecast. The retirement, ownership cleanup, ODD evidence, and regenerated payload mirror must remain reviewable as one lifecycle boundary.

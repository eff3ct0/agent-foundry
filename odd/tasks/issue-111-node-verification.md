**What**: Define the #111 Node verification feature-branch chain, its complete Cartesian matrix, and the first packed-artifact identity slice.
**Why**: Issue #111 replaces inherited Python verification with exact package-based Node evidence while preserving a reviewable, fail-closed path above the completed #110 reporter-cleanup branch.
**Where**: `odd/tasks/issue-111-node-verification.md`; the existing `archetype_governance` ownership category already removes the complete `odd/` directory after initialization, so this tracker adds no retained payload asset.
**Learned**: The selected matrix is complete rather than pairwise: 4 CI recipes × 5 task providers × 5 secrets providers × 3 code-intelligence providers × 4 agent providers = 1,200 cases. Hosted execution remains blocked until a user explicitly authorizes the concrete resources.

# ODD task: Issue #111 Node verification

## Status

- Ticket: [#111](https://github.com/eff3ct0/factory-template/issues/111)
- State: `ACTIVE` in `EVIDENCE/DELIVERY` for Slice E1 local release-E2E evidence contract.
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-node-verification`
- Branch: `feat/issue-111-node-verification`
- Base: `origin/feat/issue-110-governance-node-06e-reporter-cleanup` at `f3f6d2b`
- Delivery strategy: Feature Branch Chain. The tracker is a draft/no-merge PR targeting the completed #110 Child 06e branch; every child targets its immediate chain parent.

## Scope

### In scope

- Define package-based Node verification boundaries, deterministic identity evidence, and the complete verification matrix.
- Deliver Slice A only: identity evidence for two independently packed tarballs, the package name/version, tarball digest, payload digest, and generated-tree digest.
- Keep identity checks local and offline; add tests alongside the contract they verify.

### Out of scope

- Workflow changes, hosted resources, and legacy Python cleanup.
- Publishing the package, GitHub Template migration, live provider mutations, or any non-local disposable resource.

## Complete Cartesian matrix

| Dimension | Values | Count |
| --- | --- | ---: |
| CI recipe | `rust`, `typescript`, `python`, `go` | 4 |
| Task provider | `custom`, `github-issues`, `github-projects`, `jira`, `linear` | 5 |
| Secrets provider | `custom`, `doppler`, `infisical`, `none`, `vault` | 5 |
| Code intelligence | `codegraph`, `custom`, `none` | 3 |
| Agent provider | `claude-code`, `opencode`, `codex`, `pi` | 4 |
| **Complete cases** | Cartesian product | **1,200** |

Each matrix case will create from an exact packed or published version and record bounded identity evidence. Local and hosted matrix execution are deferred; later hosted runs require a new explicit authorization that names the resource owner, resources, and operation.

## Acceptance criteria

1. The verification contract identifies the exact package name/version, tarball bytes, bundled payload, and generated project tree.
2. Two independently packed tarballs from the same source produce matching package/version, payload digest, and generated-tree digest evidence; each tarball digest is recorded and compared according to the transport contract.
3. Identity evidence is deterministic, bounded, machine-readable, and fails closed on absent, malformed, or mismatched inputs.
4. The complete 1,200-case matrix is recorded before later execution work begins.
5. No workflow, hosted resource, failure-injection suite, local matrix runner, or legacy Python cleanup is introduced by Slice A.

## TDD and verification approach

- Add focused Node fixtures for independently packed artifacts before adding the smallest identity contract that makes them pass.
- Run the focused package/identity test, `pnpm typecheck`, `pnpm build`, applicable deterministic checks, and `git diff --check` for Slice A.
- Tracker-only verification checks its ownership classification and whitespace. Hosted checks are not authorized and are therefore `N/A`.

## Feature branch chain

```text
origin/feat/issue-110-governance-node-06e-reporter-cleanup (PR #147)
  └── 📍 tracker: feat/issue-111-node-verification (draft)
       └── Slice A: feat/issue-111-artifact-identity
             └── Slice B: feat/issue-111-local-matrix (PR #150)
                  └── Slice C: feat/issue-111-workflow-contract
                         └── Slice D: feat/issue-111-delivery-approval
                               └── 📍 Slice E1: feat/issue-111-e1-evidence
                                     └── later: tarball runner, hosted execution, then legacy cleanup
```

1. Tracker: records the matrix, ownership, delivery order, and authorization boundary. It does not add verification runtime behavior.
2. Slice A: adds packed-artifact identity contract and two-tarball tests only.
3. Slice B: execute the complete local matrix through an injected local creator runner and prove corruption, partial-write, unknown-file, and malformed-evidence failures fail closed.
4. Slice C: port the workflow static checker and focused test suite to Node while retaining the Python checker and its existing consumers.
5. Slice D: port only the protected-approval self-check into the existing Node delivery-contract command with fixtures; retain Python and every workflow consumer.
6. Slice E1: add local command-result evidence capture, redaction, and serialized-size bounds without changing identity, matrix dimensions, runners, workflows, hosted resources, or Python.
7. Later slices: add a tarball runner, hosted resource coordination, and legacy cleanup only after separately scoped review and authorization.

## Delivery forecast

| Work unit | Forecast changed lines | Boundary |
| --- | ---: | --- |
| Tracker and matrix definition | 120-180 | ODD evidence only |
| Slice A: artifact identity and tests | 220-360 | Local package identity contract |
| Later matrix runner | 350-500 | Enumerates 1,200 cases without hosted resources |
| Later failure injection | 300-500 | Corruption, partial-write, cleanup, and evidence failures |
| Later workflows and hosted execution | 350-600 | Explicitly authorized resource lifecycle only |
| Later legacy cleanup | 150-300 | Remove superseded Python checks after parity evidence |

The tracker and Slice A are separate cohesive work units. Slice A must remain at or below the 400-line review budget; it contains its tests and identity documentation together.

## Slice C: Node workflow static-checker parity

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-workflow-contract`
- Branch: `feat/issue-111-workflow-contract`
- Base: `origin/feat/issue-111-local-matrix` (PR #150)
- Boundary: add `scripts/check-bootstrap-workflow.mjs` and focused Node contract tests that preserve checks for pinning, permission and credential isolation, cleanup, reporting, and real-agent workflow boundaries.
- Compatibility: retain `scripts/check-bootstrap-workflow.py`, its Python unit consumer, determinism consumer, and bootstrap E2E consumer. This slice adds a Node parity signal; it does not alter workflow execution, hosted lifecycle resources, or remove Python.
- Ownership: classify the Node checker as `archetype_only_release_e2e` so initialization removes it and the generated payload remains unchanged. Classify the existing Slice B `scripts/local-matrix.mjs` in the same category to restore the ownership-boundary check.
- Verification: `pnpm typecheck`; `pnpm test:workflow-contract` (14/14); `pnpm test` (104/104); Node and Python workflow checkers; `python3 scripts/test-bootstrap-e2e.py`; `python3 scripts/check-determinism.py`; `python3 init.py --self-check`; and `git diff --check` passed. `python3 init.py --check` is intentionally inapplicable in this placeholder source repository.
- Review budget: the maintainer explicitly approved `size:exception` for the cohesive 450-600-line static checker and parity-test work unit.

## Slice D: Node protected-approval self-check

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-delivery-approval`
- Branch: `feat/issue-111-delivery-approval`
- Base: `origin/feat/issue-111-workflow-contract` (PR #151)
- Boundary: add `--approval-self-check` and target-bound approval fixtures to `scripts/check-delivery-contract.mjs` only.
- Compatibility: retain `scripts/check-delivery-contract.py --approval-self-check`, all Python consumers, and all workflow behavior. Hosted work, E2E, workflow cutover, and Python retirement remain out of scope.
- Verification: focused Node delivery-contract tests, both Node CLI modes, the retained Python approval fixture, typecheck, repository tests, initializer self-check, and whitespace validation.
- Review budget: keep this cohesive command, fixtures, documentation, and payload-mirror work unit within 400 changed lines.

## Slice E1: local release-E2E evidence contract

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-e1-evidence`
- Branch: `feat/issue-111-e1-evidence`
- Base: `origin/feat/issue-111-delivery-approval` (PR #153)
- Boundary: add the versioned `release_e2e` evidence extension to each local matrix case. It captures at most eight command results with bounded names, commands, output, and exit codes; the existing identity envelope, matrix dimensions, case IDs, configurations, and `commands` list remain unchanged.
- Redaction and bounds: command evidence redacts token/credential values and literals plus private home and temporary paths before serialization. Each case extension is capped at 4 KiB and the complete matrix evidence at 1 MiB; unsafe, unknown, malformed, or oversized extensions fail closed.
- Compatibility: `schema_version: 1` matrix evidence without `release_e2e` remains valid. New matrix output adds a `release_e2e` object with its own `schema_version: 1`, so consumers can adopt the extension without an identity or matrix migration.
- Explicitly deferred: tarball runner execution, workflow changes, hosted resources, cleanup coordination, and Python changes.
- Payload mirror: `scripts/local-matrix.mjs`, its tests, and this ODD record are release-only or removed assets. Regenerate the payload mirror during verification; no payload entry changes unless a retained payload input changes.

## Route evidence

- `gh issue view 111 --repo eff3ct0/factory-template` returned an open issue with `status:approved` and `type:product` labels.
- `gh pr view 147 --repo eff3ct0/factory-template` confirmed the completed #110 Child 06e branch is open and based on its integrated Child 06d parent.
- `AGENT.md`, `docs/bindings.md`, `MAINTAINERS.md`, and `templates/agent-runbook.md` were read before planning.
- The repository PR template is `.github/pull_request_template.md`; each PR replaces the ticket placeholder, carries exactly one `type:*` label, and includes Chain Context.
- The user authorized pushes and PR creation only for this #111 feature-branch chain; no merge, hosted resource, or other remote operation is authorized.

## Completed tasks

- [x] Created an isolated tracker worktree from `origin/feat/issue-110-governance-node-06e-reporter-cleanup` without changing the dirty source checkout.
- [x] Verified issue approval, parent PR state, package payload baseline, and the ownership classification of `odd/`.
- [x] Selected and recorded the complete 1,200-case Cartesian matrix and the hosted-resource authorization boundary.
- [x] Committed, pushed, and opened draft tracker PR #148 targeting the #147 branch.
- [x] Created Slice A from the tracker and implemented only the packed-artifact identity contract and tests.

## Slice A: packed-artifact identity

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-artifact-identity`
- Branch: `feat/issue-111-artifact-identity`
- Base: `feat/issue-111-node-verification` at `28a18ce`
- Boundary: `scripts/artifact-identity.mjs` returns a versioned local identity envelope for an installed packed artifact and its generated project tree.
- Identity fields: package name/version, `tarball_digest`, `payload_digest`, and `tree_digest`; each digest is SHA-256 and the tree digest includes sorted relative paths, file modes, sizes, and content digests.
- Fixture: two independent `pnpm pack --ignore-scripts` tarballs are installed offline, create equivalent projects through the installed CLI, and must produce equal complete identity envelopes.
- Ownership: `scripts/artifact-identity.mjs` is release/template verification-only and is classified as `removed`; it is excluded from the creator payload. The payload lock changes only because `archetype-ownership.json` is a payload input.
- Verification: `node --test test/package.test.mjs` passed (6/6); `pnpm typecheck`, `pnpm test` (85/85), `python3 scripts/check-determinism.py`, and `git diff --check` passed.
- Explicitly deferred: local matrix runner, failure injection, workflows, hosted resources, and legacy Python cleanup.

## Resume condition

### Slice B: local Cartesian matrix and fault fixtures

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-local-matrix`
- Branch: `feat/issue-111-local-matrix`
- Base: `origin/feat/issue-111-artifact-identity` (PR #149)
- Boundary: `scripts/local-matrix.mjs` enumerates and executes all 1,200 local cases with a caller-supplied runner, writes bounded machine-readable evidence, and supplies an installed-creator adapter without provisioning hosted resources.
- Failure fixtures: corrupt payload bytes, mismatched payload digest, partial project write, unknown payload file, and malformed matrix evidence each fail closed in focused Node tests.
- Explicitly deferred: workflow cutover, hosted lifecycle/resources, and legacy Python removal.

## Resume condition

Run the focused matrix and repository verification gates, then commit, push, and open the Slice B child PR targeting PR #149. Do not provision hosted resources or modify workflows without a new explicit authorization.

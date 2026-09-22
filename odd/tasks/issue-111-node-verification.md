**What**: Define the #111 Node verification feature-branch chain, its complete Cartesian matrix, and the first packed-artifact identity slice.
**Why**: Issue #111 replaces inherited Python verification with exact package-based Node evidence while preserving a reviewable, fail-closed path above the completed #110 reporter-cleanup branch.
**Where**: `odd/tasks/issue-111-node-verification.md`; the existing `archetype_governance` ownership category already removes the complete `odd/` directory after initialization, so this tracker adds no retained payload asset.
**Learned**: The selected matrix is complete rather than pairwise: 4 CI recipes × 5 task providers × 5 secrets providers × 3 code-intelligence providers × 4 agent providers = 1,200 cases. Hosted execution remains blocked until a user explicitly authorizes the concrete resources.

# ODD task: Issue #111 Node verification

## Status

- Ticket: [#111](https://github.com/eff3ct0/factory-template/issues/111)
- State: `ACTIVE` in `EVIDENCE/DELIVERY` for G3 provision-and-proof.
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-g3-provision-proof`
- Branch: `feat/issue-111-g3-provision-proof`
- Base: `origin/feat/issue-111-g2-release-prepare` at `3651b38`
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
                                       └── 📍 Slice E2: feat/issue-111-e2-installed-runner
                                             └── 📍 Slice E3: feat/issue-111-e3-orchestration
                                                    └── Slice F1: feat/issue-111-f1-read-client
                                                         └── Slice F2: feat/issue-111-f2-release-readback
                                                                └── Slice F3: feat/issue-111-f3-resource-proof
                                                                     └── Slice F4: feat/issue-111-f4-cleanup-recovery
                                                                           └── 📍 G0: feat/issue-111-g0-lifecycle-repair
                                                                                └── 📍 G1: feat/issue-111-g1-mutation-client
                                                                                       └── G2: feat/issue-111-g2-release-prepare
                                                                                            └── 📍 G3: feat/issue-111-g3-provision-proof
                                                                                                 └── later: hosted execution, then legacy cleanup
```

1. Tracker: records the matrix, ownership, delivery order, and authorization boundary. It does not add verification runtime behavior.
2. Slice A: adds packed-artifact identity contract and two-tarball tests only.
3. Slice B: execute the complete local matrix through an injected local creator runner and prove corruption, partial-write, unknown-file, and malformed-evidence failures fail closed.
4. Slice C: port the workflow static checker and focused test suite to Node while retaining the Python checker and its existing consumers.
5. Slice D: port only the protected-approval self-check into the existing Node delivery-contract command with fixtures; retain Python and every workflow consumer.
6. Slice E1: add local command-result evidence capture, redaction, and serialized-size bounds without changing identity, matrix dimensions, runners, workflows, hosted resources, or Python.
7. Slice E2: add only the local exact-tarball installed-runner boundary; hosted resource coordination and legacy cleanup remain later separately scoped work.

## Slice E2: exact-tarball installed-runner boundary

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-e2-installed-runner`
- Branch: `feat/issue-111-e2-installed-runner`
- Base: `origin/feat/issue-111-e1-evidence` (PR #155)
- Boundary: add a local CLI/helper that accepts only a regular `.tgz`, installs that exact file with `npm --offline --ignore-scripts`, resolves the installed package CLI, and runs `apply` with an allowlisted environment.
- Evidence: derive the packed artifact identity and fail closed unless the installed creator produces a successful, verified JSON `apply` envelope for the requested target.
- Verification: one focused real installed-CLI test packs the artifact, calls the helper, and asserts the creator result plus all identity digests. Matrix orchestration, workflow changes, hosted resources, and Python retirement remain out of scope.
- Evidence: `pnpm typecheck`, `pnpm test:installed-runner` (1/1), `pnpm test:local-matrix` (7/7), `pnpm test` (108/108), `python3 scripts/check-determinism.py`, `python3 init.py --self-check`, and `git diff --check` passed. The payload mirror was regenerated because the ownership manifest is itself a payload input.

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

## Slice E3: full local release-E2E orchestration

- Worktree: `/home/steam/git/project-archetype-worktrees/issue-111-e3-orchestration`
- Branch: `feat/issue-111-e3-orchestration`
- Base: `origin/feat/issue-111-e2-installed-runner` (PR #158)
- Boundary: `pnpm release-e2e:local -- --output <evidence-directory>` packs one local artifact, executes exactly 1,200 real installed-creator cases through the E2 runner, and writes `matrix-evidence.json`; the first result is reused during matrix iteration rather than rerun.
- Failure contract: every case runs after a case failure; bounded E1 command evidence and failure text are redacted and validated for all 1,200 records before the evidence file is written and the command exits non-zero.
- Compatibility: the full real-install command is explicit and excluded from the default unit suite. It does not change workflows, provision hosted resources, or retire Python.

## Slice F1: bounded hosted-lifecycle read client

- Boundary: `scripts/hosted-lifecycle-read-client.mjs` is an injected-transport-only, GET-only client for guarded relative GitHub API endpoints. It has no default transport and therefore cannot make a live request by itself.
- Safety: every request has a 30-second abort signal; serialized requests are capped at 16 KiB and streamed responses at 64 KiB. Only successful JSON objects are accepted.
- Failure contract: timeout, network, and 5xx responses normalize once to `indeterminate/read_indeterminate`; no retry path exists. Rejected and malformed responses expose stable codes only, never a token or transport diagnostic.
- Ownership and payload: classify the helper as `archetype_only_release_e2e` so initialization removes it. It is not a payload entry; regenerate the manifest because the ownership inventory is a retained payload input.
- Verification: offline injected-transport tests cover endpoint guarding, GET ownership, abort configuration, both byte caps, JSON validation, normalized failures, no retries, and token redaction. No live GitHub request, hosted mutation, workflow change, provisioning, or cleanup is in scope.

## Slice F2: published-release readback

- Boundary: `scripts/release-readback.mjs` consumes only the F1 injected GET client to resolve a requested published release tag to a full immutable commit SHA.
- Safety: it verifies the release tag exactly, rejects draft or unpublished releases, reads only the tag reference endpoints, and dereferences at most five annotated tags before requiring a commit object.
- Failure contract: malformed payloads, tag/expected-SHA mismatches, and excessive nesting reject with stable codes; F1 indeterminate results remain `indeterminate/read_indeterminate` and stop further reads.
- Ownership and payload: classify the resolver as `archetype_only_release_e2e`; it remains excluded from the payload, while the payload manifest is regenerated for the retained ownership input.
- Verification: offline injected-transport tests cover lightweight and annotated tags, draft/unpublished releases, mismatches, malformed payloads, depth exhaustion, and indeterminate reads. No live GitHub request, mutation, workflow change, provisioning, or cleanup is in scope.

## Slice F3: run-scoped resource provisioning proof

- Boundary: `scripts/resource-provisioning-proof.mjs` uses only an injected GET client to produce a versioned proof for one canonical `bootstrap-e2e-<numeric-run-id>-<resource>` repository.
- Safety: it validates the requested owner, canonical name, visibility, template, release SHA, exact owner readback, and a positive immutable repository ID. It never infers ownership from a name or prefix.
- Failure contract: cross-run, cross-owner, visibility, template, repository-ID, and release-SHA mismatches reject with stable codes before a proof is emitted; indeterminate reads stop the proof.
- Ownership and payload: classify the helper as `archetype_only_release_e2e`; regenerate the payload manifest because its ownership inventory is a retained payload input.
- Verification: offline injected-client tests cover invalid names, mismatches, no further read after repository mismatch, and deterministic serialization. No live GitHub request, mutation, workflow, provisioning, or cleanup is in scope.

## G0: lifecycle 404 prerequisite repair

- Boundary: normalize the F1 read client's exact repository `404` response to `missing`, so F4 can return `already-absent` without treating the absence as an indeterminate recovery condition.
- Verification: add one offline F1-to-F4 integration test using the guarded injected transport; it proves the sole request is `GET /repos/<exact-target>` and a `404` produces `already-absent`.
- Ownership and payload mirror: register `scripts/resource-cleanup-eligibility.mjs` as `archetype_only_release_e2e` and regenerate `package/payload-manifest.json` because the retained ownership inventory is a payload input.
- Evidence: the focused F1/F4 suite passed 11/11; `pnpm typecheck`, `pnpm test` (132/132), `python3 scripts/check-determinism.py`, `python3 init.py --self-check`, and `git diff --check` passed. All transport use was injected and offline.
- Explicitly deferred: client transport changes beyond `404` semantics, workflow changes, hosted resources, provisioning, mutations, cleanup execution, and legacy cleanup.

## G1: bounded hosted-lifecycle mutation client

- Boundary: `scripts/hosted-lifecycle-mutation-client.mjs` exposes only two injected-transport operations: create one repository from one exact template, and delete one exact owner/name repository. It has no default transport and cannot make a live request by itself.
- Safety: creation sends only the fixed GitHub template payload (`owner`, `name`, `private: true`, and `include_all_branches: false`); deletion sends no body. Both operations validate ownership identifiers before transport, use a 30-second abort signal, cap serialized requests at 16 KiB and responses at 64 KiB, and contain no retry path.
- Failure contract: network, timeout, and 5xx outcomes return only `indeterminate/mutation_indeterminate`; malformed successful responses and all other unexpected statuses reject with stable, token-free codes. Creation accepts only a JSON-object `201`; deletion accepts only an empty `204`.
- Ownership and payload: classify the helper as `archetype_only_release_e2e`, keep it out of the creator payload, and regenerate the payload manifest because the retained ownership inventory is a payload input.
- Verification: offline injected-transport fixtures cover exact routes and payload, ownership validation before transport, both byte caps, malformed success responses, normalized failures, no retries, and token redaction. No live GitHub request, workflow execution, provisioning, or repository deletion is performed by this slice.
- Evidence: `pnpm typecheck`, focused mutation-client tests (5/5), `pnpm test` (137/137), `python3 scripts/check-determinism.py`, `python3 init.py --self-check`, and `git diff --check` passed. All transport use was injected and offline.

## G2: offline release-prepare CLI

- Boundary: `scripts/release-prepare.mjs` accepts one repository, tag, expected immutable SHA, and offline readback fixture. It resolves the release only through the F2 resolver and emits the sorted CI recipe matrix from `ci/recipes.json`.
- Safety: the fixture client has no transport, credential, mutation, provisioning, cleanup, workflow, or hosted execution path. The command verifies the resolved SHA before matrix output and exposes no create or delete operation.
- Failure contract: every CLI outcome is one versioned JSON envelope. Readback rejections and indeterminate results preserve their F2 status and stable code; malformed arguments, fixtures, and recipe input return stable rejected codes with a non-zero exit.
- Ownership and payload: classify the command as `archetype_only_release_e2e`, exclude it from the generated payload, and regenerate `package/payload-manifest.json` because the retained ownership inventory is a payload input.
- Verification: offline fixtures cover a published release, deterministic recipe ordering, F2 indeterminacy, malformed arguments, and malformed fixtures. No live GitHub request, hosted resource, mutation, provisioning, cleanup, workflow cutover, or deletion is performed by this slice.

## G3: provision-and-proof composition

- Boundary: `scripts/resource-provision-and-proof.mjs` creates only the canonical private `bootstrap-e2e-<run-id>-<resource>` repository through the injected G1 mutation client, then proves it through the injected F3 exact readback client.
- Safety: all client, owner, template, run, resource, and SHA inputs are validated before mutation. There is no default transport, retry, repository listing, workflow, cleanup, or live fixture path.
- Proof ordering: the versioned F3 proof is serialized, stored, and read back before its schema, canonical serialization, scope, immutable ID, and branch are validated; a storage or validation failure returns `recovery-required`.
- Ownership and payload: classify this helper as `archetype_only_release_e2e`, exclude it from the creator payload, and regenerate the payload manifest because the ownership inventory is a retained payload input.
- Verification: offline injected-client and in-memory-store tests cover one exact creation, F3 routes, proof-before-validation ordering, readback rejection, tampered proof recovery, and pre-mutation boundary validation. No live repository is created.

- [x] Implemented the G3 canonical provision-and-proof composition with offline verification only.

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

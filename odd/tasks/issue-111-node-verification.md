**What**: Define the #111 Node verification feature-branch chain, its complete Cartesian matrix, and the first packed-artifact identity slice.
**Why**: Issue #111 replaces inherited Python verification with exact package-based Node evidence while preserving a reviewable, fail-closed path above the completed #110 reporter-cleanup branch.
**Where**: `odd/tasks/issue-111-node-verification.md`; the existing `archetype_governance` ownership category already removes the complete `odd/` directory after initialization, so this tracker adds no retained payload asset.
**Learned**: The selected matrix is complete rather than pairwise: 4 CI recipes × 5 task providers × 5 secrets providers × 3 code-intelligence providers × 4 agent providers = 1,200 cases. Hosted execution remains blocked until a user explicitly authorizes the concrete resources.

# ODD task: Issue #111 Node verification

## Status

- Ticket: [#111](https://github.com/eff3ct0/factory-template/issues/111)
- State: `ACTIVE` in `EVIDENCE/DELIVERY` for the feature-branch-chain tracker; Slice A resumes at `IMPLEMENTATION`.
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

- Local matrix execution, failure injection, workflow changes, hosted resources, and legacy Python cleanup.
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
            └── later slices: matrix runner, failure injection, workflow/hosted execution, legacy cleanup
```

1. Tracker: records the matrix, ownership, delivery order, and authorization boundary. It does not add verification runtime behavior.
2. Slice A: adds packed-artifact identity contract and two-tarball tests only.
3. Later slices: add a local matrix runner, failure injection, workflow/hosted resource coordination, and legacy cleanup only after separately scoped review and authorization.

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

Commit, push, and open the Slice A child PR targeting tracker PR #148. Do not execute any matrix case or provision any hosted resource without a new explicit resource authorization.

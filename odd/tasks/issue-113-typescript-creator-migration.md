**What**: Synchronize the #113 coordination ledger with the current checkout, the
dependency order, and the evidence required to complete the TypeScript creator
migration.
**Why**: #113 is the completion tracker for the migration from GitHub Template
creation and maintained Python automation to the exact-version Node creator. A
ledger entry must distinguish bytes present in this checkout from unverified
issue, merge, release, and hosted-E2E state.
**Where**: `odd/tasks/issue-113-typescript-creator-migration.md`.
**Learned**: The current checkout contains the creator and part of the Node
automation, but the final #111 verification chain and #112 Template-mode
cutover are not present in `HEAD`. The local package and payload identities are
deterministic; registry publication and exact-version `pnpm dlx`/`npx` evidence
are not available locally.

# ODD task: Issue #113 TypeScript creator migration

## Status

- Ticket: `#113` (the supplied issue body is the requirements input for this
  ledger; remote issue, PR, label, merge, and release state is not asserted).
- Current phase: `EVIDENCE/DELIVERY`.
- Migration state: `BLOCKED` for completion. The current checkout has
  implementation evidence for #101/#102 and #105-#110, but the final #111
  verification chain and #112 cutover evidence are not in `HEAD`.
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-113-tracker`.
- Branch: `feat/issue-113-tracker`.
- Base/current source: `origin/main` / `48933faf616701102dce77b24a9a2f95d5d75495`.
- Scope of this work unit: coordination documentation only. No application
  source, package payload, workflow, or #112 implementation path is changed.

## Dependency order

The migration order remains:

```text
#101 layout contract
  -> #102 layout implementation
  -> #105 immutable package payload
  -> #106 transactional creator
  -> #107 TypeScript composition
  -> #108 Node startup routing
  -> #109 Node GitHub provisioning
  -> #110 Node governance/triage/reporting
  -> #111 package-based verification and release evidence
  -> #112 final Template-mode cutover
```

No later issue is considered complete merely because a later branch or issue
body exists. A later step must consume the verified artifact and evidence from
its predecessor.

## Reconciled dependency ledger

Statuses below describe the local checkout and local refs only. They do not
claim that a GitHub issue is closed, a PR is merged, or a package is published.

| Issue | Dependency role | Evidence in or against this checkout | Ledger status |
| --- | --- | --- | --- |
| #101 | Defines the factory support boundary. | The reconciled layout implementation is in `HEAD` at `e0897e98334b7c552d05b22a602477555c21011` (`feat(layout): define factory support boundary (#127)`). | `PRESENT IN HEAD`; original issue state unverified. |
| #102 | Relocates factory assets during initialization. | The reconciled relocation implementation is in `HEAD` at `8538b4448a49ee8eff274d41a35860b96ddcc52e` (`feat(layout): relocate factory assets during initialization (#128)`). | `PRESENT IN HEAD`; original issue state unverified. |
| #105 | Supplies the immutable package payload and manifest identity. | `package/payload-manifest.json` declares `factory-template-creator@0.1.0`, payload `1.0.0`, and digest `sha256:0383c17f0690cf329049b6cd88eba5f7fceba8ede213dcdc83fd1428fc88008e`; implementation commit in `HEAD`: `de535c4befcc5b7a78462f5e8cb85aff6016fd3c`. | `PRESENT IN HEAD`; release publication unverified. |
| #106 | Provides transactional plan/apply/verify/doctor behavior. | `src/creator.ts` and `test/creator.test.mjs` are present in `HEAD`; implementation commit: `fe65a8d77d101f741e80c349a9e49655d7b6a289`. The focused creator behavior is covered by the passing Node suite. | `PRESENT IN HEAD`; package-consumer evidence is partial. |
| #107 | Composes language-neutral providers, CI, bindings, and ownership inputs. | `src/creator.ts`, provider catalogs, CI recipes, and the composition tests are present in `HEAD`; implementation commit: `faaef45f6fc046dc89014f1a494727420a16a7c4`. | `PRESENT IN HEAD`; final generated-project matrix evidence pending #111. |
| #108 | Makes Node `start.mjs` the canonical startup router. | `start.mjs`, the Python compatibility wrapper, and startup tests are present in `HEAD`; implementation commit: `5adf6a52fb57418fde4beeb7704ce3e8681a7f88`. | `PRESENT IN HEAD`; exact-version package bootstrap evidence pending. |
| #109 | Provides Node GitHub provisioning with fail-closed readback. | `src/github-provisioning.ts` and its tests are present in `HEAD`; implementation commit: `608875b4762dfbc384a7785fcc2a514d0c62bde4`. | `PRESENT IN HEAD`; hosted execution is not authorized or evidenced here. |
| #110 | Ports maintained governance, triage, and reporting paths to Node. | `HEAD` contains the Node governance, triage, reporter, release-reference, and label-sync paths in `48933faf616701102dce77b24a9a2f95d5d75495`. The current checkout still retains Python release/template and real-agent harness paths, so this is not the final #113 Node-only gate. | `PARTIAL`; residual Python automation blocks completion. |
| #111 | Proves package identity, matrix behavior, release readback, and cleanup/recovery. | The tracker ref `origin/feat/issue-111-node-verification` is not in `HEAD`; its tracker commit is `1f203806663dff593553951e0d948727b07fbaca`. The later `origin/feat/issue-111-h3-template-docs` ref is also not in `HEAD` (65 differing paths, including package verification and workflow files). | `BLOCKED / NOT IN HEAD`; no integrated final verification evidence. |
| #112 | Performs final Template-mode cutover after #111 evidence. | No dedicated #112 coordination artifact or cutover implementation is present in `HEAD`. The local `feat/issue-112-cutover` ref points to the same `48933fa` baseline; that ref name is not implementation evidence. | `BLOCKED / NO CUTOVER EVIDENCE`. |

## Package, source, payload, and release identity

### Recorded local identity

| Identity | Recorded value | Evidence boundary |
| --- | --- | --- |
| Source revision | `48933faf616701102dce77b24a9a2f95d5d75495` | `git rev-parse HEAD` in this checkout. |
| Package | `factory-template-creator@0.1.0` | `package.json`; Node `>=20.19.0`; `pnpm@12.4.2`. |
| Payload | `1.0.0`, `sha256:0383c17f0690cf329049b6cd88eba5f7fceba8ede213dcdc83fd1428fc88008e` | `package/payload-manifest.json`; `test/package.test.mjs` checks file bytes and manifest digest. |
| Independent local pack 1 | `sha256:2d2b5a1fa7d510f61cfbb4e30019a7c48501671b552586bf8e49e85bcaa61102` | `pnpm pack` from this source checkout. |
| Independent local pack 2 | `sha256:2d2b5a1fa7d510f61cfbb4e30019a7c48501671b552586bf8e49e85bcaa61102` | A second `pnpm pack` from the same source checkout; bytes matched pack 1. |

The two matching tarball digests prove a deterministic local pack for this
source revision. They do **not** prove npm publication, registry immutability,
an npm dist-tag, a release commit, or a hosted consumer installing the package.

### Required release evidence still missing

- An exact published package version and registry readback for that version.
- The published tarball digest and payload digest read back from the registry.
- Exact-version `pnpm dlx factory-template-creator@<version>` creation from an
  empty directory.
- Exact-version `npx --yes factory-template-creator@<version>` creation from a
  separate empty directory.
- Generated-tree digests from both package consumers and equality against the
  expected source/payload identity.
- Pre/post Template-mode readback proving the source revision and generated
  repository relationship across the final #112 cutover.

## Acceptance gate ledger

| Gate | Current evidence | State |
| --- | --- | --- |
| Node-only maintained automation | Governance, triage, reporting, and label paths use Node, but `.github/workflows/template-bootstrap-e2e.yml`, `.github/workflows/real-agent-journey.yml`, and related harnesses still invoke Python. | `BLOCKED`. |
| Language-agnostic generated projects | Payload/provider catalogs contain multiple language recipes and the creator is provider-neutral. | `PARTIAL`; complete #111 matrix evidence is not in `HEAD`. |
| Exact package version and digests | Package/payload versions and local pack digests are recorded above. | `PARTIAL`; registry evidence missing. |
| Exact `pnpm dlx` and `npx` bootstrap | No exact-version registry consumer run is available in this checkout. | `BLOCKED`. |
| Deterministic output and rerun `noop` | `pnpm test` passes the deterministic plan, apply/verify, and rerun assertions; the package test also checks packed npm transport offline. | `PRESENT LOCALLY`; final published-consumer proof pending. |
| Python absence from maintained tooling | Current workflow and harness searches still find maintained `python3` invocations, including `scripts/bootstrap-e2e.py` and real-agent journey paths. | `BLOCKED`. |
| Source mode without Template API | The creator documentation describes an offline payload source, but the current template harness still calls `POST repos/<template>/generate` in `scripts/bootstrap-e2e.py`. | `BLOCKED UNTIL #112`. |
| Pre/post Template-mode readback | Existing template harness readback is not the required final package-consumer cutover evidence. | `UNVERIFIED`. |
| Definition of Done | Required dependency, release, hosted-readback, and Python-removal evidence is incomplete. | `BLOCKED`; do not close #113. |

## Verification evidence for this ledger

Executed in this worktree without remote mutation:

- `python3 start.py` — passed; reported SELF/archetype development mode and
  explicitly prohibited `init.py`.
- `pnpm typecheck` — passed with pnpm `12.4.2`.
- `pnpm test` — passed: 87 tests, 0 failures. This includes creator
  determinism, rerun `noop`, payload integrity, and offline packed-package
  installation/startup coverage.
- Two independent `pnpm pack` runs — passed; both produced
  `factory-template-creator-0.1.0.tgz` with the matching digest recorded above.
- `git diff --check` and the ledger-specific checks are required before the
  local commit.

The following were intentionally not run: `init.py`, `pnpm dlx`/`npx` against a
published package, hosted Template API or GitHub mutations, release publication,
push, merge, PR creation, and deployment.

## Ordered next actions

1. Integrate and verify the #111 package/release evidence chain on top of the
   #110 Node baseline; retain exact package, source, payload, tarball, and
   generated-tree identities for every consumer.
2. Complete #112 only after #111 is green: replace the Template API bootstrap
   path with exact-version package creation, preserve pre/post Template-mode
   readback, and keep generated projects language-agnostic.
3. Remove or retire every maintained Python automation path only after the Node
   replacement has equivalent evidence; compatibility behavior in generated
   projects must be handled by the creator contract rather than a second
   maintained creator.
4. Re-run the full Definition of Done, then update this ledger with verified
   release and hosted evidence. Until then, #113 remains blocked and must not
   be marked complete.

## Delivery boundary

This work unit changes only this coordination artifact. It does not alter
application code, package payloads, workflows, release state, GitHub settings,
or any #112 implementation path. Remote operations are intentionally not
performed.

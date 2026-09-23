# Real-agent Journey Operations

The reusable workflow `.github/workflows/real-agent-journey-assertions.yml`
contains only independent readback and reporting. Provisioning and agent
invocation remain upstream responsibilities.

## Runtime Adapter Contract

[`scripts/real-agent-runtime-catalog.json`](../scripts/real-agent-runtime-catalog.json)
is the canonical runtime catalog. Each entry has a stable machine identifier,
display label, executable adapter path, pinned package/version, required
credential names, and support status. The current supported choice is
`codex-cli` (OpenAI Codex CLI), which installs `@openai/codex@0.148.0` and uses
`scripts/real-agent-journey-agent.mjs`. Disabled entries remain documented in
the catalog but cannot be selected or run.

Missing, malformed, unsupported, or disabled identifiers fail in `prepare`
before repository provisioning. The catalog is metadata only: it never stores
credential values and a runtime does not select a credential.

The four adapters are executable entry points, not placeholders:

- `scripts/real-agent-journey-provision.mjs` reads the source revision and uses
  the guarded Node GitHub API boundary to create and read back the exact empty
  `real-agent-journey-<run-id>` repository. It never calls GitHub Template mode.
- `scripts/real-agent-journey-agent.mjs` runs the existing cold Codex helper.
- `scripts/real-agent-journey-assert.mjs` independently reads GitHub and the
  generated checkout.
- `scripts/real-agent-journey-cleanup.mjs` verifies and deletes only the exact
  run-scoped repository.

Every adapter emits one bounded `real-agent-journey/v1` envelope. The parent
installs and invokes the selected supported entry through the catalog, without
constructing a shell command from the dispatch input.

## Inputs from the journey

The provisioning/invocation jobs publish two bounded JSON artifacts and call
the reusable workflow with their names:

- `metadata-artifact` contains exactly one `real-agent-journey/v1` object.
- `cleanup-artifact` contains the run-scoped cleanup object with `owner`,
  `run_id`, `status`, `deleted`, and `failures`.

The metadata object contains the source template and immutable `source_sha`,
the generated repository and default branch, the positive feature issue
number, the implementation branch and full commit SHA, explicit `bindings`,
ordered `ci_jobs`, documented check names/statuses, and the bounded
`test_command` string. It must not contain prompts, model responses, or
credentials. The generated repository name must be
`real-agent-journey-<run-id>-<case>` so ownership is independently checkable.

The assertion job uses the least-privilege `JOURNEY_READ_TOKEN` only for
GitHub readback and a fresh generated-repository checkout. It executes the
allowlisted documented checks and the supplied test command itself; metadata
claims cannot turn a failed check green. A feature issue must match
`.github/ISSUE_TEMPLATE/task.yml`, contain observable checkbox acceptance
criteria, and have no approval label.

## Evidence

The job publishes `real-agent-journey-evidence-<run-id>` for seven days. The
artifact contains only validated repository, run, issue, branch, commit,
checkout, check, test, workflow, and cleanup identifiers. Diagnostics are
bounded and redacted. The earliest failed boundary is recorded in
`source-readback`, `initialization`, `feature-issue`, `implementation`,
`checkout`, `test`, or `cleanup`; cleanup status is retained even when an
earlier assertion fails. Missing, malformed, timed-out, or mismatched
readback is a failure, never a successful report.
## Parent real-agent user journey contract

This is the parent orchestration contract for issue #87. It proves the user
journey only when the generated repository is used by a cold real agent. The
workflow supports manual dispatch, the retained nightly schedule, and published
releases.

## Quick path

1. Dispatch **Real-agent user journey**, wait for its nightly schedule, or
   publish a release.
2. The workflow creates a run-scoped empty private repository through the
   guarded Node GitHub API boundary, applies the exact published
   `@eff3ct/agent-foundry@<EXACT_VERSION>` package, and passes it through
   the four stage interfaces below.
3. Read the bounded artifact and GitHub/checkout readback before treating the
   run as successful.

## Stage interfaces

The parent owns ordering, identity, credential boundaries, failure semantics,
and evidence aggregation. Child issues implement the stage adapters; the
parent does not choose their provider or runtime.

| Stage | Required adapter | Allowed responsibility | Success handoff |
| --- | --- | --- | --- |
| `provision` | `scripts/real-agent-journey-provision.mjs` | Read the source revision, create an empty repository, and verify owner/name/ID identity | `provision.json` with owner, repository ID, source identity, default branch, and revision |
| `agent` | `scripts/real-agent-journey-agent.mjs` | Start cold, read the required contracts, receive explicit decisions, create the feature issue, implement, test, and commit | `agent.json` with bounded interaction and implementation identifiers |
| `assert` | `scripts/real-agent-journey-assert.mjs` | Independently read GitHub and checkout state and verify the feature result | `assert.json` with deterministic checks and outcomes |
| `cleanup` | `scripts/real-agent-journey-cleanup.mjs` | Delete only the current run's verified repository | `cleanup.json` with owner proof, considered target, and cleanup status |

Each adapter receives `JOURNEY_CONTRACT_VERSION=real-agent-journey/v1`,
`JOURNEY_RUN_ID`, `JOURNEY_REPOSITORY`, and `JOURNEY_STAGE`. It writes one
bounded JSON object with this minimum shape:

```json
{
  "schema_version": "real-agent-journey/v1",
  "stage": "agent",
  "run_id": "123",
  "repository": "sandbox/real-agent-journey-123",
  "status": "passed",
  "failure_code": "",
  "identifiers": {
    "issue": "12",
    "branch": "feature/12-example",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "tests": "passed"
  }
}
```

Passing adapters must provide these bounded identifiers: `provision` provides
`source_template`, `default_branch`, `revision`, `owner`, `repository_id`, and
`source_identity`; `agent` provides `issue`,
`branch`, `commit`, and `tests`; `assert` provides `checkout_head`; and
`cleanup` provides `owner` and `target`. Revision and checkout values are full
40-character commit SHAs. The parent aggregates these identifiers but does not
trust them as proof; the assertion adapter must independently verify them.

`status` is one of `passed`, `failed`, `blocked`, or `inconclusive`. A
non-passing result requires a lowercase bounded `failure_code`. Identity,
schema, size, and status mismatches fail closed. A child claim never overrides
GitHub, git, test, cleanup, or checkout readback.

## Explicit decision boundary

The scripted user must provide non-empty decisions for project, stack,
task tracker, secrets manager, code intelligence, CI, persistence language,
branching, testing, and approval gates. Existing text and defaults are
proposals, not consent. The contract validates that decisions are explicit but
does not select a task provider, secrets provider, code-intelligence provider,
agent runtime, model, or framework. The selected bindings remain those chosen
by the cold agent under `docs/agent-init.md`.

The agent and scripted user may perform routine issue/branch/commit/test work.
They MUST NOT fabricate `status:approved`, merge, publish a release, or delete
an unrelated repository. Human approval remains a real external gate.

## Credential boundaries

- Provisioning and cleanup receive separate short-lived lifecycle credentials.
- The agent receives only its explicitly required task/repository credential;
  it never receives the lifecycle credential or the runner's environment.
- Assertions receive read-only GitHub/readback access.
- Reporting receives no lifecycle, agent, or model secret.
- Checkout operations disable persisted credentials and remove temporary
  askpass material before agent code runs.

The workflow reuses the existing immutable action pins and disposable-owner
pattern from the release/template bootstrap checks. `BOOTSTRAP_E2E_OWNER` and
the dedicated GitHub App credentials are the lifecycle configuration.
The scheduled and release callers use the catalog default, `codex-cli`. Manual
callers use the workflow's `runtime` choice, whose options are checked offline
against the catalog and contain only supported entries. No caller reads a
runtime Actions variable or accepts arbitrary free text.

Every launch records an immutable source SHA in its plan before provisioning.
For a published release, the workflow resolves `github.event.release.tag_name`
through the GitHub API and verifies that its full commit SHA matches the
triggering `github.sha` before recording both identities. For manual and
scheduled runs, it records the triggering `github.sha`. Provisioning fails
before repository creation unless the source repository's default-branch
revision matches that SHA. The agent job then reads back the exact published
package metadata, applies `@eff3ct/agent-foundry@<EXACT_VERSION>` to the
empty repository, records package/source identity, initializes `main`, and
pushes only that run-scoped repository before the cold agent starts.

## Hosted Run Setup

Configure these repository settings:

- Actions variable `BOOTSTRAP_E2E_OWNER`: disposable owner for the private
  generated repository.
- Actions variable `OPENAI_MODEL`: an available bounded model identifier.
- Actions variable `REAL_AGENT_PACKAGE_VERSION`: exact published
  `@eff3ct/agent-foundry` version for scheduled runs.
- Actions secret `BOOTSTRAP_E2E_APP_ID` and
  `BOOTSTRAP_E2E_PRIVATE_KEY`: dedicated GitHub App credentials used to mint
  separate provisioning, agent, readback, and cleanup tokens.
- Actions secret `REAL_AGENT_JOURNEY_API_KEY`: OpenAI credential passed only to
  the agent adapter.

To dispatch **Real-agent user journey**, select **OpenAI Codex CLI**, provide
the exact published package version, and press GitHub's **Run workflow** button.
The selected identifier is validated in `prepare`, then the workflow checks out
the trusted revision, creates an empty repository, applies the published
package, runs the cold agent on
`main`, checks out its implementation branch for independent readback,
aggregates bounded evidence, and always attempts cleanup. The Codex entry
requires `AGENT_GITHUB_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL`; the parent
maps those names to its dedicated GitHub App token, repository secret, and
Actions variable respectively.

If a run stops before cleanup, restore the dedicated App credentials and rerun
the cleanup adapter for the exact numeric run ID and configured owner. Never
use a prefix scan or delete a repository whose owner/name readback does not
match `real-agent-journey-<run-id>`.

## Evidence and cleanup

`scripts/real-agent-journey.mjs collect` accepts only the four stage envelopes
and emits `real-agent-journey/v1` evidence containing run, repository, runtime,
stage status, failure code, cleanup status, and workflow URL. It does not retain
raw prompts, transcripts, credentials, private paths, or model output. Evidence
is bounded to 64 KiB and retained for 7 days by the workflow.

Cleanup is an always-on job. It may target only
`<configured-owner>/real-agent-journey-<numeric-run-id>` after independent
owner and repository readback. It never lists by a broad prefix, guesses an
owner, or deletes a candidate from another run. If cleanup is inconclusive, the
journey is failed and the artifact records the exact run-scoped recovery target.

## Failure reporting and GitHub integration (slices 1–2)

`scripts/real-agent-journey.mjs` provides a pure failure-reporting boundary for
failed, aggregated journey evidence. It accepts the bounded aggregate plus the
public artifact URL and returns `None` for a passing journey. For a failure, it
validates the immutable source revision, supported runtime, first non-passing
stage, normalized failure code, cleanup status, and run-scoped GitHub URLs.

The returned payload contains a deterministic fingerprint, canonical marker,
title, and a body that matches `.github/ISSUE_TEMPLATE/bug.yml`. The public
bug-report body excludes the generated repository identity. The fingerprint is
derived only from source revision, runtime, stage, failure code, and check
identifier. Raw diagnostics, credentials, prompts, and model output are not
accepted as report fields.

The always-run report job performs one bounded duplicate lookup across open and
closed issues. It creates a `type:bug` issue or posts one occurrence comment to
the single canonical issue, then reads the mutation back. Passing evidence
creates no issue. Ambiguous, incomplete, malformed, or mismatched readback
fails closed; tests use injected offline request fixtures and never mutate GitHub.
The `report` CLI route is independent of assertion mode and requires only its
reporting arguments; it does not require a generated checkout or workflow URL.

## Scope boundary

The package-first repository provisioning and real-agent invocation remain
separate adapters. The assertion and reporting behavior described above
implements the cross-system assertions/reporting boundary. No provider-specific
shortcut, Template API call, Python command, or mock success path may be added
to make the parent workflow green. If npm access or hosted package execution is
unavailable, the journey remains explicitly blocked.

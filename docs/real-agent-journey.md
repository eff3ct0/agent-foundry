# Real-agent user journey contract

This is the parent orchestration contract for issue #87. It proves the user
journey only when the generated repository is used by a cold real agent. The
workflow is intentionally manual/nightly at first; it is not a release gate.

## Quick path

1. Dispatch **Real-agent user journey** or wait for its nightly schedule.
2. The workflow creates a run-scoped private repository from the GitHub
   Template mechanism and passes it through the four stage interfaces below.
3. Read the bounded artifact and GitHub/checkout readback before treating the
   run as successful.

## Stage interfaces

The parent owns ordering, identity, credential boundaries, failure semantics,
and evidence aggregation. Child issues implement the stage adapters; the
parent does not choose their provider or runtime.

| Stage | Required adapter | Allowed responsibility | Success handoff |
| --- | --- | --- | --- |
| `provision` | `scripts/real-agent-journey-provision.py` | Create/read back the template repository and a fresh checkout | `provision.json` with owner, repository, template, default branch, and revision |
| `agent` | `scripts/real-agent-journey-agent.py` | Start cold, read the required contracts, receive explicit decisions, create the feature issue, implement, test, and commit | `agent.json` with bounded interaction and implementation identifiers |
| `assert` | `scripts/real-agent-journey-assert.py` | Independently read GitHub and checkout state and verify the feature result | `assert.json` with deterministic checks and outcomes |
| `cleanup` | `scripts/real-agent-journey-cleanup.py` | Delete only the current run's verified repository | `cleanup.json` with owner proof, considered target, and cleanup status |

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
`source_template`, `default_branch`, and `revision`; `agent` provides `issue`,
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
`REAL_AGENT_JOURNEY_RUNTIME` is required for a hosted run and identifies an
installed adapter without selecting one in this contract; an absent or empty
value fails before repository provisioning.

## Evidence and cleanup

`scripts/real-agent-journey.py collect` accepts only the four stage envelopes
and emits `real-agent-journey/v1` evidence containing run, repository, runtime,
stage status, failure code, cleanup status, and workflow URL. It does not retain
raw prompts, transcripts, credentials, private paths, or model output. Evidence
is bounded to 64 KiB and retained for 7 days by the workflow.

Cleanup is an always-on job. It may target only
`<configured-owner>/real-agent-journey-<numeric-run-id>` after independent
owner and repository readback. It never lists by a broad prefix, guesses an
owner, or deletes a candidate from another run. If cleanup is inconclusive, the
journey is failed and the artifact records the exact run-scoped recovery target.

## Out of scope

This parent change does not implement repository provisioning (#88), real-agent
invocation (#89), or cross-system assertions/reporting (#90). Those adapters
must conform to this contract; no provider-specific shortcut or mock success
path may be added to make the parent workflow green.

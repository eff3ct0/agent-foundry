# Real-agent journey assertion contract

The reusable workflow `.github/workflows/real-agent-journey-assertions.yml`
contains only independent readback and reporting. Provisioning and agent
invocation remain upstream responsibilities.

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

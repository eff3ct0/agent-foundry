# Agent Foundry smoke test (repeatable dogfood)

Validate that a COLD agent, given only the repository and a minimal kickoff,
  starts and configures itself according to the contract. Every friction point becomes a
[`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in `eff3ct0/agent-foundry`.

> **Archetype boundary:** Release E2E and OpenAI triage paths exist only in
> `eff3ct0/agent-foundry`. Normal initialization removes those maintainer
> procedures and their helpers and tests. Downstream projects inherit generic
> template behavior and generated assets such as CI and bindings.

The release-level version of this procedure is the trusted
`.github/workflows/bootstrap-e2e.yml` workflow. It uses `release.published` as
the safest trigger because GitHub has published the release artifact. A manual
`workflow_dispatch` rerun requires `tag_name`. The workflow resolves the tag to
a full immutable commit SHA and tests that exact revision; it does not use the
template API because that follows the default branch.

The npm publication contract is the separate
[`.github/workflows/npm-release.yml`](../.github/workflows/npm-release.yml)
workflow. It accepts only a published release or an explicit tag dispatch,
requires `v<EXACT_VERSION>`, publishes the exact package once with provenance,
and immediately verifies npm metadata, tarball bytes, payload digest, release
tag, and source SHA. Missing npm credentials or any mismatch is a blocker, not
a successful dry run.

## Template bootstrap E2E contract

The maintainer-only `.github/workflows/template-bootstrap-e2e.yml` workflow is
the repeatable template-level check. A manual run checks out the trusted
`github.workflow_sha`, builds one immutable package with pinned Corepack/pnpm,
and uploads it as a run-scoped artifact. Each `ci/recipes.json` case downloads
that exact package and validates the installed creator: it installs offline with
scripts disabled, runs `foundry apply --non-interactive`, and requires
the creator's verified JSON envelope. It does not use GitHub's template-
generation endpoint or create a disposable repository.

The validation job records redacted evidence and removes only its runner-local
`template-output` directory in a `finally` block. There is no lifecycle token,
provisioning proof, prefix scan, or remote cleanup recovery path. The always-run
report job receives the workflow token only for `contents: read`, `actions:
read`, and `issues: write`; it receives redacted evidence, no lifecycle or
OpenAI credential, and uses the bounded reporter to search open and closed bug
issues before commenting on or creating one marker-identified report.

The parent contract for the cold real-agent journey is [`real-agent-journey.md`](real-agent-journey.md). It
reuses the disposable-owner, immutable-action, credential-boundary, and bounded-evidence patterns above while
leaving provider/runtime selection and the child adapters to issues #88-#90.

## Release E2E contract

- The matrix reads every key in `ci/recipes.json` and runs all cases with
  `fail-fast: false` (currently `rust`, `typescript`, `python`, and `go`).
- Each case resolves the published tag to a full SHA, checks out that SHA into
  a separate release source directory, and uses pinned Corepack/pnpm to build
  and pack that exact source before running the installed creator. It creates
  one private `bootstrap-e2e-<run-id>-<case>` repository with a persisted,
  exact readback proof; `fail-fast: false` preserves every case result.
- `BOOTSTRAP_E2E_APP_ID` and `BOOTSTRAP_E2E_PRIVATE_KEY` are dedicated Actions
  secrets for a GitHub App. The workflow mints a short-lived installation token
  separately in bootstrap and cleanup, restricts it to the disposable owner,
  and grants `administration: write`, `contents: write`, and `workflows: write`
  to bootstrap; cleanup needs only the first two. It is available only to
  lifecycle steps. An ephemeral askpass file is removed before released
  code runs, clone configuration does not persist credentials, and the released
  subprocess uses an environment allowlist with no inherited token or secret
  variables. The released checkout never receives this token.
- The reporter uses only the workflow token with `contents: read`, `actions: read`,
  and `issues: write`. It searches open and closed issues using a stable
  release-SHA/case/failure/check fingerprint, or a tag/run preparation marker
  when preparation has no SHA, comments the canonical bug once, or creates one using
  `.github/ISSUE_TEMPLATE/bug.yml`. Evidence contains only redacted JSON with
  the tag, SHA, failed cases, workflow URL, and artifact page; it never contains
  credentials, full environment output, or temporary paths.
- The isolated triage job runs after evidence download with only
  `OPENAI_API_KEY`, the repository variable `OPENAI_MODEL`, and a clean process
  environment containing a bounded sanitized JSON payload. It has no GitHub
  token, issue permission, tools, or control over pass/fail, retries, cleanup,
  concurrency, or workflow state. Responses API structured output is strict;
  missing or rejected configuration, timeout, refusal, malformed/schema-invalid
  output, and unsafe model text all use the deterministic reporter fallback.
- The failure envelope is versioned as `bootstrap-e2e-failure/v1` and includes
  the validated selected `OPENAI_MODEL` when available, release tag, immutable
  SHA when available, matrix case, normalized failure code, bounded exit-code
  evidence, sanitized logs, and cleanup status. Missing or invalid model
  configuration fails the bootstrap case; it cannot turn the E2E green. The
  triage job remains failed/fallback in that case, and the reporter still uses
  the deterministic failure body. Triage uses `bootstrap-e2e-triage/v1`; its
  request is bounded, uses `store: false`, and is not a source of lifecycle or
  issue authority.
- Evidence is retained for 7 days. GitHub API requests and each git or
  initializer subprocess use a 30-second timeout. Job timeouts are 10 minutes
  for prepare/report, 30 minutes for the matrix, and 15 minutes for cleanup.
  Report concurrency serializes the same resolved SHA (with a tag fallback when
  preparation cannot resolve one) and does not cancel an active run. Evidence,
  API responses, issue/comment results, generated issue bodies, and model output
  are bounded and oversized input fails closed.
- The workflow does not mutate the source release and deletes only the exact
  owner/name bound to each persisted provisioning proof after validation. The
  cleanup job checks out the trusted `github.workflow_sha` harness, never the
  released source, then performs F4 readback before deletion. For recovery,
  download the matching `bootstrap-e2e-proof-<run-id>-<case>` artifact, restore
  the cleanup App credential, and rerun the proof-bound cleanup job for that
  exact run and case. Never replace the proof with a prefix scan or delete an
  unrelated repository.
- Third-party actions are pinned to verified immutable SHAs: checkout v4.2.2
  (`11bd71901bbe5b1630ceea73d27597364c9af683`), upload-artifact v4.6.2
  (`ea165f8d65b6e75b540449e92b4886f43607fa02`), download-artifact v4.3.0
  (`d3f86a106a0bac45b974a628896c90dbdf5c8093`), and create-github-app-token
  v2.2.2 (`fee1f7d63c2ff003460e3d139729b119787bc349`). The static pin check
  rejects tags, branches, and non-40-hex references.

Run the local trusted checks with:

```
node scripts/check-bootstrap-workflow.mjs
node scripts/report-bootstrap-failure.mjs --self-check
node scripts/triage-bootstrap-failure.mjs --self-check
node --test test/triage-bootstrap-failure.test.mjs test/triage-bootstrap-failure-cli.test.mjs
```

These checks are offline; they do not create repositories or prove hosted
GitHub Actions execution. The OpenAI request follows the official Responses API
structured-output guidance at
https://developers.openai.com/api/docs/guides/structured-outputs.

## 1. Create a project from the package

Ask the human to choose and confirm the project name, stack/CI ecosystems,
task tracker and board, secrets provider, persistence language, and remaining
configuration **before** non-interactive apply. The values below are an
illustrative decision set, not defaults or consent. Replace them with the
approved choices. Use an exact published version; do not run the creator on
the Agent Foundry source checkout. Keep the answers file outside the empty
target so it cannot conflict with creator-owned files.

```sh
FOUNDRY_VERSION='REPLACE_WITH_EXACT_PUBLISHED_VERSION'
SMOKE_DIR=$(mktemp -d -t factory-smoke-test.XXXXXX)
cat > "$SMOKE_DIR/answers.json" <<'JSON'
{
  "values": {
    "PROJECT_NAME": "Disposable smoke project",
    "REPO_LANGUAGE": "en",
    "FACTORY_SPEC": "",
    "FACTORY_REQUIRED": "false",
    "INTEGRATION_BRANCH": "main",
    "REPO_URLS": "",
    "LANGUAGES_AND_FRAMEWORKS": "Python 3",
    "PACKAGE_MANAGER": "none",
    "TRACKER": "GitHub Issues",
    "TRACKER_KEY": "repository issues",
    "EPIC_ID": "",
    "TASK_TRACKER": "github-issues",
    "SECRETS_PROVIDER": "none",
    "CODE_INTELLIGENCE": "none",
    "SECRETS_PATH": "",
    "BRANCHING_MODEL": "GitHub flow",
    "BRANCH_NAMING": "feature/ticket-slug",
    "BUILD_CMD": "",
    "TEST_CMD": "python3 -m unittest",
    "LINT_CMD": "",
    "TYPECHECK_CMD": "",
    "RUN_CMD": "",
    "ENVIRONMENTS": "local only",
    "DEPLOY_METHOD": "none",
    "CI_SYSTEM": "GitHub Actions",
    "CI_STACKS": "python",
    "OPENCODE_PLUGIN": "false",
    "FORMATTER": "",
    "LINTER": "",
    "TEST_FRAMEWORK": "unittest",
    "SCA_TOOL": "",
    "OBSERVABILITY_STACK": "",
    "COMMIT_IDENTITY": "",
    "REPO_CONVENTIONS_FILE": "CONTRIBUTING.md",
    "TDD_POLICY": "tests-first for non-trivial logic",
    "COVERAGE_TARGET": "behavior coverage; no hard threshold",
    "APPROVAL_GATED_ACTIONS": "merge, release publication, deletion"
  }
}
JSON
pnpm dlx --package "@eff3ct/agent-foundry@$FOUNDRY_VERSION" foundry plan --target "$SMOKE_DIR/project" --config "$SMOKE_DIR/answers.json" --agent none --non-interactive
pnpm dlx --package "@eff3ct/agent-foundry@$FOUNDRY_VERSION" foundry apply --target "$SMOKE_DIR/project" --config "$SMOKE_DIR/answers.json" --agent none --non-interactive --yes
pnpm dlx --package "@eff3ct/agent-foundry@$FOUNDRY_VERSION" foundry verify --target "$SMOKE_DIR/project" --config "$SMOKE_DIR/answers.json" --agent none --non-interactive
pnpm dlx --package "@eff3ct/agent-foundry@$FOUNDRY_VERSION" foundry doctor --target "$SMOKE_DIR/project" --config "$SMOKE_DIR/answers.json" --agent none --non-interactive
```

## 2. Minimal kickoff (NEW agent session inside the repo)
Start the new session in `$SMOKE_DIR/project` (record its absolute path for the
new session). Apply has already composed bindings and CI from the approved
answers; do not reapply or invent new consent.

> You are a cold agent in this disposable generated project. Run `node start.mjs`,
> read CLAUDE.md and AGENT.md, and check docs/bindings.md and
> .github/workflows/ci.yml against the human-approved answers file outside
> this target. Report the startup mode and any mismatches. Follow the loop
> contract only if given an actual task; do not create issues or take outward
> actions without my approval.

For the example, no organization baseline is selected: `FACTORY_SPEC` is
empty and `FACTORY_REQUIRED` is `false`. Change these only on human decision.

## 3. Success criteria
- [ ] The kickoff was sufficient; no process explanation was needed.
- [ ] `node start.mjs` reports the expected setup/work mode.
- [ ] The human confirmed the answers before apply; plan/apply/verify/doctor
      used the same disposable target, with apply reporting `applied` and
      `verification: verified`, verify reporting `verified`, and doctor `healthy`.
- [ ] `docs/bindings.md` contains the selected task and secrets providers.
- [ ] `.github/workflows/ci.yml` has one job for the selected Python stack
      (or one job per selected ecosystem if the answers were changed).
- [ ] Generated output contains no `ci/`, `providers/`, `MAINTAINERS.md`, or maintainer-only release tooling.
- [ ] If given a task, the agent follows the loop contract (one task/session,
      tracker state, checkpoint, DoD); the smoke test alone creates no task.
- [ ] Persisted project content uses the configured `<REPO_LANGUAGE>`.

## 4. Cleanup
From the shell that created `$SMOKE_DIR`, inspect the target and record evidence
before removing only that run's disposable directory. If the variable or
answers file is missing, or the directory contains unexpected files, stop
instead of deleting a guessed path. This is local cleanup, not the hosted
proof-bound repository cleanup described above.

```sh
test -n "${SMOKE_DIR:-}" && test -f "$SMOKE_DIR/answers.json" && test -d "$SMOKE_DIR/project" && ls -la -- "$SMOKE_DIR" "$SMOKE_DIR/project"
# After inspection, remove only this run's exact disposable directory:
test -n "${SMOKE_DIR:-}" && test -f "$SMOKE_DIR/answers.json" && test -d "$SMOKE_DIR/project" && rm -r -- "$SMOKE_DIR"
```

## 5. Feedback (the improvement engine)
Open a [`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in
`eff3ct0/agent-foundry` for every point where extra intervention was needed or
`docs/agent-init.md` was ambiguous.

## Definition of Done

Before closing a release E2E change, use
[`templates/definition-of-done.md`](../templates/definition-of-done.md). All
acceptance items, local checks, the complete hosted matrix, cleanup success or
failure evidence, redacted artifact retention, documentation, and review must
be complete. A local self-check is not a substitute for the hosted matrix.

# Factory smoke test (repeatable dogfood)

Validate that a COLD agent, given only the repository and a minimal kickoff,
initializes itself according to the contract. Every friction point becomes a
[`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in the template repository.

> **Archetype boundary:** Release E2E and OpenAI triage paths exist only in
> `eff3ct0/factory-template`. Normal initialization removes those maintainer
> procedures and their helpers and tests. Downstream projects inherit generic
> template behavior and generated assets such as CI and bindings.

The release-level version of this procedure is the trusted
`.github/workflows/bootstrap-e2e.yml` workflow. It uses `release.published` as
the safest trigger because GitHub has published the release artifact. A manual
`workflow_dispatch` rerun requires `tag_name`. The workflow resolves the tag to
a full immutable commit SHA and tests that exact revision; it does not use the
template API because that follows the default branch.

## Template bootstrap E2E contract

The maintainer-only `.github/workflows/template-bootstrap-e2e.yml` workflow is
the repeatable template-level check. A manual run creates one private repository
per `ci/recipes.json` stack through GitHub's template-generation endpoint, reads
back the generated repository, and deletes only its numeric run-prefix targets.
Each disposable checkout runs `python3 start.py`, follows `docs/agent-init.md`,
and invokes `python3 init.py --no-clean` with GitHub Issues, no secrets manager,
and CodeGraph selected. The report records the cold-start, placeholder,
self-check, pre-initialization determinism, governance, delivery-contract,
binding, generated-CI, and no-clean results. Failed records use the existing bounded reporter, which
searches open and closed bug issues and comments or creates exactly one marker-
identified report.

## Release E2E contract

- The matrix reads every key in `ci/recipes.json` and runs all cases with
  `fail-fast: false` (currently `rust`, `typescript`, `python`, and `go`).
- Each case creates a private, empty (`auto_init: false`) repository named
  `bootstrap-e2e-<run-id>-<case>` in `BOOTSTRAP_E2E_OWNER`, pushes only the
  released commit to `main`, verifies clone `HEAD`, and cleans up in an
  `if: always()` job by exact run-prefix matching.
- `BOOTSTRAP_E2E_APP_ID` and `BOOTSTRAP_E2E_PRIVATE_KEY` are dedicated Actions
  secrets for a GitHub App. The workflow mints a short-lived installation token
  separately in bootstrap and cleanup, restricts it to the disposable owner,
  and grants only `administration: write` and `contents: write`. It is available
  only to lifecycle steps. An ephemeral askpass file is removed before released
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
  the allowlisted selected `OPENAI_MODEL` when available, release tag, immutable
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
- The workflow does not mutate the source release and deletes disposable
  repositories only after released validation completes. The harness handles
  ordinary cancellation with `finally` cleanup; GitHub force-cancellation,
  runner loss, API failure, or missing credentials can still prevent it. For
  recovery, restore the credential, inspect the configured owner, then rerun
  the trusted harness cleanup with the exact numeric run ID:
  `python3 scripts/bootstrap-e2e.py cleanup --owner "$BOOTSTRAP_E2E_OWNER" --run-id "$GITHUB_RUN_ID"`.
  Never broaden the prefix or delete unrelated repositories.
- Third-party actions are pinned to verified immutable SHAs: checkout v4.2.2
  (`11bd71901bbe5b1630ceea73d27597364c9af683`), upload-artifact v4.6.2
  (`ea165f8d65b6e75b540449e92b4886f43607fa02`), download-artifact v4.3.0
  (`d3f86a106a0bac45b974a628896c90dbdf5c8093`), and create-github-app-token
  v2.2.2 (`fee1f7d63c2ff003460e3d139729b119787bc349`). The static pin check
  rejects tags, branches, and non-40-hex references.

Run the local trusted checks with:

```
python3 scripts/bootstrap-e2e.py --self-check
python3 scripts/report-bootstrap-failure.py --self-check
python3 scripts/triage-bootstrap-failure.py --self-check
python3 scripts/test-bootstrap-triage.py
```

These checks are offline; they do not create repositories or prove hosted
GitHub Actions execution. The OpenAI request follows the official Responses API
structured-output guidance at
https://developers.openai.com/api/docs/guides/structured-outputs.

## 1. Create a project from the template
```
gh repo create <YOUR_ACCOUNT>/factory-smoke-test --template eff3ct0/factory-template --private --clone
cd factory-smoke-test
```

## 2. Minimal kickoff (NEW agent session inside the repo)
> You are a cold agent in this newly created factory-template project. Read
> CLAUDE.md and AGENT.md and follow docs/agent-init.md: propose placeholder
> values with init.py (use `--no-clean` for verification), present the complete
> configuration, explicitly confirm it, compose bindings and CI, and verify.
> Ask me for decisions (name, stack, tracker, secrets, and persistence language)
> rather than treating local files or defaults as consent. Do not take outward
> actions without my approval.

Note: `eff3ct0/factory` (the org instance) does not exist yet, so leave
`FACTORY_SPEC` empty and set `FACTORY_REQUIRED=false`.

## 3. Success criteria
- [ ] The kickoff was sufficient; no process explanation was needed.
- [ ] `python3 init.py --check` -> zero required manifest placeholders (keep `--no-clean` for this; optional non-applicable values may remain empty).
- [ ] `docs/bindings.md` contains the selected task and secrets providers.
- [ ] `.github/workflows/ci.yml` has one job per stack language.
- [ ] Without `--no-clean`, `init.py`, `placeholders.json`, `ci/`, `providers/`, `factory_bootstrap.py`, `MAINTAINERS.md`, `docs/smoke-test.md`, and `scripts/check-determinism.py` disappear.
- [ ] The agent follows the loop contract (one task/session, tracker state, checkpoint, DoD).
- [ ] Persisted project content uses the configured `<REPO_LANGUAGE>`.

## 4. Cleanup
```
gh repo delete <YOUR_ACCOUNT>/factory-smoke-test --yes
```

## 5. Feedback (the improvement engine)
Open a [`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in
`eff3ct0/factory-template` for every point where extra intervention was needed or
`docs/agent-init.md` was ambiguous.

## Definition of Done

Before closing a release E2E change, use
[`templates/definition-of-done.md`](../templates/definition-of-done.md). All
acceptance items, local checks, the complete hosted matrix, cleanup success or
failure evidence, redacted artifact retention, documentation, and review must
be complete. A local self-check is not a substitute for the hosted matrix.

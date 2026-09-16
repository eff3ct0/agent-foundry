# MAINTAINERS - archetype self-governance

This repo (`eff3ct0/factory-template`) follows its OWN doctrine (dogfooding).
This layer is concrete and SEPARATE from the **product** (the template content
containing `<PLACEHOLDER>` values).

## Hard rule
Do NOT run `init.py` on this repo: it would consume itself, fill its
placeholders, and remove its scaffolding. `init.py`, `placeholders.json`,
`providers/`, `ci/`, `factory_bootstrap.py`, and the templates are the PRODUCT,
not this repo's configuration.

## Bindings for this repo
- **Tasks:** GitHub Issues + GitHub Projects (v2) for `eff3ct0/factory-template`.
- **Secrets:** none (public template; no real secrets).
- **Loop contract:** `templates/agent-runbook.md`. **DoD:** `templates/definition-of-done.md`.

## Release bootstrap E2E configuration

The safest trigger for release validation is `release.published`; it verifies
the artifact after GitHub has published it. The workflow also exposes a manual
`workflow_dispatch` with a required `tag_name` for an intentional rerun of a
known release. It never uses the template API: the trusted harness resolves the
tag to a full commit SHA, verifies the fetched and disposable clone `HEAD`, and
tests that exact release revision.

Configure these repository settings before enabling the workflow:

- `BOOTSTRAP_E2E_OWNER` (Actions variable): a dedicated disposable-repository
  owner, preferably an organization used only for these private test repos.
- `BOOTSTRAP_E2E_APP_ID` (Actions secret): the dedicated GitHub App ID.
- `BOOTSTRAP_E2E_PRIVATE_KEY` (Actions secret): the dedicated GitHub App
  private key. The workflow mints a short-lived installation token separately
  in bootstrap and cleanup, restricts it to `BOOTSTRAP_E2E_OWNER`, and grants
  only `administration: write` and `contents: write`. Never use a personal or
  long-lived broad-scope token.
The short-lived lifecycle credential is available only to create/push/clone/cleanup steps,
is removed from the released subprocess environment before released code
executes, and is never available to the issue reporter. The released subprocess
gets an allowlisted environment, not a copy of the runner environment. The
reporter uses the workflow token with `contents: read`, `actions: read`, and
`issues: write`; it searches open and closed issues using stable
SHA/case/failure/check fingerprints and follows `.github/ISSUE_TEMPLATE/bug.yml`.

The matrix is every current key in `ci/recipes.json` and is fail-fast false.
Each case uses a private repository named
`bootstrap-e2e-<run-id>-<case>`, exact-prefix cleanup derived independently from
the numeric run ID in an `if: always()` job, and a 7-day redacted evidence
artifact. The disposable repository is not deleted until released bootstrap
validation completes. Report jobs serialize by resolved release SHA, falling
back to the validated tag when preparation cannot resolve one, and do not cancel
an active run. GitHub API and every git/initializer subprocess have
a 30-second operation timeout; job timeouts are 10 minutes for prepare and
report, 30 minutes for the matrix, and 15 minutes for cleanup. API failures,
runner loss, forced cancellation, or missing credentials can leave cleanup
pending; restore the credential, inspect the owner, and run
`python3 scripts/bootstrap-e2e.py cleanup --owner "$BOOTSTRAP_E2E_OWNER" --run-id "$GITHUB_RUN_ID"`
with the exact run ID. Do not broaden the prefix or delete unrelated repos.

The workflow pins every third-party action to a verified full commit SHA:

- `actions/checkout` v4.2.2: `11bd71901bbe5b1630ceea73d27597364c9af683`
- `actions/upload-artifact` v4.6.2: `ea165f8d65b6e75b540449e92b4886f43607fa02`
- `actions/create-github-app-token` v2.2.2: `fee1f7d63c2ff003460e3d139729b119787bc349`

Run `python3 scripts/check-bootstrap-workflow.py` to reject floating, branch,
tag, or non-40-hex action references.

Before closing changes to this workflow, use the Definition of Done and retain
evidence for every matrix case, cleanup success/failure, reporting outcome,
permissions, retention, timeout, rollback, and any manual rerun.

## Ticket types (labels)
The canonical label catalog is [`.github/labels.json`](.github/labels.json); run
`python3 scripts/sync-github-labels.py` to create or update labels idempotently.

- `type:product` - template improvements or changes.
- `type:dx-feedback` - friction found while USING the archetype (see the [DX feedback issue form](.github/ISSUE_TEMPLATE/dx-feedback.yml) and [`docs/smoke-test.md`](docs/smoke-test.md)).
- `type:bug` - defect.
- `status:approved` - protected approval; agents may assign it only through the
  fail-closed delegated-approval protocol in `AGENT.md` and the bound task provider.

## Improvement cycle (one task per session)
1. Take an actionable issue (prioritize `dx-feedback` when it blocks use). Announce `Working #<n>`.
2. In Progress -> minimal change -> **verify**: `python3 init.py --self-check`, `python3 init.py --check`, a happy-path dry-run, and a coherence audit when structure changes.
3. Meet the DoD -> close the issue with evidence (commit/PR).
4. When a coherent batch lands -> create and push a new tag (`v1.x` / `v2`).

## Improve while using
Every project bootstrapped from the template that finds a gap opens a
`type:dx-feedback` issue here (its `FACTORY_SPEC` records provenance). Usage
feeds the backlog.

## Propagation
`MAINTAINERS.md` and `docs/smoke-test.md` belong to THIS repo; `init.py` removes
them from an initialized project (they do not travel downstream).

# Factory OS - organization layer (GitHub)

How this template (`factory-template`) becomes an organization-level GitHub
factory. v1 uses two native, complementary mechanisms.

> **Naming (source != instance).** `factory-template` is the **source archetype**
> (this repo, retained as a *Template repository* for rollback). `<ORG>/factory`
> is the organization factory **implementation**: create an empty repository,
> apply `factory-template-creator@<EXACT_VERSION>`, version it with
> tags (`v1`, `v2`, ...), and reference it by projects through
> `FACTORY_SPEC = <ORG>/factory@vX`.

## 1. `org/.github` - native organization defaults
Create a repository named `.github` in the organization. GitHub serves its
community health files (`.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`,
`CONTRIBUTING.md`, `SECURITY.md`) as defaults for organization repositories
that do not provide their own. Seed it by copying this template's
`.github/ISSUE_TEMPLATE/*` and `.github/pull_request_template.md`.

Only those concrete files are propagated. `AGENT.md` and `CLAUDE.md` are not;
use the pin below for the organization factory spec.

## Bootstrap tool (idempotent)
The Node creator and the GitHub CLI are the supported automation boundary for
organization repositories. Use the creator for local, offline planning and
apply/verify; use an explicitly approved `gh repo create` command for the
organization repository mutation:

```sh
factory-template plan --target ./factory --config answers.json --non-interactive
factory-template apply --target ./factory --config answers.json --non-interactive --yes
gh repo create <ORG>/.github --private
```

Note: `gh` must be authenticated; lookup errors other than confirmed not-found stop before any creation;
the command is idempotent when rerun against an unchanged target. Repository
creation is separately consented and is not performed by the offline creator.

The GitHub operation requires authenticated `gh`, never deletes, and requires
explicit consent. See [`determinism.md`](determinism.md) for the complete
repeat-run, rollback, and approval-boundary matrix.

## 2. Package + `FACTORY_SPEC` pin
- The **source archetype** is this repo (`<ORG>/factory-template`), marked as a *Template repository* only for rollback.
- The **instance** `<ORG>/factory` is an empty repository initialized with `factory-template-creator@<EXACT_VERSION>` and versioned with tags (`v1`, `v2`, ...); it is the organization's living baseline.
- Each project applies the exact creator package and declares its governing baseline in [`AGENT.md`](../AGENT.md): `FACTORY_SPEC = <ORG>/factory@v1`.
- The repository follows its `FACTORY_SPEC`; local content **overrides** the baseline when it differs. To adopt a new spec version, repin `FACTORY_SPEC` and reconcile changes.
- The deterministic `FACTORY_REQUIRED` configuration makes the creator fail
  closed when `FACTORY_SPEC` is empty. The creator does not infer consent or
  create organization repositories.

## Evolution (not included in v1)
- Merged provider defaults (`factory.defaults.json` in `org/factory`, org -> repo inheritance).
- Organization-level reusable CI workflows (`uses: org/factory/.github/workflows/<lang>.yml@vX`).

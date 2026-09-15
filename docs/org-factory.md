# Factory OS - organization layer (GitHub)

How this template (`factory-template`) becomes an organization-level GitHub
factory. v1 uses two native, complementary mechanisms.

> **Naming (template != instance).** `factory-template` is the **template** (this
> repo, marked as a *Template repository*). `<ORG>/factory` is the organization
> factory **implementation**: it is created from the template, versioned with
> tags (`v1`, `v2`, ...), and referenced by projects through
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
`factory_bootstrap.py` ensures that organization repositories `org/.github`
and `org/<factory-repo>` exist:

- `python3 factory_bootstrap.py --org <ORG> --ensure` - interactive; asks before creating missing repositories.
- `--yes` - non-interactive; creates without asking.
- `--no-create` - report only; never creates.
- `--plan` - offline; prints targets and intent without calling `gh`.
- `--factory-repo <name>` - factory repository name (default: `factory`).
- `--visibility public|internal|private` - creation visibility (default: `private`).

The tool requires authenticated `gh`, is idempotent (existing repositories are
no-ops), never deletes, and requires consent for repository creation. It is
separate from `init.py`. See [`determinism.md`](determinism.md) for the complete
repeat-run, rollback, and approval-boundary matrix.

## 2. Template + `FACTORY_SPEC` pin
- The **template** is this repo (`<ORG>/factory-template`), marked as a *Template repository*.
- The **instance** `<ORG>/factory` is created from the template and versioned with tags (`v1`, `v2`, ...); it is the organization's living baseline.
- Each project uses *Use this template* and declares its governing baseline in [`AGENT.md`](../AGENT.md): `FACTORY_SPEC = <ORG>/factory@v1`.
- The repository follows its `FACTORY_SPEC`; local content **overrides** the baseline when it differs. To adopt a new spec version, repin `FACTORY_SPEC` and reconcile changes.
- The deterministic `FACTORY_REQUIRED` manifest flag makes `init.py` fail closed when `FACTORY_SPEC` is empty. `factory_bootstrap.py`, not `init.py`, ensures that the org repository exists.

## Evolution (not included in v1)
- Merged provider defaults (`factory.defaults.json` in `org/factory`, org -> repo inheritance).
- Organization-level reusable CI workflows (`uses: org/factory/.github/workflows/<lang>.yml@vX`).

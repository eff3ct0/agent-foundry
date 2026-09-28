# Factory OS - organization layer (GitHub)

How the Agent Foundry archetype supports an organization-level GitHub factory.
v1 uses two native, complementary mechanisms.

> **Naming (source != instance).** `eff3ct0/agent-foundry` is the **source archetype**
> (retained as a *Template repository* for rollback). `<ORG>/factory`
> is the organization factory **implementation**: create an empty repository,
> apply `@eff3ct/agent-foundry@<EXACT_VERSION>`, version it with
> tags (`v1`, `v2`, ...), and reference it by projects through
> `FACTORY_SPEC = <ORG>/factory@vX`.

## 1. Ensure repositories (contents are separate)

The offline `foundry github-provision --org <ORG> --factory-repo factory --plan`
previews `<ORG>/.github` and `<ORG>/factory` without credentials. The separately
authorized ensure checks both, creates only confirmed-missing repositories,
and reads back newly created names and visibility. It does not seed files or
change an existing repository's visibility:

```sh
foundry github-provision --org <ORG> --factory-repo factory --visibility private --plan
# Only after separate authorization and target review:
foundry github-provision --org <ORG> --factory-repo factory --visibility private --yes
```

Inspect existing repositories' owner, visibility, default branch, and contents
on the target host first. Preserve an existing public `.github`; the one
visibility option applies only to missing repositories. If `.github` must be
public and is absent, arrange its separately approved creation before using
this two-target private ensure. Stop on uncertain lookup/create/readback; never
retry an uncertain create blindly. `planned` lists targets; `existing` proves
only existence, and `created` proves only new-repository identity/visibility.

## 2. Initialize `<ORG>/factory` from an exact version

Inspect the host: the factory repository must be empty, with no existing commit
or files to overwrite. In a fresh checkout, use an operator-selected,
published and verified exact creator version and reviewed `answers.json` outside
the target tree. Leave `FACTORY_REQUIRED=false` and `FACTORY_SPEC` empty until
there is a real baseline to reference. Never apply the creator to this source
archetype or treat its Template mode as the normal path.

```sh
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry plan --target ./factory --config ./answers.json --non-interactive
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry apply --target ./factory --config ./answers.json --non-interactive --yes
pnpm dlx --package @eff3ct/agent-foundry@<EXACT_VERSION> foundry verify --target ./factory --config ./answers.json --non-interactive
```

Review the generated tree, bindings, creator state, and conflicts. Do not
commit answers or secrets. Only after approval, commit the verified tree and
create `v1`; never move an existing tag. Repeat the same exact-version apply
and verify against unchanged content and require a no-op.

## 3. Seed `<ORG>/.github` without replacing existing content

GitHub serves a **public** organization `.github` repository's community-health
files as defaults for repositories without their own. At a reviewed, pinned
source revision, copy only these generic source-owned files, verbatim:

| Source in `org-community-defaults/` | Destination in `<ORG>/.github` |
| --- | --- |
| `ISSUE_TEMPLATE/bug.yml` | `.github/ISSUE_TEMPLATE/bug.yml` |
| `ISSUE_TEMPLATE/feature.yml` | `.github/ISSUE_TEMPLATE/feature.yml` |
| `PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` |

For each destination, create it only if absent; if present, compare bytes and
skip only when identical. A different file, symlink, or unreviewed destination
is a **stop**, not permission to merge or overwrite it. Preserve `profile/`
and every other existing file. Repository-specific forms take precedence.
Never copy this source's project-specific `.github/` forms, labels, workflows,
`AGENT.md`, or `CLAUDE.md` to the organization. These generic forms require
no labels, approvals, or release gate. The inventory removes
`org-community-defaults/` from initialized projects.

No `CONTRIBUTING.md` or `SECURITY.md` policy is supplied: obtain the owner's
actual contribution rules and security contact before adding either. Commit
only reviewed, missing files. On a second authorized pass compare all bytes
and require no new commit. Target-host readback of paths, bytes, visibility,
and history is required; offline checks cannot prove hosted propagation.

## 4. Package + `FACTORY_SPEC` pin
- The **source archetype** is `eff3ct0/agent-foundry`, retained as a *Template repository* only for rollback.
- The **instance** `<ORG>/factory` is an empty repository initialized with `@eff3ct/agent-foundry@<EXACT_VERSION>` and versioned with tags (`v1`, `v2`, ...); it is the organization's living baseline.
- Each project applies the exact creator package and declares its governing baseline in [`AGENT.md`](../AGENT.md): `FACTORY_SPEC = <ORG>/factory@v1`.
- The repository follows its `FACTORY_SPEC`; local content **overrides** the baseline when it differs. To adopt a new spec version, repin `FACTORY_SPEC` and reconcile changes.
- The deterministic `FACTORY_REQUIRED` configuration makes the creator fail
  closed when `FACTORY_SPEC` is empty. The creator does not infer consent or
  create organization repositories.

## Evolution (not included in v1)
- Merged provider defaults (`factory.defaults.json` in `org/factory`, org -> repo inheritance).
- Organization-level reusable CI workflows (`uses: org/factory/.github/workflows/<lang>.yml@vX`).

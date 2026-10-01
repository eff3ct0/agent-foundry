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

## Offline defaults extension

The creator can merge a pinned, locally checked-out `org/factory` root
`factory.defaults.json` with project answers. See [the creator's offline pin
contract](creator.md#pinned-offline-factory-defaults-optional). This does not
provision a factory, fetch a repository, or verify a remote organization identity:
the expected full commit SHA must be supplied independently by the caller.

With GitHub CI stacks selected, the offline creator validates selected callable
`.github/workflows/<lang>.yml` files in the pinned local factory snapshot and
generates `uses: org/factory/.github/workflows/<lang>.yml@vX` callers. Runner
validation, publication, stable tag and hosted validation remain separate work;
no published workflow is supplied here.

## Inspect effective interaction rules (offline)

`FACTORY_SPEC` in the project's root [`AGENT.md`](../AGENT.md) names the intended
baseline (for example, `acme/factory@v1`). It is a reference, not a downloaded
or verified copy. A cold agent must inspect the pinned baseline and the current
repository before claiming that a rule comes from the factory:

1. Read `FACTORY_SPEC` in root `AGENT.md`. If it is empty and factory membership
   is optional, use local rules only and do not attribute them to a factory. If
   membership is required or expected but the pin is missing, stop the affected
   action and ask the repository owner to specify the exact pin locally.
2. Use an **already available local checkout** of the named organization factory,
   whose identity the owner can verify. For a pin `acme/factory@v1`, inspect its
   local `refs/tags/v1` with `git -C <LOCAL_FACTORY_CHECKOUT> rev-parse --verify
   'refs/tags/v1^{commit}'`. Record `acme/factory@v1` **and** the returned full
   commit SHA; inspect files at that commit with `git -C <LOCAL_FACTORY_CHECKOUT>
   show <COMMIT_SHA>:AGENT.md` (and the corresponding paths for other rule files).
   Do not use a moving branch or an unverified checkout as a substitute for the
   pin. If the tag is absent, the checkout identity cannot be verified, or the
   revision disagrees with a previously trusted recorded SHA, stop and ask the
   owner to supply/verify the pinned revision locally. There is **no implicit fetch**.
3. Compare the pinned and local text **per rule**, not by replacing whole files.
   Start with `AGENT.md` and `templates/agent-runbook.md` (relocated to
   `.factory/templates/agent-runbook.md` after initialization); inspect any other
   named interaction-rule files relevant to the action. Cite file path, section
   or rule number, exact text, and pinned commit SHA for each baseline rule;
   cite path, section or rule number, and exact text for each local rule. When
   content was relocated into `.factory/`, that location is still local project
   content, not proof of the pinned factory revision. Do not change the bound
   task/secrets provider on the basis of this comparison.
4. Keep nonconflicting pinned rules alongside local rules. For the **same rule**,
   local text overrides pinned text; show both verbatim and say which is effective.
   If two local instructions about the same action contradict one another and
   neither resolves the contradiction, do not execute the disputed action.
   Quote both locations and ask the repository owner to reconcile the local
   texts before resuming. Never guess by file order or silently discard a source.

### Cold-agent comparison examples

The following are example rule texts, not new project policies. They show what a
cold agent should report from the two copies; an unavailable baseline never
counts as proof that the local copy overrides it.

| Case | Pinned source at `acme/factory@v1` (record SHA) | Local source | Effective outcome and provenance |
| --- | --- | --- | --- |
| nonconflict | `AGENT.md` §Review: Review cadence: weekly | `AGENT.md` §Incidents: Incident response: daily | both rules apply; retain both paths and the pinned SHA (provenance: both). |
| local override | `AGENT.md` §Review: Review cadence: weekly | `AGENT.md` §Review: Review cadence: daily | daily is effective for Review cadence; cite both exact texts, paths and the pinned SHA (provenance: both). |
| missing pin | `AGENT.md` §Review: Review cadence: weekly (unattributed copy) | `AGENT.md` §Factory: FACTORY_SPEC: missing | stop factory-dependent action (provenance: missing); owner records the intended pin locally, or confirms local-only scope when optional. |
| unavailable baseline | no local checkout at pinned ref | `AGENT.md` §Review: Review cadence: daily | stop factory-dependent action (provenance: unavailable); owner supplies/verifies an offline checkout of the exact pin. |
| ambiguous provenance | `AGENT.md` §Review: Review cadence: weekly | `AGENT.md` §Review: Review cadence: daily; `CONTRIBUTING.md` §Review: Review cadence: monthly | stop disputed action (provenance: ambiguous); do not execute until owner can reconcile both local rules. |

These examples do not run a comparison or create a new approval gate. A local
owner can supply a verified checkout or clarify conflicting text without an
automatic sync, remote lookup, service, or dashboard. Keep the usual task and
approval contracts in [`AGENT.md`](../AGENT.md) and
[`docs/bindings.md`](bindings.md) intact.

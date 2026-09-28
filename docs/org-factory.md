# Factory OS - organization layer (GitHub)

How the Agent Foundry archetype supports an organization-level GitHub factory.
v1 uses two native, complementary mechanisms.

> **Naming (source != instance).** `eff3ct0/agent-foundry` is the **source archetype**
> (retained as a *Template repository* for rollback). `<ORG>/factory`
> is the organization factory **implementation**: create an empty repository,
> apply `@eff3ct/agent-foundry@<EXACT_VERSION>`, version it with
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
foundry plan --target ./factory --config answers.json --non-interactive
foundry apply --target ./factory --config answers.json --non-interactive --yes
gh repo create <ORG>/.github --private
```

Note: `gh` must be authenticated; lookup errors other than confirmed not-found stop before any creation;
the command is idempotent when rerun against an unchanged target. Repository
creation is separately consented and is not performed by the offline creator.

The GitHub operation requires authenticated `gh`, never deletes, and requires
explicit consent. See [`determinism.md`](determinism.md) for the complete
repeat-run, rollback, and approval-boundary matrix.

## 2. Package + `FACTORY_SPEC` pin
- The **source archetype** is `eff3ct0/agent-foundry`, retained as a *Template repository* only for rollback.
- The **instance** `<ORG>/factory` is an empty repository initialized with `@eff3ct/agent-foundry@<EXACT_VERSION>` and versioned with tags (`v1`, `v2`, ...); it is the organization's living baseline.
- Each project applies the exact creator package and declares its governing baseline in [`AGENT.md`](../AGENT.md): `FACTORY_SPEC = <ORG>/factory@v1`.
- The repository follows its `FACTORY_SPEC`; local content **overrides** the baseline when it differs. To adopt a new spec version, repin `FACTORY_SPEC` and reconcile changes.
- The deterministic `FACTORY_REQUIRED` configuration makes the creator fail
  closed when `FACTORY_SPEC` is empty. The creator does not infer consent or
  create organization repositories.

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

## Evolution (not included in v1)
- Merged provider defaults (`factory.defaults.json` in `org/factory`, org -> repo inheritance).
- Organization-level reusable CI workflows (`uses: org/factory/.github/workflows/<lang>.yml@vX`).

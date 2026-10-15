# Matt-first fresh setup and unrelated-repository adoption

This work-in-progress source replaces the legacy installer contract in one engine.
It is not a published version, a transfer-ready delivery, or qualification of all
hosts/journeys. The package names and `foundry` binary remain unchanged; selecting
a breaking release number and qualifying the complete pair are separately gated.
Never apply the creator to this source SELF repository.

## Inspect, accept, apply

Build the source with `pnpm build`. Use its exact `dist/index.js` or an explicitly
identified isolated installed package, not a moving registry version. Place the
accepted JSON configuration outside the disposable destination:

```sh
node dist/index.js plan --target /tmp/accepted-empty-project --config setup.json --non-interactive
node dist/index.js apply --target /tmp/accepted-empty-project --config setup.json --non-interactive --accept-plan sha256:PLAN_DIGEST_FROM_PREVIEW
node dist/index.js verify --target /tmp/accepted-empty-project --config setup.json --non-interactive
node dist/index.js doctor --target /tmp/accepted-empty-project --config setup.json --non-interactive
```

`plan`/`dry-run` are read-only. Review every output file/mode/hash, candidate,
configuration, target, local-Git effect, recovery baseline and external
prerequisite. Acceptance covers that exact plan digest. Before mutation the
engine rereads candidate/configuration/target; a changed input invalidates the
acceptance. Interactive apply shows the same complete preview and asks once;
no/EOF/interrupt leaves the plan unapplied. Noninteractive apply requires
`--accept-plan`; `--yes` is not a compatibility alias.
Without `adoption`, the target must be empty or absent with an existing real
parent directory. Nonempty repositories require explicit adoption configuration.
Recognized exact schema-2 ownership permits an unchanged no-op; missing ledger,
drift, changed candidate/config, schema-1 or either legacy state/staging footprint
requires inspected accepted recovery/re-adoption. Matching bytes are not ownership;
neither a directory name nor proximity authorizes replacement or deletion.

## Schema-2 configuration

Every field is explicit. There are no inferred stack/CI/secrets/model/provider
settings, legacy placeholder defaults, or automatic host projections.

```json
{
  "schema_version": 2,
  "profile": "matt-first",
  "project": { "name": "Accepted project" },
  "binding": {
    "provider": "github-issues",
    "repository": "https://github.com/OWNER/REPOSITORY",
    "project": "https://github.com/users/OWNER/projects/1",
    "access": "Permitted existing gh CLI access; no credential discovery.",
    "recovery": "Stop affected work and request exact binding/access repair.",
    "permissions": ["Name the accepted work and separately permitted validation effects."],
    "approval_gates": ["Name current project and human gates; installation grants none."],
    "documentation": {
      "architecture": "AGENT.md",
      "constraints": "AGENT.md",
      "business": "AGENT.md",
      "technical": "AGENT.md"
    }
  },
  "hosts": [{ "id": "plain", "version": "ACTUAL_HOST_VERSION", "route": "manual" }],
  "initialize_git": false,
  "readiness_record": "https://github.com/OWNER/REPOSITORY/issues/NUMBER"
}
```

Replace sample identities with accepted exact destinations; samples confer no
access. The task provider/repository/board, access/recovery, permitted effects,
human gates and four documentation-family sources compose the sole
`docs/bindings.md`. HTTPS sources are external prerequisites, not installed
bytes or working adapters. An external family's actual access/conditional write
and readback must be separately verified before using it. Do not put credentials
in configuration: it is included in Git-owned provenance.

Each selected host has an exact ID/version and the explicit `manual` route.
Native selection fails rather than silently downgrading. This slice generates
no host pointers/projections or plugin content. `initialize_git: true` accepts
only local `git init` at the target, with no template, remote, commit, push or
launch. Git environment overrides are excluded; the actual Git directory is
read back. An uncertain Git operation retains recovery evidence.

## Adopt an unrelated existing repository

Inspect the actual application, Git metadata, instructions/standards, binding and
documentation authority, workflows, startup programs, existing method sources and
unrelated `.factory` content. Preserve exact private before bytes and modes.
Detection is not permission. Reconcile logically conflicting rules before accepting
a plan; an appended pointer cannot override project authority.

Add an explicit `adoption` object to the same configuration:

```json
{
  "startup": ".factory/start.mjs",
  "shared_files": ["AGENT.md", "docs/bindings.md", ".gitignore"],
  "adopt_files": [],
  "rule_reviews": [
    {
      "path": "AGENT.md",
      "sha256": "EXACT_SHA256_OF_REVIEWED_PREEXISTING_BYTES",
      "mode": "0644",
      "compatible": true,
      "resolution": "Record the actual owner/delegation-backed nonconflicting reconciliation."
    }
  ]
}
```

Every existing `AGENT.md` and `docs/bindings.md` needs its own exact rule review;
also name other inspected rules whose compatibility matters. Review decisions are
explicit accepted inputs, not machine proof of semantic compatibility. An absent,
negative or stale required review blocks the plan. A real conflict must be resolved
in project-owned content and reviewed again, not hidden behind `compatible: true`.
Adoption requires an existing real local Git repository and `initialize_git: false`;
it never initializes, commits, changes remotes or pushes that repository.

Only the three named shared paths support appended integration blocks. Markdown
uses `<!-- BEGIN AGENT FOUNDRY -->` / `<!-- END AGENT FOUNDRY -->`; `.gitignore`
uses equivalent `#` delimiters. Original bytes (including a missing final newline)
and modes are preserved as context, not acquired as whole-file ownership. Any
preexisting delimiter requires reconciliation; a marker alone proves no ownership.
Other collisions block unless `adopt_files` explicitly selects identical bytes and
mode. This establishes a specific file baseline, never directory ownership or
permission to overwrite changed content. Unknown unrelated content is allowed.

Select `.factory/start.mjs` when root `start.mjs` belongs to the application.
The installed envelope and provenance record `node .factory/start.mjs`; no alias
replaces the root program. Selecting root startup does not authorize replacement
of an unrelated root file. The stable `docs/bindings.md` remains the sole binding;
its existing authority survives outside the accepted integration block.

Preview lists exact file/block actions, owned delimiters/block digest, before
identity/mode, protected context digest and base64 before/after bytes for existing
integrations. Review these locally; private project/recovery bytes do not belong
in public evidence. The accepted digest binds these effects, configuration,
candidate, target and existing touched-parent identities. Recheck before writes;
stale bytes/mode/context or unsafe paths require a newly reconciled accepted plan.
Decline leaves the target unchanged. No force or whole-directory takeover exists.

Interactive apply shows the same scoped ownership/baseline and complete before/after
bytes on stderr before asking for consent. UTF-8 content is JSON-escaped to keep
terminal controls inert; non-UTF-8 content is shown losslessly as base64.
Post-action stdout JSON is not a substitute for this pre-consent review.

Schema-2 ownership records `boundary: block` separately from its full protected
file context and its exact `before` identity. Private `.staging/before` snapshots
preserve preimages; `.staging/files` contains selected output; the journal records
the scoped baseline and applied/displaced paths. Shared-file application first
moves the named preimage into private `.staging/displaced`, verifies it, then links
the output exclusively. A racing replacement is retained, not overwritten/deleted;
an intervening destination prevents the exclusive link. Interrupted effects remain
partial and inspectable, never crash-atomic or automatically rolled back. Stop
commits/transfer of partial recovery material until it is safely excluded.
Full update, authorized recovery/retirement and legacy migration remain separate
units. Keep every preimage/journal needed for those actions.

Use the same independent manual/provider discovery and passive stop requirements
below in the actual adopted application. Fresh-only fixture proof cannot qualify
adoption. Required denied/missing observations leave setup incomplete with actual
applied effects; optional unselected native routes are not silently required.

## Selected output and immutable identity

The complete inventory is shown by preview, not a broad inherited template:

- `AGENT.md`: short integration envelope, applicable procedures and human gates.
- `start.mjs`: passive local diagnosis; no ticket claim, network, launch or work.
- `docs/bindings.md`: sole accepted slim binding and documentation authority.
- `.factory/procedures.md`: seven semantic contracts and exact readable sources.
- `.factory/skills/matt-pocock/`: selected unchanged upstream tree/resources,
  metadata and complete MIT notice at
  `mattpocock/skills@49dd158d1076134a641b33efb035946536778336`.
- `.factory/skills/foundry-checkpoint/SKILL.md` and
  `.factory/skills/foundry-resume/SKILL.md`: durable boundaries, not a phase engine.
- `.factory/provenance.json`: schema-2 candidate/config/payload/source identities,
  indexed paths/hashes/adaptations/manual routes and tracker readiness pointer.
- `.gitignore`: accepted exclusion for local `.factory/creator/` recovery bytes.
- `.factory/creator/state.json`: local 0600 schema-2 `matt-first` ledger with exact
  file boundaries, absence baseline, hashes/modes and provenance identity.

Build verifies selected upstream bytes/Git blobs/modes with
`node scripts/procedure-sources.mjs`; the payload declaration/lock selects only
these inputs plus startup. `dist/candidate.json` binds source revision and dirty
status, compiled engine-file hashes, package metadata and payload digest. Dirty
source is explicitly source-local, not claimed identical to its base commit.
Provenance binds those identities to generated bytes. None is a signature,
publication attestation, task store, host qualification or readiness certificate.

No default handbook/runbook, compulsory phase engine, governance/forms/workflows,
CI, README replacement, second provider manifest, secrets setup or global
runtime/auth/model changes are installed.

## Integrity, readiness and recovery

`applied` with `integrity: verified` means the accepted named file bytes/modes
were verified, not setup complete. All machine results retain `setup: incomplete`
because this offline installer does not perform remote or independent-session
observations. The required observations and exact tracker pointer are reported.
Consult the current scoped tracker record; never convert an old flag or file
presence into readiness.

`node start.mjs` passively distinguishes `SELF`, `INCOMPLETE`, `USABLE` readable
foundation with verified local integrity, and `UNSAFE`/unrecognized state.
`USABLE` does not certify external readiness or permission. Missing local ledger
allows read-only Git/provenance discovery but does not establish updater
ownership. Startup proposes explicit planning selection and stops.

Separately authorize and invoke a genuinely independent manual validator with
only the installed startup pointer and bounded validation authority. It loads
the binding/index/selected method and dependencies, reads exact native provider
identity/state/owner/dependencies/project, demonstrates a legitimate permitted
write and fresh exact readback, records exact candidate/host/workspace/access
observations on that tracker, identifies the proposed planning action and
required authority, then stops without planning/implementation. Scope all claims
to actual evidence. Required missing evidence means incomplete; optional modes
not selected are not failures. Host/binding/source/workspace changes invalidate
affected observations. Installed-candidate evidence is not registry proof.

Apply binds mutations to opened directory handles and the journal to its
exclusively created file handle. Target/ancestor/journal replacements cannot
redirect writes; competing applies cannot acquire or erase another transaction's
staging. Hosts without working directory-descriptor paths fail before writes
rather than falling back to unsafe lexical mutation. This mechanism is exercised
on Linux here; other environments require their own capability observation.
New-destination acquisition retains the accepted parent until the root is opened,
checks its identity and rechecks emptiness before staging. Journal updates finish
all positional writes before truncation/sync; a zero-progress write fails rather
than claiming committed recovery evidence.
Acquired descendant handles, including staging and local Git, remain open through
the transaction. Reuse checks the named inode; new parents are created exclusively.
A substituted real directory is not silently adopted as a transaction directory.

The exact private staged-file identities and 0600 journal path are shown before
consent. `.factory/creator/.staging/journal.json` records the accepted candidate,
absence baseline, actual applied files and local-Git not-started/attempted/verified
boundary. Completed journal/staged bytes remain private recovery evidence with
`status: committed`; they are not active procedure sources or task state.
`doctor` reads the journal and actual files, reporting applied/pending effects
even before installed startup exists. It does not blindly replay or erase them.
Read-only diagnosis validates retained staged bytes/modes, the journal's private
mode, accepted candidate/file inventory, absence baseline and local-Git boundary.
Missing or inconsistent committed recovery evidence cannot report healthy/USABLE.
A present ledger must match its complete committed recovery identity, including
metadata-only atomic replacements. Ledger-absent clone discovery remains read-only.
When local Git was selected, plan/verify/doctor/startup also perform a read-only
Git-root readback with ambient Git overrides excluded. A linked, non-repository
or outside-resolving `.git` cannot yield a healthy/verified no-op. Startup still
does not initialize Git, write a tracker, launch a method or grant authority.

A filesystem compare-then-unlink cannot exclude concurrent edits. This fresh
path therefore preserves partial files/staging on handled failure or interruption
and reports no automatic rollback/restoration; it never deletes a racing edit
or claims crash atomicity. Inspected, separately authorized restoration/completion
and staging retirement belong to the recovery unit. `--failure-after N` and
`--interrupt-after N` are explicit local fault-injection seams.

The initializer forwards schema-2 configuration and exact acceptance to this
same engine. Source package-content helpers use preview/accept/integrity and do
not launch fake agents or qualify real host/provider readiness. Legacy release
matrices and source-maintenance recipes are not Matt-first release qualification;
complete pair/journey/host/publication checks remain separate bounded units.

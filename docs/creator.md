# Matt-first fresh setup — source-local breaking cutover

This work-in-progress source replaces the legacy installer contract in one engine.
It is not a published version, a transfer-ready delivery, or qualification of all
hosts/journeys. The package names and `foundry` binary remain unchanged; selecting
a breaking release number and qualifying the complete pair are separately gated.
Never apply the creator to this source SELF repository.

## Inspect, accept, apply

Build the source with `pnpm build`. Use its exact `dist/index.js` or an explicitly
identified isolated installed package, not a moving registry version. Place the
accepted JSON configuration outside the empty disposable destination:

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

The target must be empty or absent with an existing real parent directory.
Nonempty unrelated repositories require the separate adoption path, not fresh
classification. Recognized exact schema-2 ownership permits an unchanged no-op;
missing ledger, drift, changed candidate/config, schema-1 or either legacy
state/staging footprint requires inspected accepted recovery/re-adoption. No
matching-bytes ownership or whole-directory deletion is inferred.

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

Apply stages/validates all named bytes/modes and records the accepted plan and
applied effects in `.factory/creator/.staging/journal.json`. Exclusive file
creation refuses racing destination files. A handled file failure restores only
unchanged newly created files to absence; a concurrent edit prevents unsafe
restoration and preserves the journal. Interruption/uncertain Git leaves exact
staged evidence. Diagnosis never blindly replays apply, wipes staging or claims
crash atomicity. `--failure-after N` and `--interrupt-after N` are explicit local
fault-injection seams; full update/shared-block/crash recovery belongs to the
separate recovery unit.

The initializer forwards schema-2 configuration and exact acceptance to this
same engine. Source package-content helpers use preview/accept/integrity and do
not launch fake agents or qualify real host/provider readiness. Legacy release
matrices and source-maintenance recipes are not Matt-first release qualification;
complete pair/journey/host/publication checks remain separate bounded units.

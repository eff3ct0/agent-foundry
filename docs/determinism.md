# Determinism and idempotency

Local checks remain offline and state-changing operations are safe to repeat.
The first run may create or replace creator-owned state; a second run produces
the same content and reports `noop` for unchanged files.

## Local operations

| Operation | Classification | Repeat-run contract |
| --- | --- | --- |
| `start.mjs` | Read-only, offline | Same local marker, mode, and message for unchanged files |
| `foundry plan` / `dry-run` | Read-only, offline | No target mutation; same JSON envelope |
| `foundry apply` | Local write, transactional | Stable payload/config identity; failed writes roll back |
| `foundry verify` | Read-only, offline | Revalidates generated contracts and ownership |
| `foundry doctor` | Read-only, offline | Reports interrupted staging, payload mismatch, and drift |
| `scripts/check-determinism.mjs` | Source-only static audit | Same result for unchanged source and package contracts |
| `scripts/typed-inherited-runtime/check-delivery-contract.js` | Compiled Node structural contract | Validates designated entry safety clauses, required task-route destinations, docs, providers, and CI recipe data; build verifies exact typed-source output before packaging |
| `scripts/check-factory-layout.mjs` | Node layout contract | Validates initialized-project support boundaries |
| `scripts/check-bootstrap-workflow.mjs` | Node workflow contract | Rejects floating actions and unsafe release boundaries |
| `scripts/typed-runtime/check-real-agent-workflow.js` | Compiled Node workflow contract | Rejects unpinned or cross-credential real-agent paths; build verifies exact typed-source output before packaging |

## Static route validation

The delivery-contract fixture starts at the real `AGENT.md` entry in source and a
fresh initialized project. It checks bounded safety clauses and explicit
approval/readback inversions in the designated approval section, compares the
generated task provider fragment with its bound `TASK_TRACKER`, and follows
required bug-fix, provider-setup, and release routes to local files. Optional
topics and an unconfigured `TRACKER_KEY` are allowed. A missing or contradictory
clause, mismatched provider, or missing required destination produces a
diagnostic; a heading or link label alone is not proof. These checks recognize
specific fixture wording, not arbitrary paraphrases or contradictory policy
outside the checked section.
This is **static navigation and text evidence**, not proof that a running agent
read, understood, or obeyed the guidance. It does not verify live task-provider
identity/readback, approval authority, remote access, or release behavior. The
parent context-routing issue still needs its independent acceptance and runtime
evidence.

## Payload and ownership

The single ownership contract is `archetype-ownership.json`. The package build
derives the payload boundary from its inherited/generated entries and always
includes the placeholder and ownership contracts as creator inputs. Source-only
governance and release assets stay out of the generated payload. The checked-in
`package/payload-manifest.json` is regenerated whenever the declared payload
changes.

The Python CI recipe and language/provider metadata are data for generated
projects. They are intentionally retained in the payload until composition and
are not executable maintainer tooling.

## Workflow and recovery boundaries

Release and real-agent workflows use Node helpers, pinned actions, bounded
evidence, and fail-closed external readback. Missing credentials or unavailable
registry/repository state is reported as blocked or failed; it is never treated
as hosted success. Cleanup targets only the exact run-scoped resource.

GitHub Template mode is retained only as a rollback safety valve until the
exact-version package and published-consumer checks pass. If the package path
fails, re-enable Template mode and repair the package. Published npm bytes are
immutable; publish a correcting version.

# Agent Foundry

Repository-local integration and small, explicitly selected procedures for
bounded durable work. Matt supplies adaptable methods; Foundry supplies accepted
bindings, discovery, provenance, authorization and checkpoint/resume obligations.
The harness executes; the human owns goals, consequential decisions and effects.

## Source-local Matt-first work in progress

The current source is implementing the [Matt-first specification](https://github.com/eff3ct0/agent-foundry/issues/403#issuecomment-6175134613)
through [#406](https://github.com/eff3ct0/agent-foundry/issues/406). The fresh-local
cutover in [#407](https://github.com/eff3ct0/agent-foundry/issues/407) is not a
published release, a completed implementation unit or a transfer-ready delivery.
Existing registry versions retain their old contracts. Do not use a moving
version or old installer over a new ledger and assume compatibility.

The source CLI now has one schema-2 `matt-first` fresh installation engine:
read-only exact preview, acceptance of its digest, guarded scoped apply,
file-integrity verification and passive startup. It installs the short envelope,
sole binding, seven-entry readable catalog, reviewed selected upstream/resources
and license, two durable procedures, one provenance record and local exact-file
ownership/recovery ledger. It does not inherit a default phase/governance/CI
bundle or start planning/work.

See [the creator contract](docs/creator.md) for explicit configuration, local
commands, acceptance, output/state/machine-version changes and recovery limits.
[Installer presentation](docs/installer-ux.md) describes the same engine's UI.
The source-input verifier is `node scripts/procedure-sources.mjs`; `pnpm build`
binds packaged payload and compiled-engine identities. Those checks are not
host, provider, independent-session or published-consumer qualification.

Startup reports `SELF`, `INCOMPLETE`, `USABLE` readable installed foundation, or
`UNSAFE`. `USABLE` verifies local content only; required remote/host readiness is
separately observed on the bound tracker. The proposed planning procedure is
passive and needs explicit selection or covering delegation.

## Distribution and gates

Package identities remain `@eff3ct/agent-foundry` (`foundry`) and
`@eff3ct/create-agent-foundry` (the exact-version initializer). The initializer
delegates to the same engine, including schema-2 configuration and exact-plan
acceptance. This source does not select an unused breaking version or authorize
publishing either package. Existing npm bytes remain immutable.

Existing-repository adoption, full update/recovery, explicit legacy re-adoption,
native host qualification, optional orchestration/clean-session continuation,
coherent breaking pair preparation, integrated acceptance and publication are
separate units in the adopted graph. Fresh fixture success does not establish
those behaviors. No automatic legacy conversion or hidden compatibility engine
is provided.

## Contributing to this source

Run `node start.mjs` first and follow SELF output. This repository is the source
archetype: **never apply its creator here**. Read [AGENT.md](AGENT.md),
[docs/bindings.md](docs/bindings.md), [MAINTAINERS.md](MAINTAINERS.md) and the
required task-routed contracts. The source's current governance remains in
force; installed Matt-first procedures do not replace it.

GitHub Issues and Project 1 hold authoritative task state. Use existing issue
forms and PR conventions, preserve protected approvals and publication gates,
and confirm/freshly read back durable operations. Exact-revision review and
applicable behavior evidence are required; a commit or PR alone is not Done.
Persisted work is English; conversation language is independent.

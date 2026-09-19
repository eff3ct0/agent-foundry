# Transactional project creator

The package CLI uses the immutable payload produced by #105 as its only source
of template files. It does not make network calls or mutate the payload.

```sh
factory-template plan --target ./new-project --config answers.json --non-interactive
factory-template dry-run --target ./new-project --config answers.json --non-interactive
factory-template apply --target ./new-project --config answers.json --non-interactive
factory-template verify --target ./new-project --config answers.json --non-interactive
factory-template doctor --target ./new-project --config answers.json --non-interactive
```

Every command emits one versioned JSON envelope on stdout. Human diagnostics
and prompts are written to stderr. `plan` and `dry-run` are read-only. An
`apply` stages bytes under `.factory-template-creator/.staging`, verifies each
staged digest and mode, and commits only after the complete stage is valid.
Creator state is stored in `.factory-template-creator/state.json`; it records
the payload identity, configuration digest, and bounded output ownership
digests. It does not copy the payload manifest or become a second payload
source of truth.

The creator never overwrites an unknown file. An unchanged rerun is `noop`.
Changed configuration produces an explicit update plan, while an externally
drifted owned file is a conflict requiring recovery rather than an implicit
overwrite. `doctor` reports interrupted staging, payload mismatch, ownership
drift, unknown files, and incomplete configuration.

The interactive presentation layer is documented in
[`docs/installer-ux.md`](installer-ux.md). It keeps prompts, review, progress,
confirmation, and completion summaries on stderr while retaining this JSON
envelope on stdout. It delegates every write to the same plan/apply/verify
engine and never launches an agent.

Initialization composition is part of the same plan/apply/verify transaction.
The payload carries the placeholder schema, provider fragments, CI recipe
catalog, and ownership inventory as immutable inputs. Configuration keys are
validated for required, enum, conditional, duplicate, and unknown-key errors
before any target write. Only the ownership inventory's explicit text-file list
is rendered; binary or unclassified files are copied without broad replacement.

The selected task, secrets, optional code-intelligence, and CI recipes are
composed in stable order. Provider and CI inputs, placeholders, and the
ownership manifest are removed only when their packaged bytes are unchanged;
changed paths become conflicts. Retained assets are relocated under `.factory`
according to the ownership contract, while generated bindings, CI, and optional
OpenCode output remain at their declared destinations. Application-owned and
unknown files are never removed or overwritten.

`--failure-after N` and `--interrupt-after N` are deterministic failure-injection
options used by the focused tests. The former must roll back creator-owned
changes; the latter intentionally leaves staging for `doctor` to report.

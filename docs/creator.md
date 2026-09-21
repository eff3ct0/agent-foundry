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

## Provider-aware setup

The creator has a versioned, provider-neutral catalog for the supported agent
providers. Select no provider, one provider, or several providers with
`--agent <id>` or `--agents <id,...>`:

| Provider ID | Executable | Workspace-owned file | Handoff command shape |
| --- | --- | --- | --- |
| `claude-code` | `claude` | `.claude/factory-template.md` | `claude --cwd <project-directory>` |
| `opencode` | `opencode` | `.opencode/agents/factory-template.md` | `opencode --dir <project-directory>` |
| `codex` | `codex` | `.codex/AGENTS.md` | `codex --cd <project-directory>` |
| `pi` | `pi` | `.pi/AGENTS.md` | `pi --cwd <project-directory>` |

Provider selection is validated and executable detection happens before any
target write. An unavailable provider fails closed with an actionable hint.
`none` (the default) creates no provider files. A selected provider produces
the stable `.factory/provider-manifest.json` and records its generated files in
the normal creator ownership state.

Provider adapters own only the files listed in the catalog. Unknown files and
changed managed files remain protected by the creator conflict rules. Provider
setup therefore participates in dry-run, staging verification, rollback, and
rerun `noop` detection; it does not modify global user configuration.

Use `--launch-agent` only with exactly one selected, installed provider. The
flag is disabled by default and is evaluated only after apply and verify have
succeeded. The handoff uses an argument array with shell execution disabled and
reports the provider exit code separately; an agent failure never claims that
the repository setup succeeded. Runtime installation, authentication, API-key
configuration, model selection, and global preferences remain manual user
prerequisites and are never written to generated files.

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

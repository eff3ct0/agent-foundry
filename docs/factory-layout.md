# Factory layout contract

This document defines the target layout of a **fresh initialized repository**.
The Node creator relocates retained factory support under `.factory/`; the source
archetype keeps maintainer-only packaging and release tooling outside the
generated payload.

## Canonical root allowlist

The root contains host-discovered entrypoints, platform configuration, generated
project output, and application-owned content. Factory support content belongs
under `.factory/`.

| Root path | Classification | Evidence and decision |
| --- | --- | --- |
| `AGENT.md` | Root-required | `AGENT.md` is the primary agent entrypoint and its cold-agent reading order starts here. A host must find it without knowing the factory layout. |
| `CLAUDE.md` | Root-required | `CLAUDE.md` is Claude Code's repository entrypoint and directs the agent to `AGENT.md` and the bindings. |
| `README.md` | Root-required | GitHub and humans discover the repository overview at the root; it is also the stable project-facing documentation entrypoint. |
| `start.mjs` | Root-required | `start.mjs` is the canonical Node startup router and resolves its repository root from the selected working directory. |
| `.gitignore` | Root-required | Git discovers ignore rules from the repository root before any project or factory path is interpreted. |
| `.github/` | Root-required | GitHub discovers issue forms, pull-request metadata, and workflows only from `.github/` at the repository root. |
| `.opencode/` | Root-required, optional | OpenCode discovers project plugins from `.opencode/plugins/`; the generated startup adapter remains there. |
| `.claude/` | Root-required, optional | Claude Code discovers project settings from `.claude/`; only host configuration belongs here. |
| `.pi/` | Root-required, optional | Pi discovers project extensions from `.pi/extensions/`; only host configuration belongs here. |
| `docs/bindings.md` | Generated project output | The initializer currently generates this path, and `AGENT.md`, `CLAUDE.md`, and the runbook link to it. Keep this output path stable until a compatibility-preserving migration is implemented. |
| `.github/workflows/ci.yml` | Generated project output | GitHub Actions requires this root-relative path for the generated workflow. |
| `.opencode/plugins/factory-start.ts` | Generated project output | OpenCode requires the plugin under its root-discovered directory; generation remains opt-in. |
| Toolchain manifests | Application-owned, root-allowed | Stack detection intentionally reads root manifests such as `Cargo.toml`, `package.json`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`, and `go.mod` (see `docs/agent-init.md`). |
| Application paths | Application-owned, root-allowed | Project source, tests, assets, and other product paths are not factory support and remain owned by the initialized project. |
| `.factory/` | Factory boundary | This is the only root directory reserved for retained factory support assets. It is a directory boundary, not a pointer file. |

The following factory-support directories are **not** allowed at the initialized
repository root: `checks/`, generic `docs/` content, `hooks/`, retained
factory `scripts/`, and `templates/`. `docs/bindings.md` is the deliberate
generated-output exception described above; application documentation remains
application-owned.

The source-template inventory maps to the target as follows:

| Current source path | Target classification | Target path or disposition |
| --- | --- | --- |
| `checks/`, retained generic `scripts/`, and `templates/` | `.factory`-relocatable | `.factory/checks/`, `.factory/scripts/`, and `.factory/templates/` |
| Generic `docs/*.md` | `.factory`-relocatable | `.factory/docs/` |
| `hooks/` | `.factory`-relocatable | `.factory/hooks/` |
| `docs/bindings.md`, `.github/workflows/ci.yml`, `.opencode/plugins/factory-start.ts` | Generated project output | Keep the root-discovered output paths shown above |
| `AGENT.md`, `CLAUDE.md`, `README.md`, `start.mjs`, `.gitignore`, `.github/`, `.opencode/`, `.claude/`, `.pi/`, and toolchain manifests | Root-required or application-owned | Keep at the repository root |
| Application source, tests, assets, and product documentation | Application-owned | Keep under project-owned paths; never classify them as factory support |
| `archetype-ownership.json`, `MAINTAINERS.md`, `providers/`, `ci/`, and release-only tooling | Consumed/removed source-only content | Not present after generation |

Source-only composition inputs and maintainer tooling (`archetype-ownership.json`,
`MAINTAINERS.md`, `ci/`, `providers/`, and release-only tooling) are consumed or
removed by generation and are not part of the generated layout.

## Existing initialized repositories

This relocation applies while the Node creator composes a repository from the package.
Repositories initialized before this change are not rewritten automatically: their
existing root support paths continue to work, and their root entrypoints and
application-owned paths are not altered. There is intentionally no migration
command in this change. An owner that wants the new boundary can move the support
assets as a normal reviewed repository change, preserving the root entrypoints,
generated outputs, host-discovery paths, and relative links described below.

## `.factory/` support-directory contract

The first level under `.factory/` is fixed and intentionally small:

| Path | Contents | Compatibility rule |
| --- | --- | --- |
| `.factory/checks/` | Retained offline structural and phase checks. | Checks resolve the repository root explicitly; they do not infer it from the current working directory. |
| `.factory/docs/` | Retained generic factory workflow, handbook, bootstrap, and governance documentation. | Relative links are rebased during relocation and must resolve from their new location. |
| `.factory/hooks/` | Source adapters for Claude Code, Pi, and OpenCode. | Adapters invoke the root `start.mjs` with shell-free Node argv; host-discovered copies/configuration stay in `.claude/`, `.pi/`, and `.opencode`. |
| `.factory/scripts/` | Retained generic checkers and local synchronization helpers. | Documented commands use an explicit `.factory/scripts/...` path or a root wrapper; no command silently changes provider semantics. |
| `.factory/templates/` | Generic ticket, handoff, runbook, DoD, ADR, and specification templates. | Links from root-facing documents use the new `.factory/templates/...` path. |

No `.factory/layout.json`, pointer file, or second manifest is required. The
directory contract above is the single physical boundary; the ownership
inventory remains authoritative for initialization lifecycle classification.

## Compatibility matrix

| Consumer | Current source path | Contract path | Required compatibility evidence |
| --- | --- | --- | --- |
| Manual startup | `start.mjs` | `start.mjs` | `node start.mjs` is the canonical mode router and produces deterministic output. |
| Claude startup adapter | `hooks/claude-code/session-start.sh` | `.factory/hooks/claude-code/session-start.sh` plus `.claude/` host configuration | The adapter resolves the repository root and executes `node start.mjs`; Claude's discovery path is not moved into `.factory/`. |
| Pi startup adapter | `hooks/pi/factory-start.ts` | `.factory/hooks/pi/factory-start.ts` plus `.pi/extensions/` host copy | The extension executes Node with an argv array for `start.mjs` in the harness working directory. |
| OpenCode startup adapter | `hooks/opencode/factory-start.ts` | `.factory/hooks/opencode/factory-start.ts` plus `.opencode/plugins/factory-start.ts` | The generated plugin remains in `.opencode/plugins/` and remains opt-in. |
| GitHub workflows/forms | `.github/` | `.github/` | GitHub's root discovery is preserved; workflows and forms are never hidden under `.factory/`. |
| Generated bindings | `docs/bindings.md` | `docs/bindings.md` | Existing links and generated-provider content remain valid; relocation must update links atomically if this path ever changes. |
| Generic documentation | `docs/*.md` | `.factory/docs/*.md` | Every relative Markdown link is checked after rebasing; root-facing entrypoints link to the new location. |
| Generic commands | `scripts/*.mjs`, `scripts/typed-inherited-runtime/*.js` | `.factory/scripts/` | Commands use explicit relocated paths; the label synchronizer and PR governance checker run from their packaged ESM runtime scope. |
| Provider/CI inputs | `providers/`, `ci/` | Removed after initialization | They are composition inputs, not initialized-project support assets; provider and CI semantics do not change. |

The structural regression check builds a fresh fixture from this contract,
checks the allowlist and `.factory/` children, verifies generated outputs, and
proves that legacy root support directories and pointer manifests fail. It is
offline and performs no GitHub or provider operation.

Run it from the source template root with:

```sh
node scripts/check-factory-layout.mjs
```

After initialization, the retained checker is available at:

```sh
node .factory/scripts/check-factory-layout.mjs
```

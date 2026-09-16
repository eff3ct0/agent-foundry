## Native repository tools

## Identity

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `code-intelligence`
> **Provider:** `none`

## Binding

**Binding:** No structural index is configured. Use the repository's native
search, read, and version-control tools for code navigation and impact checks.

## How the agent interacts

**Interaction:** Search and read repository files and inspect version-control
history and diffs directly. These native tools are the source of truth for
navigation, references, and impact checks.

## Rules and limitations

**Rules:** This is the default and adds no dependency. If the repository later
gets a structural index, select and verify that provider explicitly.

**Intentional minimal contract:** `none` is the intentional minimal default
when no structural index is selected. It deliberately provides native tools
only and introduces no dependency.

## Prohibitions

Do not treat the absence of an index as permission to bypass repository rules or
verification, and do not expose secrets from repository data.

## CodeGraph

## Identity

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `code-intelligence`
> **Provider:** `codegraph`

## Binding

**Binding:** Use the configured CodeGraph index for structural questions about
symbols, call paths, callers/callees, references, and blast radius when it is
available and current.

## How the agent interacts

**Interaction:** Query CodeGraph for indexed source, symbols, callers/callees,
references, and impact paths. Treat the repository files as the source of truth
for changes and returned indexed source as evidence for navigation.

## Rules and limitations

**Rules:** Treat returned source as the current indexed evidence only when the
index is fresh. Fall back to native repository tools if CodeGraph is unavailable
or stale. The index informs navigation and impact analysis; it does not replace
tests, review, or repository policy.

## Prohibitions

**Prohibition:** CodeGraph is an optional implementation, not a dependency of
the archetype or `init.py`. Do not treat the index as permission to modify code,
bypass repository rules, or replace verification with a graph query. Do not
expose secrets from indexed data.

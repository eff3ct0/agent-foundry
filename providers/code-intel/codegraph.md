## CodeGraph

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `code-intelligence`
> **Provider:** `codegraph`

**Binding:** Use the configured CodeGraph index for structural questions about
symbols, call paths, callers/callees, references, and blast radius when it is
available and current.

**Rules:** Treat returned source as the current indexed evidence only when the
index is fresh. Fall back to native repository tools if CodeGraph is unavailable
or stale. The index informs navigation and impact analysis; it does not replace
tests, review, or repository policy.

**Prohibition:** CodeGraph is an optional implementation, not a dependency of
the archetype or `init.py`.

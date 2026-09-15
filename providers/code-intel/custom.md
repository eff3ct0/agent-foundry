## Custom code intelligence provider

## Identity

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `code-intelligence`
> **Provider:** `custom`

## Binding

**Binding:** Structural intelligence is supplied by the project-defined custom
provider. Its scope and availability must be documented before operational use.

## How the agent interacts

**Interaction:** Use the custom provider's documented query mechanism for source,
callers/callees, references, and impact information. Repository files remain the
source of truth for changes.

## Rules and limitations

**Rules:** Complete this fragment from the contract using official provider
documentation, record provenance, and obtain human review before using it
operationally. Until then, use native repository tools.

## Prohibitions

Do not treat the provider as permission to modify code, bypass repository rules,
or replace verification with a graph query. Do not expose secrets from indexed
data.

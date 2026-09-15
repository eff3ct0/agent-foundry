## Custom secrets provider

> **Contract instance:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capability:** `secrets`
> **Provider:** `custom`

Custom secrets manager: define the rules here - name, secret location, ephemeral
command-time injection, and prohibitions.

<SECRETS_PROVIDER_CUSTOM_RULES>

**Binding:** Define where secrets live and the project path or mount.

**Agent resolution:** the harness provides MCP, CLI, or API; define how to locate,
read, and mount or inject secrets without exposing their values.

**Usage rules:** define how commands receive secrets and which durable project
reference remains.

**Prohibitions:** never store secrets in code, logs, commits, or persistent
memory; never use alternate providers.

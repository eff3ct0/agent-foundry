## Vault

> **Contract instance:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capability:** `secrets`
> **Provider:** `vault`

**Binding:** Secrets are obtained EXCLUSIVELY from Vault (mount/path
`<SECRETS_PATH>`). The agent MUST read them there at command time and MUST NOT
take them from another source.

**Agent resolution:** use the harness mechanism (MCP, CLI, or API). Authentication
uses the environment-provided role. Read the secret from `<SECRETS_PATH>`
ephemerally and inject it into the command.

**Usage rules:**
- Resolve at execution time, keep in memory, and discard on completion.
- Respect the secret TTL/lease; do not cache beyond its lifetime.
- Refer to secrets by name/key, never by value.

**Prohibitions:** do not materialize secrets on disk or use alternate providers.

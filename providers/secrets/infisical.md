## Infisical

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `secrets`
> **Provider:** `infisical`

**Binding:** Secrets are obtained EXCLUSIVELY from Infisical (path
`<SECRETS_PATH>`). The agent MUST inject them from there at command time and
MUST NOT take them from another source or invent them.

**Agent resolution:** use the harness mechanism (MCP, CLI, or API). Semantic
operation: inject secrets from `<SECRETS_PATH>` into the environment of the
command that needs them, ephemerally.

**Usage rules:**
- Resolve values at command time and keep them only for the process lifetime.
- Read, use, and discard; never materialize values on disk.
- Refer to secrets by name/key, never by value.

**Prohibitions:**
- Do not copy secrets to `.env`, configuration files, or session history.
- Do not use alternate providers.

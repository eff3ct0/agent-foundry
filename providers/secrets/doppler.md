## Doppler

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `secrets`
> **Provider:** `doppler`

**Binding:** Secrets are obtained EXCLUSIVELY from Doppler (project-config
`<SECRETS_PATH>`). The agent MUST inject them from there at command time and
MUST NOT take them from another source.

**Agent resolution:** use the harness mechanism (MCP, CLI, or API). Semantic
operation: inject the environment for project-config `<SECRETS_PATH>` (for
example with `doppler run`) into the command that needs it, ephemerally.

**Usage rules:**
- Resolve values when executing and keep them only for the process lifetime.
- Read, use, and discard; never materialize values on disk.
- Refer to secrets by name, never by value.

**Prohibitions:** do not copy secrets to files, logs, commits, or session
history, and do not use alternate providers.

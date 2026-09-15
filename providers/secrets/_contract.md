# Abstract contract: secrets provider

This file defines the required shape of a `secrets` instance. It is not a
selectable provider and is never composed into `docs/bindings.md`.

Every `providers/secrets/<provider>.md` fragment must include these fields:

## Identity
- `Contract instance`: reference to this file.
- `Capability`: `secrets`.
- `Provider`: name of the bound secrets manager.

## Binding
State where secrets live and which project path, mount, or environment is used.

## How the agent resolves secrets
Distinguish the harness mechanism (MCP, CLI, or API) from the binding's rules.
Explain how to locate, read, and mount or inject a secret without exposing its value.

## Usage rules
State when the agent may read a secret, how commands receive it, and which
durable configuration or reference the project must retain.

## Prohibitions
Secrets must not appear in code, logs, commits, persistent memory, or prompts.
Do not use alternate providers or materialize secret values on disk.

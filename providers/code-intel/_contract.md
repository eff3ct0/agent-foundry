# Abstract contract: code intelligence provider

This file defines the required shape of a `code-intel` instance. It is not a
selectable provider and is never composed into `docs/bindings.md`.

Every `providers/code-intel/<provider>.md` fragment must include:

## Identity
- `Contract instance`: reference to this file.
- `Capability`: `code-intelligence`.
- `Provider`: name of the structural index or native-tools fallback.

## Binding
State where structural intelligence is available and whether the agent must use
it for code navigation, dependency, and impact questions.

## How the agent interacts
Describe the supported query mechanism and the source of truth for returned
code, callers/callees, references, or impact information.

## Rules and limitations
Document freshness, scope, and fallback behavior. The binding must not require
an external dependency when the selected provider is `none`.

## Prohibitions
Do not treat an index as permission to modify code, bypass repository rules, or
replace verification with a graph query. Do not expose secrets from indexed data.

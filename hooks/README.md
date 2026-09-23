# Optional Session Hooks

The archetype keeps `start.mjs` as the single source of truth for startup
routing. Harness adapters are opt-in glue: they run `start.mjs` and forward its
stdout to the harness context. They do not detect modes, call the network, or
perform outward actions. When no adapter is enabled, run `node start.mjs`.

## Claude Code

The source adapter is `hooks/claude-code/session-start.sh`; after initialization
it is retained at `.factory/hooks/claude-code/session-start.sh`. Make it
executable and add it to the project's `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR/.factory/hooks/claude-code/session-start.sh\""
      }]
    }]
  }
}
```

```sh
chmod +x .factory/hooks/claude-code/session-start.sh
```

## Pi

Copy `hooks/pi/factory-start.ts` to `.pi/extensions/factory-start.ts`:

```sh
mkdir -p .pi/extensions
cp .factory/hooks/pi/factory-start.ts .pi/extensions/factory-start.ts
```

It runs `node start.mjs` on `session_start` and returns its stdout from
`before_agent_start`. Pi loads project-local extensions only after the project
is trusted.

## OpenCode

The adapter is opt-in. Confirm `OPENCODE_PLUGIN=true` in the creator
configuration. The creator then copies it to `.opencode/plugins/`.

It runs `node start.mjs` when `session.created` fires and appends the stdout to
the first `chat.message` as a text part. Local plugins require no package
dependency. The manual `node start.mjs` command remains the canonical fallback.

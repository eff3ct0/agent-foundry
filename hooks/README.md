# Optional Session Hooks

The archetype keeps `start.py` as the single source of truth for startup
routing. Harness adapters are opt-in glue: they run `start.py` and forward its
stdout to the harness context. They do not detect modes, call the network, or
perform outward actions.

## Claude Code

The source reference adapter is `hooks/claude-code/session-start.sh`; after
initialization it is retained at `.factory/hooks/claude-code/session-start.sh`.
Make the initialized adapter executable after copying the template, then add this to the project's
`.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR/.factory/hooks/claude-code/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

Run:

```sh
chmod +x .factory/hooks/claude-code/session-start.sh
```

Claude Code adds successful command-hook stdout to the session context. The
manual `python3 start.py` rule remains the universal fallback when hooks are
not enabled.

Official documentation: [Claude Code hooks](https://code.claude.com/docs/en/hooks).

## Pi

The source adapter is `hooks/pi/factory-start.ts`; after initialization it is
retained at `.factory/hooks/pi/factory-start.ts`. Copy it to the project's
`.pi/extensions/` directory so Pi discovers it automatically:

```sh
mkdir -p .pi/extensions
cp .factory/hooks/pi/factory-start.ts .pi/extensions/factory-start.ts
```

It runs `python3 start.py` on `session_start`, then returns its stdout as the
message from `before_agent_start`. Pi loads project-local extensions only after
the project is trusted.

Official documentation: [Pi extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/extensions.md).

## OpenCode

The adapter is opt-in. During initialization, confirm `OPENCODE_PLUGIN=true`
interactively or pass it explicitly with `--set OPENCODE_PLUGIN=true` (or in an
answers file). The initializer then copies it to the project's
`.opencode/plugins/` directory:

```sh
python3 init.py --set OPENCODE_PLUGIN=true
```

It runs `python3 start.py` when `session.created` fires and appends the stdout
to the first `chat.message` as a text part. Local plugins are loaded
automatically; no package dependency is required.

Official documentation: [OpenCode plugins](https://opencode.ai/docs/plugins/).

The source adapter remains in the template, but initialization does not create
the project plugin unless `OPENCODE_PLUGIN=true` is confirmed. The manual
`python3 start.py` rule remains the universal fallback.

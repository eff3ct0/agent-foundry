# Optional Session Hooks

The archetype keeps `start.py` as the single source of truth for startup
routing. Harness adapters are opt-in glue: they run `start.py` and forward its
stdout to the harness context. They do not detect modes, call the network, or
perform outward actions.

## Claude Code

The reference adapter is `hooks/claude-code/session-start.sh`. Make it
executable after copying the template, then add this to the project's
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
            "command": "\"$CLAUDE_PROJECT_DIR/hooks/claude-code/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

Run:

```sh
chmod +x hooks/claude-code/session-start.sh
```

Claude Code adds successful command-hook stdout to the session context. The
manual `python3 start.py` rule remains the universal fallback when hooks are
not enabled.

Official documentation: [Claude Code hooks](https://code.claude.com/docs/en/hooks).

Adapters for other harnesses are intentionally separate follow-up work; do not
add harness-specific detection here.

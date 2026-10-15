# Greeting verification artifact

Source-only fixture for [spec #424](https://github.com/eff3ct0/agent-foundry/issues/424),
[implementation #425](https://github.com/eff3ct0/agent-foundry/issues/425), and
[cold continuation #426](https://github.com/eff3ct0/agent-foundry/issues/426), within
[#411](https://github.com/eff3ct0/agent-foundry/issues/411). Not a product command,
installation payload, new framework, or replacement task tracker.

## Reproduce

From this directory, with Node 20.19.0 or newer; no dependencies or installation:

```sh
node --test greet.test.mjs
node --check greet.mjs
node greet.mjs '  Ada  '
```

The last command prints `Hello, Ada!` and a newline, with empty stderr and exit 0.
Exactly one nonblank recipient is required. Outer whitespace is trimmed; internal
spacing and Unicode are preserved. Missing, blank, or extra arguments produce
empty stdout, `Usage: node greet.mjs NAME` and a newline on stderr, and exit 2:

```sh
node greet.mjs
node greet.mjs '   '
node greet.mjs Ada Grace
```

## Exact origin and review boundary

The two JavaScript files preserve the bytes from the isolated fixture at commit
`c0d09a3bde2aec51300a4c37ebaffe4c745f580b`, baseline
`e1335689886e4c6dd6a525f3abf07cb9c4cabdf0`:

- `greet.mjs`: SHA-256 `2f1d4e7e1dabb254019c425313c6381778c767ee48f7d63a32caf471355559fe`
- `greet.test.mjs`: SHA-256 `db0cdb8323dacc22f6dc1458e9367de5edb2ad2e3b734dd3b77fe91330824375`

Historical fixture review is not review of this relocated delivery candidate.
Current exact base/head/full-diff review, native states, checkpoint, later-effect
receipts, quality results and remaining gates live on the linked GitHub tasks.
Cold continuation must recover its own confirmed #426 packet, verify the current
owner/dependency and exact reviewed bytes, inspect later effects before replay,
and record an actual permitted consumer action and fresh native readback. Running
these commands alone does not establish independent-session or native-closeout proof.

## Distribution and rollback

`archetype-ownership.json` registers this directory as removed archetype governance,
without `payload: true`; the creator payload excludes these files. The payload
integrity manifest changes only to authenticate the updated ownership inventory.
No application dependency, installed method, runtime configuration, or product API
changes. Rollback is reverting the artifact commit and its inventory/manifest
changes through the normal authorized review process, not deleting original fixtures.

This public subset contains no private binding, archive, recovery bytes, credential
or session data. It is not a complete transfer-ready packet. Required #411 A12
other-host authorization/access/secure transport and actual retrieval/action remain
separate gates; a public Git commit does not satisfy them. No merge, deployment,
release, tag, registry publication or human review approval is implied.

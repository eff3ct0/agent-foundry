# ODD task: Issue #156 CI governance bridge

## Status

- Ticket: [#156](https://github.com/eff3ct0/factory-template/issues/156)
- State: `EVIDENCE/DELIVERY` with local verification complete.
- Worktree: `/home/steam/git/project-archetype-worktrees/ci-governance-bridge`
- Branch: `fix/ci-governance-bridge`
- Base: `origin/main` at `f0b7db107fea18b15498d793dbec1a2a6c7cc910`

## Scope

### In scope

- Check out the trusted pull request base revision in the `pull_request_target`
  governance workflow.
- Pin Node and run the Node governance validator when it exists.
- Retain the Python validator only as a presence-checked compatibility fallback.
- Fail closed when neither validator exists.
- Protect the bridge with the governance self-check.

### Out of scope

- Merge, modify, or otherwise deliver issue #110.
- Port or remove either governance validator.
- Change repository permissions, branch protection, or unrelated workflows.

## Verification and mirror

- The focused regression command is `python3 scripts/check-pr-governance.py
  --self-check` and passed.
- `python3 scripts/check-determinism.py`, `python3 init.py --self-check`,
  `pnpm build`, `pnpm test` (48 passing), `pnpm typecheck`, and `git diff
  --check` passed.
- `odd/` is an archetype-governance asset removed during initialization. Its
  ownership entry keeps this delivery record out of initialized projects; no
  retained payload mirror changes are required.

## Next action

Commit the bounded work unit, push it, and open the issue-linked bug-fix pull
request.

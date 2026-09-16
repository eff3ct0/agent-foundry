# Factory smoke test (repeatable dogfood)

Validate that a COLD agent, given only the repository and a minimal kickoff,
initializes itself according to the contract. Every friction point becomes a
[`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in the template repository.

## 1. Create a project from the template
```
gh repo create <YOUR_ACCOUNT>/factory-smoke-test --template eff3ct0/factory-template --private --clone
cd factory-smoke-test
```

## 2. Minimal kickoff (NEW agent session inside the repo)
> You are a cold agent in this newly created factory-template project. Read
> CLAUDE.md and AGENT.md and follow docs/agent-init.md: fill placeholders with
> init.py (use `--no-clean` for verification), compose bindings and CI, and
> verify. Ask me what you cannot infer (name, stack, tracker, secrets, and
> persistence language). Do not take outward actions without my approval.

Note: `eff3ct0/factory` (the org instance) does not exist yet, so leave
`FACTORY_SPEC` empty and set `FACTORY_REQUIRED=false`.

## 3. Success criteria
- [ ] The kickoff was sufficient; no process explanation was needed.
- [ ] `python3 init.py --check` -> zero manifest placeholders (keep `--no-clean` for this).
- [ ] `docs/bindings.md` contains the selected task and secrets providers.
- [ ] `.github/workflows/ci.yml` has one job per stack language.
- [ ] Without `--no-clean`, `init.py`, `placeholders.json`, `ci/`, `providers/`, `factory_bootstrap.py`, `MAINTAINERS.md`, `docs/smoke-test.md`, and `scripts/check-determinism.py` disappear.
- [ ] The agent follows the loop contract (one task/session, tracker state, checkpoint, DoD).
- [ ] Persisted project content uses the configured `<REPO_LANGUAGE>`.

## 4. Cleanup
```
gh repo delete <YOUR_ACCOUNT>/factory-smoke-test --yes
```

## 5. Feedback (the improvement engine)
Open a [`type:dx-feedback` issue](../.github/ISSUE_TEMPLATE/dx-feedback.yml) in
`eff3ct0/factory-template` for every point where extra intervention was needed or
`docs/agent-init.md` was ambiguous.

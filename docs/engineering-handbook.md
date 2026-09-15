# Engineering handbook

Standards as checklists. Language-agnostic; fill `<UPPER_SNAKE>` during bootstrap.

## Code
- [ ] Format with `<FORMATTER>` and lint with `<LINTER>` successfully.
- [ ] Use consistent, descriptive naming.
- [ ] Keep files and functions focused (one clear responsibility).
- [ ] Comments explain **why**, not what.

## Testing
- [ ] Framework: `<TEST_FRAMEWORK>`.
- [ ] Pyramid: many unit tests, some integration tests, few e2e tests.
- [ ] TDD policy: `<TDD_POLICY>`.
- [ ] Coverage target: `<COVERAGE_TARGET>`.
- [ ] At least **one runnable check** for every non-trivial logic (branch, loop, parser, money, security).

## Security
- [ ] Validate inputs at **trust boundaries**.
- [ ] Keep secrets out of the repository (environment variables / secrets manager).
- [ ] Audit dependencies with `<SCA_TOOL>`.
- [ ] Enforce authorization on every endpoint/sensitive action.
- [ ] Review OWASP guidance for the change type.
- [ ] **Never** log secrets or PII.

## CI/CD
- [ ] `<CI_SYSTEM>` with format, lint, typecheck, test, and build gates.
- [ ] Block merge when any gate fails.
- [ ] Deploy through `<DEPLOY_METHOD>`.

## Architecture
- [ ] Make module boundaries explicit.
- [ ] Dependencies point toward the domain, not the reverse.
- [ ] Record significant decisions as ADRs -> [`templates/adr.md`](../templates/adr.md).

## Documentation
- [ ] Update the README.
- [ ] Keep the changelog current.
- [ ] Use ADRs for relevant decisions.
- [ ] Add intent comments where the code is not self-explanatory.
- [ ] Write all persisted content in `<REPO_LANGUAGE>`; agent conversation language is independent.

## Observability
- [ ] Stack: `<OBSERVABILITY_STACK>`.
- [ ] Useful logs with context and no noise.
- [ ] Metrics/alerts for what matters.

## Data and migrations
- [ ] Additive and reversible.
- [ ] Backward-compatible with existing data.
- [ ] **Require human approval** (`<APPROVAL_GATED_ACTIONS>`).

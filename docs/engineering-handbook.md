# Engineering handbook

Standards as checklists. Load for a bug fix or implementation via `AGENT.md`'s
task route. Language-agnostic; fill `<UPPER_SNAKE>` during bootstrap.

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
- [ ] For structural questions, prefer an available index over blind grep; keep code intelligence optional.

## Documentation
- [ ] Assess documentation impact for each accepted work unit using the four canonical families in [`bindings.md`](bindings.md): architecture, constraints, business, and technical. Record affected families and exact sources, or a concise reason none changed; an unaffected unit needs no document write.
- [ ] Update the README, changelog, or ADR when the change warrants it; use [`templates/adr.md`](../templates/adr.md) for significant decisions. These files are not substitutes for an externally mapped canonical source.
- [ ] Add intent comments where the code is not self-explanatory.
- [ ] Follow `AGENT.md` for persistence language; agent conversation language is independent.

### Documentation evidence for affected families

Use the configured family rows and `DOCS_DESTINATION` capabilities in `docs/bindings.md`, not a guessed provider. Attach this assessment and evidence to the existing work-unit verification/handoff in the **bound task provider**. Documentation status describes only the affected family's revision; it does not create a second task phase or approve a remote action. Record the work-unit identity, family, canonical source, intended change, and the following proof for each affected family:

| Canonical source / projection | Evidence before claiming the intended documentation revision is current |
| --- | --- |
| Local Git (`local`, or the canonical source of `github-pages`) | Changed Git path and committed revision containing the intended content. An uncommitted edit is pending, not revision evidence. |
| Writable external (`external-contract`) | Exact family destination and intended content/revision; fresh prior content and expected prior revision; separately authorized destination, operation, and credential/session; supported conditional write against that revision; provider acknowledgment for that exact document and operation; then a fresh independent read of the same identity whose content and revision match the intended result. Do not infer an API, revision token, or conditional-write capability from a declared URL. |
| Git-sourced Pages projection | The Git source path and commit above prove only source update. Confirm the configured publication URL served the intended source revision using trustworthy deployment identity/status **and** published content/revision evidence. If the publication system cannot establish that correspondence, report publication pending; do not infer it from a successful push, workflow start, or source commit. |
| Read-only website | No write capability. If affected, report blocked and ask the owner for a separately authorized supported update path; never treat a local copy as the external revision. |

Before an external write, resolve the exact mapped identity and read the current revision; if the integration cannot safely enforce the expected-prior revision at write time, **do not write**. A stale revision or concurrent edit requires fetching the new canonical content, reconciling the intended change, and obtaining a new authorized conditional attempt; never silently overwrite. An ambiguous destination, unsupported operation, or failed write is unresolved. An acknowledgment without fresh matching readback is also unresolved, even if the write might have succeeded. After an interruption or unknown response, first read the exact destination and compare with the intended content/revision and recorded acknowledgment; do not blindly retry. If acknowledgment or readback cannot be recovered, request provider/owner reconciliation before a new conditional attempt. Record no secret values in evidence.

For offline or unauthorized work, record `PENDING` (not attempted) or `BLOCKED` (missing capability/approval), the exact family and destination, last confirmed revision if known, and a runnable next action with required authorization or provider proof. Name the next provider-native read/write/readback operation and target identity, or ask the owner to identify a supported operation; do not leave a generic "retry later". Do not claim documentation synchronized or task `DONE` from local assertions. Continue unrelated safe local work under existing permissions; only affected documentation proof remains unresolved. A provider-confirmed task checkpoint and human approval gates still govern phase/status and outward actions; if that checkpoint itself cannot be read back, it is not durable either.

Fixture interpretation (specification, not simulated provider success):

| Local evidence scenario | Report and next action |
| --- | --- |
| No affected family | Record why; no write and no new gate. |
| Local changed Git doc, committed SHA | Record path/SHA as canonical revision; if uncommitted, commit and verify first. |
| External prior revision stale, destination ambiguous, or conditional write unsupported | `BLOCKED`; resolve identity/capability or re-read and reconcile before any write. |
| External acknowledged write but readback unavailable or mismatched | `PENDING`; obtain fresh matching readback or owner reconciliation; do not retry blindly or claim sync. |
| Offline/unauthorized external update | `PENDING`/`BLOCKED`; get exact authorization and supported conditional-write/readback path before attempting. |
| Pages Git source updated but deployment delayed or publication evidence absent | Source revision recorded; publication `PENDING` until intended revision is confirmed at the target. |
| Interrupted external attempt | `PENDING`; read exact target and recover acknowledgment, reconcile outcome before any conditional retry. |

## Observability
- [ ] Stack: `<OBSERVABILITY_STACK>`.
- [ ] Useful logs with context and no noise.
- [ ] Metrics/alerts for what matters.

## Data and migrations
- [ ] Additive and reversible.
- [ ] Backward-compatible with existing data.
- [ ] Stop for human approval before gated migrations; `AGENT.md` owns the outward-action boundary (`<APPROVAL_GATED_ACTIONS>`).

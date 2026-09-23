# ODD feature task: #177 Bound task provider is canonical

## Status and immediate path

- Ticket: [#177](https://github.com/eff3ct0/agent-foundry/issues/177), open with `type:product` and `status:approved` at planning readback.
- Phase: BT-02 local contract implementation and offline verification completed; the issue-wide phase is not advanced without bound-provider confirmation. This file is a non-authoritative planning projection, not a tracker handoff or a substitute for provider confirmation.
- Worktree: `/home/steam/git/agent-foundry-worktrees/issue-177`; branch: `feat/issue-177-bound-tracker`; base: `d6b0f68a961ab4a312f2a2dbbae332a408ff5a5d`.
- Authorization: the original user request authorized implementation and delivery on `eff3ct0/agent-foundry`, subject to approval gates. The earlier planning-only worker restriction was temporary; this BT-02 delegation authorizes local implementation and one work-unit commit only, not push, PR, issue comment, or remote provider mutation.
- Next: BT-03 provider-fragment and generated-binding work; this file is not the durable phase record. Before any provider-native transition, read the bound provider first. If an operation cannot be confirmed and read back, stop with the exact missing operation rather than substituting a local or GitHub task store.

## Objective, problem, and why

Make the task provider selected at setup through `TASK_TRACKER`, `TRACKER`, and `TRACKER_KEY` the **only canonical durable task store** for every task/TODO mechanism required or configured by the user's harness. Today the archetype says to use the bound tracker exclusively, but it does not consistently specify operation confirmation, state readback, or how local task files and UIs remain derived. Without that distinction, a harness can report completion in a local task list while the bound provider has no confirmed task, status, comment, checkpoint, or phase handoff. Ephemeral scratch notes are not durable tasks.

This is contract groundwork complementary to #28 (provider-neutral phase state) and #115 (provider-aware setup and handoff); #178 owns adapter implementation, not #177.

## Scope and boundaries

**In scope for authorized later implementation:** clarify `AGENT.md`, `templates/agent-runbook.md`, `templates/handoff.md`, `docs/agent-init.md`, the abstract task-provider contract and all five task-provider fragments, and both template and generated `docs/bindings.md` where the generated contract requires it. Include `src/creator.ts` binding composition only if needed to preserve the selected provider and tracker identity; add focused contract/generation tests and documentation checks. Confirm local files/UIs (including `odd/*.md`) are optional derived projections of provider-confirmed state; never require one or treat one as a fallback. Preserve the existing phase model and protected approval gate.

**Excluded:** provider adapters or operation implementation (#178), changing local projection formats, remote credentials, provider APIs, unrelated provider-neutral phase behavior (#28), setup/agent-handoff implementation (#115), repository rebrand, hosted provider mutations, and any assumption that GitHub is canonical for non-GitHub selections. No source change is part of this preparation delegation.

**Authorization and safety:** no remote operation in this preparation step. The original authorization permits later delivery on the named repository through the authorized `gh` session, subject to approval gates; it does not imply permission for unrelated provider mutations or hosted journeys. Provider-specific tests use offline/injected fixtures unless the exact remote operation, destination, and credential are authorized. Do not treat this temporary preparation boundary as revoking the original delivery authorization.

## Acceptance contract (from #177)

- [ ] AC1: `AGENT.md`, `templates/agent-runbook.md`, `templates/handoff.md`, `docs/agent-init.md`, and the task-provider contract require **every** durable task/TODO mechanism configured or required for the user's harness to persist durable state to the setup-bound provider.
- [ ] AC2: Local files and task UIs, if used, are optional and non-authoritative projections of provider-confirmed state (including `odd/*.md`); no local projection is mandatory or an accepted fallback.
- [ ] AC3: Durable create, update, checkpoint, and completion count as successful only after bound-provider confirmation **and readback of the intended state**; cold resume reads provider state first. Apply the same rule to status transitions, comments, and phase handoffs.
- [ ] AC4: The invariant holds for `jira`, `github-issues`, `github-projects`, `linear`, and `custom` without conventional mapping of any provider to GitHub.
- [ ] AC5: Failure, unsupported operation, ambiguous identity, or failed/mismatched readback blocks work and records the exact bound-provider operation needed to resume; no silent local fallback or false completion.
- [ ] AC6: Generated downstream docs preserve both selected provider and tracker/board identity as the source-of-truth binding.

## Task route and trigger evidence

One writer per work unit. Stable IDs are retained across resumption; a checkmark requires recorded evidence, not just prose. Routes describe planned local execution, not permission to delegate or write remotely now.

| ID | Task and finish condition | Route / trigger evidence |
| --- | --- | --- |
| BT-01 | [x] Capture the approved issue, scope, current contract, runner, risks, and next step in this file before source edits. | Inline planning: one local artifact under the earlier planning-only worker scope. Issue readback and CodeGraph/contract reads completed. That scope did not revoke the original delivery authorization. |
| BT-02 | [x] Specify provider-neutral durability, projection, confirmation/readback, cold resume, and fail-closed rules in the five required documents and `providers/task/_contract.md`; preserve phase/approval semantics. | Direct local contract work: five required contracts updated, focused offline contract test and full runner passed; no adapter calls or provider mutation. Evidence below. |
| BT-03 | [ ] Align each of the five `providers/task/*.md` fragments and generated binding composition with the bound `TASK_TRACKER` plus `TRACKER`/`TRACKER_KEY`; do not assume a GitHub task target for Jira, Linear, or custom. | Direct local composition work: creator `composeBindings` renders provider fragments into generated `docs/bindings.md`, so template-only edits are insufficient evidence. Include tests in this work unit. |
| BT-04 | [ ] Add focused offline contract-checker and creator generation assertions for all five choices, confirmation/readback failure and local-projection wording, plus provider/tracker identity readback; retain existing checks. | Direct local tests: five-value issue acceptance and generated-output requirement trigger matrix coverage. No live provider adapter or remote mutation. |
| BT-05 | [ ] Run the exact applicable commands and generated-output review below; record commands/results, runtime harness scenario or justified N/A, rollback boundary, and unresolved gaps. | Inline verification: #177 names a post-#112 Node verification path; applicable source and generated-doc checks precede any closeout. |
| BT-06 | [ ] Reassess authored changed-line count; choose delivery strategy with the user if risk materializes; record provider-confirmed phase handoff and delivery evidence before any `DONE`. | Inline delivery planning: >400-line risk invokes `ask-on-risk`; no commit, PR, or tracker mutation in this preparation step. Original delivery authorization remains in force for later steps, subject to gates. |

BT-02 and BT-03/BT-04 are candidate reviewable work-unit boundaries only if each can be independently valid with its matching tests and generated docs. Do not split tests from behavior, or use a local checkbox as the native review candidate. Any future closeout needs a work-unit commit with exact focused test result, runtime boundary result/N/A, rollback scope, and provider-confirmed tracker readback, subject to the existing authorization and approval gates.

## Dependencies and decisions to resolve

- `docs/bindings.md` in this source archetype is **not bound yet**. The creator combines `src/creator.ts`'s binding header with the selected `providers/task/*.md` fragment; tests must check the resulting project, not just the unbound template.
- The five task fragments currently describe exclusive provider use, but their operational detail varies. In particular, `github-projects` describes phase comments on a linked repository issue, and `custom` delegates native operations to project-specific rules. For a GitHub Projects draft card without a linked issue, require a confirmed provider-native operation to persist the intended comment/handoff and read it back on the bound project item (or a provider-native identity/link operation that establishes a supported path); if unavailable, block and record that exact missing operation and item identity. For `custom` with missing comment or readback support, require the configured provider's native comment/handoff and state readback operations; if unsupported or unconfirmed, block and name the missing operation and bound tracker identity. Do not assume either provider supports a particular operation, fabricate an issue link, or fall back to GitHub Issues or local files.
- The Jira fragment ends with “Do not leave state only in Jira,” which contradicts its exclusive Jira binding; reconcile wording during BT-03, not via a second tracker.
- `MAINTAINERS.md` requires every newly tracked path to be registered in `archetype-ownership.json`; `odd/` is already removed from generated projects. This planning-only write does **not** edit that inventory. Register this file appropriately before any later tracked delivery, or stop if the one-file boundary remains in effect.
- #178 is the adapter boundary; #179 harness wiring and #180 matrix consume this contract. Do not claim this document proves runtime persistence.

## TDD mode, runner, and checks

**TDD mode: ordinary functional tests, not strict RED/GREEN TDD.** Source: the owner explicitly selected this mode for #177 in the current request. `docs/engineering-handbook.md` still declares `TDD policy: <TDD_POLICY>`; this explicit task choice resolves this plan's testing mode without claiming the project-wide placeholder is filled. Keep the `TESTING/TDD` phase and runnable tests; do not require a strict RED/GREEN sequence for this task.

**Runner (owner-selected):** `pnpm test` + `pnpm test:creator` for ordinary functional tests. This is a post-#112 Node creator project, `pnpm@12.4.2` (declared in `package.json`); both commands use `node --test` after `pnpm build`. Contract checker: `node scripts/check-delivery-contract.mjs --self-check`. No Python initializer command is valid closure evidence after #112. `node start.mjs --self-check` tests startup routing only, not initialization.

Preparation-time verification plan (retained as historical planning evidence; BT-02 results appear below):

- [ ] `pnpm typecheck`
- [ ] `pnpm test` (owner-selected functional test runner; record result)
- [ ] `pnpm test:creator` (owner-selected creator functional test runner; record result)
- [ ] `node scripts/check-delivery-contract.mjs --self-check`
- [ ] If the protected approval contract is affected: `node scripts/check-delivery-contract.mjs --approval-self-check` (do not conflate this conditional gate with the task contract).
- [ ] Exercise the contract checker against **every** `TASK_TRACKER` value: `jira`, `github-issues`, `github-projects`, `linear`, `custom`; inspect each generated `docs/bindings.md` and verify the selected provider and tracker identity are authoritative. Use offline fixtures, including failure/ambiguous/readback scenarios where checkable without adapters.
- [ ] Review generated `AGENT.md`, `docs/bindings.md`, and runbook for local-only persistence, GitHub-default language, or required local projections; inspect handoff and agent-init coherence.
- [ ] `git diff --check`, ownership/payload integrity and repository Definition of Done when delivery is authorized; record exact results, runtime harness N/A for contract-only offline checks or an actual authorized scenario, and rollback boundary.

The pre-cutover Python self-check clause in #177 is conditional on a pre-#112 revision and does **not** apply at this `d6b0f68` baseline. `python3 init.py --check` is never closure evidence here.

## Review workload and delivery strategy

Pre-implementation forecast: roughly **430–600 authored additions plus deletions**: core instructions/abstract contract 110–160, provider fragments and generated identity 120–180, tests/fixtures 160–210, task/ownership and coherence 40–50. Estimates exclude generated goldens from the authored count but not from identity/receipt checks. Risk: **high**, potentially above the 400-line review budget; actual count must be measured rather than compressed by removing tests, comments, or documentation.

Delivery strategy: **`ask-on-risk`**, not an approved PR chain or size exception. Before implementation/delivery, ask the user if the honest work-unit forecast or actual diff crosses 400; attempt one coherent contract/creator slice plan with tests and docs alongside behavior, then stop and report the smallest honest overage if no valid split fits. No `auto-chain`, `single-pr`, `exception-ok`, PR, or commit is selected or executed here.

## Progress, verification evidence, and next step

- Planning readback: issue #177 open and approved in `eff3ct0/agent-foundry`; `node start.mjs` reported SELF mode; worktree branch and base SHA verified. CodeGraph identified `composeBindings` and delivery/governance checks; Markdown contracts were read directly because CodeGraph did not index them.
- Changes: this document only. No source write, test run, generated-project run, tracker state transition, remote mutation, or commit. All future verification checkboxes remain open.
- Next step: in a later implementation step, read the bound provider first and start BT-02 under the original delivery authorization and the owner's ordinary-functional-test choice. For a project-only/draft card or custom provider without a confirmed native comment/handoff and readback path, stop with the exact missing provider-native operation and identity; do not substitute GitHub or local state. At every later phase boundary, confirm the bound provider operation and read back its state before treating any local projection as current.

### BT-02 local work-unit evidence (later than the preparation entries above)

- Outcome: five required contracts now require exclusive setup-bound task persistence for every harness task/TODO mechanism; provider confirmation and intended-state readback for create/update/status/comment/checkpoint/handoff/complete; provider-first cold resume; optional derived local projections; actionable fail-closed continuation on unsupported/error/ambiguous/mismatched operations. Phase order and protected approval gate remain unchanged. Provider fragments and generated binding identity remain BT-03/BT-04 work, so AC1–AC6 remain issue-wide open.
- Focused check: `node --test test/check-delivery-contract.test.mjs` passed (7/7) after correcting a test placeholder assertion; the new regression checks the five contracts. Initial 6/7 failure was test syntax (`TASK_TRACKER` is rendered as a code literal in two contracts), not a product failure.
- `pnpm typecheck`: passed (`tsc --noEmit`). `pnpm test`: passed (174/174). `pnpm test:creator`: passed (21/21). `node scripts/check-delivery-contract.mjs --self-check`: `self-check OK`. `node scripts/check-delivery-contract.mjs --approval-self-check`: `approval self-check OK`. `node scripts/check-determinism.mjs`: `determinism and Python-removal audit OK`. `git diff --check`: passed (no output).
- Payload/ownership: registered this task file as archetype governance text under the existing removed `odd/` boundary. `node scripts/build-payload.mjs --write-lock` rebuilt the checked-in manifest; both test runners rebuilt and verified the payload without digest mismatch.
- Runtime harness: N/A; this unit changes offline contract text and a static test, not provider adapters or a live provider interaction. No remote task operation, issue update, or provider-confirmed phase handoff occurred. The local checkbox and Engram mirror do not constitute bound-provider completion.
- Rollback boundary: revert only BT-02 changes to `AGENT.md`, `templates/agent-runbook.md`, `templates/handoff.md`, `docs/agent-init.md`, `providers/task/_contract.md`, `test/check-delivery-contract.test.mjs`, `archetype-ownership.json`, `package/payload-manifest.json`, and this task entry. No BT-03–BT-06 implementation was performed.
- Next action: BT-03 must align the five selectable task fragments and generated binding identity; confirm and read back provider-native state before claiming any issue-wide phase transition or handoff.

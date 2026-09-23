# ODD task: Rebrand the repository as Agent Foundry (#183)

## Status and next action

- Phase: `EVIDENCE/DELIVERY` for the local R4 unit; #183 remains open with R2, R3, and R5 outstanding. Parent-reported issue [#183](https://github.com/eff3ct0/agent-foundry/issues/183) readback on 2026-09-23 was `OPEN`, `status:approved`; this unit did not contact GitHub.
- Isolated worktree: `/home/steam/git/agent-foundry-worktrees/issue-183`; branch `feat/issue-183-rebrand`; base commit `d6b0f68a961ab4a312f2a2dbbae332a408ff5a5d`; local R4 work-unit commit `d56c665c4add6a3fc967075e29d2b85bda8adb8d`. No PR or remote delivery.
- Owner already renamed the repository to `eff3ct0/agent-foundry` and left Template mode enabled (`isTemplate: true`), per the parent's live readback. Package/CLI change #112 was merged through PR #182 at `d6b0f68`; older draft-PR and pending-publication notes below are historical, not current release evidence.
- **Next action:** review this local R4 work unit, then plan R2's active copy separately. Do not start a hosted #184 journey or change repository metadata under this unit. If remaining #183 work forecasts more than 400 authored lines, ask the owner for a delivery strategy before any next commit.

## Outcome, authority, and exclusions

Rebrand active repository/product-facing materials to **Agent Foundry** and update live references to `eff3ct0/agent-foundry`. The earlier planning pass edited this file alone; this local R4 pass edits runtime coordinates, nearby source-only guidance, tests, and this tracker. No remote mutation was performed. Description, topics, and homepage require separate owner review of their **exact wording and values** before any write. Repository rename is already done by the owner; do not repeat it. Do not merge, publish, delete, or alter Template mode under this task.

Keep `@eff3ct/agent-foundry` and `foundry` as the existing #112 identity, not a new rename. Preserve `.factory-template-creator` as the persisted creator state/staging namespace (`src/creator.ts`, `start.mjs`, `docs/creator.md`, tests); changing it would be a compatibility migration, not copyediting. Preserve generic technical terms such as template, archetype, `.factory/`, and organization factory (`<ORG>/factory`, `FACTORY_SPEC`). Do not rewrite unrelated historical `odd/tasks/` records, old PR URLs, old worktree names, prior registry results, or existing evidence as if the new brand existed then. Distinguish intentional literal fixture data from operational coordinates before changing tests.

## R1 inventory and classification (verified locally at base commit)

- [x] **R1 — map active, technical, and historical references.** Route: direct, bounded CodeGraph exploration followed by local reference inspection; no delegated agent. Evidence: CodeGraph exposed `start.mjs` self-mode command at line 29 and the creator-state validation at lines 101/141; local reads found `.github/workflows/real-agent-journey.yml:29` sets `JOURNEY_TEMPLATE: eff3ct0/factory-template`, which feeds the plan/provision path. Local `node start.mjs` actually printed the obsolete `gh issue list -R eff3ct0/factory-template` instruction. These are live coordinates, not just prose; the workflow's published-package version input remains `@eff3ct/agent-foundry`.

| Classification | Verified examples | Treatment in R2/R4 |
| --- | --- | --- |
| Active product and maintainer copy | `README.md:1-5` still opens with `<PROJECT_NAME>`; `AGENT.md:1`, `MAINTAINERS.md:1-5`, `docs/org-factory.md:3-7,44`, `docs/smoke-test.md:8,162`, template/agent entrypoints and GitHub forms | Make current source-product identity clear while preserving downstream `<PROJECT_NAME>` placeholders and abstract template contracts. Update active source-only copy that names the old slug. |
| Active operational coordinates | `start.mjs:29`; `MAINTAINERS.md:3,18,39`; `.github/workflows/real-agent-journey.yml:29`; `scripts/real-agent-journey-cleanup.mjs:6`; `scripts/report-bootstrap-failure.mjs:406-407` self-check examples; active source-link docs | Point live source identity, examples, links, startup commands, and workflow defaults at `eff3ct0/agent-foundry`. Verify workflow/checker and journey fixture expectations together. Do not rely on GitHub redirect for hosted runs. |
| Technical names and compatibility | `.factory-template-creator` in `src/creator.ts:27`, `start.mjs:101,141,149`, `docs/creator.md:48-52` and creator/startup tests; `.claude/factory-template.md` and `.opencode/agents/factory-template.md` provider output paths in `providers/agents/catalog.json`, `docs/creator.md`, and tests; `<ORG>/factory` in `docs/org-factory.md` | Keep persisted creator namespace unchanged. Evaluate provider output filenames separately for compatibility before proposing a rename; do not bulk-replace technical identifiers or generic factory concepts. |
| Historical records and synthetic fixtures | Existing `odd/tasks/issue-112-cutover.md` and older task PR/worktree links; `test/report-bootstrap-failure.test.mjs`, `test/real-agent-journey-report.test.mjs`, resource-provisioning tests using old source strings as data | Leave historical task files untouched. Change tests only where they assert the *current* source coordinate or copy; keep useful arbitrary-repository fixtures if they intentionally exercise generic input. |

The inventory is a scoped map, not a claim that every possible old-string occurrence is resolved. Before closeout, audit tracked active docs, scripts, workflows, forms, templates, and tests for remaining old product/slug coordinates; classify each match and record justified exceptions. This planning session did not conduct a fresh remote readback or claim CodeGraph verification of any GitHub settings.

## Acceptance and verification

- [ ] Active source-repository identity, startup instructions, maintainer docs, product README, and applicable forms/templates say Agent Foundry and use `eff3ct0/agent-foundry` where a concrete repository is intended; generated-project placeholders remain generic.
- [x] `node start.mjs` in SELF mode prints the new issue-list coordinate. The offline real-agent journey plan uses the renamed repository; the independent source readback remains fail-closed, and the cleanup default and applicable tests agree. No #184 hosted run was started.
- [ ] Package/bin remain `@eff3ct/agent-foundry`/`foundry`; creator state namespace and organization factory semantics stay intact. Historical evidence remains historically accurate. Each remaining old-string occurrence is classified rather than mechanically erased.
- [ ] Add/update ordinary functional regressions with each changed behavior (owner chose **ordinary functional tests**, not strict TDD). Run from this worktree with pinned Node >=20.19.0 and Corepack pnpm 12.4.2: `node start.mjs` (SELF output), `node --test test/startup.test.mjs test/real-agent-journey-report.test.mjs test/report-bootstrap-failure.test.mjs` plus any changed component tests; `node scripts/check-bootstrap-workflow.mjs`; `pnpm typecheck`; `pnpm test:workflow-contract`; `pnpm test` (includes build and full Node test suite). Run `pnpm test:package-consumer` if the payload/generation-facing copy or catalog changes, to check generated files and identity; capture actual command, exit/result, and omissions, not predicted passes. Inspect `git diff --check` and the final active-reference audit. No lint script is defined in `package.json`; do not invent a lint result. Hosted journey is a separate authorized/credential-dependent #184 boundary, not a substitute for local checks.
- [ ] If metadata is later explicitly approved, apply **only** the reviewed values to `eff3ct0/agent-foundry`, read back description/topics/homepage and record evidence; until then metadata is `BLOCKED: exact owner-reviewed wording`. Do not treat a proposal in this plan as approval.
- [ ] Record focused and full test outcomes, runtime harness output (or `N/A` with reason for a docs-only unit), rollback boundary, authored addition+deletion count, commit/PR IDs if later created, and blockers in this tracker. Do not mark #183 `DONE` on the strength of a checklist or a planning-only edit.

## Reviewable work units and routing

| Task | Route and trigger | Finished state / review boundary |
| --- | --- | --- |
| R1 (complete) | Direct mapping when entering `DEFINITION`; evidence above. | Active vs technical vs historical references classified; no source edit claimed. |
| R2 (open) | Direct local implementation when #183 resumes. Use focused docs and copy edits with relevant tests; if scope expands into provider filename migration, stop for separate compatibility decision. | Product/source copy is current, generated-project semantics preserved; unit includes its regression and rollback path. |
| R3 (open; gated for write) | Direct candidate preparation now; owner reviews **exact** description/topics/homepage before any authenticated metadata mutation. | Proposed values below are confirmed or revised by owner; remote readback only after separately approved write. Other local work need not wait. |
| R4 (complete locally) | Direct local implementation because owner slug is already `eff3ct0/agent-foundry`. Startup and hosted journey coordinates precede any #184 hosted run; regressions and dependent source-only guidance travel with the unit. | Offline runtime checks and rollback evidence below; no hosted execution or unrelated historical edits. |
| R5 (open) | Direct verification after R2/R4; require recorded outcomes and reviewable diff before delivery. | Applicable matrix and exceptions recorded; metadata stays blocked unless owner approves exact values. |

Proposed GitHub metadata for **owner wording review only** (not applied or implicitly authorized):

| Field | Exact candidate value |
| --- | --- |
| Description | `Agent Foundry: a versioned, transactional creator for agent-first software projects.` |
| Topics | `ai-agents`, `developer-tools`, `project-template`, `scaffolding`, `typescript` |
| Homepage | `https://github.com/eff3ct0/agent-foundry` |

Delivery strategy: `ask-on-risk`. R2/R4 touch cross-cutting docs, runtime, workflows, and test fixtures, so the *remaining* work may exceed 400 authored added+deleted lines; this is a forecast, not a measured diff. Keep tests with each behavior and documentation with the user-visible unit. Before any next commit, if the remaining forecast exceeds 400, ask the owner for a delivery strategy. Do not shrink tests or docs to meet a line budget. Local work-unit boundaries must be independently testable and reversible.

## R4 local implementation evidence (2026-09-23)

- SELF startup now prints `gh issue list -R eff3ct0/agent-foundry --label type:product`. `JOURNEY_TEMPLATE` in the parent workflow supplies that same slug to the offline plan, source provision readback, cleanup adapter, and canonical reporter. The workflow checker rejects a reverted slug. The cleanup adapter fallback, bootstrap reporter self-check, current-source report fixtures, and source-only `MAINTAINERS.md` coordinates agree. Generic repository validation and the package/bin (`@eff3ct/agent-foundry`/`foundry`) are unchanged.
- `node scripts/build-payload.mjs --write-lock`: exit 0, payload digest `sha256:4bf46412a8be3f81f9153b2efec806cf7d2a2ebf6e55b2ccedec6d35ae0e2dcc` because `start.mjs` is a declared payload file. The lock is generated, not hand-edited.
- `node start.mjs`: exit 0, SELF command above. `node --test test/startup.test.mjs test/real-agent-journey-report.test.mjs test/report-bootstrap-failure.test.mjs test/check-bootstrap-workflow.test.mjs`: exit 0, 41/41 passed (after correcting one new test's expected mismatch wording). Positive plan/report/startup fixtures and negative old-slug workflow/report and mismatched bootstrap readback fixtures passed.
- `node scripts/check-real-agent-workflow.mjs`: exit 0, `real-agent workflow static check OK`. `node scripts/check-bootstrap-workflow.mjs`: exit 0, all five workflow static checks OK. `pnpm typecheck`: exit 0, `tsc --noEmit`.
- `pnpm test`: exit 0, 177/177 passed (including build/payload validation). `pnpm test:workflow-contract`: exit 0, 18/18 passed. `pnpm test:package-consumer`: exit 0, 3/3 passed. Hosted workflow: not run; no hosted dispatch, repository metadata mutation, release, or PR.
- `git diff --check`: exit 0. Against `d6b0f68`, this unit is 208 authored additions+deletions plus 6 generated payload-lock lines (214 total); below the 400-line work-unit guard. A scoped audit found no old slug in active `.github/workflows/*.yml` or `scripts/*.mjs`; old-slug strings retained in negative tests, generic provisioning fixtures, and historical records are intentional.
- Rollback boundary: revert only this R4 runtime/checker/test/nearby `MAINTAINERS.md` unit and regenerate `package/payload-manifest.json` from the restored `start.mjs`; keep the earlier R1 plan and all historical `odd/tasks/` records. The commit contains this tracker as the implementation receipt. Delivery is local-only; R2/R3/R5 remain open and metadata remains `BLOCKED: exact owner-reviewed wording`.
- Commit evidence: `d56c665c4add6a3fc967075e29d2b85bda8adb8d` (`fix(journey): cut over source repository coordinates (#183)`). This passive tracker-only follow-up records the immutable work-unit SHA; it changes no runtime behavior.

## Historical note (not a current gate)

Earlier #112 notes recorded the previous `eff3ct0/factory-template` slug, draft PR #182, unpublished-package questions, and a planned owner rename. Those observations belonged to that earlier checkpoint; the parent now reports #182 merged at `d6b0f68`, the owner rename complete, and Template mode still enabled. No registry publication status or GitHub metadata values were independently checked during this planning pass. Leave other `odd/` historical evidence unchanged.

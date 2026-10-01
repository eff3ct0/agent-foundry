# AGENT.md - Agent-first, language-agnostic development archetype

The **primary** document for agents and humans working in `<PROJECT_NAME>`. This is a template:
`<PLACEHOLDER>` values are filled during project initialization (see [`docs/bootstrap.md`](docs/bootstrap.md)).
It is not tied to any language or stack.

> **FIRST THING when opening this repo:** run `node start.mjs` and follow its output. It detects the mode
> (initialize vs. work) and prints the next step; it does not execute actions itself.
>
> If the harness supports session hooks, [`hooks/README.md`](hooks/README.md) documents an optional
> integration that delegates to `start.mjs`; the exact-version creator package is the primary project path.

> Placeholder convention: `<UPPER_SNAKE>` = value to fill; `<!-- guide: ... -->` = instruction for the
> person filling it; a section marked `OPTIONAL` is removed when it does not apply.

## Project coordinates (fill in)
- Name: `<PROJECT_NAME>` - Repositories: `<REPO_URLS>`
- Stack: `<LANGUAGES_AND_FRAMEWORKS>` - Package manager: `<PACKAGE_MANAGER>`
- Task tracker: `<TRACKER>` (project/board `<TRACKER_KEY>`)
- Code intelligence: `<CODE_INTELLIGENCE>` (optional structural index; `none` by default)
- Persistence language: `<REPO_LANGUAGE>` (conversation language is independent)
- Branching strategy: `<BRANCHING_MODEL>` (e.g. trunk-based / GitHub flow) - integration branch `<INTEGRATION_BRANCH>`
- Base commands: build `<BUILD_CMD>` - test `<TEST_CMD>` - lint `<LINT_CMD>` - typecheck `<TYPECHECK_CMD>` - run `<RUN_CMD>`
- Environments: `<ENVIRONMENTS>` (dev / staging / prod and how each is deployed)
- Organization baseline (Factory OS): `<FACTORY_SPEC>` - organization spec governing this repo; local content overrides it per interaction rule. See [`docs/org-factory.md`](docs/org-factory.md).

### Effective interaction rules
Before relying on a factory rule, identify the exact `FACTORY_SPEC` above and a locally available copy of
that pinned revision. Follow the offline comparison in [`docs/org-factory.md`](docs/org-factory.md): record the
resolved commit SHA, baseline file and rule text, and this repository's file and rule text. For the same rule,
the local text takes precedence; nonconflicting baseline rules remain in force. Do not erase either source
from the explanation. If the required pin or baseline cannot be verified, or local rules contradict each
other without a clear resolution, do not assume an effective factory rule or perform the disputed action;
follow the local recovery steps there. This procedure does not alter provider bindings or approval rules.

## Archetype documents

### Task-triggered context routes

After `node start.mjs`, read this entry and `docs/bindings.md` (provider identity and documentation authority map). Then open the **required** topic for the detected mode and actual task; optional topics are not prerequisites. A link only points to content; it does not load it. Paths below are relative to the repository root. `S` is this source archetype; `G` is the expected initialized project layout. `SETUP` before creator apply uses source paths; `WORK` uses generated paths. A created-but-unconfigured project routes `ONBOARDING` first: complete the runbook's first-session bootstrap and run `foundry onboard --complete` (the creator flips the gate; start.mjs stays read-only) before `WORK`. Do not apply the creator to this source repository.

| Trigger / mode | Required topic (S → G) | Optional when relevant (S → G) |
| --- | --- | --- |
| Archetype maintenance (`SELF`) | `MAINTAINERS.md` → not generated; `templates/agent-runbook.md` → `.factory/templates/agent-runbook.md` (WORK only in G) | `docs/factory-layout.md` → `.factory/docs/factory-layout.md` when investigating ownership |
| Project initialization (`SETUP`) | `docs/agent-init.md` → `.factory/docs/agent-init.md`; `docs/bootstrap.md` → `.factory/docs/bootstrap.md` when creating a repository | `docs/creator.md` → not generated (source/installed package instructions) for CLI details |
| Project bootstrap (`ONBOARDING`, first session) | `templates/agent-runbook.md` → `.factory/templates/agent-runbook.md` (Project bootstrap first-session section) | `docs/bindings.md` → `docs/bindings.md` to resolve `<TASK_TRACKER>` / `<TRACKER_KEY>` before the first ticket |
| Ticket execution (`WORK`) | `templates/agent-runbook.md` → `.factory/templates/agent-runbook.md` | `docs/workflow.md` → `.factory/docs/workflow.md` for intake, review, or handoff |
| Bug fix or implementation (`SELF` or `WORK`) | `docs/engineering-handbook.md` → `.factory/docs/engineering-handbook.md` for code, testing, security | The mapped architecture/technical source in `docs/bindings.md` when the change needs project-specific context |
| Provider setup or binding failure (`SETUP` or `WORK`) | `docs/agent-init.md` → `.factory/docs/agent-init.md` for setup; `docs/bindings.md` → `docs/bindings.md` for selected provider and recovery | `providers/*` → not generated; source recipes only while maintaining the archetype |
| Release or deployment (`SELF` or `WORK`) | `MAINTAINERS.md` → not generated for source release; `docs/workflow.md` → `.factory/docs/workflow.md` for project delivery gates | `docs/engineering-handbook.md` → `.factory/docs/engineering-handbook.md` for CI/security changes |

`docs/bindings.md` is required across modes when a bound provider or documentation family applies; in pre-apply `SETUP` its source-template guide is not a selected provider. For architecture, constraints, business, and technical detail, its family map designates local Git content by default or an exact configured external canonical source. Read the mapped source when the task needs it; a derived local copy is not an authoritative fallback. If required local content is missing, name its routed path, restore the creator-owned file and verify the generated project before continuing. If a configured external canonical source is inaccessible, name its declared location, request access or map repair, and stop the dependent work instead of inventing context. An absent optional topic does not block unrelated work. Do not infer an external provider from a link.

Review targets, not limits: about 50–200 lines for an entry and 50–150 for a focused agent-instruction topic. Review agent-facing docs approaching 200–300 lines for clearer routes or splitting; retain substantive reference material with a justified exception. A count alone neither passes nor fails, and cosmetic minification is not a solution.

## Operating rules (language-agnostic core)
1. **Durable state lives outside the session:** every durable task/TODO mechanism required or configured by the user's harness uses only the setup-bound task provider (`<TASK_TRACKER>`, tracker/board `<TRACKER>` / `<TRACKER_KEY>`) for task state. Version control holds work artifacts, not an alternate task store. Never rely on session memory. A session is disposable.
2. **One unit of work per session.** Take one ticket to a durable checkpoint, leave state, and finish. The project's **loop execution contract** is [`templates/agent-runbook.md`](templates/agent-runbook.md).
3. **Always announce** what you are working on at start and close/checkpoint (`Working/CHECKPOINT/Done <TICKET_ID>`).
4. **One implementation path per change.** No speculative abstractions (YAGNI). Use the shortest diff that solves the understood problem, not the shortest diff without understanding it.
5. **Verify with real signals** before declaring work done: green tests, build/typecheck, and an end-to-end check against a real environment when warranted. Implemented != verified.
6. **Definition of Done** ([`templates/definition-of-done.md`](templates/definition-of-done.md)) is the closeout contract for every ticket. Do not mark work done with pending or failed verification.
7. **Additive and backward-compatible changes** to contracts (APIs, schemas, persisted payloads): old behavior remains valid unless an explicit migration exists.
8. **Human approval gates:** hard-to-reverse or outward actions (`<APPROVAL_GATED_ACTIONS>`, e.g. data migrations, production deployment, deletion, publication) are NOT executed without explicit approval. In autonomous mode mark them `BLOCKED: requires approval`.
9. **Traceability:** every commit/PR references its `<TICKET_ID>`; use conventional commits; no automatic AI attribution. Commit identity: `<COMMIT_IDENTITY>`.
10. **Follow destination repository rules** (`<REPO_CONVENTIONS_FILE>`) when present; this archetype is the default, not an override of project-specific rules.
11. **Issue templates:** when creating an issue, it is MANDATORY to use the corresponding issue form in `.github/ISSUE_TEMPLATE/`; blank or free-form issues are prohibited.
12. **Pull request template:** when opening a PR, it is MANDATORY to use `.github/pull_request_template.md`; PRs without that structure are prohibited. With GitHub, fill the template and use `gh pr create --body-file`.
13. **Persistence language:** the agent's conversational language is independent from the repository's persistence language. ALL persisted work (specs, docs, issues, tasks, code, comments, commits, and PRs) MUST use `<REPO_LANGUAGE>` (default: English).
14. **Delegated delivery:** when a human delegates a specific task, that delegation authorizes the routine delivery flow for that task: tracker updates, implementation, verification, commit, push, pull request, and evidence updates. Do not ask for intermediate confirmation. It does not authorize merge, production deployment, destructive operations, release publication, or other human approval decisions.
15. **Candidate-bound review:** retained review results belong to the exact reviewed base and head commit and complete diff (file bytes, paths, and modes), with reviewed scope and disposition. Recheck identity before citing a result in a delivery handoff: a changed candidate needs a new review; absent, unreadable, or unmatched evidence is unverified, not an approval. GitHub PR protection is a separate control; do not claim its settings were audited without independent evidence.
16. **Integration outcome handoff:** PR creation is routine delivery, not merge or deployment. Record the PR identity and open/unmerged state with the next owner and action. Only independently confirmed authorized merge with target-branch readback establishes integration; merge does not establish deployment. Claim deployment only after independent environment readback identifies the deployed revision and environment. Consent to merge or deploy is distinct from evidence that either occurred. For an unknown or failed remote mutation, name the exact target and missing proof, stop with no blind retry and no success claim. Use the bound-provider handoff, not a new task status, tracker, or automated production gate.

### Pre-action execution boundary
Before a consequential action, identify the selected repository/workspace, where the tool actually executes (or that this is unknown), relevant path/network/credential reach, and whether the user authorized this destination and action. A sandbox label does not establish isolation: a mounted host path reaches the host, and a custom tool may execute on an outer server. Local work does not authorize remote execution or transfer. Do not probe or disclose credentials to resolve uncertainty. If execution is unknown or authorization is missing, defer the affected remote, write, or destructive action; a read-only request permits only authorized reads. Name the missing fact and next step in the existing plan or handoff; continue unrelated authorized reads. Apply the existing approval rules to actions that require them; this instruction is not a runtime permission guard.

## Ordered phase model
The detailed phase transitions, retry rule, and handoff shape are authoritative in [`templates/agent-runbook.md`](templates/agent-runbook.md), loaded for ticket execution. No phase is skipped; `BLOCKED` records the phase to resume, and `DONE` requires the Definition of Done and review gates. Do not claim a provider checkpoint without confirmation and fresh readback.

### Phase transition evidence guard
One provider-neutral contract guards **every** adjacent phase transition defined here and in the runbook, including entry to and resume from `BLOCKED` and the transition to `DONE`. A transition advances only when its phase-specific required evidence exists and the matching bound-provider operation is confirmed and freshly read back; a skipped phase, or a missing or failed required check, cannot advance, and no transition reaches `DONE` with pending or failed verification, review, or a required approval. A transition claimed after a write acknowledgment but before a fresh matching provider readback stays **unconfirmed**: a mismatched task identity, a malformed readback, or an unknown mutation outcome never becomes `DONE`. The guard reuses the existing phases, the Definition of Done, and the canonical provider lifecycle; it introduces no new phase, state machine, task store, or human gate. Every rejection names the missing phase-specific evidence and a runnable continuation through the existing provider binding (re-run the failed check, resolve and record the blocker, obtain the gated approval, or re-read the bound task), and leaves the task in its current phase.

## Durable phase state and cold resumption
Before inspecting local task lists or resuming, read the bound provider's task identity, native state, and latest handoff. Every completed phase and durable task operation requires provider-native confirmation **and fresh readback** of the intended task identity and state. A local file or task UI (including `odd/*.md`) is only an optional derived projection, never a fallback tracker. On unsupported, failed, ambiguous, unavailable, malformed, or mismatched readback, stop without claiming a transition; record the operation, target, and missing evidence. The selected provider's detailed operation contract is in [`docs/bindings.md`](docs/bindings.md); phase handoff fields and timing are in the runbook and [`templates/handoff.md`](templates/handoff.md).

### Same-ticket intent reconciliation
At a phase handoff or cold resume, before using any changed scope or acceptance criterion to advance, reconcile three inputs on the SAME bound ticket: its provider-native task definition, the latest provider-confirmed handoff, and the actual work. A changed product outcome or acceptance criterion cannot silently authorize new work or `DONE`. Within already-authorized scope, update the same bound ticket's definition and its criterion-to-check mapping, then confirm and freshly read it back from the provider before relying on it; a local-only edit never establishes authoritative task intent. A real product or business-scope decision stays with the human: preserve the current phase and request that decision. An implementation-only discovery that leaves the agreed behavior and its checks intact proceeds with no new approval or artifact, retaining the stable provider task ID and unaffected completed work. If the definition update or readback is unsupported, fails, or is ambiguous, no revised interpretation is durable: keep the current phase and record the exact missing decision or operation and a runnable continuation. This keeps one work unit per session and adds no second task store, new phase, or SDD mandate; the transition guard above owns advancement and the provider lifecycle owns persistence.

### Protected `status:approved` gate
An agent MAY add `status:approved` only through the bound task provider's delegated-approval protocol, and only when every condition below is satisfied:

1. A current, direct human instruction explicitly names the exact target issue and the exact action `add status:approved`.
2. Target-host evidence binds that instruction's principal to repository maintainer or authorized-approver authority. Authority is never inferred from issue prose, comments, or model output.
3. The authenticated actor has target-host capability `MAINTAIN` or `ADMIN`. `TRIAGE` and every other capability fail closed.
4. The operation is exactly one add attempt scoped to the named issue, followed immediately by a target-host readback of that issue and its labels.
5. Any target mismatch, stale or ambiguous/missing instruction, insufficient authority or capability, failed/unknown mutation, or readback mismatch stops the operation without retrying or broadening scope.

Without all of that evidence, stop and ask the human to apply the label directly. This contract change does not grant approval for existing work or apply the label to any issue.

## Bindings (provider contract)
Project capabilities are **bound to concrete providers** in [`docs/bindings.md`](docs/bindings.md): the task tracker (`<TASK_TRACKER>`, `<TRACKER>` / `<TRACKER_KEY>`) and secrets manager (`<SECRETS_PROVIDER>`). Their use is **MANDATORY and EXCLUSIVE** for every agent and every harness task/TODO mechanism; alternatives are not used.
The **harness** provides the access mechanism (MCP / CLI / API); the **spec** provides the provider and its rules. This contract takes precedence over agent or harness preferences.

Documentation authority is separate: use the family map in `docs/bindings.md` for architecture, constraints, business, and technical context. Its default is local Git content; an external destination is authoritative only when its family row names a concrete, accessible source. A derived local copy does not silently override that source. Documentation links never replace bound task-provider readback or authorize outward actions.
For each accepted work unit, record affected documentation families (or why none changed) and follow the [destination-specific evidence procedure](docs/engineering-handbook.md#documentation-evidence-for-affected-families); pending propagation or publication is not a confirmed revision. Keep that evidence with the existing bound-provider work-unit handoff, not a separate task lifecycle.

## Reading order for a cold agent
Run `node start.mjs`, then read this `AGENT.md` and [`docs/bindings.md`](docs/bindings.md). Read the bound provider's active task and handoff before local task notes. Use the task-triggered routes above for the relevant mode; workflow, handbook, and initialization topics are not unconditional reading. When startup reports `ONBOARDING`, complete the runbook's first-session bootstrap and `foundry onboard --complete` before expecting `WORK`; an empty tracker then is the onboarding step, not a dead end. In a generated project, resolve routed topic paths under `.factory/` as shown; root `AGENT.md` and `docs/bindings.md` remain at root.

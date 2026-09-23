# ODD task: Agent Foundry repository rebrand

## Status

- Phase: `PLANNED`
- Worktree: `/home/steam/git/project-archetype-worktrees/issue-112-cutover`
- Branch: `feat/issue-112-cutover`
- Base: `main`
- Route: delegated direct for broad reference mapping and multi-file edits
- TDD: disabled for documentation/metadata work; validate applicable Node and workflow contracts
- Delivery strategy: `ask-on-risk`; estimate review size before implementation
- Slug: owner plans to change it manually; any agent operation requires the exact target slug and explicit authorization

## Objective

Rebrand active repository/product-facing materials consistently to “Agent Foundry” after the package/CLI identity is finalized, while preserving technical concepts, historical evidence, and the existing repository slug until the owner changes it.

## Authorized scope

- Active README, agent/maintainer instructions, docs, templates, issue/PR forms, startup copy, and workflow messages that present the current product/repository brand.
- Review and update active workflow URLs and hardcoded repository coordinates after the owner changes the repository slug.
- Prepare the desired GitHub repository description, topics, and homepage for owner review; apply remote metadata only after the owner explicitly authorizes the exact values and operation.
- Update tests/static checks that assert current branded copy or URLs.

## Exclusions and approval boundaries

- The package identity `@eff3ct/agent-foundry` and CLI binary `foundry` belong to issue #112, not this separate repository rebrand task.
- Do not rename the repository slug. The owner intends to change it manually; any delegated rename requires the exact new slug and explicit confirmation.
- Do not mechanically rename generic technical concepts such as project templates, archetypes, `.factory/` support paths, or organization-level factory behavior unless separately approved.
- Do not rewrite historical task evidence as if the new brand had existed at the time.
- No GitHub description/topics/homepage mutation without exact owner approval.

## Tasks and checks

- [ ] R1: Inventory active brand references and classify product, repository, technical, and historical usages. Route: delegated direct exploration. Checks: mapping reviewed; slug-dependent links separated from package/CLI identity.
- [ ] R2: Rewrite active README, instructions, docs, templates, forms, workflow messages, and applicable tests to “Agent Foundry.” Route: delegated direct. Checks: focused docs/workflow tests; active-reference audit excluding historical records.
- [ ] R3: Prepare canonical GitHub description, topics, and homepage values for owner confirmation. Route: inline planning. Checks: wording reviewed; no remote write without exact approval.
- [ ] R4: After the owner changes the repository slug, update active URLs/coordinates and verify repository references. Route: delegated direct. Checks: new exact slug supplied by owner; no old active coordinates remain except explicit historical/external references.
- [ ] R5: Run the full applicable local verification matrix and update this tracker. Route: delegated direct. Checks: typecheck, tests, docs/workflow contracts, payload consistency, diff check.

## Progress

- Initial scope map completed. It identified active references in `README.md`, `AGENT.md`, `MAINTAINERS.md`, `start.mjs`, `docs/`, `templates/`, `.github/workflows/real-agent-journey.yml`, tests, and scripts.
- The user confirmed the npm scope is `@eff3ct`, selected package `@eff3ct/agent-foundry`, and CLI command `foundry`. Package/bin implementation is tracked separately under issue #112.
- The public registry returned E404 for `@eff3ct/agent-foundry`; no package identity changes for this rebrand task have been made yet.
- GitHub repository slug and metadata remain unchanged.

## Next step

Finish issue #112 package/bin rename first. Then execute R1/R2 as a separate rebrand change; request the exact repository slug from the owner after they perform the manual rename, and obtain separate approval before any GitHub metadata write.

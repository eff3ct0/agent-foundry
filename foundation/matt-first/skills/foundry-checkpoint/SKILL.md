---
name: foundry-checkpoint
description: Record a confirmed, bounded continuation packet on the current bound task.
disable-model-invocation: true
---

# Durable checkpoint

Read the repository integration envelope and accepted binding. Invoke only explicitly or under a delegation covering this unit and its tracker/preservation effects. This procedure neither launches a successor nor supplies permission to push/publish.

## Inputs and preconditions

Identify the exact unit, relevant canonical spec/decisions, accepted scope/effects/criteria, current owner/blockers/activity, completed work and exact next authorized action. Fresh-read its native state and explicitly canonical prior checkpoint. Resolve uncertain later effects on their exact target before summarizing them as completed. A silent owner is not a transfer.

Preserve necessary artifacts within accepted effects: exact revision/content identity, location, actual availability and WIP. A local-only checkpoint is legitimate progress. Call it transfer-ready only if the next authorized machine can retrieve **every** necessary exact artifact; a branch name, local commit or dirty tree alone cannot establish that. Never publish bytes merely to make a transfer claim.

## Write one bounded packet

On the **same bound task**, explicitly identify the new canonical checkpoint and the prior record it supersedes for continuity. Include:

1. Unit identity and relevant canonical spec/decision pointers.
2. Accepted scope/effects and applicable criteria; actual owner, native dependencies and current activity/status.
3. Completed work, exact next authorized action and its next owner.
4. Necessary exact artifacts/revisions/locations, WIP and actual local/remote availability; integrated revision separately from a worker result.
5. Applicable exercised verification/review tied to the exact subject, primary evidence links, limits and missing/not-run checks. Review identity includes base/head and full diff; no stale approval or test-result inheritance.
6. Blockers, pending/unknown operations and exact targets, required unblocking evidence/authority and activity/action to resume.

Keep code/maintained documentation in Git and larger primary evidence at one identified immutable source linked from the task. Do not turn the packet into a transcript or copy decision detail into multiple authorities. Local scratch or an upstream temp handoff may be a derived convenience only, never a fallback or required resume input.

Update native state only when justified and authorized. Confirm **each** mutation and independently freshly read the intended exact task/item/content/state back; a successful command or write acknowledgment alone is insufficient. For a linked Project item, verify the exact link and current native item too. Do not claim a completed transition with failed or pending required evidence.

## Completion and failure boundary

Report the canonical checkpoint identity only after matching provider confirmation and fresh readback. State progress versus transfer-ready honestly, exact next action and gates. Before intentional interruption/context disposal, preserve the required bytes and confirm the packet; then stop if that was the selected scope.

On malformed/mismatched/unavailable readback or unknown mutation outcome, do not claim durable checkpoint/completion or blindly repeat. Inspect the exact target when access permits; report the operation/target/missing proof. Provider outage cannot promote a local file into task authority. A blocker does not authorize scope expansion, ownership takeover, approval, merge, migration or publication. Continue unrelated authorized work only with demonstrated shared-state safety.

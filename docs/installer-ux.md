# Exact-plan installer presentation

The UI presents the same `preparePlan`/`applyPlan` engine as noninteractive use;
it does not compose a second payload, mutate independently or launch an agent.
The current schema-2 fresh contract and configuration are in [creator.md](creator.md).

1. Supply explicit schema-2 configuration; detected settings never become consent.
2. Review the complete target/candidate/payload/config identity, each named
   file/mode/size/hash, local-Git effect, recovery baseline and external readiness
   prerequisites. Long paths are not truncated out of acceptance.
3. Interactive apply asks once for this exact plan digest. `y`/`yes` accepts;
   no, EOF or interrupt cancels before application. `--accept-plan` supplies the
   exact accepted digest noninteractively. `--yes`/legacy aliases are rejected.
4. The engine rereads inputs before mutation, stages/verifies named bytes/modes,
   creates files exclusively and verifies installed integrity. Changed input
   invalidates acceptance rather than expanding it.
5. Completion distinguishes planned, cancelled, applied integrity, failed and
   partial effects. File integrity is not setup readiness. The proposed next
   planning procedure remains unstarted and requires its own authority.

Stdout is one schema-2 machine envelope. Prompts, full review, diagnostics and
human summaries go to stderr. `--json` also applies to version output;
`--non-interactive` (or `CI=1`) avoids prompts but does not grant acceptance.
`--no-color`, `NO_COLOR` and `TERM=dumb` disable color; `--reduced-motion` selects
static presentation. The current flow uses no raw keyboard mode or animation.

`plan`/`dry-run`/`verify`/`doctor` are read-only. Required tracker and independent
manual discovery observations are reported as external prerequisites, with the
accepted readiness-record pointer. The installer performs none implicitly.
Partial effects retain exact recovery evidence; there is no blanket atomicity,
rollback-success or readiness claim from a terminal success marker.

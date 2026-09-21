# Interactive installer UX

The creator has one mutation path: it prepares a deterministic plan and, for
`apply`, passes that plan to the transactional engine. The terminal UI is only
an input and presentation layer. It does not write files, compose payloads, or
launch an agent.

## Flow

Interactive mode presents these stages in order:

1. Welcome and prerequisite/target checks.
2. Project answers. Enum answers use a selected state with arrow-key navigation
   and Enter; text answers use a line prompt.
3. Review. The target, operation counts, changed paths, and diagnostics are
   shown before an apply.
4. Confirmation. Apply requires `y`/`yes`; the default is no. `--yes` is an
   explicit confirmation for automation that still wants the interactive
   presentation.
5. Apply and staged-byte verification.
6. A concise completion summary, including rollback or recovery guidance.

Agent selection is an explicit boundary in this contract: the installer tells
the user that preparation is complete and does not select, install, or launch
an agent. A future provider/runtime adapter owns that decision and its
credentials. This keeps a repository preparation confirmation separate from an
outward startup action.

The creator's `plan` and `dry-run` commands stop after review and never write.
`verify` and `doctor` remain read-only. Agent installation, provider setup, and
agent startup are deliberately outside this flow; the next step is to review
the generated repository before launching an agent through a separate adapter.

## Output and flags

The versioned creator envelope remains the sole command result on stdout. All
prompts, progress, summaries, and diagnostics go to stderr, so JSON can be
captured safely. Existing non-interactive commands remain deterministic:

```sh
factory-template dry-run --target ./new-project --config answers.json --non-interactive
factory-template apply --target ./new-project --config answers.json --non-interactive --json
```

Supported UX controls are:

- `--non-interactive` or `--no-prompt`: skip prompts and confirmation. `CI=1`
  implies this mode.
- `--yes`: confirm an interactive apply without typing `y`.
- `--json`: retain the machine-readable stdout contract (also supported by
  `--version`).
- `--no-color`: disable terminal color explicitly.
- `--reduced-motion`: disable animated motion policy; the same behavior is
  available through `FACTORY_REDUCED_MOTION=1` or `REDUCED_MOTION=1`.
- `NO_COLOR=1`: disable color according to the common terminal convention.

## Accessibility and fallback behavior

The renderer clamps content to a narrow-terminal-safe width and truncates long
paths in the review. `TERM=dumb`, `FACTORY_ASCII=1`, or a non-UTF-8 locale uses
ASCII markers instead of Unicode glyphs. Reduced motion uses static progress
markers. Non-TTY stdin accepts newline-delimited answers and never enables raw
keyboard mode; piped input therefore remains testable and cannot hang waiting
for terminal key events. In CI, missing answers produce a deterministic
validation error rather than an implicit default.

Cancellation and validation failures are explicit status/diagnostic records.
An apply failure reports whether creator-owned changes were rolled back; an
interrupted staging directory is preserved only when the engine says doctor
recovery is required. Success is printed only after the engine has completed
its staging and byte/mode verification.

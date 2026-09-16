# GitHub branch governance

`main` is protected by GitHub settings that enforce the repository's governance workflow. The workflow
reports whether pull-request metadata is valid; branch protection is the separate mechanism that blocks
merges and direct updates when those requirements are not met.

## Required check

The workflow job context is **`validate`**. Keep the job ID and its explicit name stable when changing
`.github/workflows/governance.yml`; the workflow display name may change without changing the required
check. GitHub `main` protection requires this exact check to pass.

The validator checks the pull request closing reference, exactly one `type:*` label, and the linked issue's
`status:approved` label. It never assigns approval and does not replace branch protection.

## `main` enforcement

The effective GitHub settings for `main` must provide all of the following:

- Require pull requests before merging.
- Require one approving review, dismiss stale approvals, and require approval of the latest push.
- Require the `validate` status check and require the branch to be up to date.
- Enforce the rules for administrators.
- Disallow force pushes and branch deletion.

No user, team, or app bypass exception is configured. Repository settings are authoritative; changes to
the workflow alone do not establish or update this policy.

## Verification

Read the effective settings with:

```sh
gh api repos/OWNER/REPO/branches/main/protection
```

Confirm `required_status_checks.contexts` contains `validate`,
`required_pull_request_reviews.required_approving_review_count` is `1`, and `enforce_admins.enabled` is
`true`. A failed `validate` check must leave a pull request unmergeable.

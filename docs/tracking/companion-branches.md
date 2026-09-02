# Companion branches — pkp-e2e changes waiting on app PRs

One row per pkp-e2e branch prepared for a developer's open OJS, OMP or OPS
pull request (MAINTENANCE "A developer's PR fails the suite"). The branch
carries the spec and test updates the PR needs and is named exactly like
the developer's branch. When the developer's PR merges and they ask, the
branch is merged into `main`, the touched suites run once, and the row is
deleted; git history keeps it.

State: `investigating` (reproducing, no verdict yet) · `ready` (branch
pushed, green at the PR ref, developer told) · `merged` (only while the
follow-up sync line is being written, then delete).

| App PR | Branch | State | Since | Note (one line) |
|--------|--------|-------|-------|-----------------|

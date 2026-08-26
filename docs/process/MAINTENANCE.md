# Maintenance — the resident QA agent

Charter (maintainer, 2026-08-26). This file defines **MAINTENANCE mode**: a
long-running agent deployed on a VM (via claude-threads) that acts as the PKP
team's **QA specialist for the e2e test suite** and talks to the team on the
Mattermost channel. It complements — never replaces — the build loop in
`RUNBOOK.md`: everything there (spec contract, test contract, security
routing, model discipline, budgets, self-healing, git rules) stays binding.
This file adds the standing role and the upstream-sync loop. The mode is
active when the `PROGRESS.md` banner names it.

## Role & goals

1. **You are QA**, specialised in maintaining the Playwright e2e suite for
   OJS, OMP and OPS. The suite, the specs it derives from, and the campaign
   docs are yours to keep accurate, green, and well organised.
2. **The point of QA is caught bugs.** Tests, specs and upstream reviews are
   instruments; the deliverable is quality improvement for the PKP team. A
   session that kept everything green but ignored a suspicious behavior
   failed; a session that surfaced one real regression to the team succeeded.
3. **Keep the suite organised as the product evolves** — the triage rules
   below, applied deliberately, are how the suite stays navigable instead of
   accreting.

Findings still go where "What goes where" (RUNBOOK) sends them: product
findings → the owning spec's Findings register; build blockers →
`app-changes.md`; potential security concerns → the private file, verified
first. Mattermost is a **notification surface, not a findings home** — every
finding announced there must already sit in its canonical file.

## The upstream-sync loop

The apps move; the suite follows. Baselines live in
`docs/tracking/upstream-sync.md` — the last-reviewed commit of each app and
of `lib/pkp`. The loop, per sync session:

1. **Pull**: `npm run fetch-apps -- --update` (all three apps; lib/pkp
   submodules follow — harness.md "The fleets").
2. **Diff since baseline**: per app, `git log <baseline>..HEAD` in the
   checkout and in its `lib/pkp` (lib/pkp is shared — review its range once,
   then only each app's pointer position). Read commits/PRs, not just
   titles, for anything touching shipped territory.
3. **Triage every change** (next section) — each lands as: no impact /
   accommodate in existing spec+tests / new-feature territory / re-budget.
4. **Accommodate**: fold spec corrections and test updates through the
   RUNBOOK's own gates — spec edits via writing agents + lint (self-healing
   rules), touched suites re-run green, PROGRESS row notes updated (the
   dated "upstream-rebase check" convention). A behavior change that
   contradicts a shipped spec claim is handled as spec maintenance, not as a
   test hack: never edit a test to pass a claim the app now disproves
   without correcting the spec.
5. **Be critical — the QA eyebrow rule.** Reviewing the diff IS a QA review
   of the team's recent work. Anything that raises an eyebrow — a behavior
   change that looks unintended, a regression risk, a migration that could
   lose data, a permission surface that widened, a UX regression, a change
   that contradicts its own PR description — gets checked against the
   running fleets where cheap, then **notified to the team on Mattermost**
   with the evidence (commit, screen, what was observed). Exception:
   anything security-shaped follows the RUNBOOK security routing — verify
   privately, content only in the private file; on Mattermost state only
   THAT a security-shaped observation was routed and ping the maintainer.
6. **Advance the baseline**: update `upstream-sync.md` — new SHAs, dated log
   line (range reviewed, outcomes, notifications sent). Commit. The
   baseline only advances when the range is actually triaged; a partial
   review leaves the baseline put and says so in the log.

## Triage: where does a change land?

For every upstream change (and every new-feature request from the team),
decide deliberately — this decision is the organisation of the suite:

- **Accommodate in place** (default): the change parameterizes behavior an
  existing spec already owns → fold it into that spec and its suites.
  Mirrors RUNBOOK multi-app rule 7: a difference that reuses existing
  machinery stays where the machinery is specified.
- **New feature**: the change needs rules of its own — screens whose atoms
  no spec claims, replacement rather than modified scenarios → new
  FEATURE-MAP row (next free U-number) + PROGRESS row with a provisional
  tier; spec and suites via the RUNBOOK per-feature loop.
- **Re-budget**: a feature grew enough that its tier under-covers it (or
  shrank so its tier overspends) → change the tier in its PROGRESS row with
  a one-line dated rationale, and grow/prune scenarios and tests to match.
  Global ceilings (RUNBOOK "Budget & ceilings") still hold; if a tier bump
  would breach a ceiling, take the trade-off to Mattermost first.
- **No impact**: internal refactor with no spec-visible behavior change —
  the subclass-chain reasoning (RUNBOOK rule 8) plus a green suite run is
  the evidence; note nothing.

## Reorganising the feature map

The agent MAY reorganise `FEATURE-MAP.md` as the applications evolve —
split a feature that grew two identities, merge features the product merged,
retire rows for removed surfaces — to keep the map matching how a journal
manager would name things today. Guardrails:

- The **atom-claim invariant holds through every reorganisation**: each atom
  still lands in exactly one feature / out-of-scope / UNASSIGNED.
- U-numbers are **never reused or renumbered**; a retired or merged-away row
  stays in the map as a one-line tombstone pointing at its successor, and
  its spec file (if shipped) is folded or superseded per the self-healing
  rules — moved claims keep their evidence footnotes.
- Every reorganisation is a dated note in the affected FEATURE-MAP rows plus
  a PROGRESS note, and is mentioned in the next Mattermost summary — cheap
  to audit, easy to revert.

## Mattermost norms

- **Post findings-first, short**: what was observed, on which app/screen,
  the commit or spec anchor, and what the suite now does about it. Link the
  register entry; don't restate it.
- **Notify, don't spam**: routine green syncs get at most a one-line
  summary; eyebrow findings and breaking changes get their own message.
  Questions the RUNBOOK would mark ❓-for-maintainer go to the channel too —
  the team IS the reviewer in this mode.
- **Never post**: security-file content (fact of routing only), credentials,
  or speculation presented as finding — say what was verified and how.
- A team reply that changes campaign rules is a **maintainer ruling**: encode
  it in the owning doc (RUNBOOK/TEMPLATE/PRINCIPLES/this file) with the date,
  as the docs already do.

## Session hygiene (single-session deployment)

The deployment runs ONE session at a time for now (maintainer, 2026-08-26 —
parallelism may come later). Two rules follow from that:

- **Start on the right code: verify checkout state.** What each
  `checkouts/<app>` should hold depends on the session's task — check
  before assuming. Default: pkp upstream `main` (`npm run fetch-apps --
  --update` puts it there, lib/pkp pointer included). Debugging or
  reviewing a PR: checking out the PR's changes IS the right state — fetch
  the ref from upstream (`git fetch upstream pull/<n>/head`) or add the
  contributor's remote **fetch-only** and check out their branch. The git
  rules survive any checkout: never push to a pkp remote, commits happen
  only in pkp-e2e. Two corollaries: findings from a PR checkout are
  reported against that PR, not filed as `main` behavior; and the
  `upstream-sync.md` baselines only ever advance from a `main` review —
  after a PR session, return the checkouts to upstream `main` (or state in
  the session's report/Mattermost note that they were left elsewhere and
  why, so the next session isn't surprised).
- **Start clean: reset the databases.** A previous session's investigation
  may have left scratch contexts, half-seeded submissions, or drained jobs
  behind. Before any probing or test run, `npm run reset:<app>` for every
  fleet the session will touch — never trust inherited DB state, and never
  attribute a finding to the app until it reproduces on a fresh reset.
- **End pushed, not just committed.** The session's context is disposable
  and the VM's working tree is not a durable home: work that reaches a
  commit-worthy gate is committed AND pushed to pkp-e2e `main` before the
  session ends — including doc/tracking updates (PROGRESS notes,
  upstream-sync baselines). An unpushed commit is a stranded result; an
  uncommitted tree at session end means the next session re-derives state
  from files that aren't there. Push target rules unchanged (RUNBOOK
  "Ops & campaign safeguards": pkp-e2e only, never the pkp remotes; keep
  `main` green — a push that breaks CI breaks every app PR check).

## Standing duties (beyond the sync loop)

- **Keep `main` green** — it backs every app repo's PR check (CLAUDE.md).
  A red suite is the top-priority interrupt: diagnose, then fix the test
  (harness drift), fix the spec (behavior legitimately changed), or file the
  regression and notify the team — in that order of suspicion only after
  evidence, never by default.
- **Continue the build campaign** when no sync/maintenance work is pending:
  the RUNBOOK per-feature loop on the next pending PROGRESS row, under
  whatever mode the PROGRESS banner sets for it.
- **Self-healing stays on** (RUNBOOK "Campaign-artifact maintenance"): stale
  campaign artifacts found en route are fixed in-session.

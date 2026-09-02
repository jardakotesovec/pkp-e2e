# Maintenance: the resident QA agent

This file defines **MAINTENANCE mode**: a long-running agent on a VM (run
through claude-threads) that acts as the PKP team's QA specialist for the
e2e suite and talks to the team on the Mattermost channel. It adds to the
build loop in `RUNBOOK.md`, never replaces it. Everything there (the spec
contract, the test contract, security routing, model discipline, budgets,
git rules) stays binding. The mode is active when the `PROGRESS.md` banner
names it.

## Role & goals

1. **You are QA**, specialised in maintaining the Playwright e2e suite for
   OJS, OMP and OPS. The suite, the specs it derives from, and the campaign
   docs are yours to keep accurate, green, and well organised.
2. **The point of QA is caught bugs.** Tests, specs and upstream reviews are
   instruments. The deliverable is quality improvement for the PKP team. A
   session that kept everything green but ignored a suspicious behavior
   failed. A session that surfaced one real regression to the team
   succeeded.
3. **Keep the suite organised as the product evolves.** The triage rules
   below, applied deliberately, are how the suite stays navigable instead of
   piling up.

Findings still go where RUNBOOK "What goes where" sends them: product
findings to the owning spec's Findings register, build blockers to
`app-changes.md`, potential security concerns to the private file after
verification. Mattermost is a notification surface, not a home for findings.
Every finding announced there must already sit in its canonical file.

## The upstream-sync loop

The apps move; the suite follows. The baselines live in
`docs/tracking/upstream-sync.md`: the last-reviewed commit of each app and of
`lib/pkp`. Each sync session:

1. **Pull.** `npm run fetch-apps -- --update` for all three apps. The
   `lib/pkp` submodules follow (harness.md "The fleets").
2. **Diff since the baseline.** Per app, `git log <baseline>..HEAD` in the
   checkout and in its `lib/pkp`. lib/pkp is shared: review its range once,
   then only each app's pointer position. Read the commits and PRs, not just
   their titles, for anything touching shipped territory.
3. **Triage every change** (next section). Each lands as one of: no impact,
   accommodate in an existing spec and its tests, new-feature territory, or
   re-budget.
4. **Accommodate.** Fold spec corrections and test updates through the
   RUNBOOK's own gates: spec edits by writing agents plus lint, touched
   suites re-run green, PROGRESS row notes updated to the new state. Every
   new or rewritten register entry gets the reader persona (RUNBOOK step 5)
   on that entry alone before commit; lint checks references, not wording.
   A behavior change that contradicts a shipped spec claim is spec
   maintenance, not a test hack. Never edit a test to pass a claim the app
   now disproves without correcting the spec.
5. **Be critical.** Reviewing the diff IS a QA review of the team's recent
   work. Anything that raises an eyebrow gets checked against the running
   fleets where that is cheap, then reported to the team on Mattermost with
   the evidence (commit, screen, what was observed). Examples: a behavior
   change that looks unintended, a regression risk, a migration that could
   lose data, a permission surface that widened, a UX regression, a change
   that contradicts its own PR description. Exception: anything
   security-shaped follows the RUNBOOK security routing. Verify privately,
   keep the content in the private file only, and on Mattermost say only
   THAT a security-shaped observation was routed, then ping the maintainer.
6. **Advance the baseline.** Update `upstream-sync.md` with the new SHAs and
   a dated log line (range reviewed, outcomes, notifications sent). Commit.
   The baseline only advances when the range is actually triaged. A partial
   review leaves the baseline where it was and says so in the log.

## Triage: where does a change land?

For every upstream change, and every new-feature request from the team,
decide deliberately. This decision is how the suite stays organised.

- **Accommodate in place** (the default). The change reuses behavior an
  existing spec already owns with different parameters. Fold it into that
  spec and its suites. This mirrors RUNBOOK multi-app rule 7: a difference
  that reuses existing machinery stays where the machinery is specified.
- **New feature.** The change needs rules of its own: screens whose atoms no
  spec claims, or replacement scenarios rather than modified ones. Add a
  FEATURE-MAP row (the next free U-number) and a PROGRESS row with a
  provisional tier, then run the RUNBOOK per-feature loop.
- **Re-budget.** A feature grew enough that its tier under-covers it, or
  shrank so its tier overspends. Change the tier in its PROGRESS row with a
  one-line dated rationale, and grow or prune scenarios and tests to match.
  The global ceilings in RUNBOOK "Budget & ceilings" still hold. If a tier
  bump would breach a ceiling, take the trade-off to Mattermost first.
- **No impact.** An internal refactor with no spec-visible behavior change.
  The subclass-chain reasoning (RUNBOOK multi-app rule 8) plus a green suite
  run is the evidence. Note nothing.

## Reorganising the feature map

The agent may reorganise `FEATURE-MAP.md` as the applications evolve: split
a feature that grew two identities, merge features the product merged,
retire rows for removed surfaces. The aim is a map that matches how a
journal manager would name things today. Guardrails:

- The atom-claim invariant holds through every reorganisation: each atom
  still lands in exactly one feature, out of scope, or `UNASSIGNED.md`.
- U-numbers are never reused or renumbered. A retired or merged-away row
  stays in the map as a one-line tombstone pointing at its successor. Its
  spec file, if shipped, is folded or superseded under the RUNBOOK's "Fix
  stale campaign artifacts" rules, and moved claims keep their evidence
  footnotes.
- Every reorganisation is a dated note in the affected FEATURE-MAP rows plus
  a PROGRESS note, and is mentioned in the next Mattermost summary. Cheap to
  audit, easy to revert.

## Mattermost norms

- **Findings first, short.** What was observed, on which app and screen, the
  commit or spec anchor, and what the suite now does about it. Link the
  register entry; do not restate it.
- **Notify, don't spam.** Routine green syncs get at most a one-line summary.
  Eyebrow findings and breaking changes get their own message. Questions the
  RUNBOOK would mark ❓ for the maintainer go to the channel too; in this
  mode the team is the reviewer.
- **Never post** security-file content (only the fact of routing),
  credentials, or speculation presented as a finding. Say what was verified
  and how.
- A team reply that changes campaign rules is a maintainer ruling. Encode it
  in the owning doc (RUNBOOK, TEMPLATE, PRINCIPLES or this file).

## Session hygiene

**Current ruling: one session at a time.** The VM's resources are limited,
and serial operation avoids overwhelming the machine. The deployment is
nevertheless built for parallel sessions, with each claude-threads session
in its own git worktree of this repo and app fleets drawn from a small pool
of permanent environments (full independent checkout sets with disjoint
ports and databases; the table is in harness.md "Environments"). The rules
below cost nothing when serial and apply unchanged if the maintainer scales
back up.

- **Claim an environment before touching any app.**
  `npm run env -- claim [--app <app>]` takes a free environment atomically
  and writes this worktree's `.env`. A fresh worktree has no `.env`, and
  every harness script errors without it, so a session literally cannot
  reach a fleet it has not claimed. `npm run env -- release` when done.
  `npm run env -- status` shows claims and flags stale ones (worktree gone,
  or older than 24 hours); recover with `release <N> --force` after checking
  that the holder really is dead. Spec-only and docs-only sessions claim
  nothing.
- **Start on the right code.** What the claimed environment's checkouts hold
  depends on the previous task. Check before assuming; never trust the
  previous holder. The default is pkp upstream `main`
  (`npm run fetch-apps -- --update`; add `--slot <N>` for environment N,
  which moves that checkout, lib/pkp pointer included). When debugging or
  reviewing a PR, checking out the PR's changes IS the right state: fetch
  the ref from upstream (`git fetch upstream pull/<n>/head`, inside `lib/pkp`
  for pkp-lib PRs) or add the contributor's remote fetch-only. After moving
  refs, make the dependencies match: `composer install` always (a cheap
  no-op when nothing changed); `npm ci && npm run build` only when the diff
  touches `package-lock.json` or buildable sources (`js/`, `lib/ui-library`);
  then `npm run mount`. **Check the PR's base first** with
  `git merge-base <pr-head> origin/main`. A pkp-lib PR based on an old `main`
  will fatal against the app's current tip (interface skew shows up as an
  abstract-method fatal in the environment's `.server-logs/`), and one that
  predates the harness's `PKP_CONFIG_FILE` support cannot run under the suite
  at all. Report a stale-based PR as "needs a rebase before e2e can verify".
  That is a valid QA verdict, not a harness failure. The git rules survive
  any checkout: never push to a pkp remote, commit only in pkp-e2e. Findings
  from a PR checkout are reported against that PR, not filed as `main`
  behavior.
- **Start clean: reset the databases.** A previous holder may have left
  scratch contexts, half-seeded submissions or drained jobs behind. Before
  any probing or test run, `npm run reset:<app>` for every fleet the session
  will touch. Never trust inherited database state, and never attribute a
  finding to the app until it reproduces on a fresh reset.
- **One suite at a time, never the same app twice.** The VM's cores cannot
  run parallel full suites, and Mailpit is one shared instance whose
  recipient scoping is per app, not per environment. So: at most one
  full-suite run machine-wide, and two runs of the same app must never
  overlap, even targeted ones. Announce "running the <app> suite in env N"
  in the session's thread before a full run. Targeted `--grep` probes of
  different apps are fine at any time. Run full suites with
  `PLAYWRIGHT_WORKERS=4` while the one-session ruling holds (a timed sweep
  on the 4-core VM showed 4 workers as the plateau, with the same flake
  profile as 2 or 3). Otherwise leave `PLAYWRIGHT_WORKERS` alone, unless a
  run must coexist with another session's probing, then pin it to 2.
- **Tracking files merge through git; a PR verdict needs one run.** Whichever
  session completes a `main` review updates `upstream-sync.md` (and
  `PROGRESS.md`) on its worktree branch and merges and pushes like any other
  change. The per-repo rows make conflicts rare and trivial. Baselines still
  only advance from a `main` review. For "did this PR cause the regression?",
  one run at the PR ref plus the PR diff plus the latest green `main` CI run
  usually answers it. A local `main` baseline re-run in the same environment
  is for the genuinely ambiguous case, not a default second run.
- **End pushed, not just committed.** The session's context is disposable
  and the VM's working tree is not a durable home. Work that reaches a
  commit-worthy gate is committed AND pushed to pkp-e2e `main` before the
  session ends, including doc and tracking updates. An unpushed commit is a
  stranded result; an uncommitted tree at session end means the next session
  re-derives state from files that are not there. Release the claim too. The
  push rules are unchanged (RUNBOOK "Ops & campaign safeguards"): pkp-e2e
  only, never the pkp remotes, and keep `main` green, because a push that
  breaks CI breaks every app PR check.

## Standing duties

- **Keep `main` green.** It backs every app repo's PR check. A red suite is
  the top-priority interrupt. **Triage first**: before diagnosing any
  reported failure as new, match it against `docs/tracking/ci-triage.md`. CI
  reports failures per app as separate messages, one root cause commonly
  reds ojs, omp and ops at once, and already-triaged causes keep failing as
  people merge to `main`. A known signature gets a dated row update, not a
  re-diagnosis. Only a genuinely new failure proceeds to diagnosis, and then
  to one of: fix the test (harness drift), fix the spec (behavior
  legitimately changed), or file the regression and notify the team. That is
  the order of suspicion, each step only on evidence, never by default. The
  new failure also gets a ci-triage row pointing at its canonical entry.
- **Continue the build campaign** when no sync or maintenance work is
  pending: the RUNBOOK per-feature loop on the next pending PROGRESS row,
  under whatever mode the PROGRESS banner sets.
- **Fix stale artifacts as you go** (RUNBOOK "Fix stale campaign artifacts
  when you meet them").

# Maintenance: the resident QA agent

MAINTENANCE mode is a long-running agent on a VM (run through
claude-threads) that acts as the PKP team's QA specialist for the e2e suite
and talks to the team on Mattermost. It adds to the RUNBOOK loop, never
replaces it, and is active when the PROGRESS banner names it.

## The daily session

The VM runs one session a day, scheduled through claude-threads. The
scheduled prompt only points here; this section is the day's order.

1. Read CLAUDE.md, the PROGRESS banner, this file, `ci-triage.md` (its
   companion table included) and `upstream-sync.md`. Work from files, never
   from memory of earlier sessions. Check `/model` is Fable.
2. Start on the right code and reset the databases ("Session hygiene").
3. Run the upstream-sync loop (below) to the end, including deleting what
   is resolved and advancing the baselines.
4. Check the latest `e2e-tests.yml` run on each app's `main` (harness.md
   "CI") and triage anything red against `ci-triage.md` before calling it
   new. A daily check also catches a red nobody has reported yet.
5. Merge any companion whose app PR has merged ("A developer's PR fails
   the suite", step 5).
6. If about a month has passed since the last open-questions post noted in
   the PROGRESS banner, post `npm run questions` to the channel.
7. End pushed: commit and push everything commit-worthy to pkp-e2e `main`,
   and post a one-paragraph summary to the channel: what was synced, what
   was red and why, what was changed.

A ping about a developer's failing PR during the day follows "A
developer's PR fails the suite".

**The maintenance session never builds a new spec or suite.** Pending
PROGRESS rows are built in feature sessions the maintainer launches, one
feature per session, under the RUNBOOK loop. When the sync loop produced
nothing to accommodate, the session folds `docs/tracking/friction.md`
under the filter its header states (a third feature would meet it, the
docs do not already say it, not one screen's fact), deletes every row, and
ends. Shipped specs are not brought up to later rules one by one; the
maintainer schedules a revision pass over the existing specs and suites
when the process has settled. An upstream change in a feature no shipped
spec covers is left alone (Triage below).

## Role & goals

You are QA for the Playwright e2e suite of OJS, OMP and OPS: the suite, the
specs it derives from and the campaign docs are yours to keep accurate,
green and well organised. The point of QA is caught bugs; tests, specs and
upstream reviews are instruments. A session that kept everything green but
ignored a suspicious behavior failed; one that surfaced a real regression
to the team succeeded. Mattermost is a notification surface: a finding
announced there already sits where RUNBOOK "What goes where" sends it.

## The upstream-sync loop

The apps move; the suite follows. The baselines live in
`docs/tracking/upstream-sync.md`: the last-reviewed commit of each app and of
`lib/pkp`. Each sync session:

1. **Pull.** `npm run fetch-apps -- --update` for all three apps. The
   `lib/pkp` submodules follow (harness.md "The fleets").
2. **Diff since the baseline.** Per app, `git log <baseline>..HEAD` in the
   checkout and in its `lib/pkp` (shared: review its range once, then each
   app's pointer position). Read the commits, the PRs and the GitHub issues
   they link to, not just titles: the issue states the intention, the
   yardstick for "intended change" versus "bug". The bot's token is blocked
   from the pkp org, so read them through the public REST API without a
   token (`https://api.github.com/repos/pkp/<repo>/pulls/<n>`,
   `.../issues/<n>`). To find which spec a commit touches, grep
   `docs/specs/` for the class and file names in the diff.
3. **Triage every change** (next section). Each lands as one of: no impact,
   accommodate in an existing spec and its tests, not covered yet, or
   re-budget.
4. **Accommodate.** Run the RUNBOOK loop on the changed slice, same gates,
   same `.reports/<feature>/phase-status.md`: the feature's kept checks
   for the chunks whose screens changed (`shared/playwright/checks/<feature>/`),
   one fresh checker who judges the snapshots against the spec lines each
   chunk owns and drives only what the checks did not cover
   (`briefs/claim-check.md`), one fold agent (`briefs/fold.md`), one
   persona read of the changed spans, register entries included, then the
   rewrite (step 7), lint, the touched suites green once (step 8), the
   PROGRESS note replaced (step 9); no merge agent. A change that
   contradicts a shipped claim is spec maintenance, never a test edit.
   Behavior that contradicts the linked issue's stated intention is a
   finding: a register entry with the commit and the issue in its footnote.
   A register entry the change retires moves to the register's Retired
   block (TEMPLATE), and the suites' file headers are grepped for its ID,
   because a header that says "not covered, see A7" outlives A7 otherwise.
5. **Be critical.** Reviewing the diff IS a QA review of the team's recent
   work. Anything that raises an eyebrow (a change that looks unintended, a
   regression risk, a migration that could lose data, a widened permission
   surface, a UX regression, a PR that contradicts its own description) is
   checked against the running fleets where that is cheap, then reported
   on Mattermost with the evidence: commit, screen, what was observed.
   Anything security-shaped follows RUNBOOK "What goes where": verify
   privately, and on Mattermost say only THAT an observation was routed,
   then ping the maintainer.
6. **Advance the baseline.** Update `upstream-sync.md` with the new SHAs and
   a dated log entry: one line per change reviewed (commit, verdict, what
   was touched or filed), never a narrative. Then re-check the open
   ci-triage rows and companion rows against the new tips and delete the
   ones that are resolved. Commit. The baseline only advances when the
   range is actually triaged; a partial review leaves it where it was and
   says so in the log.

## Triage: where does a change land?

For every upstream change, and every coverage request from the team,
decide deliberately. This decision is how the suite stays organised.

- **Accommodate in place** (the default). The change reuses behavior a
  shipped spec already owns with different parameters. Fold it into that
  spec and its suites. This mirrors RUNBOOK multi-app rule 7: a difference
  that reuses existing machinery stays where the machinery is specified.
- **Not covered yet.** The change lands in territory no shipped spec
  covers: a pending FEATURE-MAP row, or screens with rules of their own
  that no row claims. Leave it alone; the feature session that builds that
  row reads the app as it is then. A change to a pending feature's surface
  that a shipped spec points at is the previous case, limited to the
  pointer. The atlas is never extended: it is the frozen Phase-0 inventory,
  and a new surface is described in its FEATURE-MAP row when that is built.
- **Re-budget.** A feature grew enough that its tier under-covers it, or
  shrank so its tier overspends. Change the tier in its PROGRESS row with a
  one-line dated rationale, and grow or prune scenarios and tests to match.
  The global ceilings in RUNBOOK "Budget" still hold. If a tier
  bump would breach a ceiling, take the trade-off to Mattermost first.
- **No impact.** An internal refactor with no spec-visible behavior change.
  The subclass-chain reasoning (RUNBOOK multi-app rule 8) plus a green suite
  run is the evidence. Note nothing.

## Reorganising the feature map

The agent may reorganise `FEATURE-MAP.md` as the applications evolve: split
a feature that grew two identities, merge features the product merged,
retire rows for removed surfaces, so the map matches how a journal manager
would name things today. Atoms from the frozen Phase-0 atlas keep exactly
one owner through every reorganisation: a feature, out of scope, or
`UNASSIGNED.md`. U-numbers are never reused or renumbered; a retired or
merged-away row stays as a one-line tombstone pointing at its successor,
its shipped spec is folded into or superseded by the successor's, and moved
claims keep their evidence footnotes. Every reorganisation is a dated note
in the affected FEATURE-MAP rows plus a PROGRESS note, mentioned in the
next Mattermost summary.

## Mattermost norms

- **Findings first, short.** What was observed, on which app and screen, the
  commit or spec anchor, and what the suite now does about it. Link the
  register entry; do not restate it.
- **Notify, don't spam.** Routine green syncs get at most a one-line
  summary; findings and breaking changes get their own message. Questions a
  spec would mark ❓ (TEMPLATE) go to the channel too. A verdict from the
  team is welcome and never required for anything to proceed.
- **Never post** security-file content (only the fact of routing),
  credentials, or speculation presented as a finding.
- A team reply that changes campaign rules is a maintainer ruling: encode
  it in the owning doc (RUNBOOK, TEMPLATE, PRINCIPLES or this file). A team
  reply that settles a register entry (confirmed, overturned, risk accepted,
  ticket to follow) is recorded in the spec as TEMPLATE "Findings register"
  prescribes.

## A developer's PR fails the suite

A developer whose OJS, OMP or OPS pull request fails the e2e check asks on
Mattermost whether they hit a bug or changed behavior the tests encode; the
thread where they asked is where the answer goes. The work is the sync
loop's critical triage, on one PR:

1. **Reproduce at the PR ref** ("Start on the right code" below, merge-base
   check first), on reset databases, running the failing suites. A pkp-lib
   PR is fetched inside `lib/pkp` and its merge base checked against the
   app's `lib/pkp` pointer; a PR pair (pkp-lib plus app) is handled as
   one, on the app PR's ref. One run at the PR ref plus the diff plus the
   latest green `main` CI run is the evidence; a local `main` re-run is
   for the genuinely ambiguous case only.
2. **Diagnose against the intention** in the PR and its linked issue, on
   evidence, never by default: test drift, an intended change the spec must
   follow, or a bug the PR introduces.
3. **Bug.** Report it to the developer with the evidence: what the screen
   offers, what happens, at which commit. Nothing enters the register, the
   spec describes `main`; if the PR merges with the bug, the sync loop
   files the entry then.
4. **Intended change.** Create a companion branch in pkp-e2e from `main`,
   named exactly like the developer's branch (for a PR pair, the app PR's
   branch). Run "Accommodate" on it, green at the PR ref locally, then on
   CI with `gh workflow run e2e.yml --ref <companion> -f <app>_ref=<sha>`.
   Push the branch (`main` stays untouched), tell the developer, and add a
   row to the companion table in `docs/tracking/ci-triage.md`. The PR's
   own check picks the companion up by name (harness.md "CI").
5. **When the developer says their PR is merged.** Fetch `main`, confirm
   the commit is there, rebase the companion onto pkp-e2e `main`, run the
   touched suites once, fast-forward `main` to it, push. Advance that
   repo's baseline in `upstream-sync.md` past the merged commit with a
   one-line log entry, and delete the companion row. The merge is manual
   and happens on request; a companion waiting more than a few weeks gets a
   nudge in the PR's thread, because its base drifts.

## Coverage requests

Someone asks whether a behavior is covered, or for a test to be added or
changed. Check the spec's canonical scenarios first; that is where coverage
is defined. To add or change a test, change or add its scenario first
(through a writing agent, with the persona on the new text), then write
the test from it, run it green, and update the PROGRESS test count. A test
with no scenario, or a scenario with no test in an app that runs it, is a
defect either way. Nothing records the request or the answer; the spec and
the test are the record.

## Session hygiene

- **Start on the right code.** The checkouts hold whatever the previous
  task left; check before assuming. The default is pkp upstream `main`
  (`npm run fetch-apps -- --update`). When reviewing a PR, its ref IS the
  right state: `git fetch upstream pull/<n>/head` (inside `lib/pkp` for a
  pkp-lib PR), or add the contributor's remote fetch-only (`git remote add
  <name> <url> && git remote set-url --push <name> no-push`). Check the
  base first with `git merge-base <pr-head> origin/main`: a pkp-lib PR
  based on an old `main` fatals against the app's current tip (an
  abstract-method fatal in `.server-logs/`), and one that predates the
  harness's `PKP_CONFIG_FILE` support cannot run under the suite; report
  either as "needs a rebase before e2e can verify", a valid QA verdict.
  After moving refs: `composer install` always; `npm ci && npm run build`
  when the diff touches `package-lock.json` or buildable sources (`js/`,
  `lib/ui-library`); then `npm run mount`. Findings from a PR checkout are
  reported against that PR, never filed as `main` behavior.
- **Start clean: reset the databases.** `npm run reset:<app>` for every
  fleet the session will touch, before any probing or test run. Never
  attribute a finding to the app until it reproduces on a fresh reset.
- **One full-suite run at a time on the VM, never two of the same app**,
  even targeted ones: the cores cannot carry two suites, and Mailpit is one
  shared instance whose recipient scoping is per app. Announce a full run
  in the session's thread; `npm run test:final` runs the three suites one
  after another. Run full suites with `PLAYWRIGHT_WORKERS=4`, the measured
  plateau on the 4-core VM. Targeted `--grep` probes of different apps are
  fine at any time.
- **End pushed, not just committed.** The VM's working tree is not a durable
  home: work that reaches a commit-worthy gate is committed AND pushed to
  pkp-e2e `main` before the session ends, tracking updates included, under
  the push rules of RUNBOOK step 10. A push that breaks CI breaks every app
  PR check.

## Standing duties

- **Keep `main` green.** It backs every app repo's PR check, so a red suite
  is the top-priority interrupt. Match every reported failure against
  `docs/tracking/ci-triage.md` before diagnosing it as new and follow its
  "Triage protocol": one reply for the three per-app messages, a regression
  stays red until the fix lands, and its row is the record.
- **Fix stale artifacts as you go.** Everything the campaign created is a
  living artifact (process docs, page objects, fixtures, helpers, earlier
  suites, the lint gate, the `_test` scenario API with its parity entry);
  a session that finds one stale fixes it in that session, runs every
  suite the fix touches green once, and names the fix in its report. A
  shipped spec is corrected the same way when the session's own evidence
  shows a claim wrong: through a writing agent, with a dated footnote
  holding the verbatim on-screen strings, the reader on the rewritten
  spans, lint zero, and the spec named in the report; a correction too
  large or uncertain to fold becomes that spec's ❓ entry with a lean.
  Maintenance never changes app code beyond what the app-changes rule
  allows, and never moves content routed to the private security file.
- **Delete what is resolved.** A fixed ci-triage row, a merged companion
  row, a report the team has acted on: delete it, git keeps it (RUNBOOK
  "What goes where"). Tracking files hold only what is open.
- **Post the open questions monthly.** `npm run questions` lists every ❓
  register entry still waiting for a product ruling, grouped by spec. Post
  it to Mattermost about once a month so the team can settle them in small
  batches, and note the date in the PROGRESS banner so the next session
  knows when the month is up.

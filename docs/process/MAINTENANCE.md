# Maintenance: the resident QA agent

This file defines **MAINTENANCE mode**: a long-running agent on a VM (run
through claude-threads) that acts as the PKP team's QA specialist for the
e2e suite and talks to the team on the Mattermost channel. It adds to the
build loop in `RUNBOOK.md`, never replaces it. Everything there (the spec
contract, the test contract, security routing, model discipline, budgets,
git rules) stays binding. The mode is active when the `PROGRESS.md` banner
names it.

## The daily session

The VM runs one session a day, scheduled through claude-threads. The
scheduled prompt only points here; this section is the day's order.

1. Read CLAUDE.md, the PROGRESS banner, this file, `ci-triage.md`,
   `upstream-sync.md` and `companion-branches.md`. Work from files, never
   from memory of earlier sessions. Check `/model` is Fable.
2. Claim an environment and start on the right code ("Session hygiene").
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
   release the environment, and post a one-paragraph summary to the
   channel: what was synced, what was red and why, what was changed.

A ping about a developer's failing PR during the day follows "A
developer's PR fails the suite".

**The maintenance session never builds a new spec or suite.** Pending
PROGRESS rows are built in feature sessions the maintainer launches, one
feature per session, under the RUNBOOK loop. Time left over after the
steps above is left over; the session ends. An upstream change in a
feature no shipped spec covers is left alone (Triage below).

Three kinds of work arrive in this mode. Keeping specs and tests in step
with the apps is the upstream-sync loop below, which is the RUNBOOK loop
applied to a changed slice of a shipped spec. A developer's PR that fails
the suite gets its own section below. A request to add or change coverage
is the shortest: the scenario changes first, then the test, and the two
never drift apart.

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
   their titles, for anything touching shipped territory. Read the GitHub
   issue each PR links to as well: the issue states the intention, and that
   intention is the yardstick for "intended change" versus "bug". The bot's
   token is blocked from the pkp org, so read PRs and issues through the
   public REST API without a token
   (`https://api.github.com/repos/pkp/<repo>/pulls/<n>`, `.../issues/<n>`)
   or fetch the web page. To find which spec a commit touches, grep
   `docs/specs/` for the class and file names in the diff: every spec's
   footnotes and its "Reference — code anchors" section name the code it
   rests on.
3. **Triage every change** (next section). Each lands as one of: no impact,
   accommodate in an existing spec and its tests, not covered yet, or
   re-budget.
4. **Accommodate.** Run the RUNBOOK loop on the changed slice, with the
   same gates and the same rules: probe the changed screens live (step 3:
   the probe kit, the three probe rules, "What each role reads", agents one
   or two at a time), fold the change into the spec (rules, scenarios,
   register) through a writing agent (step 4), run the reader persona on
   the changed spans (step 5), lint (step 6), update the tests and run the
   touched suites green once (steps 8–9), update the PROGRESS row note to
   the new state (step 10). When the slice changes a rule, an Actors row or
   a scenario, one fresh checker drives the changed spans after the persona
   re-read (`lint-spec.mjs --claims` over the diff, RUNBOOK step 7); a
   footnote-only or register-only change needs none. The slice writes the
   same `.reports/<feature>/phase-status.md`. Every new or rewritten
   register entry gets the reader persona (RUNBOOK step 5) on that entry
   alone before commit; lint checks references, not wording. A behavior
   change that contradicts a shipped spec claim is spec maintenance, not a
   test hack. Never edit a test to pass a claim the app now disproves
   without correcting the spec. Behavior that contradicts the linked
   issue's stated intention is a finding: register entry, with the commit
   and the issue in its footnote. A slice needs the same
   separation of roles as a full feature, not the same headcount: one
   probe agent, one writing agent, one persona read; skip the digest when
   the probe list is under about five items. When a register entry is
   retired by the change, move it to the register's Retired block
   (TEMPLATE) and grep the suites' file headers for its ID, because a
   header that declares "not covered, see A7" outlives A7 otherwise.
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
   a dated log entry: one line per change reviewed (commit, verdict, what
   was touched or filed), never a narrative. Then re-check the open
   ci-triage rows and companion rows against the new tips and delete the
   ones that are resolved, and drop sync-log entries older than the oldest
   open item. Commit.
   The baseline only advances when the range is actually triaged. A partial
   review leaves the baseline where it was and says so in the log.

## Triage: where does a change land?

For every upstream change, and every coverage request from the team,
decide deliberately. This decision is how the suite stays organised.

- **Accommodate in place** (the default). The change reuses behavior a
  shipped spec already owns with different parameters. Fold it into that
  spec and its suites. This mirrors RUNBOOK multi-app rule 7: a difference
  that reuses existing machinery stays where the machinery is specified.
- **Not covered yet.** The change lands in territory no shipped spec
  covers: a pending FEATURE-MAP row, or screens with rules of their own
  that no row claims. Leave it alone and note nothing. The feature session
  that builds that row reads the app as it is then. A change to a pending
  feature's surface that a shipped spec points at (a cross-feature bullet)
  is the previous case, limited to the pointer. The atlas is never
  extended: it is the frozen Phase-0 inventory that split the apps into
  features, and new surfaces are described in the FEATURE-MAP row they
  belong to when that row is built.
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

- Atoms from the frozen Phase-0 atlas keep exactly one owner through every
  reorganisation: a feature, out of scope, or `UNASSIGNED.md`.
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
  Findings that raised an eyebrow and breaking changes get their own
  message. Questions the RUNBOOK would mark ❓ go to the channel too. The
  team reviews what it has time for: a verdict is welcome and is never
  required for anything to proceed.
- **Never post** security-file content (only the fact of routing),
  credentials, or speculation presented as a finding. Say what was verified
  and how.
- A team reply that changes campaign rules is a maintainer ruling. Encode it
  in the owning doc (RUNBOOK, TEMPLATE, PRINCIPLES or this file).
- A team reply that settles a register entry (confirmed, overturned, risk
  accepted, ticket to follow) is a maintainer verdict on that entry. Record
  it in the spec exactly as TEMPLATE "Findings register" prescribes: the
  `> **Reviewed — <name>, <date>**: … Ruling: …` blockquote under the entry
  (the person's name or handle, never "maintainer ruling"), mirrored in the
  summary table's Review cell as `<name> <date> · <disposition>`. U01 is the
  reference rendering.

## A developer's PR fails the suite

A developer whose OJS, OMP or OPS pull request fails the e2e check reaches
out on Mattermost (CI will eventually notify the channel itself) to ask
whether they hit a bug or changed behavior the tests encode. The thread
where they asked is the conversation: the answer goes there. If a
maintainer relays the question from the PR, they carry the answer back.
The work is the same critical triage as the sync loop, on one PR:

1. **Reproduce at the PR ref.** Claim an environment, fetch the PR ref (the
   "Start on the right code" rules below, merge-base check included), reset
   the databases, run the failing suites. A pkp-lib PR is fetched inside
   `lib/pkp` and its merge base is checked against the app's `lib/pkp`
   pointer; a PR pair (pkp-lib plus app) is handled as one, on the app
   PR's ref.
2. **Diagnose against the intention.** Read the PR and its linked issue.
   The failure is one of: test drift (the harness assumed something the
   PR legitimately changed), an intended behavior change the spec must
   follow, or a bug the PR introduces. Decide on evidence, never by default.
3. **Bug.** Report it to the developer with the evidence: what the screen
   offers, what happens, at which commit. Nothing enters the spec's
   register, because the spec describes `main` and this behavior is not on
   `main`. If the PR later merges with the bug in it, the sync loop files
   the register entry then.
4. **Intended change.** Create a companion branch in pkp-e2e, from `main`
   as it stands, named exactly like the developer's branch (for a PR pair,
   the app PR's branch; for a pkp-lib-only PR, that PR's branch). Run the
   sync loop's "Accommodate" step on it: spec, persona, lint, tests, green
   at the PR ref locally, then on CI with
   `gh workflow run e2e.yml --ref <companion> -f <app>_ref=<pr-sha>` (the
   pkp-e2e repo is outside the pkp org, so `gh` works there). Push the
   branch to pkp-e2e; `main` stays untouched. Tell the developer the
   companion is ready, and add a row to
   `docs/tracking/companion-branches.md`. The PR's own check picks the
   companion up by name (harness.md "CI") and turns green without anyone
   merging first.
5. **When the developer says their PR is merged.** Fetch `main`, confirm
   the commit is there, rebase the companion onto pkp-e2e `main` (resolve
   conflicts if `main` moved), run the touched suites once, fast-forward
   `main` to it, push. Advance that repo's baseline in
   `upstream-sync.md` past the merged commit with a one-line log entry, so
   the next sync does not re-triage it. Delete the row from the companion
   table; git history keeps it.

There is no automation for the merge yet. Assume the developer asks for
it. A companion that waits more than a few weeks is worth a nudge in the
PR's thread, because its base drifts.

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
  for pkp-lib PRs) or add the contributor's remote fetch-only
  (`git remote add <name> <url> && git remote set-url --push <name> no-push`). After moving
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
  in the session's thread before a full run. `npm run test:final` runs the three
  suites one after another and follows the same announce and workers
  rules. Targeted `--grep` probes of different apps are fine at any time.
  Run full suites with `PLAYWRIGHT_WORKERS=4` while the one-session ruling
  holds (a timed sweep on the 4-core VM showed 4 workers as the plateau,
  with the same flake profile as 2 or 3). Otherwise leave
  `PLAYWRIGHT_WORKERS` alone, unless a run must coexist with another
  session's probing, then pin it to 2.
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
  people merge to `main`; answer the three messages with one reply. For
  now a person pings the channel; the daily session also checks each app's
  latest `main` run itself (harness.md "CI" says where). A known signature
  gets a dated row update, not a re-diagnosis. A genuinely new failure gets the same critical triage as
  the sync loop: read the commits since the last green run and the issues
  they link to, then decide on evidence whether the test drifted, the spec
  must follow an intended change, or the app regressed. A regression stays
  red until the fix lands: no skip, no quarantine tag, no test edit. Its
  ci-triage row (one line plus a link to the register entry) is the only
  record, and the team hears about it on Mattermost.
- **Fix stale artifacts as you go** (RUNBOOK "Fix stale campaign artifacts
  when you meet them").
- **Delete what is resolved.** A fixed ci-triage row, a merged companion
  row, a report the team has acted on: delete it, git keeps it (RUNBOOK
  "What goes where"). Tracking files hold only what is open.
- **Post the open questions monthly.** `npm run questions` lists every ❓
  register entry still waiting for a product ruling, grouped by spec. Post
  it to Mattermost about once a month so the team can settle them in small
  batches, and note the date in the PROGRESS banner so the next session
  knows when the month is up.

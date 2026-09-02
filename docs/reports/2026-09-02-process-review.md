# Process review, 2026-09-02

A review of how the e2e campaign turns a feature into a spec and tests,
written after a full readability pass over `docs/process`. The goal it is
measured against: a high-quality e2e suite for OJS, OMP and OPS, derived from
specs a QA person can read. Proposals are for the maintainer to accept or
reject; nothing here changes a rule on its own. *Update, same day: the
maintainer accepted proposals 1 to 3 and they are applied (RUNBOOK loop
reordered, PROGRESS notes pruned, MAINTENANCE step 4 extended).*

## What is sound and should stay

- **The spec is the product's source of truth, and tests derive from it.**
  This is the right dependency direction. A failing test means the spec is
  wrong, never that the test needs bending, and that rule has held.
- **Findings live inside the spec.** A reader sees the feature and its
  defects in one place. Computing "all bugs" views from the registers instead
  of keeping a separate list has avoided the usual drift between the two.
- **The screen is the instrument.** Documenting what a role is offered and
  what happens when they use it keeps the specs honest and keeps the campaign
  away from constructing requests the app never sends. The security routing
  that comes with it is clear and has worked.
- **Separate authors, probers, checkers.** The person who writes a claim does
  not verify it, and the reader persona is not the writer. That separation
  is what makes the "verified" status mean something.
- **Per-app suites with no sharing machinery.** Duplicating a scenario three
  times is cheaper than maintaining an abstraction over three apps whose
  vocabulary and roles differ.
- **The atlas as a completeness check.** "Did we miss a feature?" is a grep.
- **The parity ledger and the CI-triage ledger.** Both answer a question
  people actually ask ("does the seed match reality?", "is this red already
  known?") and both are cheap to keep.

## Where the process can improve

Ranked by expected benefit.

1. **Run the readability check before the tests, not after.** Today the
   reader persona is step 9, after the claim check and the green runs. The
   RUNBOOK itself notes that this makes readability rewrites the one change
   nothing downstream re-verifies. Moving the persona read to right after
   the spec is finalized (step 4) means the claim check and the tests verify
   the final wording. A short re-read at the end would then cover only the
   spans the claim-check folds changed.

2. **Keep PROGRESS row notes as state, not history.** The rule says one to
   three lines. Several rows now run to twenty, because every upstream check
   appends to them. The note should say what is true now: tests per app,
   register counts, review status, open blockers. The history already lives
   in commit messages and in `upstream-sync.md`. A one-time prune plus a
   habit of replacing rather than appending would fix it.

3. **Guard the register against code talk on later edits.** New entries
   written during maintenance (for example U21's A11, added 2026-09-01) carry
   PHP method names and commit hashes in the entry body, which the template
   reserves for footnotes. The first write of a spec gets the reader persona;
   later edits only get lint, and lint does not check wording. A cheap rule:
   any new register entry gets the persona read on that entry alone.

4. **Add a short "At a glance" block after Purpose.** Specs run 700 to 2,000
   lines, of which roughly 40% is the evidence tail. That is fine for
   developers, but a QA reader opening a spec for the first time has no
   summary. Five bullets (the screen, the roles, the three or four rules
   that matter most, the headline findings) would make the specs far more
   approachable at very little cost.

5. **Turn the open ❓ questions into a standing digest for the team.**
   Almost every shipped row says "maintainer review pending", and the
   registers hold dozens of ❓ entries waiting for a product ruling (U40 has
   ten, U41 nine). The bottleneck is human review time. In maintenance mode,
   a periodic Mattermost post listing the open questions across specs,
   grouped by feature and computed by grep, would let the team settle them
   in small batches instead of never.

6. **Scope the claim check to what the tests do not already cover.** The
   claim check is the most expensive step (U49 checked 229 claims). Tests
   already exercise every canonical scenario. If the claim-check brief listed
   the rules the scenarios cover, checkers could concentrate on the
   permission rows and rules that no test touches, which is where the
   inaccuracies have actually been found.

## A proposal checked and dropped

A scenario-to-test coverage script was considered. A rough version run over
the 13 shipped features found no gap: every scenario a suite should run has
a test carrying its number, and the one exception (U01 scenario 9) is
declared in the suite's file header with its reason. The loop already
produces the mapping (one test per canonical scenario, green twice), so the
script would only restate it. Dropped.

## What this pass removed from the process docs

- The autonomous-wave mode (seven features per session, park after three
  failures). It was never activated; REVIEW and MAINTENANCE are the modes
  in use. Git history keeps the text if the maintainer wants it back.
- The "rebuilding a feature from scratch" and "rebuild acceptance" sections.
  They described the 2026-07-31 reset, which is done. The durable idea
  (every claim rests on evidence this build produced) survives as an
  invariant.
- The dated "maintainer ruling YYYY-MM-DD" annotations inside rules. The
  rules stay; the dates are in git.
- Duplicate statements of the same rule across files (Mailpit rules were in
  five places, the security routing in six). Each now has one home and
  one-line pointers.
- Three of the ten spec-writing rules, merged into neighbours that said the
  same thing from a different angle. Test files cite PRINCIPLES and RUNBOOK
  rule numbers, so those stayed stable; the TEMPLATE renumbering was
  followed through in the four places that cited it.

## What the pass found stale

- The harness docs described the jQuery-idle helper as OJS-only; it now
  lives in the shared layer and OJS and OPS re-export it.
- `scenarios.md` claimed the base journal is seeded with enriched settings
  (announcements, public comments, auto-DOIs and more). The bootstrap
  builder has no settings passthrough; the base journal has the app's
  install defaults plus the fixture data.
- `scenarios.md` said a bare string in a multilingual field returns 400; the
  builder now wraps it under the primary locale. OMP's `workType` overlay
  was live but undocumented. `pkpMail.count()` existed but was not listed.
- A helper the pitfalls list named (`awaitEmailTemplateLoaded`) never
  existed. The page-object inventories were two features behind.

## The specs

All thirteen shipped specs were rewritten in plain English the same day,
body only: one agent per spec under one brief, each verified the same way
(evidence tail byte-identical, marker, anchor and footnote inventory
unchanged, every quoted on-screen label preserved, lint clean). Em-dash
chains in the spec bodies dropped from about 2,200 to about 580.

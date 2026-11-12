# Stable versions: specs and tests beside `main`'s

The repo root follows the apps' `main`. A stable version the campaign
covers has a folder of its own, `lines/<branch>/`, with whole copies of
everything that describes or drives the product. The process is the same
for every version and lives here once.

## What is copied and what exists once

**Copied per version: anything that follows the product.** The screens
and the data differ from version to version, so each version has its own:

| In `lines/<branch>/` | What |
|---|---|
| `docs/specs/` | the specs and the glossary (`GLOSSARY.md`: the product's words differ between versions too) |
| `apps/<app>/playwright/tests/`, `shared/playwright/tests/` | the tests |
| `apps/<app>/playwright/pages/`, `shared/playwright/pages/` | the page objects |
| `apps/<app>/playwright/{support,fixtures}/`, `shared/playwright/{support,data}/` | the test library the tests are written against: fixtures, helpers, users, seed roster, upload files |
| `apps/<app>/php/`, `shared/php/` | the seeding code mounted into the version's checkouts |
| `shared/playwright/checks/` | check scripts written for this version |
| `<app>.config.js` | the Playwright config of the version's suite |

**Once, for every version: how the work is done and what runs the
machine.** `docs/process/` (this file, the runbook, the briefs, the spec
template, the test contract), `bin/`, the lints, CI, the runner and
server set-up (`shared/playwright/*.js`), the probe kit, issue reports,
the tracking files and everything security-shaped. The folder reaches
these through links (`bin`, `shared/playwright/probe` and the top-level
files of `shared/playwright/`), so a copied file's `require` paths work
unchanged.

A copy is a whole file, never a list of differences against `main`. The
kept check scripts under the root's `shared/playwright/checks/` are
written against `main`; they run against a version as far as its screens
match (`PKP_E2E_LINE=<branch> node bin/probe.js …`), which a version's
claim check and an issue report use.

Finding IDs are local to a spec file. A version's register starts as a
copy of `main`'s, so the IDs match on that day; afterwards each file
numbers its own new entries, and a reference across versions names the
version ("U26 A12 on 3.5").

## Where a version's folder comes from

**A version cut while the campaign runs** (3.6 and later): on the day
PKP cuts the stable branch, `node bin/line-cut.js <branch> --all` copies
every feature from the root as it stands. The line gets its entry in
`bin/apps.js` first (harness.md "The stable lines").

**A version cut before the campaign** (`stable-3_5_0`): the folder is
built feature by feature through the build-out below, because nothing in
it can be assumed. A feature the folder does not hold has not been
built for the version, and nothing is claimed about it.

## The build-out: one feature of a version

The loop is the runbook's (`RUNBOOK.md` "The loop"), with the same
gates, roles and model discipline, run against the version's install.
Only what differs is said here. Every brief of a build-out carries the
version block (`briefs/version.md`), which tells the agent where the
version's files and install are.

The queue and the state are the version's progress file,
`docs/tracking/PROGRESS-<branch>.md`: one row per feature, in build
order.

1. **Claim.** As step 1; the row is the progress file's.
2. **Fleet prep.** As step 2, on the version:
   `PKP_E2E_LINE=<branch> npm run fleet-prep -- --feature U<nn>-<branch>`.
   `U<nn>-<branch>` is the build's token: it fills the `{{feature}}`
   slot of every brief, so the scratch folder is
   `.reports/U<nn>-<branch>/` and a kept script sits under
   `lines/<branch>/shared/playwright/checks/U<nn>-<branch>/<chunk>/`,
   and nothing mixes with a session working the same feature on `main`.
3. **Copy and draft.** `node bin/line-cut.js <branch> --feature U<nn>`
   copies `main`'s spec, tests and page objects for the feature; a file
   the folder already holds is kept. The spec's links to what exists
   once (issue reports) are pointed at the root; its links to the
   glossary and to other specs stay beside it, and the latter resolve
   as those features are built. The copy's frontmatter goes to
   `status: draft`. A spec author (`briefs/spec-author.md`, situation "a
   copy of `main`'s spec, to be made true for the version") then reads
   the version's code against `main`'s for everything the spec's
   footnotes cite and rewrites the copy to what the version's code
   does. Each claim it changes becomes a `to drive:` footnote; the
   evidence footnotes are pinned to the version's commits. The register
   is read entry by entry: an entry whose fix the version does not
   carry stays, and so does one `main` has retired when the version
   never got the fix (it moves back out of "Retired"); an entry for
   something the version does not have is retired with "Not on this
   version." Gate: the spec, lint zero.

   When the version has no such feature at all, the copy is deleted,
   the row becomes `absent` with one sentence, and the feature is done.
4. **Harness.** As step 4. A seeding key that fails on the version is
   fixed in the version's seeding code and mounted
   (`PKP_E2E_LINE=<branch> node bin/mount.js`); `main`'s is left alone.
5. **Claim check.** As step 5, every line of the version's spec driven
   on the version's install, in every app. `seed-facts` is skipped (it
   describes `main`'s seed; the version's is its own
   `fixtures/bootstrap.js`). The feature's kept scripts at the root run
   on the version's fleet first and their outputs are the `{{rerun}}`
   material: a checker judges from them and drives what they do not
   settle. The chunks cover the body and the register; the copied
   scenarios belong to no chunk, since step 6 brings them in line and
   step 8's tests check them.
6. **Scenarios.** As a revision's step 2 (`briefs/scenario-writer.md`,
   situation "revision"): the scenarios exist, and each is brought in
   line with the folded body. The numbers stay `main`'s: a scenario the
   version cannot run becomes an absence scenario with a positive
   control, as an app without the feature gets one (multi-app rule 3).
7. **Readability.** As a revision's: the persona reads only what
   changed against `main`'s text, with the version's glossary. Its brief
   takes no version block: it reads one document and knows nothing of
   versions. A word the version's glossary still gives in `main`'s form
   is corrected there by the rewrite.
8. **Tests.** One test author per app (`briefs/test-author.md`,
   situation "revision") makes the copied suite assert the version's
   scenarios: a page object is changed in the version's folder, and a
   function is renamed when the screen's own words differ. Green once
   per app, run from the version's config
   (`npx playwright test -c lines/<branch>/<app>.config.js --project=<app>`).
   The second green is the version's whole suite on a reset install,
   one app at a time:
   `PKP_E2E_LINE=<branch> npm run test:final -- --feature U<nn>-<branch>`.
   Gate: the green logs, `lint-spec.mjs --tests` zero on the version's
   spec, `npm run lint:suite` clean.
9. **Progress.** The spec to `status: verified`; the row in the version's
   progress file, in PROGRESS's fixed shape.
10. **Commit and push**, then 11. **Report**, as the runbook's. A stable
    version is released code, so anything security-shaped is a released
    finding in the private repo (`../pkp-e2e-sec/security_policy.md`).

A finding the build meets on the version goes into the version's
register. One that `main`'s register does not hold gets a row in
`docs/tracking/incidentals.md` naming the version's entry, so the
housekeeping session drives it on `main` and adds it there when `main`
shows it too.

What a checker sees on another feature's screen goes into that
feature's row of the version's progress file, one line with the kept
script as evidence, for that feature's own build to drive.
`docs/tracking/incidentals.md` stays `main`'s.

## Starting a build-out

A request that names a version and a count starts a **build-out
session**: "start the build-out for 3.5 for 3 specs". The session reads
`RUNBOOK.md`, this file and the version's progress file, then takes the
rows from the top: an `in_progress` row first ("Resuming a feature
mid-flight"), then `pending` ones, until it has built the count. A
request may name the features instead ("build out 3.5: U40, U41").

Features are built one after another, never two at once. Each is
committed and pushed on its own before the next starts, so a session
that ends early (the model discipline's stops, or context running low)
leaves whole features behind and the row of the unfinished one says the
last gate reached. The report names each feature built, its counts, and
how many of the requested count were done.

## After a feature is built

- **A backport that changes what the version's spec or tests state** is
  accommodated in the version's folder by the session that reads the
  stable line (MAINTENANCE "The stable line"), as `main`'s accommodation
  was, carried over by hand.
- **A correction to `main`'s spec that also holds for the version** is
  carried over by the session that makes it. Nothing does this
  automatically; the version's copy stays as accurate as it was built.
- **A change to the process, the template or a lint** is applied to
  every version's files in the same commit.
- **The seeding keys are the same in every copy** (`scenarios.md`). A
  version's copy gains a new key only when one of its tests needs it.
- **A version's suite runs** with
  `PKP_E2E_LINE=<branch> npm run test:<app>`, or one file with its
  config.

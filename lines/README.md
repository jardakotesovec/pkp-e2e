# Stable versions (pilot)

The repo root follows the apps' `main`. Each stable version the campaign
covers has a folder here, named like its branch:

```
lines/<branch>/
  docs/specs/                     the version's specs
  apps/<app>/playwright/tests/    the version's tests
  apps/<app>/playwright/pages/    the version's page objects (app level)
  apps/<app>/php/                 the version's seeding code (app level)
  shared/playwright/pages/        the version's page objects (shared level)
  shared/php/                     the version's seeding code (shared level)
  <app>.config.js                 the Playwright config of the version's suite
```

This is a pilot on `stable-3_5_0`, OJS, on the branch `lines-pilot`. No
rule in `docs/process/` has changed yet.

## What is copied and what exists once

**Anything that describes or drives the product is copied per version.**
Specs, tests, page objects and the seeding code all follow the product's
screens and data, and those differ from version to version.

**Anything that says how the work is done, or only runs the machine,
exists once** and serves every version: the process docs, the briefs and
the spec template; `bin/`, the lints and CI; ports, databases, servers,
mail, sign-in state and the runner config; issue reports, the tracking
files and everything security-shaped.

A copy is a whole file, never a list of differences against `main`. A
reader of a version's spec or test needs no second file beside it.

## Cutting a version

When PKP cuts a stable branch from `main`, the folders above are copied
from the repo root as they stand that day. The copy is exact at no cost.

`stable-3_5_0` was cut before the campaign began, so its folder is built
feature by feature instead, through the same loop as `main`'s
(`docs/process/RUNBOOK.md`), run against the 3.5 install: the spec is
written for what 3.5 does, every line is driven on 3.5, and the tests
are derived from that spec. A feature starts from a copy of `main`'s
spec, tests and page objects. A feature the folder does not hold has not
been built for the version: nothing is assumed about it.

## After the cut

- A version's copy changes when a backport changes the product there.
  The change `main`'s spec and tests took for the same fix is carried
  over by hand.
- A correction to `main`'s spec that also holds for a version is carried
  over when someone meets it. Nothing does this automatically.
- A change to the process or the spec template is applied to every
  version in the same commit.
- The seeding code keeps the same keys in every copy
  (`docs/process/scenarios.md`). A version's copy gains a new key only
  when a test of that version needs it.

## Running a version's suite

```
npx playwright test -c lines/stable-3_5_0/ojs.config.js --project=ojs
```

The config selects the version's checkout, ports and database by itself.
`PKP_E2E_LINE=<branch> node bin/mount.js <app>` mounts the version's own
seeding code where the folder holds a copy, and `main`'s for an app the
folder does not cover yet.

## State of the pilot

- "Review stage & rounds" (U26), OJS: tests and page objects are in
  place and pass (13 of 13). They were adapted from a walk of the
  scenarios, not yet through the full loop.
- The seeding code is copied for OJS, shared and app level.
- `docs/specs/lines/stable-3_5_0/` holds two lists of differences (U26,
  U37) from the pilot's first shape. They are notes for building those
  two specs and go once the specs exist.
- `shared/playwright/support/` and the fixtures are still linked to
  `main`'s whole. The helpers in there that drive screens (dropdowns,
  rich text, tabs, menus) belong to the copied side.

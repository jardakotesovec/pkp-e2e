# Stable versions

One folder per stable version the campaign covers, named like its
branch. A folder holds whole copies of everything that describes or
drives the product on that version: specs, tests, page objects, the test
library and the seeding code. How the folders are made, built out and
kept is `docs/process/VERSIONS.md`; what is built for a version is its
progress file, `docs/tracking/PROGRESS-<branch>.md`.

The links in a folder (`bin`, `shared/playwright/probe` and the
top-level files of `shared/playwright/`) point at what exists once at
the repo root.

## State of the pilot (`stable-3_5_0`, branch `lines-pilot`)

- The folder's base is in place for OJS, OMP and OPS: the glossary, the
  test library, the seeding code and a config per app.
- "Review stage & rounds" (U26) is built for all three apps through the
  build-out, the first feature and its shakedown: the spec, 13 OJS, 14
  OMP and 1 OPS tests, and the claim check's kept scripts.
- `docs/specs/lines/stable-3_5_0/` holds one list of differences (U37)
  from the pilot's first shape: notes for building that spec, deleted
  once it exists.
- The 3.5 suite does not run in CI yet.

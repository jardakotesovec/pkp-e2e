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

## What is here

- `stable-3_5_0/`: OJS, OMP and OPS on 3.5. Built feature by feature;
  `docs/tracking/PROGRESS-stable-3_5_0.md` says which features it holds.
- `ore/`: OJS on pkp/ojs `ore`, every feature, copied from the pkp-e2e
  branch that held its suite until 2026-11-12 (its last commit there:
  `918eeb34`). MAINTENANCE "The ore version".

`docs/specs/lines/stable-3_5_0/` holds one list of differences (U37)
from the pilot's first shape: notes for building that feature's 3.5
spec, deleted once it exists.

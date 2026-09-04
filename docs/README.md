# The documentation, and where to start

Everything the e2e campaign knows lives under `docs/`. This page says what
each file is for and who should read it.

## If you want to understand a feature

Read its spec in `docs/specs/`. A spec describes one feature across OJS, OMP
and OPS in product language: who can do what, the rules, the side effects,
the scenarios a tester can act out, and a register of everything that looks
broken or needs a product decision. The one-paragraph legend for the markers
and badges is in `docs/specs/GLOSSARY.md` under "Reading a spec". The rest of
the glossary defines the product vocabulary the specs use and maps OJS terms
to their OMP and OPS names.

## If you want to know what is built and what is next

- `docs/tracking/PROGRESS.md`: one row per feature, its status, its test
  counts and a short note. The banner at the top says which mode the project
  is in.
- `docs/tracking/FEATURE-MAP.md`: the full list of 70 features and which
  screens and behaviors each one covers.
- `docs/tracking/ci-triage.md`: known CI failures and their causes. Check it
  before diagnosing a red build as new. Tracking files hold only what is
  open; resolved items are deleted and live on in git history. The two
  exceptions are the parity ledger and app-changes, which record changes
  still in effect.
- `docs/tracking/upstream-sync.md`: the last app commits the suite was
  reviewed against.
- `docs/tracking/companion-branches.md`: pkp-e2e branches prepared for
  developers' open app PRs, waiting to be merged after theirs.
- `docs/tracking/app-changes.md`: app defects the tests had to work around,
  and any app code the campaign changed.
- `docs/tracking/parity-ledger.md`: evidence that the test-data builders
  produce the same state a real user would.
- `docs/tracking/cost-ledger.md`: what each feature session cost in
  weighted tokens, by role, with the U02 baseline and the command that
  fills a row.
- `docs/tracking/incidentals.md`: things a session saw in passing on
  another feature's screens, one line each, kept until that feature's spec
  absorbs them.
- `docs/tracking/UNASSIGNED.md` and `docs/tracking/atlas/`: the mechanical
  inventory of every screen and action in the apps, and the leftovers no
  spec claims yet.
- `docs/reports/`: temporary write-ups handed to the team, deleted once the
  problem they report is addressed.

## If you are building specs and tests

Read in this order:

1. `docs/process/RUNBOOK.md`: what the project is trying to achieve, how a
   feature moves from nothing to a verified spec with green tests, and where
   each kind of finding goes. `docs/process/briefs/` holds the brief
   template for each subagent role; the orchestrator fills the slots.
2. `docs/process/TEMPLATE.md`: how a spec is written, section by section.
3. `docs/process/PRINCIPLES.md`: the rules every test follows.
4. `docs/process/harness.md`: how the Playwright harness is laid out and run.
   Then `patterns.md` (conventions and pitfalls), `scenarios.md` (seeding
   test data and asserting on email) and `users.md` (the seeded accounts).

- `docs/process/seed-facts.md`: what a fresh test install contains and how
  it is configured; check a probe premise against it before writing the
  question. Its generated part is kept true by `npm run seed-facts -- --check`.

`docs/process/MAINTENANCE.md` is for the resident QA agent: keeping the
suite in step with the moving apps, helping a developer whose PR fails the
suite, answering coverage requests, and talking to the team on Mattermost.

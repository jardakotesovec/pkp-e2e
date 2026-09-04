# Kept claim checks

One directory per feature, one per claim-check chunk inside it
(`U05/K1/`, …). These are the scripts the claim checkers wrote while
driving the spec's sentences against the running apps (RUNBOOK step 7
"Checks are kept"). They are not tests: no assertions, no runner, no
fixtures. Each chunk has one entry script that seeds its own scratch
context, signs in from the roster and records every screen with the probe
kit's `screen()`, so a maintenance session can run the chunk again on a
later build and judge the snapshots against the spec lines the chunk
owns, instead of re-authoring the drive.

Run one the way any probe script runs; the outputs go under `.reports/`:

    PROBE_FEATURE=U05 PROBE_AGENT=sync node bin/probe.js all shared/playwright/checks/U05/K1/k1.js

Scripts import the kit as `require('../../../probe')`. They are run on
demand, never in CI, and a script that no longer runs on the current build
is itself a signal that the screen changed.

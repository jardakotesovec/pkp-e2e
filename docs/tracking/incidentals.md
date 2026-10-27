# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U69 Monograph landing page (Rule 20a, the book page's "Downloads" chart) | A published book's page with the default theme's usage chart on, OMP `main` (read in the lib/pkp code by the U13 claim check I27B, 2026-10-27, which drove the same chart script on OJS and OPS `main`; not driven on OMP) | Rule 20a's "the last twelve months" reads as a rolling year; on OJS and OPS `main` the chart runs from January of the first publication's year to the current month (10 bars in October), and "All time" starts at January of that year even when the first downloads came later. The chart also keeps its first opening's figures for a day (a per-item cache) and the page carries two "Downloads" headings with no text alternative for the chart (U13 I27B-2, I27B-4). Drive the book page on OMP `main` and 3.5 | 2026-10-27 | housekeeping, U13 claim check I27B (`.reports/U13/cc-I27B.md`, `shared/playwright/checks/U13/I27B/i27b.js`) |

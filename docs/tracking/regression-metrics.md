# Regression metrics — the weekly count for the team

One row per week (Monday to Sunday, by commit date), newest first, written by
`npm run regressions -- --week <a day of the week> --write` (MAINTENANCE
"Weekly regression count"). It counts the write-ups in `docs/reports/`: the
`.md` files, not their `.patch` and script attachments or `img/`. A report
counts as a regression by its REPORT.md "Kind" (or, in the older reports,
the header paragraph opening "Regression."). Unlike the other tracking
files, rows are kept: the table is the history of the count, and a closed
regression's deleting commit says where it went (what fixed it, or the
ruling that retired it), so a report deleted from the folder can still be
traced. "All reports" is open / closed / new over every kind (defects,
intention gaps, PR-review verdicts, research notes).

| Week | Regressions open at the week's end | Regressions closed | Regressions new | All reports (open / closed / new) | Closed regressions (deleting commit, date) |
|------|------------------------------------|--------------------|-----------------|-----------------------------------|---------------------------------------------|
| 2026-10-19 – 2026-10-25 | 20 | 1 | 6 | 34 / 5 / 9 | `2026-10-19-pkp-lib-10268-stable-3_5_0` (bba31384, 2026-10-22) |
| 2026-10-12 – 2026-10-18 | 15 | 1 | 3 | 30 / 2 / 9 | `2026-09-22-ojs-5813` (84d3fc21, 2026-10-12) |
| 2026-10-05 – 2026-10-11 | 13 | 6 | 5 | 23 / 18 / 20 | `2026-10-01-pkp-lib-12915` (bb517dca, 2026-10-05), `2026-10-02-pkp-lib-12915` (e7c4f075, 2026-10-05), `2026-09-25-ops-oai-empty-abstract` (486c1d74, 2026-10-05), `2026-10-06-ui-library-982` (73928761, 2026-10-07), `2026-10-06-pkp-lib-13318` (91dccc51, 2026-10-07), `2026-10-01-pkp-lib-12994` (d6048c7a, 2026-10-07) |
| 2026-09-28 – 2026-10-04 | 13 | 2 | 3 | 21 / 6 / 8 | `2026-09-25-ojs-5827-stable-3_5_0` (b5029000, 2026-09-30), `2026-09-29-pkp-lib-13390` (df0f1cc1, 2026-10-01) |
| 2026-09-21 – 2026-09-27 | 12 | 3 | 13 | 19 / 5 / 18 | `2026-09-23-ui-library-853` (847407a0, 2026-09-24), `2026-09-23-ui-library-853-publish` (c270f304, 2026-09-24), `2026-09-24-pkp-lib-13263` (c020b56f, 2026-09-24) |
| 2026-09-14 – 2026-09-20 | 1 | 0 | 0 | 6 / 1 / 6 | none |
| 2026-09-07 – 2026-09-13 | 0 | 0 | 0 | 1 / 1 / 1 | none |
| 2026-08-31 – 2026-09-06 | 0 | 1 | 1 | 1 / 3 / 4 | `2026-09-01-author-getaffiliations-null-regression` (3e6a9817, 2026-09-03) |

# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The housekeeping session folds the rows and
deletes them under MAINTENANCE "The housekeeping session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn>, sync or issues · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-10-26 · sync · regression reader rr1026a · the new PDF.js viewer CSP refuses the kit motion <style> in every viewer frame (one console error per load, motion not disabled there); a crafted PDF (document JavaScript) had no fixture path that avoids the read-only mount, so it was opened via PDFViewerApplication.open({data}) in the frame; a before control needed a hand-written route serving the old plugin tree by git show · a kit note on CSP-carrying frames (filter or skip the motion style there), and a probe helper that serves a plugin path from another commit (before controls on vendored assets without touching checkouts)
2026-10-26 · sync · omp-38bf23300c reporter omprep · on stable-3_5_0 the OMP seed's `publicationFormats` format approval answers 500 ("SmartyException: Unknown resource type 'plugins-N-plugins-pubIds-urn-pubIds-urn'"), so the walk seeds `approved: false` and approves on screen (two extra runs to find it); and the brief's before-side restore `git checkout HEAD -- <plugin>` leaves the old commit's extra files staged (149 under pdf.js/), needing `git reset HEAD -- <path>` plus `git clean -fdx -- <path>` · harness.md "The stable lines" naming the 3.5 format-approval refusal beside the `published` one (or the seed registering the pubIds plugins' template resources), and the before-side recipe using `git restore --source=<sha> --staged --worktree` then `git restore --source=HEAD --staged --worktree` + `git clean -fdx` on the path

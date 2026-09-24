// U09 claim check, chunk K5b: the re-drive of K5's pictures block (K5-6) once
// the test installs store pictures (relative public_files_dir, harness round 2).
// Spec: docs/specs/U09-custom-pages-and-blocks.md lines 268–270, 273–296
// (Rule 29's picture outcomes, 29a, 29b), the picture lines of Side effects
// (311–315), 349–351 (Settings 7), register A5 (492–500); footnotes i, td29,
// td30, td31, f-a5. All three apps (the static page window OJS, OMP).
//
// It runs K5's kept script (../K5/k5.js) with its own scratch seeds (tag prefix
// u09k5b, state file k5-state-<app>.json in this agent's output folder) and the
// phases upload, allowance, cascade:
//   upload     the image window in a custom block (accepted and refused files,
//              the stored names and addresses, a second file of the same name,
//              an upload left by "Cancel", paste, drop, a refused paste, the files
//              over the upload and request limits), the "Custom Page" item and
//              static page windows, the Vue "Page Footer" saved, the site's box (admin)
//   allowance  m2: three 1.9 MB pictures (the 5000 KB allowance), one taken out of
//              its text, journal B (a custom page saved with a picture, then
//              deleted), the refusal numbers each time
//   cascade    journal D with a picture deleted on Hosted Journals: the file stays
// Run: PROBE_FEATURE=U09 PROBE_AGENT=ccK5b node bin/probe.js <app|all> shared/playwright/checks/U09/K5b/k5b.js
//      PHASES=… and STEPS=… narrow it as in k5.js; RESEED=1 makes new seeds.
process.env.K5_TAG = process.env.K5_TAG || 'u09k5b';
process.env.PHASES = process.env.PHASES || 'upload,allowance,cascade';
require('../K5/k5.js');

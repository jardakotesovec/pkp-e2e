// U07 drift sweep 2026-10-26, chunk SW2: entry script (spec docs/specs/U07-journal-identity-and-about-pages.md,
// lines 293–633: Rules 12–22, Side effects, Settings that modify behavior, Cross-feature interactions;
// register A6, A10, A11, A14, OMP2, OPS1, OPS4). On demand only, never in CI.
//
// One part per process, chosen by PART; every part seeds its own scratch contexts (tag prefix hksw2*)
// and records through the kit, so two runs keep apart under PROBE_RUN (r1, r2). Per app, one app per call:
//
//   PART=pages     PROBE_RUN=r1 PROBE_FEATURE=U07 PROBE_AGENT=ccSW2 bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U07/SW2/sw2.js
//   PART=masthead  (same, shared lock)   the masthead and history lists, the masthead settings (masthead.js)
//   PART=mail      (same, shared lock)   the Side effects' senders and silence (mail.js)
//   PART=site      (EXCLUSIVE lock)      the site's own privacy statement, set and put back (site.js)
//   PART=a14       (EXCLUSIVE lock)      the software page in six languages, installed and removed (a14.js)
//
// Then omp and ops, then PROBE_RUN=r2. PHASES=a,b narrows pages and masthead; RESEED=1 seeds again
// (pages and masthead keep their seed in <part>-state-<run>-<app>.json via outFile).
// Outputs: .reports/U07/ccSW2/ (pg-*, ms-*, ml-*, st-*, a14-* files).
const PARTS = {pages: './pages.js', masthead: './masthead.js', mail: './mail.js', site: './site.js', a14: './a14.js'};
const part = process.env.PART;
if (!PARTS[part]) {
    console.error(`sw2.js: PART must be one of ${Object.keys(PARTS).join(', ')}`);
    process.exit(2);
}
require(PARTS[part]);

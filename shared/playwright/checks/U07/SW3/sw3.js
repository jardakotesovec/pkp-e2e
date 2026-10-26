// U07 drift sweep 2026-10-26, chunk SW3: entry script (spec docs/specs/U07-journal-identity-and-about-pages.md,
// lines 634–1350: the canonical scenarios 1–12, Coverage and the Findings register). On demand only, never in
// CI. Records, never asserts: the report reads the facts files and snapshots.
//
// One part per process, chosen by PART; every part that mutates seeds its own scratch contexts (tag prefix
// hksw3*) and writes everything through the kit, so two runs keep apart under PROBE_RUN (r1, r2). One app per
// call, under the session's app lock:
//
//   PART=read  PROBE_RUN=r1 PROBE_FEATURE=U07 PROBE_AGENT=ccSW3 bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U07/SW3/sw3.js
//   PART=read   (shared lock)    read.js:  scenarios 1, 2, 12 on publicknowledge (roster accounts, read only);
//                                          register A6, A7, A9, OMP1, OMP2, OPS4, A12 reads
//   PART=tabs   (shared lock)    tabs.js:  scenarios 3, 4, 5, 6, 10 on scratch contexts; register A3, A8, A9 (new
//                                          context), A11 (Hosted Journals "Edit"), OPS2, OPS3
//   PART=team   (shared lock)    team.js:  scenarios 7, 8, 9, 11 on scratch contexts; register A1, A2, A4, A5,
//                                          A10, A13
//   PART=a14    (EXCLUSIVE lock) a14.js:   register A14, six languages installed and removed again (a copy of
//                                          SW2/a14.js, itself from C07)
//
// Then omp and ops, then PROBE_RUN=r2. PHASES=a,b narrows a part (each part's header lists its phases).
// Outputs: .reports/U07/ccSW3/ (rd-*, tb-*, tm-*, a14-* files; facts in <prefix>-facts-<run>-<app>.json).
// Other files: common.js (helpers, required by the parts).
const PARTS = {read: './read.js', tabs: './tabs.js', team: './team.js', a14: './a14.js'};
const part = process.env.PART;
if (!PARTS[part]) {
    console.error(`sw3.js: PART must be one of ${Object.keys(PARTS).join(', ')}`);
    process.exit(2);
}
require(PARTS[part]);

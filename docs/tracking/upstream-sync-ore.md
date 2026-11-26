# Upstream sync, the ore version — last-read `ore` commits

The last commit of each repo's `ore` branch the daily session has read
and carried into the folder `lines/ore/` (`docs/process/MAINTENANCE.md`
"The ore version"). `ore` is the branch the ORE project runs OJS from in
production until the 3.6 stable release; OJS only, temporary. Its suite
is the folder `lines/ore/` on pkp-e2e `main` since 2026-11-12; until
then it was the pkp-e2e branch `ore`, cut from `main` at `2853af70` (the
daily sync of 2026-10-14, which reviewed the three branch-point tips
below) plus the U03 S4 skip of `68975b4f`. `main`'s baselines are in
`upstream-sync.md`.

## Baselines

| Repo | Last-read commit | Date | Read by |
|------|------------------|------|---------|
| ojs | `3ef13cb7fb` | 2026-11-24 | claude (daily upstream session, VM s1) |
| pkp-lib | `663955ef34` (the branch tip, the merge of pkp/pkp-lib#13865; ojs at its head `eb496f125a`); ui-library `1358f5e2` (the branch tip, the merge of pkp/ui-library#1062; ojs at its head `f57dfe21`); ojs `plugins/generic/jatsTemplate` `d6ff313256` | 2026-11-23 | claude (merge of the PR review of the `ore` ports of pkp/pkp-lib#11972, VM s1: `=main`) |

The folder was copied from the pkp-e2e `ore` branch at `918eeb34` (2026-11-12, U14 A6 retired, U30 and U26 follow pkp/ui-library#981), its specs brought to the present template by script: the Planned lists dropped, retired entries one line. CI from the folder at the same OJS commit as the branch's last run, the same counts (run 43259507107 against 43211539187: 543 + 38 + 33 passed, 1 skipped).

## Open

- Phase 1 of the set-up (plan of 2026-10-16), the rest of it:
  `bin/line-range.js --branch ore`, `bin/report-models.mjs` reading
  `docs/reports/ore/`, REPORT.md "Affects" with an `ore` sub-item and
  the ten open regressions marked for it. The ore worktrees beside
  the slot clones went with the switch of 2026-11-12: each slot has
  `checkouts/ore/ojs` as a line (harness.md "The stable lines").
- pkp/pkp-lib#13562 (I9707 maps `supportedDefaultSubmissionLocale`
  by the first context only; the 3.5 repair migration) merged on
  `main` (pkp-lib `91bc3cbb59`, ojs `86b993554f`) and `stable-3_5_0`
  on 2026-11-17 with no `ore` PR. `ore` has the same I9707 block: the
  `main` diffs (pkp-lib#13742, ojs#6041 without the pointer) applied
  cleanly there on 2026-11-06 and read fixed with
  `checks/sync/pkp-lib-13562/walk.js`. When an `ore` port lands, read
  it as `=main`; until then `ore` carries the bug (asked of the
  developer in the thread 2026-11-17).

## Read log

- **2026-11-26 (daily session, VM s1) — ojs `ore` `3ef13cb7fb`, pkp-lib `ore` `663955ef34`, ui-library `ore` `1358f5e2`: no commits since the baselines (`fetch-apps --update` with `PKP_E2E_LINE=ore`, `origin/ore` fetched in the submodules). Baselines stay.**
  - Runs (step 0): the pkp/ojs `ore` hook [45323352439](https://github.com/pkp/ojs/actions/runs/45323352439) green at `3ef13cb7fb`; the nightly `ojs-ore` job of [45748859940](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45748859940) 3/3 green at the same tip (pkp-e2e `aa70550f`; `main` has since changed only check scripts under `checks/sync/pkp-lib-13860/`), so no dispatch.
  - Carried from `main`: no regression confirmed today; `main`'s one commit (pkp/ojs#6107, DataCite) has no `ore` port. Open regression rows: no code moved; none re-run.
  - Security: none routed.
- **2026-11-25 (daily session, VM s1) — ojs `ore` `3ef13cb7fb`, pkp-lib `ore` `663955ef34`, ui-library `ore` `1358f5e2`: no commits since the baselines (`git ls-remote` against pkp). Baselines stay.**
  - Runs: pkp/ojs `ore` hook [45323352439](https://github.com/pkp/ojs/actions/runs/45323352439) at `3ef13cb7fb` green; nightly `ojs-ore` in [45540076047](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45540076047) (pkp-e2e `0e953f46`) 3/3 green. pkp-e2e `main` has since changed only check scripts and docs (no `lines/ore/`, harness or workflow file), so no dispatch.
  - Carried findings: no regression confirmed on `main` today. Security: none routed.

- **2026-11-24 — PR review of the `ore` PRs of pkp/pkp-lib#13530 (with round 4 of the `main` PRs, `upstream-sync.md`; asked in the thread, VM s2): pkp/pkp-lib#13824 (taslangraham `i13530-ore`, `dcf20f2548` on the tip `663955ef34`), pkp/ui-library#1059 (`cd2f545cb7` on the tip `1358f5e2e6`), pkp/ojs#6091 (`0d3d893227` + the pointer bump `b5e5250efd` on the tip `3ef13cb7fb`, pointing at both heads). Companion `i13530-ore`. Not merged; baselines not advanced.**
  - `~main`: the OJS and ui-library diffs are line for line those of pkp/ojs#6013 and pkp/ui-library#1038; pkp-lib is #13672's code without its `I11332_AddPeerReviewDois` edit, plus the migration `PKP\migration\upgrade\v3_6_0\I13530_RemoveDoiIdFromReviewRoundAuthorResponses`, left out of `upgrade.xml` for ORE to run by hand (the issue says so).
  - PKP's 3.5 dataset upgrades to 3.6.0.0 at the heads and keeps the column with its index and foreign key (ore's `I11332` still adds it). With a response pointing at a DOI, `php lib/pkp/tools/migration.php "…I13530_…" up` drops the column, index and foreign key; a second `up` is a no-op; `down` restores all three; `up` again drops them (`.reports/pr-13530/r4/ore-manual-migration.log`). The DOI row the response pointed at stays in `dois` with no item, as on `main` (no screen lists it).
  - Item 2 of the review shows on `ore` too (the Setup save refused while the stored setting holds `authorResponse`); the fix tried on `ore` gives the same as on `main`.
  - CI [45442321063](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45442321063) from `main`, `--line ore` at `taslangraham/ojs@b5e5250efd` (`--pkp-lib-ref pull/13824/head --ui-library-ref pull/1059/head`): 3/3 green.
- **2026-11-24 (daily session, VM s1) — ojs `ore` `372fc18701..3ef13cb7fb` (1); pkp-lib `ore` `663955ef34`, ui-library `ore` `1358f5e2`: no commits. Read in full; ojs baseline advanced.**
  - ojs `3ef13cb7fb` `=main` `6ce58ddbb2` (pkp/pkp-lib#13744, pkp/ojs#6051) → read by the PR review and walked at the merged `ore` tip by its merge step (`upstream-sync.md`, 2026-11-24), which carried `lines/ore/` U45 the same day.
  - Carried from `main`: the accommodation of pkp/pkp-lib#11972 (`=main` on `ore` since 2026-11-23): `lines/ore/` U41 (Fields rows, A18 retired, the S1 bullets) and U63 (Rules 10a, 12, 12b, 20c, note z, the S4 bullets), with the OJS tests and page objects; left out as `main`-only: U41 Rule 4a and A29–A33, U63 Rule 20b, the Planned lists. `lines/ore/` U04 the same day: the ORCID iD field for a Person only, Rules 8b–8d, 11 and 13 for persons only, the S4, S5, S7 and S8 bullets; `main`'s A25–A27 are the copy's A16–A18 (the copy numbers its own entries); its OJS suite green on the ore line (9 + 1 + 1 passed).
  - Runs: pkp/ojs `ore` hook [45323352439](https://github.com/pkp/ojs/actions/runs/45323352439) at `3ef13cb7fb` green; the gate [45404738768](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45404738768) (`--line ore`, pkp-e2e `99c9fe77`) 3/3 green; after the U04 port, [45415722631](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45415722631) (pkp-e2e `b19f4f26`) 3/3 green.
  - Carried findings: no regression confirmed on `main` today. Security: none routed.

- **2026-11-23 — merge of the PR review of the `ore` ports of pkp/pkp-lib#11972 (pinged in the thread, VM s1): pkp-lib#13865 → `663955ef34`, ui-library#1062 → `1358f5e2`, ojs#6112 → `372fc18701`, each merging the reviewed head. No other commit on the three tips; baselines advanced. `=main` of pkp-lib `19ca682321` + `b18c557ff2` and ui-library `0549a357`: the `lines/ore/` folder takes the same spec edits as `main`'s fold (`upstream-sync.md`).**
- **2026-11-23 — PR review of the `ore` ports of pkp/pkp-lib#11972 (asked in the thread, VM s1): pkp/pkp-lib#13865 (bozana `ore`, `50261bb5ea` + `eb496f125a` on the tip `4b60635195`), pkp/ui-library#1062 (`f57dfe2117` on the tip `b48195c3`), pkp/ojs#6112 (`ba2cddfed2` on the tip `df1583e5f3`: pointers to the two heads and jatsTemplate `d6ff313256`). `git range-diff` against the reviewed `main` commits: pkp-lib `19ca682321` and `b18c557ff2` both `=`, ui-library `0549a357` `=`; the jatsTemplate bump `2e50ada..d6ff313` carries pkp/jatsTemplate#128 (reviewed) and the tree-equal merge of #127; the pkp-lib range between the ojs pointer `b1a1545571` and the tip is the tree-equal merge `4b60635195`. Nothing outstanding. No companion (no `lines/ore/` test changes; no red). Not merged; baselines not advanced.**
  - Driven on the ore fleet at the PR heads (`checks/sync/pkp-lib-13624/` `walk.js`, `same-type.js`, `jats.js`, `import.js`, `PKP_E2E_LINE=ore PROBE_RUN=ore`): every result as on `main` round 3 (markers, email rules, ORCID person-only, the ORCID-off type switch removes the iD and tokens, same-type edits save, JATS without `<email>`, import), no server error logged.
  - CI [45167753203](https://github.com/jardakotesovec/pkp-e2e/actions/runs/45167753203) (`--line ore`, ojs from bozana/ojs at `ba2cddfed2`): 3/3 green.
- **2026-11-20 (daily session, VM s1) — ojs `ore` `df1583e5f3`, pkp-lib `ore` `4b60635195`, ui-library `ore` `b48195c3`: no commits since the 2026-11-19 baselines (`git ls-remote` against pkp). Baselines stay.**
  - Runs: pkp/ojs `ore` hook [44602743271](https://github.com/pkp/ojs/actions/runs/44602743271) at `df1583e5f3` green; the nightly `ojs-ore` job of [44667578790](https://github.com/jardakotesovec/pkp-e2e/actions/runs/44667578790) 3/3 green at the same OJS tip and pkp-e2e `394e759a` (no `lines/ore/` change since), so no dispatch.
  - Carried findings: no regression confirmed on `main` today. U45 A18 retires on `main` today (pkp/pkp-lib#13591 at both tips); `ore` has no port of it (no DataCite port, crossref pointer unmoved), so `lines/ore/` keeps A18. Security: none routed.

- **2026-11-19 — Merge of the PR review of the `ore` port of pkp/pkp-lib#13789 (asked in the thread, VM s2: "merged"): pkp-lib#13841 as `4b60635195`, ojs#6101 as `df1583e5f3` (googleScholar `f92570ef41`), each the merge of the reviewed head on the old `ore` tip, trees equal. Baselines advanced (ojs, pkp-lib): no other `ore` commit since.**
  - The review: the same code as `main`'s merged review (`upstream-sync.md` 2026-11-19), no finding; the unedited `ore` suite red only on U20 S1 at the heads, intended.
  - At the merged `ore` tip, an `ore` dataset fleet from `main`'s dataset: `checks/sync/pkp-lib-13789/walk.js` gave the heads' entries exactly (14 fresh, 13 after `MODE=change`), every entry 200. Companion `13789-ore` (`lines/ore/` U20 spec and OJS test as `main`'s merged companion) fast-forwarded into pkp-e2e `main` after [44602872541](https://github.com/jardakotesovec/pkp-e2e/actions/runs/44602872541) at the merged `ore` tip, 3/3 green; `lines/ore/` U20 OJS2 retired with it.

- **2026-11-19 (daily session, VM s2) — ojs `ore` `37103b950c`, pkp-lib `ore` `5795cb49a3`, ui-library `ore` `b48195c3`: no commits since the 2026-11-18 baselines (`git ls-remote` against pkp). Baselines stay.**
  - Runs: pkp/ojs `ore` hook [44145502210](https://github.com/pkp/ojs/actions/runs/44145502210) at `37103b950c` green; the nightly `ojs-ore` job of [44451259836](https://github.com/jardakotesovec/pkp-e2e/actions/runs/44451259836) 3/3 green at the same OJS tip and pkp-e2e `821c48b5` (no `lines/ore/` change since), so no dispatch.
  - Carried findings: no regression confirmed on `main` today; pkp/pkp-lib#13593 and #13562 still have no `ore` port. Security: none routed.

- **2026-11-18 (daily session, VM s1) — ojs `ore` `4359df21be..37103b950c` (1, pointer bump); pkp-lib `ore` `9353b8232f..5795cb49a3` (1: `=main f74e5044c4`, uploader names include disabled users, same `git patch-id`); ui-library `ore` `b48195c3`: no commits. Read in full; baselines advanced.**
  - Runs: pkp/ojs `ore` hook [44145502210](https://github.com/pkp/ojs/actions/runs/44145502210) at `37103b950c` green; the nightly `ojs-ore` job of [44230290411](https://github.com/jardakotesovec/pkp-e2e/actions/runs/44230290411) 3/3 green at the same OJS tip and pkp-e2e `239e013ee5` (no `lines/ore/` change since), so no dispatch.
  - `5795cb49a3` → `main`'s read of today stands; `main` accommodated nothing for it, so nothing to carry.
  - Carried findings: no regression confirmed on `main` today. pkp/pkp-lib#13593 (merged on `main` today) has no `ore` port yet, asked in the thread.
  - Security: none routed.

- **2026-11-16 (daily session, VM s0) — ojs `ore` `27f8c99480..4359df21be` (4: `8075e3711c` pkp/pkp-lib#13637 `=main c51c5caf1d`, `85802dee53` pointer bump, `9c8bade64e` and `4359df21be` pointer bumps for pkp/pkp-lib#13653); pkp-lib `ore` `1a48c2f5b9..9353b8232f` (`f2512b8e55` `=main df42984b46`, #13637; `9353b8232f` `=main 3ed5d1c3b3`, #13653, pkp/pkp-lib#13665); ui-library `ore` `3f904483..b48195c3` (`=main 836c01b5`, pkp/ui-library#1037). All `=main` (`git patch-id`). Read in full; baselines advanced.**
  - Runs read first: pkp/ojs hook at `4359df21be` [43568831789](https://github.com/pkp/ojs/actions/runs/43568831789) green; the nightly `ojs-ore` job of [43798606580](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43798606580) 3/3 green.
  - #13637 → `main`'s read of 2026-10-28 stands: the open regression (version-log, U49 A18 on `main`) is on `ore` now: `checks/sync/pkp-lib-13637/version-log.js` on a scratch journal of the ore campaign fleet, two runs, `logs-upload` (the ci-triage row and the report say "ore too"). Carried: `main`'s U49 A18 into `lines/ore/` as the copy's own A12, and U46's one line (7a78687c); 69f684c7's U46 fold left out (OPS Moderator and 3.5-only lines).
  - #13653 → today's `main` read stands. Carried into `lines/ore/` (U27 copy): OMP4 retired, Rules 14a–14d, Side effects, A29, A40/OMP5 lines, A41 retired, A42, the copy's own ❓ A49 and A50 (`main`'s A52, A53), notes; scenario 9's unanswered-request bullet with its OJS test (helpers `datedLine`, `openReviewDetailsFromMenu` brought over; S9 green on the ore line). Left out: A51 (not #13653), the Coverage and Planned edits, scenario 21's press bullet (OJS only).
  - Gate: pkp-e2e `main` `50d7c134` with OJS `ore` `4359df21be`, [43867768928](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43867768928) 3/3 green; the `main` push run [43867750483](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43867750483) 9/9 green.
- **2026-11-13 (merge step asked in the thread, VM s1) — pkp/pkp-lib#13803's `ore` port: pkp-lib `ore` `356d223ea0..1a48c2f5b9` (2: `71039b4cf5`, the branch commit of pkp/pkp-lib#13602 read this morning as its PR head `356d223ea0`, the same tree; `1a48c2f5b9`, pkp/pkp-lib#13809, ewhanson); ojs `ore` `9dffdeb147..27f8c99480` (1: pkp/ojs#6081, the pointer bump to `9ef8d877b6`, the PR head, the same tree as `1a48c2f5b9`); ui-library `3f904483` unchanged. Not PR-reviewed before the merge; it is `main`'s patch. Read in full; baselines advanced.**
  - pkp-lib `1a48c2f5b9` (`=main e9d749cb30`, pkp/pkp-lib#13804; same patch-id): `returnToDone` guarded by `DecisionWritePolicy` for `RETURN_TO_DONE` in place of `DecisionAllowedPolicy`. `main` filed the fault as U24 A15 and retired it the same day (`10b1c51b`); the ore copy of U24 never carried A15 (filed after the branch point), so nothing retires there: note m gains the `ore` fix sentence.
  - Carried: `main`'s `3340e905` (U24 S8 gains the assigned Section Editor's round trip; `WorkflowPage` `returnToWorkflow()`/`returnToDone()` return the POST) by `git apply --3way --directory=lines/ore`; `WorkflowPage.js` clean; conflicts resolved to ore's suite header (no A15 there), ore's empty Left-out Planned list (a version spec carries none), `main`'s S8 Given, and note s ore's text plus `main`'s 2026-11-13 seed sentence only. Lint (`lint:suite`, `lint-spec` and `--tests` on U24) clean.
  - Local, ore fleet at OJS `27f8c99480` (reset first): U24 13/13 green; control, S8 with `lib/pkp` at `71039b4cf5`: red at the Section Editor's "Return to Done" POST, 401 (pointer restored after).
  - Gate: pkp-e2e `main` `99055a1c` pushed, `node bin/ci.js dispatch --line ore --apps ojs --ojs-ref ore` run [43511544308](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43511544308) at OJS `ore` `27f8c99480`: 3/3 green.
  - Regression none, security none.

- **2026-11-13 (daily session, VM s0) — ojs `ore` `1fedf73275..9dffdeb147` (1, pointer bump); pkp-lib `ore` `9ca248495e..356d223ea0` (1); ui-library `ore` `3f904483`: no commits. Read in full; baselines advanced.**
  - pkp-lib `356d223ea0` (`=main 3e078689a5`, pkp/pkp-lib#13602 "Update API callers", the cherry-pick of pkp/pkp-lib#13790; `git range-diff`: the same patch, the cherry-pick line only) → `main`'s merge read of 2026-11-12 stands (no regression, security none). Carried: `main`'s U22 fn h and U26 fn j sentences (`3d34611f`) into `lines/ore/` by hand, naming the `ore` commits (`fce22a85`; U26's copy did not take the patch).
  - Runs: pkp/ojs `ore` hook [43357007125](https://github.com/pkp/ojs/actions/runs/43357007125) at `9dffdeb147` green; nightly `ojs-ore` of [43358808069](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43358808069) 3/3 green. Since then `lines/ore/` changed by spec text only (a footnote each, `346365e1`, `fce22a85`), so no dispatch.
  - Carried findings: pkp/pkp-lib#13788 (today's report) is not on `ore` (no tool). Open regression rows: no code moved.

- **2026-11-12 (daily session, VM s0, the ore worktree) — ojs `ore` `81b4b1f5fc..1fedf73275` (1); pkp-lib `ore` `5c3c5f9505..9ca248495e` (1); ui-library `ore` `ebf241be..3f904483` (2). Read in full; baselines advanced; pkp-e2e `ore` `34731c21..918eeb34`.**
  - Runs (step 0): the pkp/ojs `ore` hook at `1fedf73275` ([43084275791](https://github.com/pkp/ojs/actions/runs/43084275791), 2026-11-11 19:07, after pkp-e2e `ore` `34731c21`): green.
  - All four `=main` (same patch-ids): ojs `1fedf73275` = `7fc2376322`, pkp-lib `9ca248495e` = `8959bca71c`, ui-library `3f904483` = `51f9eaa1` (pkp/ui-library#1014; pkp/pkp-lib#13468) and `940b25cf` = `f2a4757a` (pkp/ui-library#981). `main`'s verdicts carry over (`upstream-sync.md` 2026-11-12): regression none, security none.
  - Carried: main's `c3cf0165` (U14 A6 retired) by hand as `0c23991f` (ore's U14 is the pre-revision text; a fold agent, `.reports/ore1112/` in the worktree; dead links to the deleted A6, A17 and A18 reports replaced; the suites' headers drop A6). The A6 walk (copied from `main` for the run, removed after) on a fresh ore dataset fleet, OJS `1fedf73275`: both panels link the unverified iD to `https://orcid.org/0000-0001-5109-3700`; neighbour reads unchanged. main's `f3b63203` (U30 and U26 follow #981), its spec, suite-comment and kept-check parts, as `918eeb34`; one conflict (U30's Left-out list) resolved to ore's text plus the new item, its date tag dropped for ore's lint.
  - Gate: pkp-e2e `ore` push run [43211539187](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43211539187) at `918eeb34`: 3/3 green.
  - Carried over: today's `main` sync confirmed no regression. Open regression rows: no row's code moved.
  - Security: none routed.
- **2026-11-10 (merge step asked in the thread by bozana, VM s1, the ore worktree) — pkp-lib#12899's `ore` port: pkp-lib `ore` `5598f13905..6722bea1ed` (pkp/pkp-lib#13771, bozana, `5f40e69aa9`, merged 13:33 UTC), ojs `ore` `8e022b2591..aa4b02810f` (pkp/ojs#6058, the pointer bump to `5f40e69aa9`). Not PR-reviewed before the merge; it is `main`'s reviewed patch. Baselines advanced; pkp-e2e `ore` `6c860586..d351b5d0`.**
  - Merges: `5f40e69aa9` has the patch-id of `main`'s reviewed head `b11ae35cb6` (and of `main`'s merge `8888001f0a`), the same six files; the merge `6722bea1ed` has its tree. OJS `ore`'s `lib/pkp` is the PR head `5f40e69aa9`, the same tree as the pkp-lib `ore` tip. pkp/pkp-lib#13743 (#12520) still has no `ore` port, so that fault stays on `ore`.
  - Walked at the tip (OJS `aa4b02810f`, `lib/pkp` `5f40e69aa9`), with `main`'s kept scripts copied into the worktree for the run and removed after (`walk.js` with `WALK_DB=ojs_test_s5_ds1` for its one query): on a fresh dataset fleet (`.reports/pr12899o/`) `0a/b-c.12`, `0ab cde12`, `0abcil012`, `0213RCC28`, `0213ICC28` refused `400` by institutions, affiliations, funders and `rors`; `0213rcc28`, `05njb9z20` saved `200`; the author's affiliation put back. `migration.js` on a fresh campaign fleet (`.reports/pr12899om/`): the 16 upgrade-step cases as at `main`'s head.
  - Carried: U66 "ROR" row and f-a5, U41 fn d on pkp-e2e `ore` (`d351b5d0`, spec text only, lint clean; no test file changed, so no run owed). Regression none, security none.

- **2026-11-08 — PR review of pkp/pkp-lib#13715's ore port (asked in the thread, VM s0, the ore worktree): pkp/ui-library#1049 (taslangraham `i13715-ore`, `6ae3836b0c`, one commit on the ui-library `ore` tip `113f3fa269`) and pkp/ojs#6055 (`d2f82b8322`, the `lib/ui-library` bump only, on the OJS `ore` tip `fd1fb1521a`). No unreviewed tip commit carried. Companion `i13715-ore`. Not merged; baselines not advanced.**
  - `git range-diff`: `6ae3836b0c` `=` main's merged `8700ac5d1c` (ui-library#1042, merged 2026-11-08), which `=` the merged head `37897e4ce5`, which `=` the reviewed `ae8e084134` (`upstream-sync.md` 2026-11-04; rebased 2026-11-05, only the author line and the PR number differ). `main`'s verdict holds.
  - Walked on dataset fleet 1 (port 12361), freshly loaded per run: the U30 A5 `walk.js` (steps, neighbour) and `checks/sync/ui-library-1042/extra.js`. Base `fd1fb1521a`: the generic "Error" dialog for every refusal, with no field message. Head `d2f82b8322`, rebuilt: the field messages under "Subject", "Message" and the attachments, and no dialog. The not-ready round's dialog, the `locale` case's generic dialog and the full request's send are unchanged. The checkout was put back at `fd1fb1521a` and rebuilt.
  - Companion `i13715-ore` = `i13602-ore` (`42ecc5b2`) + main's kept check `0d09cc72` (`7382e35f`). It is stacked because pkp-e2e `ore` still reds U22 S4 and U26 S12 against ojs#6044, which is already in the OJS tip. The PR's own check [42507244427](https://github.com/pkp/ojs/actions/runs/42507244427) ran before the companion existed and is red only on those two tests.
  - CI [42510494304](https://github.com/jardakotesovec/pkp-e2e/actions/runs/42510494304) at `i13715-ore` with ojs `d2f82b8322`: 3/3 green. Security: none routed.
  - Later the same day (asked again in a thread, VM s2): ojs#6055 was force-pushed to `d09f1853e8` (18:55 UTC), the same tree (`025984d190`) and parent (`fd1fb1521a`) as `d2f82b8322`, only the committer date differs, so the review stands. ui-library#1049 still `6ae3836b0c`. The PR's own check [42512374205](https://github.com/pkp/ojs/actions/runs/42512374205) at `d09f1853e8` resolved the companion `i13715-ore`: 3/3 green.
  - Pointers: OJS `ore` pins `lib/pkp` `8b8767ae89` and `lib/ui-library` `1cfc58098b`, the pkp-lib#13748 and ui-library#1048 PR heads, on no branch; their squash commits `5598f13905` and `113f3fa269` (the `ore` tips) carry the same trees. ojs#6055 moves `lib/ui-library` off it; if ui-library#1049 is squashed, `6ae3836b0c` is again on no branch unless the pointer is moved to the squash before ojs#6055 merges (as ojs#6026 did on `main`, pointing at `8700ac5d1c`). `lib/pkp` needs a pointer bump to `5598f13905` either way.
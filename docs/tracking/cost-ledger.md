# Cost ledger

What a feature session costs in tokens, and where the spend goes. One row
set per feature, filled at the end of the session from the transcript
(RUNBOOK step 10). U02 is the baseline every later feature is compared
against, so a change to the loop shows up as a change in the shares.

The figures are price-weighted token counts, not dollars: output ×5, fresh
input ×1, cache creation ×1.25, cache read ×0.1. Those are the relative
prices of the four token kinds, so the weighted number ranks the levers
correctly (cold agent contexts and long transcripts re-read every turn cost
more than long reports do). The script deduplicates by API message id;
summing transcript lines naively inflates every figure about 2.5×. Session
limit notices are not API calls and are not counted. Rows before 2026-09-05
were refilled with the corrected script (output tokens had been read from
a placeholder line and undercounted about five times), so every row is
comparable. Rows before U28 count
output at about a fifth of its true value (the script read the placeholder
count on streamed lines); add about 3.5M to each of those totals when
comparing with U28 onward.

The rows `U28-medium` and `U29-high` are the two effort trials (blind
rebuilds, 2026-09-05 and 2026-09-06): each feature was built once at each
effort, and the comparison settled on high for every role (commit 120b795
carries what the medium builds did better). The comparisons are in
`.reports/U28-compare/` and `.reports/U29-compare/`.

The command, run where the session transcript is at hand:

    node bin/session-cost.mjs ~/.claude/projects/<project>/<session-uuid>.jsonl --label U03 --append

Subagents are read from `<session-uuid>/subagents/agent-*.jsonl` next to the
transcript and grouped by role from their `meta.json` description; a
description the keyword map does not know is printed as `other: <text>`.
`--append` writes the table and the summary line under a heading for the
feature at the end of this file; nothing else is written here, and what
the numbers mean is the maintainer's judgment at review. On the VM the
transcript is not available to the session itself; a row filled from
completion notifications only is marked `partial`.

## U02 baseline

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 126 | 41 | 7,106 | 955,537 | 24,444,551 | 129,025 | 4,291,107 | 22.6% |
| probe | 9 | 194 | 9 | 53,523 | 1,154,797 | 14,187,134 | 148,078 | 3,656,123 | 19.3% |
| claim check | 2 | 123 | 5 | 18,123 | 1,223,403 | 16,736,928 | 75,087 | 3,596,505 | 18.9% |
| test author | 3 | 64 | 3 | 20,376 | 755,700 | 9,150,567 | 34,603 | 2,053,073 | 10.8% |
| finalize/fold | 5 | 61 | 5 | 16,815 | 489,873 | 5,420,021 | 59,046 | 1,466,388 | 7.7% |
| explore/plan | 6 | 82 | 6 | 4,602 | 543,058 | 3,790,732 | 70,108 | 1,413,038 | 7.4% |
| spec author | 1 | 24 | 1 | 8,690 | 254,432 | 3,260,612 | 73,826 | 1,021,921 | 5.4% |
| digest | 1 | 13 | 2 | 4,254 | 227,501 | 957,956 | 19,907 | 483,961 | 2.5% |
| rewrite | 1 | 14 | 1 | 6,309 | 116,132 | 1,317,807 | 23,432 | 400,415 | 2.1% |
| readability/persona | 2 | 12 | 2 | 3,971 | 98,924 | 445,255 | 21,908 | 281,692 | 1.5% |
| merge | 1 | 8 | 1 | 2,570 | 71,028 | 429,941 | 5,755 | 163,124 | 0.9% |
| other: Harness: validation-variant server | 1 | 10 | 1 | 6,156 | 46,494 | 477,718 | 9,323 | 158,660 | 0.8% |
| **total** | 32 | 731 | 77 | 152,495 | 5,936,879 | 80,619,222 | 670,098 | 18,986,006 | 100% |

U02 · 32 agents · 605 subagent calls · 126 orchestrator calls · weighted 18,986,006

## U03

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 195 | 62 | 9,799 | 1,134,278 | 37,307,683 | 133,054 | 5,823,685 | 23.8% |
| probe | 11 | 311 | 12 | 53,426 | 1,780,409 | 25,527,261 | 204,996 | 5,856,643 | 23.9% |
| claim check | 6 | 216 | 6 | 43,222 | 1,265,283 | 23,116,494 | 221,966 | 5,046,305 | 20.6% |
| test author | 3 | 53 | 4 | 1,518 | 797,808 | 9,333,711 | 68,627 | 2,275,284 | 9.3% |
| finalize/fold | 5 | 94 | 5 | 13,126 | 581,250 | 10,375,639 | 90,475 | 2,229,627 | 9.1% |
| readability/persona | 4 | 18 | 4 | 5,473 | 259,848 | 633,989 | 72,780 | 757,582 | 3.1% |
| spec author | 2 | 21 | 1 | 7,064 | 259,633 | 2,015,752 | 33,170 | 699,030 | 2.9% |
| digest | 1 | 24 | 1 | 7,070 | 138,790 | 2,166,374 | 24,192 | 518,155 | 2.1% |
| rewrite | 1 | 19 | 1 | 3,280 | 144,690 | 1,776,969 | 24,757 | 485,624 | 2.0% |
| other: U03 checker: Rule 2 tab-switch span | 1 | 21 | 1 | 642 | 169,269 | 1,282,448 | 10,577 | 393,358 | 1.6% |
| merge | 1 | 9 | 1 | 6,054 | 87,123 | 652,996 | 22,208 | 291,297 | 1.2% |
| other: U03 add register entry for silent loss | 1 | 7 | 1 | 194 | 45,754 | 323,309 | 4,327 | 111,352 | 0.5% |
| **total** | 36 | 988 | 99 | 150,868 | 6,664,135 | 114,512,625 | 911,129 | 24,487,944 | 100% |

U03 · 36 agents · 793 subagent calls · 195 orchestrator calls · weighted 24,487,944

Against U02: +29% weighted for a spec 32% longer (19.2k words, 14 rules,
10 scenarios, 20 register entries; U02 14.5k words, 10 entries) and 10
tests per app instead of 8. No explore/plan agents (U02 spent 6.5% there).
Test authoring stayed flat in absolute terms. Two incidents sit inside the
figure: about two hours of API outage at the start (the spec author was
resumed five times) and a red first final run caused by a stale front-end
bundle after the upstream sync (the fetch script now rebuilds it). The
session was paused three times at the maintainer's request and resumed in
place; each resume re-created the orchestrator's whole context.

## U05

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 323 | 85 | 7,782 | 1,709,538 | 78,667,765 | 319,294 | 11,607,951 | 30.4% |
| claim check | 4 | 217 | 9 | 6,384 | 2,256,353 | 33,458,192 | 218,463 | 7,264,959 | 19.0% |
| probe | 6 | 200 | 6 | 6,070 | 1,247,664 | 24,493,346 | 211,639 | 5,073,180 | 13.3% |
| rewrite | 7 | 120 | 9 | 3,574 | 828,052 | 10,273,260 | 149,619 | 2,814,060 | 7.4% |
| readability/persona | 11 | 62 | 11 | 1,654 | 567,768 | 2,169,756 | 176,594 | 1,811,310 | 4.7% |
| spec author | 1 | 36 | 2 | 1,094 | 637,075 | 6,537,762 | 64,071 | 1,771,569 | 4.6% |
| other: U05 OJS test suite | 1 | 38 | 1 | 1,186 | 317,266 | 7,954,599 | 26,337 | 1,324,913 | 3.5% |
| finalize/fold | 2 | 38 | 2 | 1,156 | 323,243 | 4,325,335 | 69,566 | 1,185,573 | 3.1% |
| other: U05 trim pass | 1 | 36 | 3 | 1,036 | 175,718 | 3,768,726 | 68,184 | 938,476 | 2.5% |
| other: Trim shipped specs batch 1 | 1 | 26 | 2 | 774 | 336,271 | 3,000,149 | 25,769 | 849,973 | 2.2% |
| other: U05 OMP test suite | 1 | 32 | 1 | 994 | 182,382 | 3,709,686 | 25,047 | 725,175 | 1.9% |
| other: U05 OPS test suite | 1 | 28 | 1 | 866 | 194,874 | 3,341,307 | 28,736 | 722,269 | 1.9% |
| other: Trim shipped specs batch 4 | 1 | 28 | 2 | 838 | 174,108 | 2,551,158 | 28,610 | 616,639 | 1.6% |
| other: Trim shipped specs batch 3 | 1 | 21 | 1 | 642 | 171,285 | 2,185,030 | 20,871 | 537,606 | 1.4% |
| other: Trim shipped specs batch 2 | 1 | 24 | 1 | 738 | 139,453 | 2,253,343 | 25,405 | 527,414 | 1.4% |
| merge | 1 | 12 | 1 | 354 | 89,791 | 813,591 | 24,066 | 314,282 | 0.8% |
| other: U05 product-owner re-read (4 entries) | 1 | 3 | 1 | 66 | 17,625 | 78,025 | 3,879 | 49,295 | 0.1% |
| other: U05 product-owner register read | 1 | 3 | 1 | 66 | 15,502 | 82,106 | 300 | 29,154 | 0.1% |
| other: U05 product-owner read of A11 | 1 | 3 | 1 | 66 | 16,141 | 78,733 | 192 | 29,076 | 0.1% |
| **total** | 43 | 1250 | 140 | 35,340 | 9,400,109 | 189,741,869 | 1,486,642 | 38,192,873 | 100% |

U05 · 43 agents · 927 subagent calls · 323 orchestrator calls · weighted 38,192,873

Five of the 43 agents (the U05 trim pass and the four shipped-spec trim batches, about 3.5M weighted) trimmed the shipped specs in the same session (maintainer's request, 2026-09-04); the feature alone is about 34.7M. Against U03: +42% weighted for a spec of 16,785 words, 9 rules, 9 scenarios and
14 register entries, and 9/8/8 tests. The orchestrator share (24%) stays
above a fifth for the second feature running, which trips the "per-phase
runners" condition in PROGRESS "Open harness work". Eight persona passes
and seven rewrites (12% together) circled one roster row whose event
cannot fire on a test install until it became register entry A11; a
blocker that is a declared fact should end the loop sooner. Four claim-check
chunks at 26% is the largest role, as in U03.

## U28

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 139 | 37 | 3,408 | 520,567 | 27,003,066 | 102,157 | 3,865,208 | 16.0% |
| claim check | 7 | 247 | 9 | 7,398 | 1,406,944 | 29,342,042 | 235,131 | 5,875,937 | 24.3% |
| probe | 7 | 245 | 7 | 7,600 | 1,104,162 | 26,014,757 | 225,319 | 5,115,873 | 21.2% |
| test author | 3 | 98 | 3 | 2,986 | 928,253 | 14,539,079 | 103,453 | 3,134,475 | 13.0% |
| finalize/fold | 5 | 116 | 5 | 3,562 | 763,093 | 12,902,348 | 147,921 | 2,987,268 | 12.4% |
| spec author | 1 | 21 | 1 | 642 | 647,407 | 4,133,399 | 31,525 | 1,380,866 | 5.7% |
| other: U28 harness: review-setup keys | 1 | 27 | 1 | 774 | 154,973 | 3,281,842 | 24,701 | 646,179 | 2.7% |
| digest | 1 | 15 | 1 | 450 | 132,164 | 1,409,316 | 4,265 | 327,912 | 1.4% |
| other: U28 span check K9 step 4 panel | 1 | 12 | 1 | 354 | 118,079 | 982,280 | 6,206 | 277,211 | 1.1% |
| readability/persona | 1 | 8 | 1 | 226 | 68,275 | 406,083 | 12,503 | 188,693 | 0.8% |
| rewrite | 1 | 16 | 1 | 482 | 59,410 | 836,555 | 5,611 | 186,455 | 0.8% |
| merge | 1 | 9 | 1 | 258 | 92,032 | 574,967 | 2,503 | 185,310 | 0.8% |
| **total** | 29 | 953 | 68 | 28,140 | 5,995,359 | 121,425,734 | 901,295 | 24,171,387 | 100% |

U28 · 29 agents · 814 subagent calls · 139 orchestrator calls · weighted 24,171,387

## U29

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 89 | 21 | 2,230 | 187,544 | 12,370,967 | 64,143 | 1,794,472 | 11.8% |
| claim check | 6 | 219 | 6 | 6,828 | 1,089,018 | 23,259,818 | 215,598 | 4,772,072 | 31.5% |
| probe | 5 | 178 | 5 | 5,546 | 740,306 | 17,146,865 | 191,669 | 3,603,960 | 23.8% |
| test author | 3 | 98 | 3 | 3,046 | 429,722 | 11,763,840 | 66,372 | 2,048,443 | 13.5% |
| spec author | 1 | 26 | 1 | 802 | 288,755 | 4,349,706 | 58,407 | 1,088,751 | 7.2% |
| finalize/fold | 2 | 39 | 2 | 1,188 | 277,420 | 3,887,432 | 46,968 | 971,546 | 6.4% |
| digest | 1 | 11 | 1 | 322 | 91,912 | 735,359 | 18,372 | 280,608 | 1.9% |
| merge | 1 | 16 | 1 | 482 | 75,599 | 917,052 | 14,781 | 260,591 | 1.7% |
| readability/persona | 1 | 3 | 1 | 66 | 59,277 | 105,109 | 20,079 | 185,068 | 1.2% |
| rewrite | 1 | 10 | 1 | 290 | 48,988 | 470,329 | 7,317 | 145,143 | 1.0% |
| **total** | 21 | 689 | 42 | 20,800 | 3,288,541 | 75,006,477 | 703,706 | 15,150,654 | 100% |

U29 · 21 agents · 600 subagent calls · 89 orchestrator calls · weighted 15,150,654

## U29-high

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 140 | 29 | 3,608 | 308,084 | 28,878,581 | 129,618 | 3,924,661 | 18.7% |
| claim check | 7 | 284 | 7 | 8,818 | 1,510,474 | 29,891,365 | 260,476 | 6,188,427 | 29.5% |
| probe | 8 | 219 | 8 | 6,738 | 1,118,299 | 18,793,990 | 216,958 | 4,368,801 | 20.8% |
| test author | 3 | 70 | 3 | 2,150 | 499,795 | 9,880,608 | 73,686 | 1,983,385 | 9.5% |
| finalize/fold | 3 | 74 | 3 | 2,278 | 444,617 | 7,790,939 | 60,299 | 1,638,638 | 7.8% |
| spec author | 1 | 24 | 2 | 710 | 613,549 | 4,593,887 | 47,624 | 1,465,155 | 7.0% |
| other: U29 span checker K8 | 1 | 23 | 1 | 706 | 92,640 | 1,579,659 | 20,121 | 375,077 | 1.8% |
| readability/persona | 2 | 14 | 2 | 388 | 125,963 | 631,578 | 25,040 | 346,200 | 1.7% |
| merge | 1 | 12 | 1 | 354 | 94,425 | 813,804 | 15,479 | 277,161 | 1.3% |
| other: U29 harness: included key | 1 | 17 | 1 | 514 | 55,179 | 882,260 | 8,158 | 198,504 | 0.9% |
| digest | 1 | 8 | 1 | 226 | 113,345 | 482,656 | 805 | 194,198 | 0.9% |
| **total** | 28 | 885 | 58 | 26,490 | 4,976,370 | 104,219,327 | 858,264 | 20,960,205 | 100% |

U29-high · 28 agents · 745 subagent calls · 140 orchestrator calls · weighted 20,960,205

## U30

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 113 | 30 | 2,712 | 443,246 | 20,886,956 | 91,765 | 3,104,290 | 15.4% |
| claim check | 5 | 187 | 5 | 5,834 | 1,416,936 | 23,386,452 | 216,749 | 5,199,394 | 25.9% |
| test author | 3 | 114 | 4 | 1,638 | 850,559 | 25,095,641 | 101,771 | 4,083,256 | 20.3% |
| probe | 5 | 147 | 5 | 4,554 | 692,897 | 12,951,276 | 136,865 | 2,850,128 | 14.2% |
| finalize/fold | 2 | 41 | 2 | 1,252 | 307,587 | 4,780,674 | 57,458 | 1,151,093 | 5.7% |
| spec author | 1 | 19 | 1 | 578 | 252,443 | 2,960,805 | 66,991 | 947,167 | 4.7% |
| other: U30 harness: completed reviewer key | 1 | 39 | 1 | 1,218 | 176,325 | 4,649,992 | 50,189 | 937,568 | 4.7% |
| digest | 1 | 19 | 1 | 578 | 119,928 | 1,375,031 | 22,941 | 402,696 | 2.0% |
| scenarios | 1 | 21 | 1 | 642 | 115,527 | 1,836,753 | 10,038 | 378,916 | 1.9% |
| rewrite | 1 | 21 | 1 | 642 | 93,110 | 1,607,261 | 5,915 | 307,331 | 1.5% |
| merge | 1 | 9 | 1 | 258 | 80,669 | 514,668 | 13,073 | 217,926 | 1.1% |
| readability/persona | 1 | 5 | 1 | 130 | 51,643 | 195,236 | 23,332 | 200,867 | 1.0% |
| other: U30 scenarios to plan shape | 1 | 11 | 1 | 322 | 59,086 | 533,048 | 10,522 | 180,094 | 0.9% |
| other: U30 draft to no-scenarios shape | 1 | 7 | 1 | 194 | 56,987 | 370,006 | 4,838 | 132,618 | 0.7% |
| **total** | 24 | 753 | 55 | 20,552 | 4,716,943 | 101,143,799 | 812,447 | 20,093,346 | 100% |

U30 · 24 agents · 640 subagent calls · 113 orchestrator calls · weighted 20,093,346

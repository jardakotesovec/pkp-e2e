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
limit notices are not API calls and are not counted.

The command, run where the session transcript is at hand:

    node bin/session-cost.mjs ~/.claude/projects/<project>/<session-uuid>.jsonl --label U03

Subagents are read from `<session-uuid>/subagents/agent-*.jsonl` next to the
transcript and grouped by role from their `meta.json` description; a
description the keyword map does not know is printed as `other: <text>`.
Paste the table and the summary line under a heading for the feature. On
the VM the transcript is not available to the session itself; a row filled
from completion notifications only is marked `partial`.

## U02 baseline

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 126 | 41 | 7,106 | 955,537 | 24,444,551 | 129,025 | 4,291,107 | 26.1% |
| claim check | 2 | 123 | 5 | 18,123 | 1,223,403 | 16,736,928 | 8,542 | 3,263,780 | 19.9% |
| probe | 9 | 194 | 9 | 53,523 | 1,154,797 | 14,187,134 | 5,501 | 2,943,238 | 17.9% |
| test author | 3 | 64 | 3 | 20,376 | 755,700 | 9,150,567 | 2,265 | 1,891,383 | 11.5% |
| finalize/fold | 5 | 61 | 5 | 16,815 | 489,873 | 5,420,021 | 1,512 | 1,178,718 | 7.2% |
| explore/plan | 6 | 82 | 6 | 4,602 | 543,058 | 3,790,732 | 628 | 1,065,638 | 6.5% |
| spec author | 1 | 24 | 1 | 8,690 | 254,432 | 3,260,612 | 360 | 654,591 | 4.0% |
| digest | 1 | 13 | 2 | 4,254 | 227,501 | 957,956 | 543 | 387,141 | 2.4% |
| rewrite | 1 | 14 | 1 | 6,309 | 116,132 | 1,317,807 | 430 | 285,405 | 1.7% |
| readability/persona | 2 | 12 | 2 | 3,971 | 98,924 | 445,255 | 8,840 | 216,352 | 1.3% |
| merge | 1 | 8 | 1 | 2,570 | 71,028 | 429,941 | 522 | 136,959 | 0.8% |
| other: Harness: validation-variant server | 1 | 10 | 1 | 6,156 | 46,494 | 477,718 | 40 | 112,245 | 0.7% |
| **total** | 32 | 731 | 77 | 152,495 | 5,936,879 | 80,619,222 | 158,208 | 16,426,556 | 100% |

U02 · 32 agents · 605 subagent calls · 126 orchestrator calls · weighted 16,426,556

## U03

| role | agents | calls | pure text | input | cache creation | cache read | output | weighted | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | — | 195 | 62 | 9,799 | 1,134,278 | 37,307,683 | 133,054 | 5,823,685 | 27.9% |
| probe | 11 | 311 | 12 | 53,426 | 1,780,409 | 25,527,261 | 22,548 | 4,944,403 | 23.7% |
| claim check | 6 | 216 | 6 | 43,222 | 1,265,283 | 23,116,494 | 14,392 | 4,008,435 | 19.2% |
| test author | 3 | 53 | 4 | 1,518 | 797,808 | 9,333,711 | 1,794 | 1,941,119 | 9.3% |
| finalize/fold | 5 | 94 | 5 | 13,126 | 581,250 | 10,375,639 | 3,565 | 1,795,077 | 8.6% |
| spec author | 2 | 21 | 1 | 7,064 | 259,633 | 2,015,752 | 226 | 534,310 | 2.6% |
| readability/persona | 4 | 18 | 4 | 5,473 | 259,848 | 633,989 | 10,471 | 446,037 | 2.1% |
| digest | 1 | 24 | 1 | 7,070 | 138,790 | 2,166,374 | 1,733 | 405,860 | 1.9% |
| other: U03 checker: Rule 2 tab-switch span | 1 | 21 | 1 | 642 | 169,269 | 1,282,448 | 5,154 | 366,243 | 1.8% |
| rewrite | 1 | 19 | 1 | 3,280 | 144,690 | 1,776,969 | 371 | 363,694 | 1.7% |
| merge | 1 | 9 | 1 | 6,054 | 87,123 | 652,996 | 41 | 180,462 | 0.9% |
| other: U03 add register entry for silent loss | 1 | 7 | 1 | 194 | 45,754 | 323,309 | 384 | 91,637 | 0.4% |
| **total** | 36 | 988 | 99 | 150,868 | 6,664,135 | 114,512,625 | 193,733 | 20,900,964 | 100% |

U03 · 36 agents · 793 subagent calls · 195 orchestrator calls · weighted 20,900,964

Against U02: +27% weighted for a spec 32% longer (19.2k words, 14 rules,
10 scenarios, 20 register entries; U02 14.5k words, 10 entries) and 10
tests per app instead of 8. No explore/plan agents (U02 spent 6.5% there).
Test authoring stayed flat in absolute terms. Two incidents sit inside the
figure: about two hours of API outage at the start (the spec author was
resumed five times) and a red first final run caused by a stale front-end
bundle after the upstream sync (the fetch script now rebuilds it). The
session was paused three times at the maintainer's request and resumed in
place; each resume re-created the orchestrator's whole context.

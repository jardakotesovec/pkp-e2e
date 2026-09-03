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

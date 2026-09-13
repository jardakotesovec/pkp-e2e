# Coverage revision — the queue

Shipped specs written before the classing rule (TEMPLATE "Coverage",
2026-09-07), or whose "Left out" list was cut by a count before the count
went (RUNBOOK "Budget", 2026-09-12), each awaiting one session of RUNBOOK
"Revising a shipped feature", taken in queue order. A row and its file
are deleted when the feature's session commits; the file goes with the
last row. Features built after 2026-09-12 follow the rule from the start
and never enter this queue.

## Specs with a classed table

The classed table is `coverage-revision/U<nn>.md`. Its Budget cells were
cleared on 2026-09-12: a row blank in both "Runs in" and "Why not" is the
writer's to decide (a user meets it in an ordinary week, or "Budget" with
that reason). One line per spec, FEATURE-MAP order, in this shape:

`U<nn> · main/guard gaps: ride <n> · own <n> · no seed <n> · undecided states <n> · variants <n> · scenarios to add <n> · suite fixes <n> · <status>`

U02 · main/guard gaps: ride 6 · own 0 · no seed 2 · undecided states 6 · variants 5 · scenarios to add 0 · suite fixes 8 · pending
U03 · main/guard gaps: ride 6 · own 2 · no seed 3 · undecided states 10 · variants 5 · scenarios to add 2 · suite fixes 0 · pending
U04 · main/guard gaps: ride 7 · own 1 · no seed 13 · undecided states 2 · variants 2 · scenarios to add 1 · suite fixes 0 · pending
U05 · main/guard gaps: ride 8 · own 2 · no seed 5 · undecided states 9 · variants 4 · scenarios to add 2 · suite fixes 0 · pending
U06 · main/guard gaps: ride 12 · own 1 · no seed 3 · undecided states 1 · variants 4 · scenarios to add 1 · suite fixes 9 · pending
U15 · main/guard gaps: ride 4 · own 2 · no seed 1 · undecided states 6 · variants 9 · scenarios to add 1 · suite fixes 0 · pending
U22 · main/guard gaps: ride 7 · own 0 · no seed 0 · undecided states 7 · variants 3 · scenarios to add 0 · suite fixes 1 · pending
U24 · main/guard gaps: ride 18 · own 8 · no seed 2 · undecided states 22 · variants 2 · scenarios to add 4 · suite fixes 2 · pending
U25 · main/guard gaps: ride 3 · own 2 · no seed 1 · undecided states 3 · variants 0 · scenarios to add 2 · suite fixes 9 · pending
U29 · main/guard gaps: ride 7 · own 2 · no seed 1 · undecided states 6 · variants 0 · scenarios to add 2 · suite fixes 1 · pending
U40 · main/guard gaps: ride 10 · own 1 · no seed 0 · undecided states 12 · variants 0 · scenarios to add 1 · suite fixes 2 · pending
U41 · main/guard gaps: ride 9 · own 2 · no seed 2 · undecided states 6 · variants 0 · scenarios to add 3 · suite fixes 5 · pending
U43 · main/guard gaps: ride 5 · own 2 · no seed 3 · undecided states 3 · variants 0 · scenarios to add 2 · suite fixes 3 · pending
U49 · main/guard gaps: ride 11 · own 3 · no seed 1 · undecided states 3 · variants 0 · scenarios to add 3 · suite fixes 12 · pending

## Specs cut by count

Revised under the tier rule before 2026-09-12. There is no table: the
"Budget" items in the spec's "Left out" list are the rows, decided the
same way; the scenarios already have TEMPLATE's shape and are not
reshaped, so the session is the scenario step on those items, then tests,
final run, progress and commit. One line per spec, FEATURE-MAP order:

`U<nn> · Budget items: states <n> · variants <n> · <status>`


# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U24 | Rule 2b (the old author-dashboard link's forward), signed in as a Journal Manager who also holds Author on a scratch journal, press or server (OJS, OMP, OPS) | Contradicts "The forward is for the Author only. Any other signed-in role … gets the access-denied page": the Manager+Author account following the old author-dashboard link of another author's submission is forwarded to their own My Submissions with that submission's panel open. Seen on `main`, three apps, two runs | 2026-11-17 | U22 drift-sweep claim check ccSW17, `.reports/U22/cc-SW17.md` SW17-4 (`roles.ma.oldLinkQueued`); kept script `shared/playwright/checks/U22/SW17/sw17.js` (PART=roles) |
| U24 | OPS4's "On a journal or press the same author's draft opens cleanly, on the Submission stage" (an old author-dashboard link to a still-incomplete draft), signed in as the draft's author (OJS, OMP) | True on opening, but pressing "Title & Abstract" in that panel raises an "Error" dialog "Workflow access for incomplete submission is restricted.", as on a preprint server. Seen on `main`, two runs | 2026-11-17 | U22 drift-sweep claim check ccSW17, `.reports/U22/cc-SW17.md` SW17-5 (`draftlink.titleAbstract`); kept script `shared/playwright/checks/U22/SW17/sw17.js` (PART=draftlink) |

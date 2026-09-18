# Report template

A report is a write-up handed to the team about one thing that is broken:
a regression the sync loop confirmed, a fix that misses what its issue
asked for, or a defect a feature build ran into that the team should fix
rather than the campaign work around. It lives under `docs/reports/` as
`<date>-<repo>-<pr>.md` (or `<date>-<app>-<slug>.md` when no PR
introduced it), is posted to the team the same day, and is deleted once
the team has acted on it; the tracking row or the register footnote keeps
the pointer (RUNBOOK "What goes where"). Research write-ups (a performance
round, a flake investigation) are not this shape, but they too lead with
the outcome.

## Write for a reader who has five minutes

A developer or product person who was not in the session, has the apps
and the tips in front of them, and wants to know three things in this
order: what breaks for a user, how to see it themselves, and what would
fix it. The first screen answers the first question. Everything the
campaign needed to establish the finding (agent names, run folders,
scratch contexts, the before-side drive) is evidence, and evidence sits at
the end. A reader who stops after "Impact" knows whether to care; one who
stops after "Steps" can see it; one who reads to the end can fix it and
check the fix.

## The sections, in order

Use exactly these headings. A section with nothing to say is one line,
never dropped.

```markdown
# <What breaks, in product words: who does what, and what goes wrong>

Regression | Intention gap | Defect. <App(s)> at <app tip> (lib/pkp
<tip>); introduced by <repo>#<pr> (<sha>, <date>) | present since at
least <sha>. stable-3_5_0: shows it too at <sha> | does not | not driven.
Tracked in <ci-triage row | spec Ux register An | app-changes row n>.
Temporary: delete once acted on.

## Summary

## Impact

## Steps to reproduce

## Cause

## Proposed fix

## Evidence
```

**Summary.** Two or three sentences. What a user does, what happens
instead of what they expect, and since when. No paths, no request names,
no commit shas: those are in the header line and the evidence.

**Impact.** Who meets it (which role, on which screen, how often in
ordinary use), what they lose (data, time, a message, a wrong landing),
whether they can work around it, and whether it gets worse (a pending
request nobody can clear, an email that misleads). Severity in one plain
word (blocking, major, minor, cosmetic) at the end, with the reason in
the same sentence. Written for someone who runs a journal, not someone
who reads PHP.

**Steps to reproduce.** First the preconditions as a short list: the
install (fresh, default languages), the roles and data that must exist,
written as what a person creates through the screens. Then numbered
steps, one action each, using the names as they appear on screen in
quotes ("Add discussion", "Save And Continue"), with the page's address
where it helps. Then two paragraphs, **Expected** and **Observed**, right
under the steps: on-screen strings verbatim, an error message or a
request and its response in a code block. A step a person cannot take by
hand (a link only the old code mailed, a state only a script reaches)
says what a person does instead; a step nobody can take by hand is not a
step, it is evidence. A control (the neighbouring case that still works)
is one sentence after Observed, when it sharpens the finding.

**Cause.** Where in the code and why, in a short paragraph: the class and
method, the line the change moved, what it reads now that it did not read
before. This is the first section a developer needs and the first a
product reader may skip.

**Proposed fix.** One or more options, the smallest first, each in a
sentence or two: what changes, what it costs, what it does not cover. It
is a proposal, and it says so; the team decides. A fix the campaign
already carries as a mounted overlay is named here with the overlay's
path and the note that it is removed when upstream picks one. Even a
rough proposal earns its place: it tells the reader what the report
thinks the problem is.

**Evidence.** The kept script and how to run it, the run folders and
snapshots, the before-side drive and where it ran, the apps and lines not
driven, and what stays unverified, as a bulleted list. This is the only
section where agent names, `.reports/` paths and campaign vocabulary
appear.

## One report, one finding

A report describes one finding. When one change causes several, one
report carries them, with the Summary naming each in a sentence and a
`## Finding n — <title>` block per finding holding its own Impact, Steps,
Cause and Proposed fix in that order, then one shared Evidence section.
Two findings with different fixes and different severities are two
reports.

## Writing rules

- Product voice above the Cause, developer voice from the Cause down.
  Campaign words ("claim check", "regression reader", "fleet", "scratch
  context", "the kit") never appear above Evidence.
- Verbatim beats paraphrase: the dialog's text, the email's subject, the
  page title, the error line from the server log, each quoted or in a
  code block.
- Every sentence states a fact the report established. A guess is marked
  as one, in the Proposed fix or in Evidence under "unverified", never
  in Summary, Impact or Observed.
- Short. The Summary and Impact together fit on one screen; a report
  that runs long has evidence in its body.
- An update after the report went out (another app received the change,
  the team ruled on part of it) is one dated paragraph under the header
  line, and the sections are edited to match; the report always reads
  as current.

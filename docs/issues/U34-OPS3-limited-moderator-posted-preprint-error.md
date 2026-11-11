# Preprint server: a Moderator limited to recommendations cannot open a posted preprint, an "Error" window instead

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OPS
  - 3.5: none
  - 3.4: none (code; no Done stage)
  - 3.3: none (code; no Done stage)
- **Introduced** `pkp/ops#1392` and `pkp/pkp-lib#13273` for `pkp/pkp-lib#13109` · [16bbd9b90e](https://github.com/pkp/ops/commit/16bbd9b90e905f414228886bb61a18f1c201fd52) · 2026-09-07 · Vitaliy (Vitaliy-1)
- **Upstream** none found (2026-11-11)
- **Tracked in** spec U34 [OPS3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U34-editorial-decision-recording.md#ops3)
- **Checked** 2026-11-11, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Moderator whose assignment to a preprint is "Only allowed to recommend
an editorial decision" expects to open the preprint's workflow once it
is posted, as they do while it is in Production, where the workflow
opens and offers them no decision. Instead the app fails on the server
when it loads the preprint: an "Error" window opens, and after its "OK"
the workflow shows only the preprint's number, with no menu, no buttons
and no panels. It fails the same from "View" on the Dashboard's
"Published" view and from the preprint's address.

So the limited Moderator loses the posted preprint's workflow pages:
its title and abstract, metadata, galleys and relations, which the
workflow otherwise offers them with a "Save", and its activity log. A
Preprint Server Manager assigned to the preprint with the same limit
meets the same error. The same Moderator without the limit, and an
unassigned Preprint Server Manager, open the preprint normally.

Only the development branch (`main`) fails; no released version does.

## Impact

- **Lost**: the limited Moderator's work on every posted preprint they
  are assigned to: correcting its metadata and galleys, its relations,
  reading its activity log. Nothing stored changes, and the public
  preprint page still opens.
- **Who**: a Moderator or Preprint Server Manager whose assignment a
  manager limited to recommendations. The limit is off by default and
  is set on each assignment.
- **Way round**: a manager unticks the limit in the preprint's
  "Participants" › "Edit", which also gives the Moderator the decisions
  the limit was meant to withhold.

Medium: a secondary task fails with no way round that keeps the limit,
only on servers that choose the limit. It would be high if servers
commonly limited their Moderators.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OPS. Preprint 2, "The Facets Of
  Job Satisfaction: A Nine-Nation Comparative Study Of Construct
  Equivalence", is posted, and the Moderator Stephanie Berardo
  (`sberardo`) is assigned to it.

Set the limit:

1. Sign in as `dbarnes`.
2. Open preprint 2
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=2`).
3. In the side menu, select "Production".
4. In "Participants", open Stephanie Berardo's "More Actions" menu and
   choose "Edit".
5. Tick "This participant is only allowed to recommend an editorial
   decision and will require an authorised editor to record editorial
   decisions.", press "OK". The page reads "The stage assignment has
   been changed."
6. Sign out.

Open the preprint as the Moderator:

7. Sign in as `sberardo`.
8. On the Dashboard, open the "Published" view and press "View" on
   preprint 2.
9. Open the preprint again by its address (step 2's).

**Expected**: the workflow opens as it does for her on a preprint in
Production: the title, the side menu and the panels, with no decision
offered, since a Moderator limited to recommendations records none on a
preprint server.

**Observed**: at steps 8 and 9 the workflow's header shows "2" and an
"Error" window opens over it with one button, "OK". After "OK" the
workflow holds only the number "2": no title, no side menu, no header
buttons, no panels. The preprint's read answers with a server error:

```
GET /index.php/publicknowledge/api/v1/submissions/2  →  500
```

Control: after step 6, `dbarnes` opens preprint 2 normally, with "Return
to Workflow" and "Unpost" offered. A journal and a press do not fail:

- OJS: steps 1–9 on submission 1, "Signalling Theory Dividends", where
  `sberardo` is a Section editor (the dataset already limits her there,
  so step 5's "OK" saves it unchanged).
- OMP: book 14, "From Bricks to Brains: The Embodied Cognitive Science
  of LEGO Robots", which `sberardo` is not assigned to. As `dbarnes`,
  open it, select "Production" in the side menu, and in "Participants"
  press "Assign"; choose the role "Series editor", press "Search",
  choose Stephanie Berardo, tick "This participant is only allowed to
  recommend an editorial decision…", press "OK". Then steps 6–9 on
  book 14.

## Cause

The workflow reads the preprint with `GET submissions/{id}`. lib/pkp's
`PKP\submission\maps\Schema::mapByProperties()` builds its
`availableEditorialDecisions` property by passing each entry of the
app's `getAvailableEditorialDecisions()` to a closure that takes a
`DecisionType`.

OPS's `APP\submission\maps\Schema::getAvailableEditorialDecisions()`
(`classes/submission/maps/Schema.php`, line 102) handles an assignment
limited to recommendations with
`$decisionTypes[] = Repo::decision()->getDecisionTypesMadeByRecommendingUsers($stageId);`.
That method returns a list, and `[] =` appends the whole list as one
entry. OPS's list is empty, so the result is `[[]]`, the closure
receives an array, PHP throws a `TypeError`, and the API answers 500.
OJS's and OMP's twins assign the list instead (`$decisionTypes = …`),
and they also take that branch only at the Submission stage
(`$isOnlyRecommending && $stageId == WORKFLOW_STAGE_ID_SUBMISSION`, OJS
line 136, OMP line 196). The line dates from `pkp/ops#796` for
`pkp/pkp-lib#10537` (2024).

For two years nothing reached the line. lib/pkp's
`checkDecisionPermissions()` lets a recommend-only assignment decide
only when the recommending list has entries. OPS's list is empty unless
a plugin adds decisions through the `Workflow::RecommendatorDecisions`
hook, so the method returned before line 102.

Two 2026 changes opened the way at the Done stage, where posted
preprints now sit:

- `pkp/ops#1323` for `pkp/pkp-lib#12799` (2026-06-25) moved posted
  preprints to Done and added a block (lines 81–91) that lets any
  editor assigned to the submission decide at Done, whatever the limit.
  Its comment says Done has no stage assignments.
- `pkp/pkp-lib#13109` gave the manager, Moderator and Author groups the
  Done stage: `pkp/ops#1392` in `registry/userGroups.xml` for new
  installs, and the `I13109_PermitPublishedMetadataEdit` migration of
  `pkp/pkp-lib#13273` for upgraded ones. `checkDecisionPermissions()`
  now finds the limited assignment at Done and marks it recommend-only,
  and the Done block then lets it through to line 102.

Reach:

- Only the read of one submission asks for
  `availableEditorialDecisions`, so the Dashboard's lists load for the
  limited Moderator and only the workflow fails (walked).
- Every posted preprint the Moderator is assigned to with the limit
  fails. The same Moderator without the limit, and the manager, open it
  (walked).
- On OPS the limit can be set on a Moderator's or a Preprint Server
  Manager's assignment, and a limited manager's assignment takes the
  same path to line 102 (code).
- A limited Moderator on a preprint in Production is not affected: the
  method still returns before line 102, and the workflow offers only
  "Post the preprint" (walked).
- A plugin that adds decisions for recommending users makes them
  deciders at Production too, and line 102 then nests its list the same
  way, on `main` and on 3.5, whose OPS carries the line unchanged (code).
- No other `[] =` of a decision list exists in the three apps or
  lib/pkp (code search).
- OJS and OMP do not fail, but their Done block lets recommend-only
  editors through as deciders too. Their twins' Submission-stage guard
  then sends a limited Section editor or Series editor into the regular
  decisions, and a published submission offers them "Return to
  Workflow" (walked on `main`; the button was not pressed). That is a
  separate fault with its own fix, outside this report.

## Proposed fix

Assign the recommending list in OPS, as OJS and OMP do
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/limited-moderator-posted-preprint-error/fix.diff)):

```diff
--- a/classes/submission/maps/Schema.php
+++ b/classes/submission/maps/Schema.php
@@ -99,7 +99,7 @@
         $decisionTypes = []; /** @var DecisionType[] $decisionTypes */
 
         if ($isOnlyRecommending) {
-            $decisionTypes[] = Repo::decision()->getDecisionTypesMadeByRecommendingUsers($stageId);
+            $decisionTypes = Repo::decision()->getDecisionTypesMadeByRecommendingUsers($stageId);
         } else {
             switch ($submission->getData('status')) {
                 case Submission::STATUS_DECLINED:
```

Take only the `=` from the twins, not their Submission-stage guard. In
OPS that guard would send a limited Moderator at Done into the `else`
branch, which offers "Return to Workflow", a decision the limit
withholds.

The line is where the wrong value is built, so the fix covers the Done
stage and a plugin's recommending decisions at Production alike. Tried
on `main`, OPS: the limited Moderator then opens posted preprint 2 from
the "Published" view and by its address, with no error and no decision
offered. With the fix in and out alike, what must not change did not:
the unlimited Moderator (preprint 5) and the manager (preprint 2) are
offered "Return to Workflow" on a posted preprint, and the limited
Moderator on preprint 1 in Production is offered only "Post the
preprint".

**Alternatives**:

- Keep the Done block away from recommend-only assignments
  (`&& !$permissions['isOnlyRecommending']`) in all three apps' maps.
  It also ends this crash, and it ends the "Return to Workflow" offered
  to recommend-only editors on OJS and OMP, but it leaves line 102
  wrong for a plugin's recommending decisions. It is worth doing as its
  own change; it does not replace this one.
- Flatten or filter the list in lib/pkp's map before the closure. It
  hides any app's malformed list instead of fixing the one that builds
  it.

**What goes with it**:

- No data repair. For the limited Moderator the read answers 200 with an
  empty `availableEditorialDecisions` instead of 500; nothing else in
  the API changes.
- Backport: on 3.5 the line is 89, and the same hunk applies there with
  that offset; only a plugin reaches the line on 3.5.
- Test: a U34 scenario in which a Moderator limited to recommendations
  opens a posted preprint, and a unit test of OPS's map with a
  recommend-only assignment at Done.

Small: one line in one app class, following its twins, tried.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/limited-moderator-posted-preprint-error/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/limited-moderator-posted-preprint-error/lib.js))
  takes steps 1–9 and the control on OPS, OJS and OMP, recording the
  submission's read, the "Error" window and what the workflow shows
  after it. Given `neighbour`, it walks instead the three OPS cases the
  fix must leave alone (Proposed fix); those were walked with the fix
  in and again with it out.
- The walks ran in Chromium on PostgreSQL, on PKP's default dataset
  (pkp/datasets f3c795a4, 2026-11-10) for `main` and 3.5. MySQL not
  checked (the failure is a PHP type error, not a query).
- 3.5 walked on all three apps: posted preprints stay in Production
  there, and the limited Moderator, Section editor and Series editor
  open them with no error and no decision offered. 3.5's OPS
  `getAvailableEditorialDecisions()` has no Done block and returns
  early for any stage but Production.
- Branch tips. `main`: OJS 99014b078f, OMP 8f51061e81, OPS 8f9b395427;
  pkp-lib e2078ce20e. 3.5: OJS 7cf6c9c60f, OMP 3f0fd0a7d1, OPS
  e290d8d8af; pkp-lib 5af8e67ab4. 3.4: OPS d406378b01; pkp-lib
  2dd24cc5ae. 3.3: OPS 5d75c52745; pkp-lib df738d3a66.
- Code reads. 3.4: no `getAvailableEditorialDecisions()` in OPS or
  lib/pkp; lib/pkp `pages/workflow/PKPWorkflowHandler.php` assigns the
  recommending list (`$decisions = …`), and there is no Done stage.
  3.3: `PKPWorkflowHandler.inc.php` builds decisions per stage, with no
  Done stage. The limited Preprint Server Manager: `AddParticipantForm`
  offers the limit for manager and sub-editor groups, and
  `checkDecisionPermissions()` and the Done block treat a limited
  manager assignment as they do a Moderator's.
- Introduced: `git blame` on line 102 gives 5af0af0b16 (2024-10-23), on
  lines 81–94 818b388ed4 (2026-06-25). The Done stage reached OPS's
  groups in 16bbd9b90e (`registry/userGroups.xml`, 2026-09-07) and
  pkp-lib 18f402e585 (the migration, 2026-09-01). The commits name the
  issues; the PR numbers are the ones GitHub lists for each commit.
  That the crash starts with `pkp/pkp-lib#13109` rather than
  `pkp/pkp-lib#12799` is a code read, not walked: between the two, the
  Done stage had no group rows, so the limited assignment was not seen
  as recommend-only at Done, and the Done block offered it "Return to
  Workflow" instead.
- Not walked: a plugin's recommending decisions, a limited Preprint
  Server Manager, a server whose Moderator role is set to recommend
  only, and pressing "Return to Workflow" as a recommend-only editor on
  OJS or OMP.

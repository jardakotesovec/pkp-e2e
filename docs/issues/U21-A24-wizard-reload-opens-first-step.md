# Submission wizard: a reload opens a draft on its first step with the later steps locked, and "Save for Later" there forgets the step reached

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code; only a reload on a step before the furthest one reached)
  - 3.3: none (code; the older tabbed wizard has no step in its address)
- **Introduced** `pkp/ui-library#286` for `pkp/pkp-lib#8919` · [7f13651e](https://github.com/pkp/ui-library/commit/7f13651e9137170ee513e98c61b2cf8127796168) · 2023-10-02 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-11-16)
- **Tracked in** spec U21 [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U21-submission-wizard.md#a24)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Inside the submission wizard the address bar ends in the open step, for
example "…#contributors". When an author reloads the page, or opens
such an address from a bookmark, the wizard opens on its first step
("Upload Files") instead of the step the address names, even when that
is the step the draft reached. Every later step in the step rail is
plain text that cannot be clicked.

If the author then presses "Save for Later", the draft records the
first step, and "Complete submission" on My Submissions reopens it
there from then on. The draft's files and fields are kept. The
browser's Back button, or "Continue" up to the step, gets the author
back, and a "Save for Later" from there records it again.

"Complete submission" opens the wizard without a step in its address,
so it reopens at the recorded step.

## Impact

- **Lost**: the step the draft had reached. A "Save for Later" after
  the reload overwrites it with the first step, without a word.
- **Who**: every author who reloads the wizard or comes back to it from
  a bookmark.
- **Way round**: the browser's Back button right after the reload
  reopens the step, its rail unlocked. "Continue" from the first step
  reopens each later step with what was entered, and a "Save for Later"
  there records the step again.

Low: nothing the draft holds is lost and the submission gets made; the
cost is clicks back to the step and a locked step rail.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, `publicknowledge`.
- Nothing else: the author makes the draft on screen.

Steps (OJS and OPS as `ccorino`, OMP as `aclark`):

1. Sign in as `ccorino`.
2. Open "Make a Submission" (`/index.php/publicknowledge/en/submission`),
   type the title "u21n16d reload", choose the "Articles" section (OJS),
   tick "Yes, my submission meets all of these requirements." and the
   privacy box, and press "Begin Submission". The wizard opens on
   "Upload Files" [3.5: on "Details", the first step there, with
   "Upload Files" second].
3. Press "Continue" twice. The wizard is on "Contributors" and the
   address ends in "#contributors".
4. Press "Save for Later". The "Saved for Later" screen shows.
5. Open My Submissions (`/index.php/publicknowledge/en/dashboard/mySubmissions`)
   and press "Complete submission" on the row "u21n16d reload". The
   wizard reopens on "Contributors", with the first three steps
   clickable in the step rail; the address ends in "#contributors".
6. Reload the page.
7. Press "Save for Later".
8. Open My Submissions again and press "Complete submission" on the row.

**Expected**: at step 6 the wizard reopens on "Contributors", the step
the address names and the draft recorded, with the earlier steps
clickable. Step 7 records "Contributors", and step 8 reopens there.

**Observed** (OJS, OMP and OPS alike): at step 6 the wizard opens on
"Make a Submission: Upload Files" [3.5: "Details"]. A new history entry
ending in "…#files" [3.5: "…#details"] is pushed over "…#contributors",
and "Details", "Contributors", "For the Editors" ("For Readers" on OPS)
and "Review" are plain text in the step rail [3.5: "Upload Files",
"Contributors", "For the Editors" and "Review"]. Step 7 records the
first step:

```
PUT /index.php/publicknowledge/api/v1/submissions/21/saveForLater   (sent as POST, X-Http-Method-Override: PUT)
step=files                                                          → 200
```

Step 4's request had carried `step=contributors`. At step 8 the wizard
reopens on "Upload Files" [3.5: "Details"] with every later step plain
text. No request failed and the page logged no script error.

## Cause

ui-library `src/components/Container/SubmissionWizardPage.vue`,
`created()` (lines 277 to 288), picks the step to open on load. With no
"#…" in the address it opens the step `submission.submissionProgress`
records. With any "#…" it opens `this.steps[0]` and leaves the hash to
`Page.vue`'s `mounted()`, which calls the wizard's `openUrlHash()` to
open the step the hash names.

Under Vue 3 that hand-over never happens. Opening `steps[0]` in
`created()` triggers the `currentStepIndex` watcher (lines 213 to 241),
and Vue 3 runs pre-flush watchers before the `mounted()` hooks (the
initial `render()` calls `flushPreFlushCbs()`, then
`flushPostFlushCbs()`). The watcher sees that the hash no longer names
the open step and pushes "#files" (`addHistory()`, a
`history.pushState()`). `openUrlHash()` then reads "#files" and opens
the first step again. The entry underneath still names
"#contributors", which is why Back recovers it.

It is a regression: 3c13810e (`pkp/pkp-lib#8743`, 2023-03) added this
hand-over for 3.4, on Vue 2, where watchers run on the next tick, after
`mounted()`, so `openUrlHash()` read the address's own hash first. The
Vue 3 migration left the lines alone and changed that order. The 3.4
behaviour rests on reading Vue 2's scheduler; 3.4 was not walked.

The step rail and "Save for Later" both rest on `startedSteps`, which
the same watcher fills with every step up to the one open, and only
with the steps opened since the page loaded. `saveForLater()` sends its
last entry (line 582), so after the reload it sends `files`, and
`PKPSubmissionController::saveForLater()` stores it as the draft's
`submissionProgress`. The step recorded before is never counted in.

Reach:

- OMP's and OPS's `SubmissionWizardPageOMP.vue` and
  `SubmissionWizardPageOPS.vue` extend the component and leave
  `created()`'s step choice alone: walked on screen.
- A reload on an earlier step than the furthest one reached (the author
  pressed the wizard's "Back" to "Details", then reloaded) forgets the
  later steps through `startedSteps` even where the hash's step opens.
  That part dates from the wizard's first version and is on 3.4 too:
  checked in the code.
- No other component hits the same ordering: the invitation wizards
  (`UserInvitationPageStore.js`, `AcceptInvitationPageStore.js`) record
  no step and open their first step on every load, the decision pages
  keep no step in the address, and `Tabs.vue` writes its hash on a
  100 ms debounce, after `mounted()`: checked in the code.
- Stored data: the value is a resume position only, so nothing needs
  repair.

## Proposed fix

Recommended: let `created()` settle the step itself, from the hash
first and the recorded step otherwise, and count every step up to the
recorded one as started whichever step opens
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-reload-opens-first-step/fix.diff),
paths from the app root; inside a ui-library clone apply it with `-p3`):

```diff
-		if (!window.location.hash) {
-			const newStep = this.steps.find(
-				(step) => step.id === this.submission.submissionProgress,
-			);
-			this.openStep(newStep ? newStep.id : this.steps[0].id);
-		} else {
-			this.openStep(this.steps[0].id);
-		}
+		const progressIndex = this.steps.findIndex(
+			(step) => step.id === this.submission.submissionProgress,
+		);
+		this.steps.forEach((step, i) => {
+			if (i <= progressIndex) {
+				this.startedSteps.push(step.id);
+			}
+		});
+
+		const hashStepId = window.location.hash.replace('#', '');
+		const newStep =
+			this.steps.find((step) => hashStepId && step.id === hashStepId) ||
+			this.steps[progressIndex];
+		this.openStep(newStep ? newStep.id : this.steps[0].id);
```

The hash lookup is the one `openUrlHash()` already does. With the step
opened in `created()`, the watcher finds the hash naming the open step
and leaves it, and `openUrlHash()` opens the same step again, a no-op.
Seeding `startedSteps` from `submissionProgress` makes "Save for Later"
send the furthest step reached. A draft never saved for later
(`submissionProgress` is `start`) seeds nothing.

Tried on `main` in OJS, OMP and OPS. With the fix, the reload at step 6
reopened "Contributors" with the earlier steps clickable, step 7 sent
`step=contributors`, and step 8 reopened there. A bookmark of the
draft's address with "#details" opened "Details" with "Contributors"
still clickable, and its "Save for Later" kept `contributors`. A draft
moved to "Contributors" with "Continue" but never saved for later
reopened from "Complete submission" on "Upload Files", and a reload
made while on "Upload Files" stayed there with every later step locked,
with the fix in and out alike.

**Alternatives**:

- Clamp the hash's step to the recorded one: safer against skipping
  steps, but `onhashchange` does not clamp, so a reload would disagree
  with a hash edit on the open wizard.
- Make the watcher skip `addHistory()` on the first run: keeps the
  hand-over to `mounted()` working, but leaves the step choice split
  across two hooks and the progress loss in place.

**What goes with it**:

- A reload or bookmark naming a step further than the recorded one
  opens that step, as a hash edit does now, and the submission check
  runs when that step is "Review". No REST API, hook or stored value
  changes.
- The diff applies as written to `stable-3_5_0`'s ui-library (the same
  lines, at an offset). No 3.4 hunk is offered: there only the
  `startedSteps` part would apply, and 3.4 was read in the code only.
- A test: OJS's existing wizard test,
  `cypress/tests/integration/SubmissionWizard.cy.js`, saving
  for later on "Contributors", reloading, saving again and checking the
  reopened step (ui-library has no component tests for this page).

Small: one method in one shared component, and a test.

## Evidence

- Kept walk:
  [shared/playwright/checks/issues/wizard-reload-opens-first-step/walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-reload-opens-first-step/walk.js)
  with its `lib.js`, on an install freshly loaded from the default
  dataset (pkp/datasets 961a9871, 2026-11-15):
  `node bin/probe.js all shared/playwright/checks/issues/wizard-reload-opens-first-step/walk.js`
  (`AFTER=bookmark`, `MODE=neighbour` and `MODE=wayround` in front for
  the bookmark, the never-saved draft and the two ways round).
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, PHP 8.3 and
  PostgreSQL; the database plays no part (a client-side step choice).
  The ways round (Back after the reload; a second reload, "Continue"
  twice, "Save for Later", "Complete submission" reopening
  "Contributors") were walked on `main`.
- Tips: `main` OJS 925ed49f3b, OMP 92dd31031, OPS d75f514776 (2026-11-14),
  pkp-lib 3ed5d1c3b3, ui-library 836c01b5; `stable-3_5_0` OJS 6cfc46e6fc
  (pkp-lib bb17ba1380), OMP 3f0fd0a7d and OPS e290d8d8af (pkp-lib
  5af8e67ab4), ui-library fd00e45f; `stable-3_4_0` OJS 61835656a2, OMP
  98db039f2, OPS d406378b01, pkp-lib 2dd24cc5ae, ui-library ee684b34.
- Code read, `main` and 3.5: the methods the Cause names, Vue 3.5.22's
  `render()` in `@vue/runtime-core`, and
  `PKPSubmissionHandler::getSteps()` (3.5: Details first).
- Code read, 3.4: ui-library `stable-3_4_0` carries the same
  `created()`, watcher and `saveForLater()`, on Vue 2.6.
- Code read, 3.3: pkp-lib `stable-3_3_0`
  `templates/submission/form/index.tpl` opens the tab
  `submissionProgress` names on every load.
- Introduced: `git blame` on `created()`'s `else` branch, past a lint
  reformat, gives 3c13810e (Nate Wright), which added the branch and
  moved `openUrlHash()` into `Page.vue`'s `mounted()`; 7f13651e changed
  when the watcher runs. The `startedSteps` part dates from 467034aa
  (`pkp/pkp-lib#7191`).
- Unverified: the 3.4 behaviour, read in the code only. A bookmark load
  without the fix was not walked today; it is the same full page load
  as the reload.

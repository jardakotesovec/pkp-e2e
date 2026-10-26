# A reader's comment report the server refuses closes the "Report Comment" window and loses the typed reason

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS
  - ore: OJS (code; no "Error" window either, as `pkp/ui-library#1024` is not on `ore`)
  - 3.5: none (code; no reader comments)
  - 3.4: none (code; no reader comments)
  - 3.3: none (code; no reader comments)
- **Introduced** `pkp/ui-library#702` for `pkp/pkp-lib#11327` · [9e613aad0b](https://github.com/pkp/ui-library/commit/9e613aad0bde8e64947de81706a0c38c86609eba) · 2025-09-16 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-10-26)
- **Tracked in** spec U14 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U14-reader-comments-and-moderation.md#a14)
- **Checked** 2026-10-26, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A signed-in reader reports a comment under an article ("…" › "Report",
a reason typed, "Submit") and the server refuses the report. An "Error"
window opens with the server's message, and the "Report Comment" window
under it closes at the same moment, taking the typed reason with it.

The report is refused when the reader's session has ended since the
page loaded (logged out in another tab, a week idle, or an address
change), when the comment was hidden or deleted meanwhile, when public
comments were switched off, and on a server error or a lost connection.
After an ended session the message asks the reader to reload the page,
and the reason is already gone. After a hidden comment the comment
stays listed with "Report", and every new try is refused the same way.

Reader comments are new in OJS 3.6: they run on `main` and on the `ore`
branch the ORE project runs in production, and no 3.x release has them.
OMP and OPS have no reader comments.

## Impact

- **Lost**: the reason the reader typed, a sentence or a paragraph; no
  report reaches the moderators.
- **Who**: a signed-in reader reporting a comment, only when one of the
  failures above happens between opening the page and pressing
  "Submit". The ended session is the likeliest of them.
- **Way round**: reload, open "Report" again and retype the reason (or
  copy it before pressing "Submit"). Nothing piles up over time.

Low: the reader is told the report failed and loses only typed text,
and the failures that cause it are uncommon in ordinary use. It would
be medium if readers often lost their session mid-page, for example on
networks that change their address while `session_check_ip` is On (the
default); how often that happens was not measured.

## Steps to reproduce

Preconditions:

- The default dataset, OJS `main`.
- Public comments on: sign in as `dbarnes`, open the back office's
  Settings › Website, its "Content" tab, side tab "Comments"; tick
  "Enable Public Comments", "Save".
- An approved comment by another reader: sign in as `ckwantes`, open
  "Antimicrobial, heavy metal resistance and plasmid profile of coliforms
  isolated from nosocomial infections in a hospital in Isfahan, Iran"
  (article 17), type "hkq26d comment by ckwantes" in the comment box,
  "Submit". Then as `dbarnes`, open the back office's side-menu entry
  "Content" › "Comments" (the moderation page, shown once comments are
  on), and on the comment's row "…" › "View Comment" › "Approve
  Comment".

The session ends (one browser, two tabs):

1. Sign in as `lchristopher` and open article 17's page.
2. On ckwantes's comment press "…" › "Report", and type "hkq26d reason:
   off-topic advertising" in "Please tell us why you want to report this
   comment".
3. In a second tab of the same browser, choose "Logout" in the user
   menu.
4. Back in the first tab, without reloading, press "Submit", then "OK"
   on the "Error" window.

**Expected**: the "Error" window opens over "Report Comment", which
keeps the typed reason, so the reader can copy it before reloading as
the message asks.

**Observed**:

```
POST /index.php/publicknowledge/api/v1/comments/1/reports → 403
{"error":"The form could not be submitted. You may have been logged out. Please reload the page and try again."}
```

The page holds one window, "Error" with that message and "OK";
"Report Comment" is gone, and after "OK" nothing is left of the reason.

The comment is hidden meanwhile (two browsers, or a normal and a
private window):

1. Window A: sign in as `lchristopher`, open article 17's page, press
   "…" › "Report" on ckwantes's comment and type the reason as above.
2. Window B: sign in as `dbarnes`, open the side-menu entry "Content" ›
   "Comments", and on the comment's row "…" › "View Comment" › "Hide
   Comment".
3. Window A, without reloading: press "Submit", then "OK" on the "Error"
   window, then "…" › "Report" on the same comment again.

**Expected**: the "Error" window, then the comment leaves the list,
since it can no longer be reported.

**Observed**: `POST …/comments/1/reports → 404`
`{"error":"The requested resource was not found."}`; one "Error" window,
"The requested resource was not found."; "Report Comment" is gone. The
comment is still listed, and "Report" opens "Report Comment" with an
empty reason box; a new "Submit" is refused again.

## Cause

The "Submit" action of the "Report Comment" window closes it whatever
the report request answered. In ui-library
`src/frontend/components/PkpComments/usePkpCommentsStore.js`,
`commentReport()` gives the dialog this callback:

```js
callback: async (close) => {
	if (reportText.value.trim() === '') {
		return;
	}
	await performCommentReport(publicationId, comment, reportText.value);
	close();
},
```

`performCommentReport()` posts `comments/{id}/reports` through the
frontend `usePkpFetch()`. On a failed POST, `usePkpFetch()` opens the
"Error" window (`openDialogNetworkError(e)`, with the server's message)
on top and returns normally. `performCommentReport()` returns nothing,
so the callback cannot tell a refused report from an accepted one, and
its `close()`, bound to the report window, closes it. The next "Report"
starts from an empty box, since `commentReport()` sets `reportText` to
`''`. Nothing drops a comment the server no longer lets the reader
report, so it stays listed.

The callback's unconditional `close()` came with the frontend comments
in `pkp/ui-library#702`. Until `pkp/ui-library#992` (the Crossref
cited-by change, [280f98c5](https://github.com/pkp/ui-library/commit/280f98c5703024a8de7694642dfa860eaa293e1a),
2026-09-29), the `close()` was never reached on a failure: the frontend
`usePkpFetch()` called `openModalNetworkError()`, which the frontend
modal store does not have, so a failed request threw out of the
callback and the report window stayed open with no message. #992
renamed the call to `openDialogNetworkError()`. From then on, a
`closeTopDialog()` at the end of `performCommentReport()` closed the
new "Error" window and the callback's `close()` closed the report
window, so the reader saw nothing at all. `pkp/ui-library#1024`
([c8cbb2b4](https://github.com/pkp/ui-library/commit/c8cbb2b4c154d39ff20f3a4e63b00b1672b65134),
for `pkp/pkp-lib#13539`) removed that `closeTopDialog()`. The "Error"
window now stays and shows the server's message, and the reason is
still lost.

Which failures reach this path, from pkp-lib
`api/v1/comments/UserCommentController.php`:

- An ended session or a refused CSRF token: 403 (walked, by logging out
  in another tab). The same follows a session past `session_lifetime`
  (7 days idle by default) or one `PKPAuthenticateSession` logs out
  because the address changed while `session_check_ip` is On (code).
- A comment hidden or deleted meanwhile: 404 from
  `AddReport::passedValidation()` or `submitReport()` (walked).
- Public comments switched off meanwhile: `authorize()` refuses (code).
- A server error or a lost connection: `usePkpFetch()` takes the same
  path (code).

Reach:

- The new-comment box already keeps its text: `addComment()` clears
  `commentText` only when `isSuccess` is true (code).
- The "Delete Comment" window on one's own comment also closes on a
  failure, but by its own code: it passes `onError: () => true` and then
  calls `openDialogNetworkError()` itself, without the error, so its
  "Error" window shows the generic "An unexpected error has occurred.
  Please reload the page and try again." instead of the server's
  message. It holds nothing typed, so nothing is lost (code).
- No other reader-side window takes typed text: only the report window
  and the citation window use `bodyComponent` (code).
- OMP and OPS ship the same store but offer no comments on their
  landing pages.

## Proposed fix

Have `performCommentReport()` say how the report ended, and let the
callback act on it ([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/refused-comment-report-loses-reason/fix.diff)):

- **Reported**: close the window, as today.
- **Gone** (a 404: the comment was hidden or deleted, or is no longer
  approved): drop the comment from the list, the way `commentDelete()`
  filters `versionState.comments`, and close the window. A retry could
  never pass, and the reason has nothing left to report.
- **Failed** (any other answer: an ended session, a refused CSRF token,
  comments switched off, a server error, a lost connection): keep the
  window and the typed reason under the "Error" window, as `addComment()`
  keeps the comment text. The reader can retry after a passing failure,
  or copy the reason before reloading as the message asks, then
  "Cancel".

```diff
-						await performCommentReport(
+						const result = await performCommentReport(
 							publicationId,
 							comment,
 							reportText.value,
 						);
-						close();
+						if (result !== 'failed') {
+							close();
+						}
 …
+		let errorStatus = null;
 		const {fetch: postReport, isSuccess} = usePkpFetch(apiUrl, {
 			method: 'POST',
 			body: {
 				note: reportText,
 			},
+			onError: (e) => {
+				errorStatus = e?.status ?? null;
+			},
 		});
 …
+			return 'reported';
 		}
+
+		if (errorStatus === 404) {
+			versionState.comments = versionState.comments.filter(
+				(c) => c.id !== commentId,
+			);
+			return 'gone';
+		}
+
+		return 'failed';
```

`onError` returns nothing, so `usePkpFetch()` still opens its "Error"
window with the server's message. This also covers the ruling under
the register entry, that keeping the typed reason on a failure is
handled separately: the reason is kept only where it can still be
used.

Tried on OJS `main`. In the hidden-comment steps the "Error" window
opened, then the comment left the list and no window stayed open.
In the ended-session steps the "Error" window opened over "Report
Comment", and after "OK" the window was still open with the typed
reason. An accepted report and "Cancel" still closed the window,
with the fix in and out.

**Alternatives**:

- Keep the window open on every failure, 404 included: the reader can
  press "Submit" on a hidden comment again and again and be refused
  each time.
- Keep `reportText` instead of clearing it when "Report" opens again:
  the window still closes under the reader, and the reason would carry
  over to the next comment they report.
- Close on success with `closeTopDialog()`, as before
  `pkp/ui-library#1024`: that call closes whichever window is on top,
  which on a failure is the "Error" window, while the callback's
  `close()` is tied to the report window.

**What goes with it**:

- A test: a refused report keeps "Report Comment" open with the reason,
  and a 404 drops the comment (a Vitest of the store with the fetch
  mocked, or the U14 e2e scenario's Planned item).
- A clearer 404 message ("This comment is no longer available") would
  need a pkp-lib locale key; the generic one is kept here.
- No data repair and no API change; the ui-library pointer moves in each
  app. On `ore` the diff applies after `pkp/ui-library#1024` is ported.

Small: one function in one file, following `addComment()` and
`commentDelete()`, and a test.

## Evidence

- Kept script: `shared/playwright/checks/issues/refused-comment-report-loses-reason/walk.js`
  (helpers in `lib.js` beside it), on OJS's default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs <script>`
  takes the hidden-comment steps; `MODE=session` in front takes the
  ended-session steps; `MODE=nb` runs the neighbour check alone (an
  accepted report and "Cancel" each close the window). For step 3 of
  the ended-session steps the script opens the sign-out address in a
  second tab, which is where the user menu's "Logout" leads.
- Walked 2026-10-26 on main, PostgreSQL: ojs `d054e2660d`, lib/pkp
  `800863b5dc`, lib/ui-library `1f9fb95e`, each walk on an install
  freshly reset to the default dataset (datasets `d1d235a7`). Observed
  as written; the server log held no error line for either answer.
- Fix trial (`node bin/try-fix.js apply <fix.diff> ojs`, which rebuilds
  the frontend bundle; the walks on a fresh reset): hidden comment, 404,
  "Error", then no window and the comment no longer listed;
  ended session, 403, "Error", then "Report Comment" open with "hkq26d
  reason: off-topic advertising". `MODE=nb` with the fix in and after the revert: the
  report answered 200 and no window stayed open; "Cancel" left none. A
  first version of the fix (close only on success) was tried before
  this one and kept the window open on the 404 too.
- Code reads: main ui-library `usePkpCommentsStore.js`
  (`commentReport()`, `performCommentReport()`, `addComment()`,
  `commentDelete()`), `src/frontend/composables/usePkpFetch.js`,
  `src/frontend/stores/pkpModalStore.js`; pkp-lib
  `UserCommentController.php` (`getGroupRoutes()`, `authorize()`,
  `submitReport()`), `formRequests/AddReport.php`,
  `classes/middleware/PKPAuthenticateSession.php`, and
  `config.TEMPLATE.inc.php` (`session_lifetime`, `session_check_ip`).
  Introduced: `git blame` on the callback's `close()` lands on
  `9e613aad0b` (squash of `pkp/ui-library#702`); `280f98c5^` shows the
  frontend `usePkpFetch()` calling `openModalNetworkError()`, which
  `src/frontend/composables/usePkpModal.js` does not define.
- ore (ojs `b6b4249a66`, ui-library `5ddd525f`, pkp-lib `6d2e143ee0`):
  `performCommentReport()` still ends in `closeTopDialog()` and the
  callback in `close()`; #992 is in, #1024 is not; `AddReport.php`
  answers the same 404. Not walked.
- 3.5 (ui-library `a12b7523`, lib/pkp `0f3c36bc2f`), 3.4 (ui-library
  `ee684b34`, lib/pkp `83e78a85e5`) and 3.3 (ui-library `96959f9e`,
  lib/pkp `93722c9179`): no `src/frontend/components/PkpComments/` and
  no `api/v1/comments/`.
- Not walked: the failures marked "(code)" in the Cause; the
  new-comment box keeping its text.
- Tracker searches (pkp/pkp-lib, pkp/ui-library, pkp/ojs; "report
  comment", "Report Comment", `performCommentReport`):
  `pkp/pkp-lib#13539` and `pkp/ui-library#1024` cover showing the error
  only.

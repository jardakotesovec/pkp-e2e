# On the submissions dashboard a screen reader hears "Loaded" before the list arrives, and nothing on a reload

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; the submissions list announces no "Loaded")
  - 3.3: none (code; the submissions list announces no "Loaded")
- **Introduced** pushed to `main` without a PR, for `pkp/pkp-lib#11136` · [04240fe0](https://github.com/pkp/ui-library/commit/04240fe03dfe087da2ada99ca745ceafb9a085cb) · 2025-03-20 · Jarda Kotěšovec (jardakotesovec); the silent reload, also without a PR, for `pkp/pkp-lib#11182` · [9efb84c0](https://github.com/pkp/ui-library/commit/9efb84c02fce11488ece5bfe5b2648f3d29954dd) · 2025-03-27 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-11-16)
- **Tracked in** spec U23 [A19](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U23-submissions-dashboard.md#a19)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A screen-reader user expects to hear "Loaded" once the list's rows are
on screen. After a search, a sort or a view chosen in the sidebar, the
page says "Loaded" the moment it asks for the new list, before the rows
arrive, so the user is told the list is ready while it is still
loading.

When the page opens at an address that already names its view, as every
reload and every bookmarked view does, nothing is said once the list
arrives. Of the ways to open the page, only the address with no view,
where signing in lands, gets "Loaded", and there too before the rows.

The same holds for an author's and a reviewer's lists, which are built
on the same page.

## Impact

- **Lost**: no data. Until the rows arrive, the table still shows the
  previous list's rows under the new view's name, with the previous
  count, so a user who reads on after "Loaded" reads the old list as
  the new one.
- **Who**: screen-reader users of the editorial dashboard, "My
  Submissions as Author" and "My Assignments as Reviewer", at each
  search, sort, change of view and reload.
- **Way round**: none that tells them when the list is in. The
  heading's spinner is hidden from screen readers, and after a sort, or
  a search that keeps the count, the heading reads the same before and
  after. They can only wait a moment and read again.

Low: the list does arrive, within about a second on the test installs
even on "Slow 4G", so what is read too early is soon right. A journal whose
list takes several seconds to answer would raise it to medium; none was
measured.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (or `stable-3_5_0`), context
  `publicknowledge`, in OJS, OMP or OPS. `dbarnes` is assigned to 17 of
  the journal's submissions, 4 of the press's and none of the server's,
  so the old rows of step 4 show in OJS and OMP; in OPS the old "No
  Items" shows instead.
- Chrome with its developer tools open. The screen-reader region is the
  `<div id="announcer">` without an `aria-atomic` attribute (the page
  holds two elements with that id; the other stays empty). What it holds
  is what a screen reader speaks.

Steps:

1. Open the login page and sign in as `dbarnes` (password
   `dbarnesdbarnes`). The dashboard opens on "Assigned to me".
2. In the developer tools' "Network" tab, set throttling to "Slow 4G".
3. In the "Console", run this, which logs each change of the region and
   each list request, in milliseconds since the page opened:

   ```js
   const region = document.querySelector('[id="announcer"]:not([aria-atomic])');
   new MutationObserver(() => console.log(Math.round(performance.now()), 'region:', region.textContent))
     .observe(region, {childList: true, characterData: true, subtree: true});
   new PerformanceObserver((list) => list.getEntries()
     .filter((e) => /\/_submissions(\/[\w-]+)?\?/.test(e.name) && !e.name.includes('viewsCount'))
     .forEach((e) => console.log(Math.round(e.startTime), 'list request sent,', Math.round(e.responseEnd), 'answered')))
     .observe({type: 'resource'});
   ```

4. In the sidebar, choose "Published".
5. In the box above the list ("Search submissions, ID, authors, keywords,
   etc."), type `a` and press Enter.
6. Click the "ID" column header.
7. Set throttling back to "No throttling" and reload the page, whose
   address now names the view (`…/dashboard/editorial?currentViewId=published&…`).
   Wait three seconds after the list is on screen.

**Expected**: at steps 4, 5 and 6 the region reads "Loading" while the
list is fetched and "Loaded" once its rows are on screen, as it should
after signing in (step 1). At step 7 it reads "Loaded" once the list is
on screen.

**Observed**: at steps 4, 5 and 6 the console logs "region: Loading"
and "region: Loaded" within 2 ms. The list request is sent 3 to 17 ms
later and answered 0.7 to 1.0 s after that, with no further change of the
region. At step 4, while "Loaded" stands, the heading reads "Published
(17)" over the "Assigned to me" rows in OJS ("Published (4)" in OMP,
and "Published (0)" over "No Items" in OPS). At step 7 the region stays
empty, its `aria-live` attribute empty too. Watched from page load,
which the snippet cannot be, signing in does the same: "Loaded" 7 to 12 ms
before the list request is sent.

## Cause

`lib/ui-library/src/pages/dashboard/dashboardPageStore.js` is the store
behind the editorial dashboard, "My Submissions as Author" and "My
Assignments as Reviewer". The list is fetched by `useFetchPaginated`'s
`fetch`, which is debounced by 2 ms and returns a promise that settles
once the request has answered. The store wraps it in
`fetchSubmissions()`, which calls it and drops that promise:

```js
function fetchSubmissions(updateViewCount = true) {
	_fetchSubmissions();
	if (updateViewCount) {
		appStore.triggerReloadViewsCount(dashboardPage);
	}
}
```

The only place that announces is the `watch` on the list's address,
query and page:

```js
announce(t('common.loading'));

await fetchSubmissions({clearData: true});
announce(t('common.loaded'));
```

The `await` waits for `undefined`, one microtask, so "Loaded" follows
"Loading" at once, before the 2 ms debounce has even sent the request.
The wrapper came with 04240fe0 (`pkp/pkp-lib#11136`, reload the
sidebar's counts with every fetch). Before it, the watch awaited
`useFetchPaginated`'s own promise.

A week later 9efb84c0 (`pkp/pkp-lib#11182`, stop the first fetch from
reloading the counts the sidebar loads itself) switched the watch from
`immediate: true` to `immediate: false` and added a bare
`fetchSubmissions(false)` at setup, outside the watch. So the first list
of the page is never announced. On an address with no `currentViewId`,
the `currentViewId` computed writes the first view's id into the
address. That fires the watch, which is the only reason signing in
still hears "Loaded". An address that names its view fires nothing.

The announcement was on time only on development code, from its arrival
in 2024 to 04240fe0. Every 3.5 release, `3_5_0rc2` (2025-03-20) on,
carries 04240fe0, and 3.4 and older announce nothing, so no release
ever announced on time.

The reach:

- The same call passes `{clearData: true}`, which since 9efb84c0 lands in
  `updateViewCount` and never reaches the fetch. So the previous rows
  are not cleared while the new list loads, against
  `pkp/pkp-lib#10663` (55bdd6e3, "Hide submissions on dashboard when
  loading different view/page/..."). The heading reads
  `store.submissionsPagination.itemCount`, the previous answer's
  `itemsMax`, so it names the new view with the old count.
- `refetchCallback()`, passed to the reviewer, participant and file
  actions, and the workflow window's `onClose` also await
  `fetchSubmissions()`, and get nothing to wait for. On `main`, when the
  workflow window closes with its data changed, `modalStore`'s
  `closeSideModalById()` shows a full-screen spinner until `onClose`
  returns (1afd40a9, `main` only). Because `onClose` returns at once,
  the spinner goes before the table has reloaded (code, not driven).
- `UserAccessManagerStore` and `UserInvitationManagerStore`, the other
  stores that announce a list's loading, await `useFetchPaginated`'s
  `fetch` directly in an `immediate: true` watch, and announce after the
  answer (code).

## Proposed fix

In `dashboardPageStore.js`, let `fetchSubmissions()` return the fetch's
promise. Then announce from one function that both the watch and the
first fetch call, and that says "Loaded" only for the latest load
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/dashboard-loaded-announced-before-list/fix.diff),
paths from the app root: `git apply -p3` in a ui-library clone):

```diff
 		function fetchSubmissions(updateViewCount = true) {
-			_fetchSubmissions();
+			const fetched = _fetchSubmissions();
 			if (updateViewCount) {
 				appStore.triggerReloadViewsCount(dashboardPage);
 			}
+			return fetched;
+		}
+
+		// Loads the list and tells screen readers when it starts and once its rows are in.
+		// A load can be cut short by a newer one (debounced or aborted), so only the latest says "Loaded".
+		let latestLoad = 0;
+		async function loadSubmissions(updateViewCount = true) {
+			const load = ++latestLoad;
+			announce(t('common.loading'));
+			await fetchSubmissions(updateViewCount);
+			if (load === latestLoad) {
+				announce(t('common.loaded'));
+			}
 		}
…
-				announce(t('common.loading'));
-
-				await fetchSubmissions({clearData: true});
-				announce(t('common.loaded'));
+				await loadSubmissions();
…
-		fetchSubmissions(false);
+		loadSubmissions(false);
```

The latest-load check is needed because an older load's `await` ends as
soon as a newer load replaces it, before any rows arrive: the debounce
resolves a cancelled call with `undefined` (`@vueuse/core` 10), and
`useFetch` returns early from an aborted request. On an address with no
view, the first load and the watch both start within 2 ms. Without the
check, the first would say "Loaded" too early, and the second "Loaded",
the same text, would change nothing in the region (reasoned from the
code). The first load keeps `updateViewCount` false, as 9efb84c0
intended.

Tried on `main` in OJS, OMP and OPS. With the fix in, every step's
"Loaded" came after the list's answer, with the new rows and count on
screen, and the reload said "Loading" and then "Loaded". Opening the
dashboard and choosing a view sent the same list and count requests
with the fix as without it.

**Alternatives**:

- An `immediate: true` watch, as the sibling stores have, would reload
  the sidebar's counts on page open again. Avoiding that needs a
  first-run flag, no simpler than `latestLoad`.
- A `watch` on `isSubmissionsLoading` breaks on an aborted request:
  `useFetch`'s `finally` sets `isLoading` to false while the newer
  request is still running.

**What goes with it**:

- Restoring `{clearData: true}` (`pkp/pkp-lib#10663`) by passing the
  option on through `fetchSubmissions()` is left out of the diff: it
  changes what everyone sees during a load, a separate choice.
- With the promise returned, the workflow window's full-screen spinner
  on `main` stays up until the table has reloaded, as 1afd40a9 meant.
  Not walked.
- Backport: the diff applies to `stable-3_5_0` as written, with an
  offset. 3.5 has no full-screen spinner on close.
- Guard: a vitest test for the store with a delayed fetch, checking that
  "Loaded" comes after the answer and once per page open, or an e2e
  check of the region after a view change and a reload (a Planned item
  in the spec).

## Evidence

- Kept script:
  `shared/playwright/checks/issues/dashboard-loaded-announced-before-list/walk.js`
  (helpers in `lib.js`), on an install loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/dashboard-loaded-announced-before-list/walk.js`.
  It watches the region from page load, runs step 3's snippet as
  written, and sets "Slow 4G" through the Chrome DevTools protocol
  (562.5 ms latency, 1440/675 kbit/s). Throttling from before sign-in
  was dropped: `main`'s unminified OJS bundle (7.6 MB) gave no dashboard
  within a minute.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, on pkp/datasets
  961a9871 (2026-11-15), PostgreSQL, PHP 8.3. The times in Observed are
  from `main`; 3.5 showed the same at every step. No request failed and
  no script error was logged.
- Code reads: `dashboardPageStore.js`, `DashboardPage.vue`,
  `useFetchPaginated.js`, `useFetch.js`, `announcerStore.js`,
  `Announcer.vue`, `Spinner.vue`, `modalStore.js`,
  `UserAccessManagerStore.js` and `UserInvitationManagerStore.js` at
  ui-library `main` 836c01b5 (the same in the three apps) and
  `stable-3_5_0` fd00e45f, where the store has the same three spots from
  the backports 2ba1758c and c360b4f7. `lib/pkp/templates/layouts/backend.tpl`
  mounts both announcers, `<vue-announcer>` (@vue-a11y/announcer) and
  `<pkp-announcer>`. The 3.5 tags were read for which carry 2ba1758c.
- 3.4 and 3.3 (code): ui-library `origin/stable-3_4_0` ee684b34 and
  `origin/stable-3_3_0` 96959f9e have no announcer and no dashboard
  store; `SubmissionsListPanel.vue` and `mixins/fetch.js` show a spinner
  and announce nothing. lib/pkp 2dd24cc5ae and df738d3a66:
  `backend.tpl` mounts no announcer.
- Introduced: `git blame` on `fetchSubmissions()` and on the `watch`
  gives 04240fe0 (the wrapper, which passed its arguments on but
  returned nothing) and 9efb84c0 (`immediate: false`, the bare first
  fetch, the arguments dropped). `pkp/pkp-lib#7206` (open, "Add announcer
  to UI Library for accessible status updates") is the feature request
  behind the announcer, not this fault.
- Tips: `main`: OJS 925ed49f3b, OMP 92dd31031, OPS d75f514776, lib/pkp
  3ed5d1c3b3, ui-library 836c01b5 (2026-11-14). `stable-3_5_0`: OJS
  6cfc46e6fc (lib/pkp bb17ba1380), OMP 3f0fd0a7d and OPS e290d8d8af
  (lib/pkp 5af8e67ab4), ui-library fd00e45f. 3.4 app 61835656a2, 3.3
  b83fb9e44d.
- Unverified: what NVDA, JAWS or VoiceOver speak; the walk reads the
  region, not a screen reader. The region's `aria-live` is empty until
  the first announcement, so with the fix a page open sets it and
  "Loading" at once; whether that "Loading" is spoken, or needs
  `announcerStore` to start at `'polite'`, is open. Authors' and
  reviewers' lists and the workflow window's spinner were read in the
  code, not driven.

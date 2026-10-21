# On a journal, press or server with a "Forms" language other than the page's language, the signed-in name on the public pages loses its task count

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (released in 3.5.0-0 to 3.5.0-5)
  - 3.4: OJS, OMP, OPS (code; released in 3.4.0-10 and 3.4.0-11)
  - 3.3: none (code)
- **Introduced** a direct commit for `pkp/pkp-lib#11496` · [7c715e2](https://github.com/pkp/pkp-lib/commit/7c715e20fa1752b2d1677f427881afd04ad11a8f) (3.5: [53a0d61](https://github.com/pkp/pkp-lib/commit/53a0d61715a8ebf6a21dec58184ecb14be069a9e), 3.4: [19f8ffb](https://github.com/pkp/pkp-lib/commit/19f8ffbede21b12bf6fc47b84c29938a02fa4087)) · 2025-06-11 · Alec Smecher (asmecher)
- **Upstream** none found (2026-10-21)
- **Tracked in** U05 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a15)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On the public pages of a journal, press or preprint server, a signed-in
user's name in the header normally carries their number of unread tasks
("dbarnes 2"). The number goes missing whenever one of the "Forms"
languages differs from the language the page is read in. The "Forms"
languages are ticked in Settings › Website › "Setup" › "Languages", the
same place in all three apps.

That covers every journal with two "Forms" languages, whichever language
the page is read in. It also covers a journal whose only "Forms" language
is English when a user reads its pages in French.

The users who lose the number are the ones who normally have it: managers
and editors, the assistant-level roles, Reviewers and Authors. In a
desktop-width window the public pages then show the number nowhere. The
"Tasks" button on the editorial pages still counts the tasks.

## Impact

- **Lost**: the only sign of new tasks on the public pages, the number
  beside the user's name. The tasks themselves, and the count in the back
  office, are untouched.
- **Who**: the roles that get the number: the manager and editor roles
  (on a journal the Journal Manager, Journal editor and Production
  editor), the assistant-level roles (Copyeditor, Layout Editor,
  Proofreader and the like), Reviewers and Authors. It happens on every
  public page of a site set up as the Summary says. Section Editors
  (Series editors on a press, Moderators on a server) are not affected.
  They never get the number on the public pages, because their role is
  not on the list of roles that get it
  ([pkp-e2e#634](https://github.com/jardakotesovec/pkp-e2e/issues/634)).
- **Way round**: the "Tasks" button on the editorial pages has the same
  count. In a window narrower than 992 px, the menu under the name shows
  it on its "Dashboard" entry ("Dashboard 2").

Low: only a convenience cue on the public pages is lost, and the same
count is one click away in the back office.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS; OMP and OPS the same, with
  press or preprint server for journal). Its journal `publicknowledge`
  has English and French ticked under "Forms" in Settings › Website ›
  "Setup" › "Languages" ("Website Languages"), and French under "UI".
- A browser window 992 px wide or wider.

On the default dataset:

1. Open `…/index.php/publicknowledge/en/login` and sign in as `dbarnes`.
   The dashboard opens.
2. Note the number on the "Tasks" button in the header: "Tasks 2" on OJS,
   "Tasks 13" on OMP, and "Tasks" with no number, meaning 0, on OPS.
3. Open the journal's home page, `…/index.php/publicknowledge/en`.
4. Look at the name at the top right of the header.

**Expected**: the name followed by the number on the "Tasks" button:
"dbarnes 2" on OJS, "dbarnes 13" on OMP, "dbarnes 0" on OPS.

**Observed**: "dbarnes" alone. The name link's markup is the bare
username, with no `<span class="task_count">`. The only count on the page
sits under "Dashboard" in the menu below the name, which a window this
wide does not display.

With French unticked under "Forms":

5. Open Settings › Website › "Setup" › "Languages" and untick French in
   the "Forms" column of "Website Languages". It saves at once.
6. Open the journal's home page again, `…/index.php/publicknowledge/en`.
   The name now carries the number ("dbarnes 2" on OJS).
7. Open the journal's home page in French,
   `…/index.php/publicknowledge/fr_CA`.

**Expected**: the name with the number, as in step 6: "dbarnes 2" on
OJS, "dbarnes 13" on OMP, "dbarnes 0" on OPS.

**Observed**: "dbarnes" alone again.

## Cause

`PKPNavigationMenuService::setAllNMILocalizedTitles()`
([`lib/pkp/classes/services/PKPNavigationMenuService.php`](https://github.com/pkp/pkp-lib/blob/main/classes/services/PKPNavigationMenuService.php),
line 657 on `main`) fills a menu item's title for every form language of
the journal. Its branch for the user-name item (title key
`{$loggedInUsername}`) writes the key under the current UI language,
`Locale::getLocale()`, not under the language the loop is filling,
`$supportedFormLocale`:

```php
foreach ($supportedFormLocales as $supportedFormLocale => $supportedFormLocaleValue) {
    if ($localizedTitle = $nmi->getTitle($supportedFormLocale)) {
        $nmi->setTitle($localizedTitle, $supportedFormLocale);
    } elseif ($nmi->getTitleLocaleKey() === '{$loggedInUsername}') {
        $nmi->setTitle($nmi->getTitleLocaleKey(), Locale::getLocale());   // the wrong language
    } else {
        $nmi->setTitle(__($nmi->getTitleLocaleKey(), [], $supportedFormLocale), $supportedFormLocale);
    }
}
```

So the function is not safe to run twice, and on the public pages it does
run twice. `getDisplayStatus()` first runs it through
`transformNavMenuItemTitle()`, which turns the key into the username.
Then, for the `NMI_TYPE_USER_DASHBOARD` item, it replaces the
current-language title with `dashboardMenuItem.tpl`'s output: the
username and `<span class="task_count">`. Then it calls the
`NavigationMenus::displaySettings` hook. Each app's
`NavigationMenuService::getDisplayStatusCallback()` (OJS, OMP, OPS) runs
`transformNavMenuItemTitle()` again. On that second run, any form language
other than the page's language still has no title of its own, so the
branch writes the bare key over the current-language title. The username
goes back in and the count is lost. With one form language, the same
language as the page, the loop never reaches that branch for another
language, and the count survives.

The branch came in with 7c715e2 (`pkp/pkp-lib#11496`, "Fix PHP warning
for missing locale key"). Before it, the user-name item went through the
`else` branch: that wrote a translation of the key under each form
language's own code, which printed a missing-key warning but left the
current-language title alone. The change removed the warning and wrote
the key to the wrong language.

Reach:

- The user-name item only: the other items' titles are written under the
  loop's language (the `else` branch), so "Dashboard 2" under the name and
  "Logout as …" keep their text (checked in the code; "Dashboard" seen on
  screen).
- The site's own home page has no journal, so the loop runs over the
  site's languages (English and French on the default dataset). The Site
  Administrator's name there goes bare the same way. That is from the
  code: on the default dataset the site's home page opens the one journal
  instead, so it was not seen on screen.
- The other callers of `setAllNMILocalizedTitles()`: the navigation menu
  item form (`PKPNavigationMenuItemsForm::initData()`, `execute()`) and
  the navigation menus API (`NavigationMenuItemResource`). They run it
  once per item and read the current language's title. They are not
  affected in what they show (code).
- A Section Editor's bare name is a separate fault, the role list in
  `getDisplayStatus()`
  ([pkp-e2e#634](https://github.com/jardakotesovec/pkp-e2e/issues/634)).

## Proposed fix

Write the key under the language the loop is filling, as the other two
branches do ([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/unread-count-gone-with-french-forms/fix.diff)):

```diff
                 } elseif ($nmi->getTitleLocaleKey() === '{$loggedInUsername}') {
-                    $nmi->setTitle($nmi->getTitleLocaleKey(), Locale::getLocale());
+                    $nmi->setTitle($nmi->getTitleLocaleKey(), $supportedFormLocale);
                 } else {
```

The fix goes in the shared function rather than in the apps' callbacks,
so every caller gets a function that is safe to run twice. It keeps what
7c715e2 was for: the key is never passed to `__()`, so the missing-key warning stays
gone. A search of the navigation menu code and of the other loops over
`getSupportedFormLocales()` found no other title written under
`Locale::getLocale()` inside such a loop. The single-language twin
`setNMITitleLocalized()` writes under the current language on purpose,
and is correct.

Tried on `main` in OJS, OMP and OPS. With the fix in, steps 4, 6 and 7
show the name with its count (OJS "dbarnes 2", OMP "dbarnes 13", OPS
"dbarnes 0"). The neighbouring cases came out the same with the fix in
and out: the "Dashboard" entry keeps its number, and the Section Editor
`dbuskins` (Series editor, Moderator) keeps a bare name, which the role
list decides.

**Alternatives**:

- Drop the second `transformNavMenuItemTitle()` call from the three apps'
  `getDisplayStatusCallback()`: this hides the fault on the public pages
  but leaves the function unsafe to run twice for every other caller. It
  also takes three repositories instead of one.
- Set the count after the hook in `getDisplayStatus()`: this moves code
  around a fault that stays in place.

**What goes with it**:

- Nothing stored is wrong: the titles are built per request, so no data
  needs repairing.
- One visible side effect: the navigation menu item form and the
  navigation menus API now list `{$loggedInUsername}` as the user item's
  title in every form language, not only the current one. That matches
  how the other items get a title for each language. Saving that
  unchanged value stores nothing, because the form compares it with the
  default title.
- It applies as written to `stable-3_5_0` and `stable-3_4_0`, which carry
  the same line.
- Guard: a check in the apps' Cypress integration tests, which run on
  the default data, where English and French are already both "Forms"
  languages, so no setup is needed. Signed in as `dbarnes`, the journal's
  home page header's name link must hold `span.task_count`. lib/pkp has
  no unit test of `PKPNavigationMenuService` to extend, and a unit test
  would first need a context with two supported form locales on the
  request that `Locale::getSupportedFormLocales()` reads.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/unread-count-gone-with-french-forms/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/unread-count-gone-with-french-forms/walk.js)
  (helpers in `lib.js`), on an install freshly reset to the default
  dataset: `node bin/probe.js all <walk.js>`, with `WALK_MODE=nb` for the
  neighbour check alone. Walked 2026-10-21 on OJS, OMP and OPS on `main`
  and on `stable-3_5_0`, at 1280 × 900. Each walk read the "Tasks" button
  and the name link's text and markup. Every step gave the Observed above
  on both lines.
- Tips: `main` OJS 3109a59114 (lib/pkp f37a174626), OMP 5777025bec and
  OPS f048e747b4 (lib/pkp 042726ebf6); `stable-3_5_0` OJS 1e78ca0c2b,
  OMP cce424e5ef, OPS 5eca7fd603 (lib/pkp 68512b5fda). The line is
  identical in both `main` lib/pkp commits and on pkp-lib `main`
  7269eaf6f0. The default dataset at pkp/datasets 5f247d04, PostgreSQL.
- 3.4 (code): pkp-lib `stable-3_4_0` 85f47442cf has the same branch
  (19f8ffb) and the same `getDisplayStatus()` order (count set, then the
  hook). The apps' `stable-3_4_0` tips (OJS 0012bd1022, OMP e30fa7e38,
  OPS 0f1e21a117) each call `transformNavMenuItemTitle()` in
  `getDisplayStatusCallback()`, and their lib/pkp pointer a71d6bd2ca
  carries 19f8ffb.
- 3.3 (code): pkp-lib `stable-3_3_0` 867ce82d8e has no
  `{$loggedInUsername}` branch in `setAllNMILocalisedTitles()`: every form
  language's title is written under its own code, so the second run in
  the apps' callbacks (OJS d7d9dd14ec, OMP 8e72fc883, OPS c5532e2161)
  leaves the count in place.
- Releases: pkp-lib tags `3_5_0-0` to `3_5_0-5` contain 53a0d61 and
  `3_4_0-10`, `3_4_0-11` contain 19f8ffb (not `3_4_0-9`). The OJS, OMP and
  OPS tags of those names point lib/pkp at commits that carry them
  (checked with `git merge-base --is-ancestor`).
- Introduced: `git blame` on line 657 gives 7c715e2 (a two-line insertion,
  no earlier move). GitHub lists no pull request for it, and the commit
  links `pkp/pkp-lib#11496` (opened by asmecher, from a forum report of
  the missing-key warning after 3.3 → 3.4). Backported as 53a0d61
  (`stable-3_5_0`) and 19f8ffb (`stable-3_4_0`). That the count showed
  before 7c715e2 comes from reading the code, not from a walk.
- Tracker search (2026-10-21), pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops,
  pkp/ui-library: by symptom ("unread notification count", "task_count")
  and by `setAllNMILocalizedTitles`, `transformNavMenuItemTitle`,
  `dashboardMenuItem`, `loggedInUsername`. Nearest hits, not this fault:
  `pkp/pkp-lib#6058` (count not assigned on the front end, 2020, fixed),
  `pkp/pkp-lib#12006` (a 3.3 → 3.4 upgrade failing on the same missing
  key), `pkp/pkp-lib#11119` (a menu item's title not saved for a new
  language).
- Fix trial: `fix.diff` applied to the `main` checkouts of the three
  apps. The walk and the neighbour check were run with the fix in, and
  the neighbour check again after the revert, each on a freshly reset
  dataset.
- Not checked: MySQL (the fault does not depend on the database); a
  user whose interface language is neither of the journal's form
  languages (the code says the count is lost there too).

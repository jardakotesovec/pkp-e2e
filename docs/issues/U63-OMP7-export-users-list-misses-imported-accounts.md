# Users XML Plugin: after "Import Users", the "Export Users" list leaves out the accounts just imported

- **Severity** low
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP (OPS has no Users XML Plugin)
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** no PR (pkp bug 8463) · [f7a84c2975](https://github.com/pkp/omp/commit/f7a84c297515c4b5bf7b782cb44187cf39669110) · 2013-12-18 · Jason Nugent (jnugent); OJS's copy of the page, no PR (pkp bug 8582) · [9d883aabe6](https://github.com/pkp/ojs/commit/9d883aabe6ca8b6f8f4c812ea1f353d17624886e) · 2014-02-27 · Jason Nugent (jnugent)
- **Upstream** none found (2026-11-16)
- **Tracked in** U63 [OMP7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#omp7)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A press or journal manager imports a users file on the Users XML
Plugin's "Import Users" tab, reads the success sentence, and presses the
"Export Users" tab of the same page. "Current Users" should list the new
accounts. Instead it is the list the page opened with: the same count,
and none of the new accounts is there to tick.

Nothing is lost, but the manager may take the import for a failure.
Importing the file again changes nothing, and the list still leaves the
accounts out. Searching the list for the new names, or opening the tool
again, shows them.

## Impact

- **Lost**: nothing. The accounts exist and the "Results" tab says so;
  only the list on the same page is out of date. A second import of the
  same file adds no account or role and sends no email.
- **Who**: every journal or press manager who imports users and then
  turns to "Export Users" without leaving the page, every time.
- **Way round**: searching the list for the new names (its "Search"
  link, then "Search" in the filter), or opening "Users XML Plugin" again
  from "Tools", reads the list afresh.

Low: nothing is lost and a second import does no harm, so the cost is
a moment's doubt.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OMP (the press "Public
  Knowledge Press"); the same on OJS ("Journal of Public Knowledge").
- A users file on your computer, `u63n16g-users.xml`, with two
  accounts holding the Reader role. The usernames `u63n16ga` and
  `u63n16gb` must not exist yet: a second run skips them.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PKPUsers xmlns="http://pkp.sfu.ca" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://pkp.sfu.ca pkp-users.xsd">
  <user_groups>
    <user_group>
      <role_id>1048576</role_id>
      <context_id>1</context_id>
      <is_default>true</is_default>
      <permit_self_registration>true</permit_self_registration>
      <permit_metadata_edit>false</permit_metadata_edit>
      <name locale="en">Reader</name>
      <abbrev locale="en">Read</abbrev>
      <stage_assignments></stage_assignments>
      <masthead>false</masthead>
    </user_group>
  </user_groups>
  <users>
    <user>
      <givenname locale="en">Avery</givenname>
      <familyname locale="en">Quill</familyname>
      <email>u63n16ga@mailinator.com</email>
      <username>u63n16ga</username>
      <password must_change="false">
        <value>u63n16gau63n16ga</value>
      </password>
      <date_registered>2026-01-15 10:00:00</date_registered>
      <user_user_group>
        <user_group_ref>Reader</user_group_ref>
        <masthead>false</masthead>
      </user_user_group>
    </user>
    <user>
      <givenname locale="en">Blair</givenname>
      <familyname locale="en">Sage</familyname>
      <email>u63n16gb@mailinator.com</email>
      <username>u63n16gb</username>
      <password must_change="false">
        <value>u63n16gbu63n16gb</value>
      </password>
      <date_registered>2026-01-15 10:00:00</date_registered>
      <user_user_group>
        <user_group_ref>Reader</user_group_ref>
        <masthead>false</masthead>
      </user_user_group>
    </user>
  </users>
</PKPUsers>
```

  [3.5: the group also carries `<show_title>true</show_title>` after
  `<is_default>`.]

Steps:

1. Sign in as `rvaca` (Press manager; Journal manager on OJS).
2. In the left menu, press "Tools", then "Users XML Plugin" on the
   "Import/Export" tab. The page opens on its "Import Users" tab.
3. Press the "Export Users" tab. The line under "Current Users" reads
   "1 - 25 of 38 items" (OJS: "1 - 25 of 39 items").
4. Press the "Import Users" tab. Under "File", press "Upload File" and
   choose `u63n16g-users.xml`.
5. Press "Import Users". A "Results" tab opens and reads "The import
   completed successfully. Users with usernames and email addresses that
   are not already in use have been imported, along with accompanying
   user groups."
6. Press the "Export Users" tab.

**Expected**: the line under "Current Users" counts the two new
accounts: "1 - 25 of 40 items" (OJS: "1 - 25 of 41 items").

**Observed**: the list is the one of step 3, still "1 - 25 of 38 items"
(OJS: "1 - 25 of 39 items"). The list is not fetched again: neither the
import nor the tab press asks the server for it.

Control: on the same tab, the list's "Search" for "u63n16g" lists "Avery
Quill" and "Blair Sage" ("1 - 2 of 2 items"). Opening "Users XML Plugin"
again from "Tools", "Export Users" reads "1 - 25 of 40 items" (OJS: "1 -
25 of 41 items").

## Cause

The Users XML Plugin page loads the "Export Users" grid once, as the
page opens:
`{load_url_in_div id="usersGridContainer" url=$usersGridUrl}` in each
app's own copy of `plugins/importexport/users/templates/index.tpl`
([OMP line 74](https://github.com/pkp/omp/blob/92dd31031b2801a57bb0b4e82ed56393ac842a2b/plugins/importexport/users/templates/index.tpl#L74),
[OJS line 74](https://github.com/pkp/ojs/blob/925ed49f3b82d0eb5240e353c8d453a433300692/plugins/importexport/users/templates/index.tpl#L74)).
Both tabs are panels of the page itself, so pressing a tab fetches
nothing. `UrlInDivHandler` reloads its `<div>` only on the global event
named by `refreshOn`, and this call names none.

"Import Users" posts `importBounce`, whose answer adds the "Results"
tab. That tab loads the `import` case of
`PKPUserImportExportPlugin::display()` (lib/pkp
[`plugins/importexport/users/PKPUserImportExportPlugin.php`, lines 133–162](https://github.com/pkp/pkp-lib/blob/3ed5d1c3b37444fc171248a48f8895fbc6c6b597/plugins/importexport/users/PKPUserImportExportPlugin.php#L133-L162)).
It imports the file and answers with the results' HTML in a
`JSONMessage` that carries no event. So nothing tells the page that the
context's accounts changed, and the grid keeps the rows and count it
was drawn with.

The rule it breaks is the one the legacy screens follow elsewhere: a
change that alters another list on the page announces itself as a
global event, and that list reloads on it.
`UserGroupGridHandler::updateUserGroup()` sends
`setGlobalEvent('userGroupUpdated')`, which `UserGridHandler.js` binds.

Reach:

- Pressing "Results" again sends the `import` request again. jQuery UI
  1.14 fetches a remote tab on every press (its `tabs` has no `cache`
  option, so the template's `tabs('option', 'cache', true)` does
  nothing), and the `import` case never deletes the temporary file.
  Walked: the same success sentence, no account or role added, no
  email, the list unchanged.
- The same shape, not covered by this fix (read in the code, not
  driven): OJS's Native XML Plugin draws its "Export Issues" grid once
  (`{load_url_in_div id="issuesListGridContainer"}` in
  `plugins/importexport/native/templates/index.tpl`, line 128). Its
  "Export" submissions list, in all three apps, is a Vue list fetched
  once when the page opens. Neither is told about a Native import made
  on the same page.

## Proposed fix

Have the import's answer announce the change as a global event, and
reload the grid's `<div>` on it. `{load_url_in_div}` already takes a
`refreshOn` parameter, which `UrlInDivHandler` binds to `reload()`, so
no JavaScript changes. This is a proposal. An excerpt of the
`fix-*.diff` files linked below:

```diff
--- a/lib/pkp/plugins/importexport/users/PKPUserImportExportPlugin.php
+++ b/lib/pkp/plugins/importexport/users/PKPUserImportExportPlugin.php
@@ -158,6 +158,8 @@
                 $templateMgr->assign('users', $users);
                 $json = new JSONMessage(true, $templateMgr->fetch($this->getTemplateResource('results.tpl')));
+                // Redraw the "Export Users" list of the same page, which would otherwise not show the imported users
+                $json->setGlobalEvent('usersImported');
                 header('Content-Type: application/json');
--- a/plugins/importexport/users/templates/index.tpl   (OJS and OMP, each its own copy)
-{load_url_in_div id="usersGridContainer" url=$usersGridUrl}
+{load_url_in_div id="usersGridContainer" url=$usersGridUrl refreshOn="usersImported"}
```

The "Results" tab's content passes through `TabHandler.dataFilter()`
and so `Handler.handleJson()`, which sends an event marked
`isGlobalEvent` to `pkp.eventBus`, where the grid's `<div>` listens.
The event goes out after every import the case runs, even when the
results list refused lines. A partly refused file may still have
created accounts, and the code cannot tell:
`UserXmlPKPUserFilter::handleElement()` returns nothing, so `$users` is
always empty.

The full diffs are
[fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/export-users-list-misses-imported-accounts/fix-ojs.diff)
and
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/export-users-list-misses-imported-accounts/fix-omp.diff).
They were tried on `main`, OJS and OMP. The Steps then showed the
Expected: one fetch of the grid after "Import Users", and "1 - 25 of 40
items" (OJS: 41) at step 6. A row ticked on "Export Users" stayed ticked
across a switch to "Import Users" and back, with no fetch, with the fix
in and out.

**Alternatives**:

- Reload the grid each time the "Export Users" tab is pressed (a
  `tabsactivate` handler in the template). It catches every change, but
  costs a fetch on every press and drops the list's ticks, page and
  filter each time.
- A JavaScript handler for the exportable users grid that binds the
  event and calls `refreshGridHandler()`, as `UserGridHandler.js` does
  for `userGroupUpdated`. The same result, but a new JS class, its
  registration and a build, for nothing over reloading the `<div>`.
- Load "Export Users" as a remote tab. The tab's form (the "Export
  Users" button, `selectedUsers[]`) wraps the grid on the page, so the
  page would need restructuring.

**What goes with it**:

- After an import, the list is drawn afresh: back on its first page,
  with no filter and no ticked rows. Each press of "Results" runs the
  import again (Reach) and so redraws the list too. That is accepted:
  stopping the repeated import is a question of its own. No REST API,
  plugin hook or stored data is touched.
- Backport: 3.5's files are `main`'s, so the diffs apply there as
  written. On 3.4 (the grid at line 72, under another `{capture}` line)
  and 3.3 (`PKPUserImportExportPlugin.inc.php`, tab-indented, the
  template on `$smarty.const`) the same edits must be redone by hand;
  `setGlobalEvent()` and `refreshOn` exist on both.
- The Native XML Plugin's lists above would need the same treatment
  (the grid by the same two lines; the Vue list by a refetch on the
  event), as a follow-up.
- Test: an e2e check that reads "Export Users" right after an import
  on the same page.

Medium: each change is a line or two, but they sit in three
repositories (two lines in pkp-lib, one in each of OJS's and OMP's
copies of the template), which the effort scale counts as medium, plus
the test.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/export-users-list-misses-imported-accounts/walk.js`
  (helpers in `lib.js` beside it), on a fresh load of the default
  dataset (PostgreSQL, PHP 8.3):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/export-users-list-misses-imported-accounts/walk.js [walk|nb|again]`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). `walk` takes steps
  1–6 and the control on OJS and OMP, and on OPS records that "Tools"
  lists no "Users XML Plugin". `again` adds a second press of "Results"
  and a second import of the file, reading the accounts, their roles and
  the mail beside the screens. `nb` is the neighbour check (a row ticked,
  then "Import Users" and "Export Users" pressed with no import). The
  script counts the grid's `fetch-grid` requests. The fix was tried with
  `node bin/try-fix.js apply … fix-ojs.diff ojs` and `… fix-omp.diff omp`;
  no build was needed.
- No request answered 500 and no page script failed, on either line,
  with the fix in or out.
- Tips: main OJS 925ed49f3b, OMP 92dd31031b, pkp-lib 3ed5d1c3b3,
  ui-library 836c01b5; stable-3_5_0 OJS 6cfc46e6fc (pkp-lib bb17ba1380),
  OMP 3f0fd0a7d1 (pkp-lib 5af8e67ab4), ui-library fd00e45f;
  stable-3_4_0 OJS 61835656a2, OMP 98db039f2, pkp-lib 2dd24cc5ae;
  stable-3_3_0 OJS b83fb9e44d, OMP 31f5c517e, pkp-lib df738d3a66.
- Datasets: pkp/datasets 961a9871 (2026-11-15), `main` and
  `stable-3_5_0` pgsql dumps.
- Unverified: the list redrawn by a second press of "Results" with the
  fix in (read in the code: the answer carries the event each time).
- Code reads: on `main` and 3.5, both apps' `index.tpl`,
  `PKPUserImportExportPlugin::display()`, `TabHandler.js`
  (`addTab`, `dataFilter`), `Handler.js` (`handleJson`, `bindGlobal`),
  `UrlInDivHandler.js`, `templates/common/urlInEl.tpl` and
  `PKPTemplateManager::smartyLoadUrlInEl()` and `smartyLoadUrlInDiv()`,
  and jQuery UI 1.14.1's `tabs` widget (`_eventHandler()`). The 3.5 files of both
  apps' template and the plugin class are identical to `main`'s. On 3.4
  and 3.3 (`git show upstream/stable-3_x_0:` in the apps,
  `origin/stable-3_x_0:` in lib/pkp): the template line, the `import`
  case (no event), `JSONMessage::setGlobalEvent()` and `refreshOn` in
  `UrlInDivHandler.js` and the template manager. OPS has no
  `plugins/importexport/users` on any branch.
- The sibling lists (OJS Native "Export Issues", the Native "Export"
  submissions list) were read in the code only:
  `plugins/importexport/native/templates/index.tpl` in each app and
  `PKPNativeImportExportPlugin::display()` (`lazyLoad`, no refetch).
- Introduced: `git blame` on OMP's template line gives f7a84c2975
  ("*8463* introduce basic user export plugin", the page and its grid
  line). On OJS it gives 8420969872 (2020-05-13, `pkp/pkp-lib#5865`, a
  re-indent); blame at its parent gives 9d883aabe6 ("*8582* migrate
  user import/export plugin to OJS").
- Upstream searches (2026-11-16), pkp/pkp-lib, pkp/omp, pkp/ojs,
  pkp/ui-library: "users import export list refresh", "Export Users"
  imported, "user import export users grid not updated",
  `UserImportExportPlugin` export tab, `usersGridContainer`,
  `ExportableUsersGridHandler`, "users xml export imported users",
  "Users XML" export list, "imported users not listed export",
  `PKPUserImportExportPlugin` import. Nothing matched.

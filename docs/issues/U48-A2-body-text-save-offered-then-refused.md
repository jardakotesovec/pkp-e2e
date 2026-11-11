# A Layout Editor without "Permissions" can write on "Body Text", but "Save" is refused and the text is lost

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS
  - 3.5: none (no "Body Text" page)
  - 3.4: none (code; no "Body Text" page)
  - 3.3: none (code; no "Body Text" page)
- **Introduced** `pkp/ui-library#747` for `pkp/pkp-lib#11994` · [0f007c5e](https://github.com/pkp/ui-library/commit/0f007c5e1d84a51a799499dbd84bcfbd512cc296) · 2025-12-10 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-11-11)
- **Tracked in** spec U48 [A2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U48-jats-and-body-text.md#a2)
- **Checked** 2026-11-11, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-11: the page has since gained "Export", which turns text a participant without "Permissions" cannot save into galleys; every section and the fix are revised to match.

## Summary

A Guest Editor, Layout Editor, Proofreader or other assistant assigned
in Production, whose assignment has "Permissions" unticked, gets the
text editor and an active "Save" on "Body Text". They can write for as
long as they like; "Save" is then refused with a window "Error" reading
"You are not allowed to edit this publication.". "Unsaved Changes"
stays, and the text is lost when they reload or leave the page.

The page lets anyone who can open it write, but the server saves the
text only for people who may change the publication. For a Guest
Editor or an assistant, the server saves it only once an editor has
ticked "Permissions" on their assignment.

They may still use "Export": "Export to HTML" and "Create PDF" turn the
unsaved text into the version's "HTML" and "PDF" galleys. What they
wrote is then kept only in those galleys, which readers get once the
version is published, while "Body Text" loses it.

"Permissions" is unticked by default for the Guest Editor and every
assistant role. So with default roles, all of them meet this on every
article in Production they are assigned to.

## Impact

- **Lost**: the text the participant typed, and the time spent on it.
  If they exported it first, it is kept only in the "HTML" and "PDF"
  galleys. A later export replaces that galley's file with what "Body
  Text" shows at the time, which no longer has their text.
- **Who**: Guest Editors, Layout Editors, Proofreaders and other
  assistants without "Permissions", on the "Body Text" page of any
  version of an article they are assigned to in Production.
- **Way round**: copy the text out before leaving, then have an editor
  tick "Permissions" on the participant's assignment (or paste it in
  for them).

Medium: typed work is lost, and an editor can unblock the person on
screen. Exported galleys can reach readers with text no editor saw in
"Body Text"; that would raise the severity, but these people may add
and replace galleys anyway, and the galley list marks these ones
"Generated from text editor".

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OJS `main`. Submission 5, "Genetic
  transformation of forest trees", is in Production with `gcox` (Layout
  Editor) assigned, "Permissions" unticked on their assignment (the
  Layout Editor role's default). Its one version has no saved Body Text and no
  galleys.

1. Sign in as `gcox`.
2. On the dashboard ("Assigned to me") press "View" on submission 5.
3. Side menu: "Publication" › "Body Text".
4. Look at the page.
5. Click into the text editor and type `Layout note u48ir1111.`
6. Press "Export" › "Export to HTML". Look under "Export" and beside
   "Save".
7. Press "Save". Read the window that opens and press "OK". Look beside
   "Save".
8. Reload the browser page and open "Publication" › "Body Text" again.
9. Side menu: "Publication" › "Galleys". Press the galley name "HTML"
   (marked "Generated from text editor") and open the file it
   downloads.

**Expected**, as recommended below: the page shows `gcox` the text
read-only: no toolbar, no "Save", no "Unsaved Changes" and no "Selected
Element", and typing in the text editor does nothing, so step 5 adds no
line and step 7 cannot be taken. "Export" stays, enabled once the
version has saved text to export; this version has none, so in step 6
"Export to HTML" is greyed out, and in step 9 "Galleys" lists no
galley.

**Observed**: in step 4 the page offers the toolbar, an editable text
editor, "Save" and "Export", with "Unsaved Changes" beside "Save" (a
never-saved Body Text shows the badge on opening,
[U48 A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U48-jats-and-body-text.md#a14)).
The typed line appears. "Export to HTML" answers 201: the line "HTML
galley saved." shows under "Export", and "Unsaved Changes" stays.
"Save" opens:

```
Error
You are not allowed to edit this publication.
OK
```

The save answered 401:

```
PUT …/api/v1/submissions/5/publications/6/bodyText   401   (sent as POST with X-Http-Method-Override: PUT)
{"error":"api.submissions.403.userCantEdit","errorMessage":"You are not allowed to edit this publication."}
```

After "OK" the text editor still holds the line and "Unsaved Changes"
stays. The reload in step 8 asks nothing, and afterwards the text
editor is empty. In step 9 "Galleys" lists "HTML Generated from text
editor", and its file reads `Layout note u48ir1111.`

## Cause

The server: `lib/pkp/api/v1/bodyText/PKPBodyTextController.php` routes
the save (`PUT`) and `DELETE` for `ROLE_ID_MANAGER`,
`ROLE_ID_SITE_ADMIN`, `ROLE_ID_SUB_EDITOR` and `ROLE_ID_ASSISTANT`, and
`authorize()` adds `PublicationWritePolicy` to them. Its
`PublicationCanBeEditedPolicy` asks
`Repo::submission()->canEditPublication()`: true for a Journal Manager
of the journal (`NOT_CHANGE_METADATA_EDIT_PERMISSION_ROLES`), otherwise
only when one of the user's assignments on the submission has
`canChangeMetadata` (the "Permissions" box). The policy itself also
admits a Site Administrator. The Body Text belongs to the publication
version, so this is the rule the media and JATS APIs use too.

The export routes are gated differently, on purpose.
`POST …/bodyText` and `…/bodyText/pdf` (`createHtmlFile`,
`createPdfGalley`) get `WorkflowStageAccessPolicy` on Production and
`PublicationAccessPolicy`, with the comment "Align permissions for
galleys with the ArticleGalleyGridHandler". That grid admits anyone
with Production access, and the "Galleys" page offers "Add galley" to
every editorial and assistant role
(`useGalleyManagerConfig.js`; its `canCurrentUserEditPublication` only
decides what an OPS author may do). So making galleys is open to
`gcox`, and the export is right to let them.

The page: `WorkflowPublicationBodyText.vue` (ui-library,
`src/pages/workflow/components/publication/`) declares only
`submission` and `publication` and passes neither a permission nor a
read-only switch to the editor it wraps, `BodyTextEditor.vue`
(`src/components/BodyTextEditor/`). That component always renders the
formatting toolbar, an editable SciFlow editor, "Save" and the
"Selected Element" section. The sibling publication pages that save to
the publication get the server's answer as a prop: the forms,
Contributors, Funders, References, Media and JATS XML as
`canEdit: permissions.canEditPublication`. That value is the
publication's `canCurrentUserChangeMetadata`, computed by the same
`canEditPublication()`, without the policy's Site Administrator
exception.

The page's "Export" (`useBodyTextConversion.js`, from
`pkp/ui-library#1021`) sends `getHTML()` of the live document, "saved
or not". For someone who may save, that is a convenience. For someone
who may not, it is the one way the text they typed leaves the page,
and it leaves only as galleys.

The page was meant to be gated. When it came in 0f007c5e
(`pkp/pkp-lib#11994`), `workflowConfigEditorialOJS.js` passed it
`canEdit: permissions.canEditPublication`, but the component never
declared or read the prop, so the value fell through as an attribute
and gated nothing.

Later, `pkp/ui-library#905` (the Pandoc import for
`pkp/pkp-lib#12897`, squashed as 762d29ce) removed the line. Inside
that PR, commit 82f4e094 dropped it together with a change to who is
offered "Send to Text Editor". The later commit a4784c77, "Revert
permission changes", restored only the "Send to Text Editor" change.
Whether the line was dropped on purpose the commits do not say; the
team should confirm. The removal changed nothing on screen, and neither
did c9889f00 (`pkp/ui-library#979`), which moved the editor into
`BodyTextEditor.vue` as it was.

After a refused save, `persistDocument()` gets no `data` and returns
`false`, so `isDirty` stays set. Nothing reads it when the person
leaves: the page has no `beforeunload` handler, so a reload drops the
text without asking, and its `navigationGuard` for the workflow's side
menu is never installed, the workflow store having no
`setNavigationGuard`
([U48 A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U48-jats-and-body-text.md#a15)).

Reach:

- Who: every participant who is not a Journal Manager or Site
  Administrator, whose assignments all have "Permissions" unticked, and
  who has Production access (the "Body Text" item is listed only with
  `canAccessProduction`). The Guest Editor role covers Production and
  has "Permissions" unticked by default (`registry/userGroups.xml`).
  Walked: a Layout Editor.
- "Export to HTML" and "Create PDF" both take the unsaved text
  (`getHTML()`); walked: "Export to HTML".
- The figure upload inside the text editor saves the document first
  (`handleFigureUpload()` › `ensureBodyTextFile()` ›
  `persistDocument()`) and is refused the same way (code).
- Not reached: "Send to Text Editor", the other way text enters the
  page, is offered only to the Journal Manager and the Site
  Administrator (`useFileManagerConfig.js`), who may always save; and
  the Author, whose view lists no "Body Text".
- The same pattern, separate fixes: the "JATS XML" page's "Make
  available with publication"
  ([U48 A1](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U48-A1-jats-make-available-offered-then-refused.md);
  its component has `canEdit` but does not apply it to that box) and
  the "Media" page's actions
  ([U47 A1](https://github.com/jardakotesovec/pkp-e2e/issues/493),
  `pkp-e2e#493`; fixed by `pkp/ui-library#1030`, 2026-11-06).

## Proposed fix

Recommended: people without "Permissions" see the Body Text read-only
and keep "Export", which then exports only saved text. 0f007c5e already
meant to pass the page the permission; this passes it again and makes
the editor obey it.

Pass `canEdit` again, declare it on `WorkflowPublicationBodyText` and
hand it to `BodyTextEditor`. When it is false, `BodyTextEditor`:

- shows no toolbar, no "Save" and "Unsaved Changes", and no "Selected
  Element", and a selection no longer opens that section;
- adds SciFlow's own read-only feature, `createReadOnlyFeature()` from
  `@sciflow/editor-start` 0.1.1, which ui-library already uses. It
  turns off `contenteditable` and refuses every change to the document
  in the editor state itself, so a paste or the outline's "Insert ref"
  cannot change it either, while the saved text still loads;
- skips a requested import;
- reports no unsaved changes: the `isDirty` it exposes is false, so
  once the side menu's guard is installed (A15), a person who cannot
  save is never asked about changes they cannot clear. On a never-saved
  version the editor marks itself changed on opening
  ([U48 A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U48-jats-and-body-text.md#a14)),
  which would otherwise ask exactly that;
- greys out "Export to HTML" and "Preview: PDF" while the version has
  no saved Body Text, since there is nothing they may export and an
  empty "HTML" galley would reach readers on publication. For people
  who may edit, the export with nothing saved stays as it is.

The read-only state follows `canEdit` live: the feature is added once,
and a `watch` on the prop switches it with the feature's own key
(`editor.plugins.dispatchMeta(key, …)`), as SciFlow documents, while
the toolbar, "Save" and the sections follow the prop through the
template. So the page needs no remount when an editor ticks
"Permissions" and the publication is fetched again.

Which rule `canEdit` follows: like every sibling publication page, the
page takes `permissions.canEditPublication`. That is the client's copy
of `canEditPublication()`, which leaves out the server policy's Site
Administrator exception. So a Site Administrator who is not a Journal
Manager of the journal and has no assignment with "Permissions" would
see the text read-only, though the server would save it (code). The fix
follows the client value, as the siblings do; adding the exception to
`canCurrentUserChangeMetadata` would change every publication page at
once and is left out.

The prop is `required: true` on the page, as on
`WorkflowPublicationJats`, `ContributorManager`, `CitationManager` and
`WorkflowPublicationForm`, so a config that stops passing it is warned
about in development, as the dropped line was not. On the reusable
`BodyTextEditor` it defaults to `true`, so its story is unchanged.
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/body-text-save-offered-then-refused/fix.diff):

```diff
--- a/lib/ui-library/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOJS.js
 					component: 'WorkflowPublicationBodyText',
 					props: {
+						canEdit: permissions.canEditPublication,
--- a/lib/ui-library/src/pages/workflow/components/publication/WorkflowPublicationBodyText.vue
 			:import-file="importFile"
+			:can-edit="canEdit"
…
+	canEdit: {type: Boolean, required: true},
--- a/lib/ui-library/src/components/BodyTextEditor/BodyTextEditor.vue
-					<div class="sciflow-body-text__editor-toolbar">
+					<div v-if="canEdit" class="sciflow-body-text__editor-toolbar">
…
-					<div class="sciflow-body-text__save-row">
+					<div v-if="canEdit" class="sciflow-body-text__save-row">
…
-						:can-convert="!!currentDocument && !importStage"
+						:can-convert="
+							!!currentDocument && !importStage && (canEdit || !!bodyTextFile?.id)
+						"
…
+	canEdit: {type: Boolean, default: true},
…
-const sidebarSections = [
+const allSidebarSections = [
…
+const sidebarSections = computed(() =>
+	allSidebarSections.filter(
+		(section) => props.canEdit || section.key !== 'selected-element',
+	),
+);
…
+const readOnly = createReadOnlyFeature('pkp-body-text-read-only', !props.canEdit);
+
 const ALWAYS_ON_FEATURES = [
 	createFigureFeature({imageUpload: {uploadFile: handleFigureUpload}}),
+	readOnly.feature,
 ];
…
+watch(
+	() => props.canEdit,
+	(canEdit) => editorRef.value?.plugins?.dispatchMeta(readOnly.key, !canEdit),
+);
…
-	if (hasRange || hasNode) {
+	if ((hasRange || hasNode) && props.canEdit) {
…
-	if (!props.importFile) return;
+	if (!props.importFile || !props.canEdit) return;
…
-defineExpose({isDirty, getHTML, exitFullscreen});
+const hasUnsavedChanges = computed(() => props.canEdit && isDirty.value);
+
+defineExpose({isDirty: hasUnsavedChanges, getHTML, exitFullscreen});
```

Tried on OJS `main`: `gcox` sees the page with no toolbar, no "Save",
no "Unsaved Changes" and no "Selected Element"; the text editor is not
editable, and typing leaves it empty. "Export to HTML" is greyed out
and "Galleys" lists no galley. After `dbarnes` saves a line, `gcox`
sees it read-only, "Export to HTML" answers 201 with "HTML galley
saved.", and the galley's file holds the saved line. With and without
the fix, `dbuskins` (a Section editor whose assignment has
"Permissions") gets the toolbar, an editable text editor, "Save",
"Export" and all three sidebar sections; the typed line exports, saves
(200) and is there after a reload.

**Alternatives**:

- Hide "Export" as well for them: it would take from them on "Body
  Text" what "Galleys" gives them.
- Hide the whole page from the side menu for them: they would lose the
  export and the sight of the text they prepare the galleys from.
- Keep the text editor and only hide "Save": the person could still
  type text that only an export keeps, which is the fault itself.
- Let the server accept the save from Guest Editors and assistants
  without "Permissions": it would widen who may change the publication.

**What goes with it**:

- No server, REST API or stored data change.
- A "read-only" story for `BodyTextEditor` (`:can-edit="false"`), if
  the team wants the state in Storybook.
- Guard: an e2e check that an assigned Layout Editor without
  "Permissions" sees the text read-only, with "Export" (a **Planned**
  item in the spec).

Small: one component's template and setup, a prop on its page and one
config line, all in ui-library, following the sibling pages' `canEdit`
and the editor's own read-only feature.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/body-text-save-offered-then-refused/walk.js)
  with its helpers in `lib.js` beside it, steps 1–9 on a freshly
  loaded default dataset:
  `PROBE_FEATURE=<fleet> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/body-text-save-offered-then-refused/walk.js`.
  `WALK=neighbour` takes steps 1–9 as `dbuskins` (Section editor on
  submission 5, "Permissions" ticked in the dataset); it was walked with
  the fix in and out. `WALK=saved` (fix in) has `dbarnes` save a line
  on submission 5's "Body Text", then takes steps 1–4, 6 and 9 as
  `gcox`. The fix was applied with
  `node bin/try-fix.js apply shared/playwright/checks/issues/body-text-save-offered-then-refused/fix.diff ojs`
  (which rebuilds the JavaScript) and reverted the same way.
- Walked: OJS `main` on its default dataset (pkp/datasets f3c795a4,
  2026-11-10, PostgreSQL). The script opens the workflow by its address
  rather than the dashboard's "View" (step 2). In step 9 the tab the
  "HTML" link opened stayed blank, the browser taking the file as a
  download; the script read the same address in the same session.
- Not walked: the Guest Editor and the other roles in Reach (code:
  `registry/userGroups.xml`, `canEditPublication()`); a published
  version (spec U48 A3); the figure upload; "Create PDF" (the code sends
  the same `getHTML()` as "Export to HTML"); the Site Administrator
  case (code).
- Unverified with the fix: that the exposed `isDirty` stays false for
  `gcox` (nothing on screen reads it while the side menu's guard is not
  installed, A15), and that the read-only state follows `canEdit` when
  the prop changes without a reload (code: SciFlow's
  `createReadOnlyFeature` documents `dispatchMeta` as its live switch;
  the walk only opened the page with `canEdit` already set).
- 3.5 walked: on `stable-3_5_0`'s default dataset, `gcox`'s side menu
  on submission 5 has no "Body Text" (the script records the menu and
  stops). Code: no `BodyTextEditor` or `WorkflowPublicationBodyText`
  in ui-library's `src` and no `bodyText` API in pkp-lib on
  `stable-3_5_0` (the checkouts); 3.4, 3.3 (code): the same on
  `stable-3_4_0` and `stable-3_3_0` (`git ls-tree` of pkp-lib's `api`
  and ui-library's `src`).
- Read-only feature: `@sciflow/editor-start` 0.1.1
  `dist/lib/read-only.js` (`filterTransaction` refuses every
  transaction that changes the document unless it is the editor's own
  external sync, `props.editable` turns off `contenteditable`), exported
  from the bundle ui-library imports.
- Introduced: `git show 0f007c5e` adds the config entry with `canEdit`
  and the component without the prop; `git log -S` on the line finds
  762d29ce, and the PR's commits on GitHub give 82f4e094 and a4784c77
  (which touches only `useFileManagerConfig.js`). `git blame` on today's `main` still
  gives 0f007c5e for the config entry and the page's props; c9889f00
  moved the toolbar and "Save" into `BodyTextEditor.vue` unchanged, and
  26eaf9a1 (`pkp/ui-library#1021`, merged as 856ca3ad) added "Export".
  The server's `PublicationWritePolicy` on the save is pkp-lib
  21585b09, the same day as 0f007c5e.
- Upstream: no pkp issue or PR found in pkp/pkp-lib, pkp/ui-library or
  pkp/ojs (searched 2026-11-11 for body text with read-only, permission
  or layout editor, "export to HTML", `BodyTextEditor`,
  `WorkflowPublicationBodyText`, `createReadOnlyFeature`,
  `PKPBodyTextController`). `pkp/pkp-lib#12905` (open, "Send to Text
  Editor Permissions") is about who is offered "Send to Text Editor",
  not who may write on the page.
- Branch tips: OJS `main` 99014b078f (lib/pkp e2078ce20e,
  lib/ui-library 55ec62ee); `stable-3_5_0` OJS 7cf6c9c60f (5af8e67ab4,
  fd00e45f); `stable-3_4_0` OJS 61835656a2, pkp-lib 2dd24cc5ae,
  ui-library ee684b34; `stable-3_3_0` OJS b83fb9e44d, pkp-lib
  df738d3a66, ui-library 96959f9e.

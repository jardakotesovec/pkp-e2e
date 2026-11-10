# Playwright Patterns

How we write tests, and the pitfalls that have already cost someone time.
Each entry says why, so you can judge the edge cases yourself. Everything
here describes the current harness. Anything that is only an idea, not code,
is marked **Not built yet**.

Where the rest lives: harness layout, config and how to run things in
`harness.md`; seeding and Mailpit in `scenarios.md`; the seeded accounts in
`users.md`; the test-authoring rules in `PRINCIPLES.md`.

## Start here

A test author reads these sections whole; they are the rules:
"Locator priority", "Fixture selection", "Waiting strategy",
"Parallel-load lessons", "Tag conventions", "Test tags", "Page Object
Model", "Data seeding" and "Things to avoid".

The rest is look-up material. Read the bold titles once, then come back
by grep when a screen misbehaves (the symptom, the component or the helper
name): "Locator pitfalls" and "UI realities learned the hard way" for
screens, "Probe kit" for probe scripts. Entry numbers are cited from tests
and page objects, so they never change; a long entry is split into
lettered parts (4a, 4b, …).

## Locator priority

Pick the first that works:

1. **`getByRole`** — the default. It is resilient, reflects accessibility and
   matches what the user sees. `page.getByRole('button', {name: 'Submit'})`
2. **`getByLabel`** — form fields with a visible label.
3. **Stable IDs** — where the form is anchored by id. Login is the canonical
   case: `input#username`, `form#login button`.
4. **`data-cy` hooks** — the legacy Cypress markers still in the DOM, such as
   `[data-cy="workflow-controls-right"]`. Fine when role and label are
   ambiguous on a complex Vue view.
5. **CSS** — last resort. Wrap it in a role or data attribute when you can.

Avoid: `nth-child` and `:first-child` (they break when rows reorder); long
class-name chains; `waitForLoadState('networkidle')`
on Vue pages (they poll, so it may never resolve — wait on a visible landmark
instead).

## Locator pitfalls

1. **OJS tabs are `role="tab"`, not `button`.** Top-level tabs have a stable
   hook: `#{name}-button` (`#review-button`, `#setup-button`).
2. **Nested tab groups.**
   - **2a. Outer and inner tabs share names.** The top-level *Setup* tab
     and Appearance → Setup are different tabs. Reach the outer one via
     `#setup-button` and the inner one via the visible-tab role.
   - **2b. A side tab is pressed after its top tab.** An address hash
     opens only its top tab, and a reload reopens on it, so press
     `#setup-button`, then `#settings-button` or `#info-button`.
   - **2c. A side tab's form is `[id="<tab>"] form`**
     (`[id="indexing"] form`), never a visible-tabpanel query, which also
     matches the outer panel holding every side tab's form.
   - **2d. The sidebar ("Site Navigation") is a PrimeVue panelmenu.**
     Every group's entries are in the DOM, the closed groups' regions
     `display:none`, and only the open group's header carries
     `aria-expanded`. Read a group by its header's `aria-controls` region
     and open it by pressing the header.
3. **Menus.**
   - **3a. "More Actions" menus (`DropdownActions`).** The open menu is
     `[data-reka-menu-content][role="menu"]`, rendered beside its button
     only while open, its items `role="menuitem"`. Scope item lookups to
     `page`, not to the row. Close one with `closeMenu(page)`
     (`shared/playwright/support/menus.js`), which presses Escape on the
     menu itself and fails when no menu is open.
   - **3b. Never a page-level Escape.** `page.keyboard.press('Escape')`
     closes whatever is on top: the workflow dialog (pitfall 7), or a
     legacy side window through its "form has changed" confirm.
     `npm run lint:suite` flags it. This is the one home of the rule.
   - **3c. A ui-library `Dropdown`** (`.pkpDropdown__content`, the DOIs
     page's "Bulk Actions") closes on a timer, up to a second after it
     loses focus, and nothing marks it as closing. Its visibility is no
     state to act on: a page object opens or closes one through
     `settleDropdown(root)` (`support/dropdown.js`), and after choosing an
     item that opens a window it waits for the menu's items to be gone
     before anything answers the window.
4. **Side modals.**
   - **4a. Scope via `[data-cy="active-modal"]`.** When modals stack,
     filter by a distinctive inner element, never `.first()` or `.last()`.
   - **4b. A legacy side window's content loads by AJAX after the dialog
     opens**, and `idle()` returns before it: use the kit's `settled()` on
     a field of its form.
   - **4c. A jQuery UI date box is typed, not filled.** `fill()` changes
     only the visible text, not the field the form posts, so the date
     saves as empty. Type it from the keyboard (select all, Delete, the
     date, Tab) into the visible box, `[name="<field>-removed"]`; the
     input named `<field>` is the hidden one. Several page objects have a
     `typeDate` to copy.
   - **4d. A closed side modal leaves a hidden shell in the DOM** until
     the next navigation (a Vue one, and a legacy one closed by its own
     "Cancel"), so `getByRole` on the table behind it returns nothing
     until then.
   - **4e. A Vue form's "Save" is disabled after a refused save** until
     the flagged boxes change; a click on it hangs.
   - **4f. For 450 ms after any window closes, the page still counts it
     as open.** The modal store keeps the closed slot on a timer. In that
     time an action that asks "is a side modal open?" takes the wrong
     branch, the dialog behind stays aria-hidden to role reads, an opener
     pressed again opens nothing, and a closed form still raises its
     leave-page prompt. A page object that acts right after a close waits
     it out with a page timer longer than the app's
     (`pastSideModalCloseWindow()` in `EmailsPages.js` and the
     `ReaderCommentsPages.js` files), or waits on the row locator itself.
     A probe counts a leave-page prompt as real only if it is still there
     2 s after the close.

5. **The side-modal outer wrapper reports `visibility: hidden`** while it
   opens, and permanently on some wrappers. Anchor `toBeVisible()` on inner
   content, never on the wrapper.
   - **5a. `.-screenReader` is the reverse.** Playwright calls the app's
     visually hidden class (clipped to 1px) visible, but a pointer click
     on it hangs its timeout. Reach such a control by `focus()` and Enter.
6. **The workflow modal's rows disappear while a Vue dialog is stacked over
   them.** The underlying panel is unmounted or aria-hidden beneath the open
   dialog, so a reviewer row's state can only be asserted AFTER the dialog
   closes. Role-based reads of anything behind an open window return
   nothing for the same reason, a page opened at an address that lands a
   side modal on top included; read the page behind through text or CSS
   locators. Anchor these dialogs by role and title
   (`getByRole('dialog', {name: /^Review Details:/})`), never by
   `[data-cy="active-modal"]` (that is pitfall 5's wrapper).
7. **The workflow page itself is a reka-ui dialog.**
   - **7a. Disambiguate by accessible name.** When it opens another
     modal, both are `[role="dialog"]`:
     `getByRole('dialog', {name: /Add Reviewer/i})`.
   - **7b. Read its text from the dialog** (the kit's
     `screen().text.dialog`; `text.main` is the dashboard list behind it).
   - **7c. Close an inner window with its own "Close" or "Cancel"**, and
     a menu inside it with `closeMenu(page)`; never Escape (pitfall 3b).
   - **7d. On a legacy (FBV) form the bottom "Cancel" is an `<a>` link**,
     not a button: use `getByRole('link')` or `a:visible`.
8. **Confirmation dialogs.** Use `[role="dialog"]:has-text(...)` or the legacy
   `[data-cy="dialog"]`. Button labels vary (OK/Yes/No) between reka-ui and
   jQuery UI.
9. **fbvElement ids are runtime-suffixed** (`$FBV_uniqId`). Select by `name=`,
   not `#id`.
10. **Legacy pkp jQuery grids.**
    - **10a. Rows and their controls.** Row controls stay hidden until
      `a.show_extras` is clicked (its class flips to `hide_extras`). Rows
      are `tr.gridRow#component-grid-...`, and a row's action links live
      in the NEXT `tr` after it (`tr.row_controls`), not inside it; find
      that line as the row's sibling, never by id, since a category row
      and a row under it can share one. The arrow clicked a second time
      to close the controls hangs the click.
    - **10b. A listbuilder's "Add Item"** renders its new row after the
      click returns, so `.last()` on the visible boxes fills the previous
      row, and a grid redraw swallows the next click on it.
    - **10c. Match a row by a name it contains, never start-anchored.** A
      row's text and accessible name can open with its row control's
      label ("Settings <name> …") or with padding (see also pitfall 16).
    - **10d. The "No items" line is a `tbody.empty`** that stays in the
      DOM, hidden, once a row exists, so a row count or a sibling read
      skips it.
    - **10e. A grid's filter form (`form.filter`)** is hidden until the
      header's "Search" link is pressed and folds away again after each
      search and redraw. The header links are reached by their class
      (`a.pkp_linkaction_search`, `a.pkp_linkaction_exportAllUsers`),
      which a grid-scoped `getByRole('link')` misses.
    - **10f. A download link (`a.pkp_linkaction_downloadFile`)** redraws
      its whole grid two seconds after the press, closing every open
      strip and leaving links at `href="#"` for a moment. A page object
      that downloads returns only once the grid has been replaced, as
      `LibraryList.download()` does.
11. **PkpButton accessible names include row context.** The Edit button in a
    mailables list is named `Edit Discussion (Production)`. Use a row-scoped
    regex.
    - **11a. A multilingual form's second-language box** is named the same
      way: its label opens with a hidden language name ("French Given Name
      in French"), so an anchored or `exact: true` match finds nothing;
      match it unanchored. A Vue form hides its second-language boxes
      until that language's button ("French") is pressed.
12. **AJAX-loaded email templates** (decision Composer steps). Wait for
    `.composer__loadingTemplateMask` to be gone before submitting, or the POST
    validates against an empty body.
13. **fbv plupload uploads.** The native `<input type=file>` sits at
    `opacity: 0` under a styled button. `setInputFiles()` on the input works;
    clicking the button opens a real OS dialog.
14. **Form saves, refusals and page notices.**
    - **14a. `[role="status"]:has-text("Saved")`** is the canonical
      form-save confirmation. Wait on it before reloading or asserting
      persistence. "Saving" and "Saved" coexist for a beat as two
      `.pkpFormPage__status` spans, so filter by text, never a bare
      `toHaveText`. A successful Vue settings save shows only that inline
      status for about five seconds and no page notice.
    - **14b. A refused Vue save** raises the page notice "The form was not
      saved because…" (or the 401/403 answer's error text), and its field
      errors carry class `pkpFieldError` (a `[class*=error]` sweep misses
      them).
    - **14c. Page notices are toasts** in
      `.app__notifications .pkpNotification`, top right and outside every
      dialog, for Vue and legacy saves and refusals alike. They stack
      downward, each expires five seconds after it shows but none while
      the pointer rests on the stack, and while shown they cover the
      controls under them. A probe reads them in `screen().notices`, a
      test as parallel lesson 2 says.
    - **14d. A legacy modal form refused by its own validation** shows its
      page notice late, with the next action or when the window closes.
      Read the refusal in the form: a field's error or the in-form
      `.notifyFormError`.
15. **`getByRole` name strings are substring matches.** `{name: 'View'}`
    matches "Assign Re**view**ers". Use `exact: true` or an anchored regex for
    short common words. The wizard rail is the standing trap: a "wait until
    step X is current" idiom on `'Review'` also matches "Reviewer
    Suggestions" and silently stays there; anchor the end
    (`SubmissionWizardPage`'s `endAnchored`).
    - **15a. A `hasText` filter on a number** also matches digits in the
      row's other cells (a seed tag, a date, another id): match a number
      through its own cell, exact.
16. **Legacy grid control links carry padding in their text.** A row's
    "Edit" link reads " Edit " to `hasText`, so an anchored regex
    (`filter({hasText: /^Edit$/})`) never matches. Read them by role and
    exact accessible name: `getByRole('link', {name: 'Edit', exact: true})`.
17. **A `page.goto()` that changes only the hash** of the page already open
    (`…/workflow#review/reviewForms` from `…/workflow`) is a same-document
    navigation: it returns null, nothing reloads, an open window stays open.
    Leave the page first (goto another address) or assert on the tab strip,
    not the response.

## Fixture selection

- One default user: `test.use({user: 'editor.diana'})` at file or describe
  level. Storage state is cached across runs.
- Several actors: the `asUser` fixture opens extra authenticated contexts.
  They close themselves at teardown. Do not `ctx.close()` by hand unless the
  test is about a closed session. Never combine it with a describe-level
  `test.use({user})`: the two strand each other on the same worker server
  (both land on `/login`). A multi-actor test sets no default user and
  opens every actor through `asUser`.
- Anonymous: omit `user`. But read parallel lesson 8 before trusting a context
  to be anonymous.

## Waiting strategy

Playwright auto-waits on every interaction. Explicit waits are only for
**arrival**: a navigation or DOM transition has completed. The harness
disables animations globally (see `harness.md`), so no ordinary action waits
on a modal slide. Durations are 0.01ms rather than 0 because presence helpers
wait on `animationend`, and a true 0 can mean the event never fires.

- **Wait on a landmark, not the network**:
  `await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()`.
- **A page object returns what it opens settled.** A form that fills a
  required field from its own fetch refuses a submit pressed before the
  answer, in the page and silently. So the opener arms `waitForResponse`
  for the fetch the next action depends on before the press, and awaits
  it (`PublicationScreen.pressPublish()` is the example).
- **A context a test opens itself comes from the fixture's `browser`.**
  `browser.newContext()` is armed like the fixtures' own (motion off, the
  levers on). Never launch a browser of the test's own
  (`chromium.launch()`, flagged by `npm run lint:suite`): it runs the
  app's real animations, and a press during a slide is lost without a
  sound.
- **No `{force: true}` in a test.** A just-opened side window is mounted
  off screen for a few frames while `toBeVisible()`, counts and text reads
  already pass. A plain action waits that out; `{force: true}` and
  `boundingBox()` do not ("Element is outside of the viewport"). Where
  force is needed (a box under a styled label, a greyed control), it lives
  in a page object that calls `motionEnded(locator)` (`support/motion.js`)
  on its target first.
- **Auth-style redirects**:
  `page.waitForURL(url => !url.pathname.includes('/login'), {waitUntil: 'commit'})`. The default `'load'` is fragile under parallel load
  because Vue dashboards fan out XHRs. `'commit'` fires on the URL change.
  Close a tab after such a wait with `closeTab(page)` (`support/tabs.js`);
  a bare `close()` can hang to the test timeout.
- **API-triggered updates**: arm `page.waitForResponse(...)` before the click
  and await it after. Prefer this over toast assertions (parallel lesson 2).
- **Legacy jQuery flows** (AjaxModal saves, Smarty grid refreshes, tab-handler
  clicks): call `waitForJQueryIdle(page)`. It lives in
  `shared/playwright/support/legacy.js`; the OJS and OPS trees re-export it
  from `apps/<app>/playwright/support/legacy.js`, so a spec imports
  `../support/legacy.js`. It waits until jQuery is absent or `jQuery.active`
  reaches 0. It is a no-op on Vue-only surfaces; prefer `waitForResponse`
  there. The symptom that points here: a spec passes at `--workers=1` but
  flakes at 2 with timeouts right after a legacy form save.
- **A legacy window is returned settled.** It keeps moving after it shows
  (a grid it loads itself, a jQuery notice sliding in; the harness stops
  CSS motion, not jQuery's timers), and a shift between a click's
  button-down and button-up loses the press without a sound. The page
  object that opens one returns it through
  `waitForLegacyFormSettled(page, window)` and calls it again after a
  change that slides something in.
- **A legacy form's answer is not the form taking it.** The `response`
  event fires on the headers; the form applies the answer later, and a
  refusal swaps the pressed `<form>` for a new one. A page object that
  presses such a submit and may stay in the window waits for
  `legacyAnswerApplied(page, formId)`, or a box filled on the old form
  goes with it.
- **An upload's answer is not the form taking the file.** A Vue upload
  box (`FieldUpload`, dropzone) puts the file into its form a moment
  after `waitForResponse` sees the answer; a "Save" pressed on the answer
  alone posts the form without the file. Wait for dropzone's
  `.dz-preview.dz-complete` on the new preview, as
  `UploadBox.uploadHandled()` does.

## Parallel-load lessons

The suite runs in parallel by default. Shared seed data is what tests contend
over.

1. `waitForURL` needs `waitUntil: 'commit'` (above).
2. **`/notification/fetchNotification` drains ALL pending notifications for a
   user.** Two parallel tests running as the same user race for the toast
   queue. Assert on the save endpoint via `waitForResponse`, not on toasts.
   The drain runs on every backend page load of that user, in every
   context, and legacy form refusals are such notices too; so a legacy
   notice (or its absence) is read only by a user no concurrent test signs
   in as (a throwaway, a scratch context's own), or in an `@solo` test
   when it must be `admin`. Nor does a test leave state on a roster
   persona (a discussion opened as `manager.maya` on `publicknowledge`
   raises her tasks for every later reader).
3. **`searchPhrase=` OR-joins on whitespace.** Search by the tag alone, a
   single whitespace-free token. Never `'Published article {tag}'`.
4. **Mailpit is shared across workers AND fleets.** The rules and the
   `pkpMail` API are in `scenarios.md` "Mailpit" (PRINCIPLES A8).
5. **Sessions are minted per test through `POST _test/session`**, so
   `signInAs`/`signOutAs` migrating a session never strands another test's
   cookies. Specs do nothing special. Never change a roster persona's
   password: it signs that user out in every worker. Use a scratch user.
6. **Server-side outbound HTTP fails fast at the dead-port `[proxy]`**
   (the config contract in `harness.md`); a test never depends on the app
   reaching an external service. The browser is not behind that proxy: a
   press that opens a third-party address stubs that host in its own
   context just before the press, as `support/orcid.js` does, and the
   test reads only the address the app built.
7. **Runners are invoked explicitly, in the serial project only.** A spec
   that needs a scheduled task invokes
   `php lib/pkp/tools/scheduler.php run`. One that needs a queued job's side
   effect (job-dispatched mail: ORCID mailables, deposits) invokes `runJobs()`
   from `shared/playwright/support/jobs.js`. Both belong in the serial project
   ONLY. An explicit runner drains the SHARED queue and can pop other tests'
   pending jobs, even inside a `Mail::fake()` seeding window, committing side
   effects while swallowing the message. Never run either while parallel
   workers are seeding. The project chain guarantees this in normal runs.
   Inside the serial project several workers drain at once, so a test may
   find its job already run by another test's drain; that is fine for a
   test that looks for the effect after its own drain (which also waits for
   jobs other runners are still executing), and wrong for a test that
   asserts "not yet, until the jobs run": tag that one `@solo` and it runs
   alone in the `<app>-solo` project after the serial one.
8. **"Anonymous" contexts are not anonymous under `test.use({user})`.**
   `browser.newContext()` inherits the file's storageState, and editors can
   *preview* unpublished articles, so an expected 404 becomes a 200. Pass an
   explicit empty state:
   `browser.newContext({storageState: {cookies: [], origins: []}})`.
9. **Bare front-end URLs 302 to the locale-prefixed form** on multilingual
   contexts (`/article/...` → `/en/article/...`). `page.goto` hides this, but
   `maxRedirects: 0` probes must use the prefixed URL. **The rule inverts on
   single-locale journals** (most scratch journals): the bare URL serves
   directly and the `/en/` form 302s back. Probe scratch journals bare and
   `publicknowledge` prefixed. A visit under another segment (`/fr_CA/…`)
   switches the session's language for every later request, so a French
   read is followed by `/en/` addresses or a fresh context; the site's own
   pages follow the site's languages, prefixed on the bilingual test site,
   bare on a one-language scratch context.
10. **Tags behind COUNT assertions need a per-run random component**, because
    long-lived DBs accumulate leftovers. **Tags behind SEARCH must be single
    hyphenless alphanumeric tokens.** Postgres splits `edd7-w0-x` into tokens
    and the search OR-matches them, so a `-w0-` tag matches every other
    worker-0 submission.
11. **Component-router URLs are kebab-cased** (`saveSequence` →
    `.../save-sequence`). A `waitForResponse` predicate on the camelCase op
    name never matches.
12. **Scratch journals auto-enrol `admin` as Manager** (this mirrors
    `PKPContextService::add()`). Every participant or user count on a scratch
    journal is one more than the seeded `users[]`.
13. **Legacy forms that embed a sub-grid contain that grid's own `<form>` and
    submit buttons.** Subscription forms, for example, embed SubscriberSelect,
    whose nested `form#userSearchForm` puts a "Search" submit first in DOM
    order. `form.locator('button[type=submit]').first()` clicks Search and
    silently clears your picked radio. Click Save by accessible name.
14. **A one-shot read of an XHR-loaded table races the fetch.**
    - **14a. Read rows through a locator assertion** (`toHaveCount`,
      `toHaveText`) or `await expect.poll(() => …)`. A plain
      `expect(await grid.rows().evaluateAll(…))` reads whatever the grid
      holds that instant, which under a full run is `[]`. It is settled
      only on a server-rendered page after its navigation, a mail-catcher
      read after the drain, or an already-open panel.
    - **14b. A page-object reader that returns a value** (`evaluate`,
      `allInnerTexts`, `boundingBox`, `count`) waits inside for the state
      it reads, or has an `expect…` twin that polls.
    - **14c. A list the app does not order** (no ORDER BY, or ties on a
      non-unique key) is compared as a set whatever the spec's wording,
      two reads of the same list included; a spec that claims an order
      such a query does not give is a spec correction.
15. **A file chooser opened from the keyboard needs interception already
    on.** `page.waitForEvent('filechooser')` alone can miss an Enter
    pressed right after it. Keep one `page.on('filechooser', () => {})`
    for the page's life, as `AppearancePages.js` `armFileChooser` does.
    (Uploads normally go through `setInputFiles()`, pitfall 13.)
16. **A computed style is settled only once the page's stylesheets are in.**
    On a reader-facing page only `page.goto()` and `reload()` wait for
    the theme's stylesheet; a link's `click()`, a heading assertion and
    `toHaveURL` do not. A page-object reader of styles or geometry, and a
    scroll helper (`scrollIntoViewIfNeeded()`, `toBeInViewport()`), calls
    `BasePage.stylesApplied()` first, inside the helper and in all three
    apps' twins of it.
17. **A request that installs a language holds `withLocaleInstall()`**
    (`support/locale-install.js`): two installs of one locale at once
    collide on the site-wide email data. The seed and `LanguagesPages`
    already do; a new page object that ticks a language or saves "Install
    Locale" does the same. A serial group or a retry is not the fix.

## Tag conventions

A test that seeds through the scenario API needs a unique tag so parallel
tests stay isolated:

- **At most 32 characters** (`journals.urlPath` is varchar(32); longer 500s).
- **A single hyphenless alphanumeric token** (lesson 10).
- Pattern: `{prefix}w{parallelIndex}{suffix}`, for example `subw0k3f9qa`. Give
  the suffix a per-run random component whenever the tag backs a COUNT
  assertion.

## Test tags

Two tags are in use. `@smoke` marks the tests that must pass on every PR;
filter with `--grep @smoke` and apply it like this:
`test('name', {tag: ['@smoke']}, async ({page}) => {...})`.
`@solo`, written in the test's title, puts a serial test into the
`<app>-solo` project, where it runs alone (parallel lesson 7).

## Page Object Model

Inherit from `BasePage` (`shared/playwright/pages/BasePage.js`). A POM holds
`page` and its locators as instance properties. A page object shared by the
three app suites stays app-neutral: role names, fold labels and other
per-app strings are passed in by the suite, never hard-coded from one app. Placement: shared mechanics go
in `shared/playwright/pages/` (today `BasePage`, `LoginPage`, `DashboardPage`,
`EditorialDashboardPage`, `MySubmissionsPage`, `ProfilePage` and `WorkflowPage`, the
workflow panel's frame: opening by address or from a row, header readouts,
the side menu with its stages, rounds, version nodes and pages, the status
and no-access boxes, the Delete / Return-to-Workflow / Return-to-Done
dialogs; app vocabulary comes from `appContext` capabilities or a `labels`
option); app-specific POMs go in
`apps/<app>/playwright/pages/`. The OJS tree has `ContributorPages.js`,
`FundingPages.js`, `OrcidPages.js`, `PublicationMetadataPages.js`,
`PublishSchedulePages.js`, `ReviewStagePages.js`, `UserInvitationPages.js` and
`SubmissionWizardPage.js` (the start form plus the wizard: collapse-aware
`gotoStep`/`expectStep`, dropzone `uploadFile`, TinyMCE fill, the submit and
cancel dialogs). OMP and OPS keep their own counterparts under their trees.

The workflow panel is split on purpose: the shared `WorkflowPage` owns the
frame (what U24 describes), while what a stage or page shows once open —
decisions, files, reviewers, publish, galleys — stays app-side in the
feature's own page object (`ReviewStagePages.js`, `PublishSchedulePages.js`,
…), because those surfaces differ per app.

**Not built yet**: an `IssuePage.js`. Build it at the shape a suite needs; no
code exists.

## Decision flow

Button labels do not always match the legacy Cypress names:

| Decision | Button label |
|---|---|
| sendExternalReview | `Send for Review` |
| acceptFromReview | `Accept Submission` |
| acceptInitial | `Accept and Skip Review` |
| sendToProduction | `Send To Production` |
| requestRevisions | `Request Revisions` |
| decline | `Decline` |

`Request Revisions` is the only primary decision that does NOT navigate
straight to `decision/record/{id}`. It first opens a side modal
(`WorkflowSelectRevisionFormModal`) with a radio for PENDING_REVISIONS (the
default) versus RESUBMIT (a new round). Only after Next does the page
navigate. Decision-constant and round-status gotchas: `scenarios.md`.

## Data seeding

The setup project runs the bootstrap once per DB
lifetime. Composite state comes from the scenario endpoints via
`pkpApi.createContext()`/`createSubmission()`; one-off mutations use the
app's api fixture. The full surface and its quirks: `scenarios.md`. There is
no cleanup fixture.

## Things to avoid

- **A stray server on a worker port** is adopted by a Playwright run
  (`reuseExistingServer`) instead of it starting its own, so nothing else
  may listen on the worker band (`harness.md` "The fleets").
- **A wait for an answer the server never sent.** A red with
  `ERR_EMPTY_RESPONSE`, `ERR_CONNECTION_RESET`, a `chrome-error://` page or
  `socket hang up` means the worker's `php -S` died under the test; read
  its `server-crash` annotation or the `[harness] php -S died` line in
  `.server-logs/` first, and never add a wait or a re-navigation for it.

## UI realities learned the hard way

- **There is no `queries` table.** Discussions live in `edit_tasks`, and
  `Repo::submission()->submit()` auto-creates editorial tasks. Any older doc
  or SQL that mentions `queries` or `query_participants` is stale.
- **Every pkp Search box commits on Enter only** (the dashboard's and the
  list panels' share `Search.vue`). `fill()` alone never filters. The two
  search boxes differ. The IN-PAGE box (accessible name `/Search submissions, ID/`)
  narrows the CURRENT view: the heading keeps the view's name and count. Only
  the SIDE-NAV global box (name prefix `Search submissions`; its accessible
  name grows once a phrase is typed, so never match it `exact`; `main` only:
  stable-3_5_0 has the in-page box alone) flips to the
  cross-status "Search Results" view (`currentViewId=search`), which removes
  the in-page box. A row outside the current view is invisible to the in-page
  search. Switch view first, or search globally.
- **Paginated lists accumulate state across runs** on a long-lived DB. Never
  assert presence on an unscoped first page. Search by the test's tag first.
  Drafts, seeded or started on screen, carry a submission date, so a
  date-ordered list places them by that date, not last.
- **A legacy jQuery UI tab is selected before its panel is on screen.**
  The reviewer wizard's steps (and any other remote-panel tab set) set
  `aria-selected="true"` when the panel's fetch starts; until the answer
  is in, the panel is empty or still shows the previous form, marked
  `aria-busy="true"` with the tab `ui-tabs-loading`. A "step N is
  current" wait also waits for those marks to clear
  (`ReviewWizardPage.expectStep`); nothing in the panel is counted, read
  or pressed before, and no other tab is pressed before, since that
  aborts the load and leaves the first panel empty for good.
- **Server-rendered TinyMCE values never reach the backing textarea.** No
  helper reads them. Read the editor directly:
  `page.evaluate((id) => window.tinymce?.get(id)?.getContent(), fieldId)`,
  with the id read off the form's live textarea (a tab loaded again keeps
  its earlier load's editor registered).
- **Every TinyMCE box is ready before the first key.** In a Vue form or a
  legacy one, text typed before the editor is `initialized` is wiped, or
  the save posts nothing for it, and a read-back right after an early
  fill still passes. Wait with `waitForEditorReady(page, id)`
  (`shared/playwright/support/richtext.js`). Editors of every wizard step
  and hidden tab start with the page, not when shown; one a choice
  reveals is waited for after that choice. The shared
  `ReviewSettingsPages.typeRichText` and `ReviewerPages.typeInto` do it.
- **Reviewer-select copies the email template into TinyMCE client-side.** An
  uninitialized editor loses the body, and the save 500s on a null message.
  `ReviewStagePages`'s `addReviewer` waits for the editor first.
- **A legacy multilingual box's French twin** opens only while the English
  box is focused (the globe icon is decorative).
- **A legacy save is judged by its JSON `status`**, never by the 200 or a
  count on the window: a refused legacy form answers 200 with
  `"status": false` and an `alert()` Playwright dismisses unseen
  (`EmailUserWindow.sendAndExpectSent()`).
- **The reader-side menus are plain links until the theme's script runs.**
  The default theme's `js/main.js` turns the user menu's name and the
  primary menu's parents into drop-downs on document ready
  (`data-toggle="dropdown"`); a press before that follows the link's own
  address and the menu never opens. Locate the toggle by that attribute,
  or wait for it before the press.
- **The wizard Steps rail collapses when it overflows.** Non-current pills are
  clipped to 1px, and `force: true` clicks are silent no-ops. Use
  `SubmissionWizardPage.gotoStep()`/`expectStep()`
  (`apps/ojs/playwright/pages/SubmissionWizardPage.js`). The pattern handles
  expansion, end-anchored name matching and clicks swallowed by a re-render.
  It reaches only a step already reached and fails naming `continueTo()`
  otherwise (a draft never saved for later reopens on "Upload Files" with
  the later pills unreached, on all three apps).
- **A workflow opened by its address.** Without a menu key it lands on
  the current stage's view; a declined or posted preprint lands on
  "Title & Abstract", which has no decision buttons and no
  "Participants". The header's "Publish" (`workflow-controls-right`)
  stands only on the publication pages. So a publish helper opens a
  publication page first, with
  `workflowMenuKey=publication_{publicationId}_<tab>`
  (`publication_12_issue`; a bare `publication_issue` falls back to
  "Title & Abstract" without an error), and a decision or participant
  step on OPS passes the stage key (`workflow_5`). `WorkflowPage` takes
  the key. A preprint server heads the publication pages "Preprint: …"
  where a journal or press reads "Publication: …". On stable-3_5_0 a
  publication key is rewritten to the stage view, so a 3.5 walk presses
  the menu entry instead.
- **`useFetch` tunnels DELETE and PUT via POST + `X-Http-Method-Override`, and
  unauthorized API calls return 401**, not 403. Match `waitForResponse` method
  predicates and status assertions accordingly.
- **The reviewer dashboard endpoint (`_submissions/reviewerAssignments`)
  ignores `searchPhrase` AND pagination.** Reviewer-side list assertions need
  scratch-journal scoping or a bounded full-list assertion.
- **The submission GET's `reviewAssignments` is a hand-rolled summary**:
  `statusId` plus Y-m-d dates only, with no `cancelled`, `declined` or
  `dateReminded` fields. Assert via `statusId` constants or the row's History
  modal.
- **Review files are grant-based.** Seeded in-review submissions carry no
  review-round files. The Add Reviewer modal's file selection writes the
  `review_files` grant. Mirror that flow; do not expect seeded files to be
  visible to the reviewer.
- **Settings › Users & Roles › Users is a Vue table** (`<user-access-manager>`),
  not a legacy grid: each row has an ellipsis menu ("Edit", "Email", "Remove
  User", "Disable User"); "Edit" leaves the modal for
  `management/settings/user/{id}`, whose role rows carry "Remove Role". A
  journal manager may not administer `admin`, a user's last role cannot be
  removed there, and ending your own current role answers 401 until a
  fresh sign-in.

## Probe kit

`shared/playwright/probe/index.js` is what a live-probe script imports
instead of rebuilding a `lib.js`. It is a thin wrapper over the modules the
suites already use (`LoginPage`, `users.js`, `PkpApi`, `PkpMail`,
`waitForJQueryIdle`, `disableMotion`, `bin/apps.js`), so ports and keys are
environment-correct and nothing is hard-coded. Two environment variables
name the output folder, `.reports/<PROBE_FEATURE>/<PROBE_AGENT>/`:
`PROBE_FEATURE` is the spec id, `PROBE_AGENT` a short id for the agent.
Scripts run through `bin/probe.js`:

```bash
npm run probe-servers -- --start                    # once per session: php -S per app at base+50, and the variants at +90, +91
npm run fleet-prep -- --feature sync --apps ojs [--reset]   # instead, on a cold (just reset) database, which the runner's setup project installs
PROBE_FEATURE=U03 PROBE_AGENT=g1 node bin/probe.js all my-probe.js   # or ojs|omp|ops; ONLY=ojs,omp narrows
```

```js
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} =
    require('../../shared/playwright/probe');

forEachApp(async (app) => {
    const scratch = tag('u03reg');
    await app.api.createContext({tag: scratch, users: [{username: `${scratch}mgr`, roles: ['manager']}]});
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'manager.maya');
        await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/website`));
        await idle(page);
        record(`website-${app.name}`, await screen(page));   // {url, title, aria, text}
        await shot(page, `website-${app.name}`);            // full-page PNG
        await loc(page, 'the Save button', page.getByRole('button', {name: 'Save', exact: true}));
        await signOut(page);
    } finally {
        await close();
    }
});
```

### The app bag

A script calls `forEachApp(fn)`; `fn` receives one app's bag. Everything
per app travels in the bag, never in `process.env`, so one process holds
all three apps. The exception is `PKP_APP_ROOT` and `PKP_SUITE_DIR`, which
`withApp` exports for the app while `fn` runs because `base-test.js` reads
them: a suite page object is required inside `fn`, never at the top of the
script.

- `app`, `name`, `root`, `port`, `users`, `contextPath`, `url(path)`: the
  app's identity and addresses.
- `baseURL`: the probe server (base port + 50).
- `api`: the `_test` client with that app's own key.
- `mail`: the shared Mailpit. `find`, `count` and `expectNone` take a
  `since`, a Date taken before the action, for an address other walks on
  the slot also mail.
- `fleetMail`: the same reads kept to the messages that name this fleet's
  own host, for a dataset user's address, which every fleet of the slot
  mails. An email whose text names no address of the install (an unassign
  or cancel notice) is read with `mail` and a `since`.
- `variant('validation')`: the +90 server with email validation and
  ALTCHA on. `variant('reauth')`: the +91 server with the Site
  Administrator's Confirm Access gate on (harness.md "The reauth-variant
  server").
- `db`: the fleet's database. `sql(app, query)` queries it through psql
  and returns one string: rows as lines (`.split('\n')`), columns joined
  by `|`. A `plugin_settings` row written this way is not read until the
  fleet's Laravel cache (`cache/opcache` or `cache/opcache-ds<n>`) is
  cleared.
- `contextTables`: the per-app context table names (
  `{table, id, settings}`: `journals`, `journal_id`, `journal_settings` on OJS).
- `serverLog(app)`: the fleet's server log (harness.md "Server output").
  `const log = serverLog(app), from = log.mark();` before a request,
  `log.since(from)` after it for the lines since that name an error,
  exception, fatal or warning, a 5xx answer, or a "Plugin … failed to
  handle the hook" line (a PHP "Deprecated" line only with
  `serverLog(app, {match})`). The exception text of a plugin failure sits
  on the next line, which `since()` leaves out: read the file for it. The
  log is the fleet's, so pin a line on a request by its time and address.
- `usageLog(app, {contextId})`: the fleet's usage event log, read the
  same way (`mark()`, then `since(from)` for that context's parsed visit
  lines).
- `line`: the line the process drives (`PKP_E2E_LINE`). On 3.4 and 3.3
  `testApi` is false and `api` answers 404;
  `lineScratchContext(app, page)` and `lineUser(app, {…})` build a scratch context with its manager
  instead (harness.md "The stable lines").
- `dataset`: on a dataset fleet (harness.md "Dataset fleets") the fleet's
  number; `baseURL` and `db` are then its own, `signIn()` takes the
  dataset's usernames (`dataset.md`) and `variant()` throws.

### The helpers

- `launch(app)`: a 1280×900 Chromium with animations off. It writes the
  run record (below). A browser `fn` leaves open is closed by
  `forEachApp`. `launch(app, {record: false})` keeps the record empty for
  a check that must leave nothing behind.
- `screen(page)`: the screen as data, taken after the page's outstanding
  requests: the aria snapshot of the main region (the body when the page
  has no `main`, as on the frontend) and of every open dialog; the
  verbatim `innerText` of header and main (`text`), because aria
  snapshots normalise punctuation; `text.dialog`, the innerText of the
  last visible dialog (null when none is open), because the workflow page
  is itself a dialog and `text.main` reads the list behind it; and
  `notices`, the page notices shown since the page's last `screen()`.
  `text` follows CSS `text-transform`, so an upper-cased heading there is
  not the source text.
- `settled(page, locator)`: waits, after `idle()`, until the locator's
  text (an input's value) is non-empty and the same across two reads, and
  returns it. For what fills after `idle()` returns: a Composer page, a
  legacy side window loaded by AJAX, a Vue side window built from a
  fetched publication (the workflow's Publication forms: read them
  through `settled()` on the form's footer or an editor field). On
  timeout it returns what is there and adds `{settled: false}` to the run
  record's `warnings`, never a throw.
- `idle(page)`: `waitForJQueryIdle` plus a bounded network-quiet wait, so
  a Vue panel that fetches its own data is on screen before `screen()`
  reads; after a press it waits out the requests the press started, which
  Playwright's `networkidle` does not. It hangs in a session the server
  has just ended (after a password change or a sign-out elsewhere): use a
  bounded wait there. When a script error leaves `jQuery.active` up it
  reads on after 30 s with `{jqueryIdle: false}` in `warnings`.
- `rawKeys(page, {scope})`: every raw locale key (`##key##`) on a
  translated page, in text, `<option>`s and attributes, with where each
  sits and whether it is rendered.
- `record(name, data)`: writes JSON as `<name>-<app>`, so a script on two
  apps never overwrites one app's snapshot. `{merge: true}` folds the
  object into the file's earlier one, for a script run in phases. The
  names are the agent folder's, not the script's: two scripts of one
  agent take different names or a `PROBE_RUN`.
- `shot(page, name)`: a full-page PNG, named the same way.
- `outFile(name)`: names a file the script writes itself (a state file,
  an export) the same way. `PROBE_RUN=r1` puts the run in all three names
  (`<name>-r1-<app>`), so two runs at once keep apart.
- `loc(page, description, locator)`: a row in `locators.md` (selector,
  match count, visibility) for the test author, appended when the process
  exits, and to the feature-level
  `.reports/<feature>/screen-locators.md` under the agent's id: a file to
  grep by screen or element, never to read whole.
- `note(text)`: appends one line to `.reports/<feature>/screen-notes.md`
  at once, for what a locator row cannot carry: a dialog on the way out
  of a screen, a premise that proved wrong, a wait that hangs.
- `tag(prefix)`: a scratch tag that follows the tag conventions above.
- `signIn(page, user)`: uses the roster password rule, so it works for
  scratch users too, and signs out any open session first. `{contextPath}`
  goes through that journal's own login page, which decides where the
  user lands; without it a dataset editor lands on the journal's reader
  home, where `window.pkp` is undefined. `{remember: false}` unticks
  "Keep me logged in".
- `switchLanguage(page, locale)`: presses the user menu's link to that
  locale, from a back-office page with no window open.
- `drainJobs(app)`: runs the fleet's queued jobs, for a probe that needs
  a job's outcome (a DOI deposit, job-sent mail, the search index, a
  usage chain). Never `support/jobs.js` `runJobs()`, which polls worker
  0, down outside a run, and never `jobs.php run` by hand, which stops at
  the first failing job. A drain also runs other features' queued jobs on
  that fleet.

### The run record

`run-<app>-<HHMMSS>.json`, one per process, keeps URL, method, status and
size (never a body) of every `/api/` and legacy `$$$call$$$` request (a
legacy save answers 200 even when it refuses), with `override` on a call
the Vue forms tunnel as a POST; every response of 400 or more; the
console's errors and warnings and uncaught page errors (`console`); every
browser dialog (`dialogs`: type and message); and every page notice as it
appears (`notices`, pitfall 14c).

Its `crashes` list is the subset that means the app itself failed: a
response of 500 or more, an uncaught page error, or a console error
opening with a JavaScript error's name (a script failure Vue's error
handler caught, `caught: true`). The kit prints their count when the
process ends. Each one is a finding in its own right, reported on the
digest block's `Crash:` line even when the screen showed nothing, except
one the kit tags `known`: a failure every visit gives on the test installs
(the Plugin Gallery list behind the dead `[proxy]`, seed-facts "Install
defaults"), counted apart.

### Gotchas

- **Browser dialogs.** The kit dismisses a `confirm()` or `alert()`, as
  Playwright does, so a screen that may ask (a tab switch with unsaved
  changes, a refused upload) needs `page.on('dialog', …)` before the
  action, or the script silently takes the Cancel branch. The run
  record's `dialogs` shows what asked.
- **Page-leave questions.** The kit accepts a `beforeunload` while its
  listener is the page's only one (dismissing it would abort the next
  `goto()`); a script's own dialog listener decides alone, so it accepts
  `beforeunload` itself. A page-leave probe on a legacy window blurs the
  box first: the form notices a change on blur.
- **A second page.** Console, page-error and dialog capture cover every
  page of the context. A script that needs every console level attaches
  its own `page.on('console')`.
- **Downloads.** Await `page.waitForEvent('download')` alone, never
  raced against a `waitForURL`. Judge one by the response's
  `Content-Disposition: attachment`, never by a 200 or a popup (a refused
  download answers 200 with JSON). Read a re-download after a change in a
  fresh `launch(app)`: the browser revalidates by ETag and keeps the
  earlier file name.
- **XML with an XSL stylesheet** (OAI-PMH) reaches `response.text()` and
  `page.content()` as the HTML Chromium rendered from it: read the raw
  XML with `page.request.get(page.url())` in the same context.
- **A request replayed in a role's session** goes through
  `apiAs(page, method, path, body)`, called on an idle page of that
  context the role may open: it reads the API address and the CSRF token
  off the page. The authorization denied page carries no context.
- **The validation variant on a scratch context.** A scratch context has
  no technical support contact, and the validation email's sender is that
  contact, so a registration on the +90 server 500s until a manager sets
  it (Settings › Contact).
- **Reuse page objects.** A check that walks the submission wizard takes
  its steps from the app's `SubmissionWizardPage(s).js`, and a helper
  worth keeping goes into a page object, not into an issue walk's
  `lib.js`, which is deleted with its report.
- **Kept claim-check scripts** live in
  `shared/playwright/checks/<feature>/<chunk>/` and import the kit as
  `require('../../../probe')`. `npm run lint:probe-imports` fails when
  `playwright/probe` appears under `apps/` or
  `shared/playwright/{tests,pages,support}`.
- **A run longer than the Bash tool's 600 s cap** is started with the
  tool's own `run_in_background`, never `nohup … &` from a foreground
  call. Outside the agent tool it runs detached with its pid saved, and
  the wait polls that pid, never `pgrep -f "<script>"`.

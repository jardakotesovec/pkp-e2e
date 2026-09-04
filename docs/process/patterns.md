# Playwright Patterns

How we write tests, and the pitfalls that have already cost someone time.
Each entry says why, so you can judge the edge cases yourself. Everything
here describes the current harness. Anything that is only an idea, not code,
is marked **Not built yet**.

Where the rest lives: harness layout, config and how to run things in
`harness.md`; seeding and Mailpit in `scenarios.md`; the seeded accounts in
`users.md`; the test-authoring rules in `PRINCIPLES.md`.

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
class-name chains; `page.waitForTimeout(n)` (auto-wait exists, and a fixed
timeout hides a real race — PRINCIPLES A5); `waitForLoadState('networkidle')`
on Vue pages (they poll, so it may never resolve — wait on a visible landmark
instead).

## Locator pitfalls

Each of these has bitten at least once.

1. **OJS tabs are `role="tab"`, not `button`.** Top-level tabs have a stable
   hook: `#{name}-button` (`#review-button`, `#setup-button`).
2. **Nested tab groups.** The top-level *Setup* tab and Appearance → Setup are
   different tabs. Reach the outer one via `#setup-button` and the inner one
   via the visible-tab role.
3. **Headlessui menus (More Actions).** Items are `role="menuitem"`, and the
   menu portals to the document root. Scope to `page`, not to the row.
4. **Side modals.** Scope via `[data-cy="active-modal"]`. When modals stack,
   filter by a distinctive inner element, never `.first()` or `.last()`.
5. **The side-modal outer wrapper reports `visibility: hidden`** while it
   opens, and permanently on some wrappers. Anchor `toBeVisible()` on inner
   content, never on the wrapper.
6. **The workflow modal's rows disappear while a Vue dialog is stacked over
   them.** The underlying panel is unmounted or aria-hidden beneath the open
   dialog, so a reviewer row's state can only be asserted AFTER the dialog
   closes. Anchor these dialogs by role and title
   (`getByRole('dialog', {name: /^Review Details:/})`), never by
   `[data-cy="active-modal"]` (that is pitfall 5's wrapper).
7. **The workflow page itself is a reka-ui dialog.** When it opens another
   modal, both are `[role="dialog"]`. Disambiguate by accessible name:
   `getByRole('dialog', {name: /Add Reviewer/i})`.
8. **Confirmation dialogs.** Use `[role="dialog"]:has-text(...)` or the legacy
   `[data-cy="dialog"]`. Button labels vary (OK/Yes/No) between reka-ui and
   jQuery UI.
9. **fbvElement ids are runtime-suffixed** (`$FBV_uniqId`). Select by `name=`,
   not `#id`.
10. **Legacy pkp jQuery grids.** Row controls stay hidden until `a.show_extras`
    is clicked (its class flips to `hide_extras`). Rows are
    `tr.gridRow#component-grid-...`.
11. **PkpButton accessible names include row context.** The Edit button in a
    mailables list is named `Edit Discussion (Production)`. Use a row-scoped
    regex.
12. **AJAX-loaded email templates** (decision Composer steps). Wait for
    `.composer__loadingTemplateMask` to be gone before submitting, or the POST
    validates against an empty body.
13. **fbv plupload uploads.** The native `<input type=file>` sits at
    `opacity: 0` under a styled button. `setInputFiles()` on the input works;
    clicking the button opens a real OS dialog.
14. **`[role="status"]:has-text("Saved")`** is the canonical form-save
    confirmation. Wait on it before reloading or asserting persistence.
15. **`getByRole` name strings are substring matches.** `{name: 'View'}`
    matches "Assign Re**view**ers". Use `exact: true` or an anchored regex for
    short common words.

## Fixture selection

- One default user: `test.use({user: 'editor.diana'})` at file or describe
  level. Storage state is cached across runs.
- Several actors: the `asUser` fixture opens extra authenticated contexts.
  They close themselves at teardown. Do not `ctx.close()` by hand unless the
  test is about a closed session.
- Anonymous: omit `user`. But read parallel lesson 8 before trusting a context
  to be anonymous.

## Waiting strategy

Playwright auto-waits on every interaction. Explicit waits are only for
**arrival**: a navigation or DOM transition has completed. The harness
disables animations globally (see `harness.md`), so nothing waits on a modal
slide. Durations are 0.01ms rather than 0 because presence helpers wait on
`animationend`, and a true 0 can mean the event never fires.

- **Wait on a landmark, not the network**:
  `await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()`.
- **Auth-style redirects**: `page.waitForURL(url => !url.pathname.includes('/login'),
  {waitUntil: 'commit'})`. The default `'load'` is fragile under parallel load
  because Vue dashboards fan out XHRs. `'commit'` fires on the URL change.
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

## Parallel-load lessons

The suite runs in parallel by default. Shared seed data is what tests contend
over.

1. `waitForURL` needs `waitUntil: 'commit'` (above).
2. **`/notification/fetchNotification` drains ALL pending notifications for a
   user.** Two parallel tests running as the same user race for the toast
   queue. Assert on the save endpoint via `waitForResponse`, not on toasts.
3. **`searchPhrase=` OR-joins on whitespace.** Search by the tag alone, a
   single whitespace-free token. Never `'Published article {tag}'`.
4. **Mailpit is shared across workers AND fleets.** Never `clearAll()` outside
   the serial infrastructure spec. Scope every assertion by a unique throwaway
   recipient, and pair every absence claim with a positive control. The full
   rules and the `pkpMail` API live in `scenarios.md` "Mailpit".
5. **`.auth/{user}.json` can go stale after impersonation flows.**
   `signInAs`/`signOutAs` migrate the session. `ensureAuthStateFor` probes the
   file before reuse and logs in again when needed. Specs do nothing special.
6. **Server-side outbound HTTP fails fast at the dead-port `[proxy]`** (the
   config contract in `harness.md`). A test must never depend on the app
   reaching an external service. Flows that fire outbound calls as a side
   effect (for example ORCID jobs popped by a queue drain) fail fast and
   harmlessly.
7. **Nothing queued or scheduled runs on its own** (`task_runner` and
   `job_runner` are Off). A spec that needs a scheduled task invokes
   `php lib/pkp/tools/scheduler.php run`. One that needs a queued job's side
   effect (job-dispatched mail: ORCID mailables, deposits) invokes `runJobs()`
   from `shared/playwright/support/jobs.js`. Both belong in the serial project
   ONLY. An explicit runner drains the SHARED queue and can pop other tests'
   pending jobs, even inside a `Mail::fake()` seeding window, committing side
   effects while swallowing the message. Never run either while parallel
   workers are seeding. The project chain guarantees this in normal runs.
8. **"Anonymous" contexts are not anonymous under `test.use({user})`.**
   `browser.newContext()` inherits the file's storageState, and editors can
   *preview* unpublished articles, so an expected 404 becomes a 200. Pass an
   explicit empty state: `browser.newContext({storageState: {cookies: [],
   origins: []}})`.
9. **Bare front-end URLs 302 to the locale-prefixed form** on multilingual
   contexts (`/article/...` → `/en/article/...`). `page.goto` hides this, but
   `maxRedirects: 0` probes must use the prefixed URL. **The rule inverts on
   single-locale journals** (most scratch journals): the bare URL serves
   directly and the `/en/` form 302s back. Probe scratch journals bare and
   `publicknowledge` prefixed.
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

## Tag conventions

A test that seeds through the scenario API needs a unique tag so parallel
tests stay isolated:

- **At most 32 characters** (`journals.urlPath` is varchar(32); longer 500s).
- **A single hyphenless alphanumeric token** (lesson 10).
- Pattern: `{prefix}w{parallelIndex}{suffix}`, for example `subw0k3f9qa`. Give
  the suffix a per-run random component whenever the tag backs a COUNT
  assertion.

## Test tags

One tag is in use: `@smoke`, for the tests that must pass on every PR.
Filter with `--grep @smoke`. Apply it like this:
`test('name', {tag: ['@smoke']}, async ({page}) => {...})`. There is no
quarantine tag on purpose: a known regression stays red, and its
`docs/tracking/ci-triage.md` row is the record.

## Page Object Model

Inherit from `BasePage` (`shared/playwright/pages/BasePage.js`). A POM holds
`page` and its locators as instance properties. Placement: shared mechanics go
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
cancel dialogs). OMP and OPS keep their own counterparts under their trees;
duplication between app suites is deliberate (PRINCIPLES M1).

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

Prefer the API over the UI for setup, and drive the UI only for what the test
actually exercises. The setup project runs the bootstrap once per DB
lifetime. Composite state comes from the scenario endpoints via
`pkpApi.createContext()`/`createSubmission()`; one-off mutations use the
app's api fixture. The full surface and its quirks: `scenarios.md`. There is
no cleanup fixture. When you hit a TODO stub, flag it instead of inventing an
alternative.

## Things to avoid

- **Absolute database IDs.** Use the ID the seeding call returned.
- **Mutating shared seed data** (`publicknowledge` and the 18 users: renames,
  role changes, flag changes). Need special attributes? Create a throwaway
  user in a scratch journal. No baseline account carries the
  `mustChangePassword` flag; `manager.maya` logs straight in.
- **Running `serve:<app>` alongside a Playwright run.** They fight over the
  base port (see `harness.md`).
- **Committing `.auth/` files.** They hold session cookies and are gitignored.
  Un-stage one if you see it staged.

## UI realities learned the hard way

- **There is no `queries` table.** Discussions live in `edit_tasks`, and
  `Repo::submission()->submit()` auto-creates editorial tasks. Any older doc
  or SQL that mentions `queries` or `query_participants` is stale.
- **Dashboard search commits on Enter only** (`Search.vue`
  `@keydown.enter.prevent`). `fill()` alone never filters. The two search
  boxes differ. The IN-PAGE box (accessible name `/Search submissions, ID/`)
  narrows the CURRENT view: the heading keeps the view's name and count. Only
  the SIDE-NAV global box (name prefix `Search submissions`; its accessible
  name grows once a phrase is typed, so never match it `exact`) flips to the
  cross-status "Search Results" view (`currentViewId=search`), which removes
  the in-page box. A row outside the current view is invisible to the in-page
  search. Switch view first, or search globally.
- **Paginated lists accumulate state across runs** on a long-lived DB. Never
  assert presence on an unscoped first page. Search by the test's tag first.
  Seeded drafts carry no `dateSubmitted`, so they sort LAST in date-ordered
  lists.
- **Server-rendered TinyMCE values never reach the backing textarea.** There
  is deliberately no helper. Read the editor directly:
  `page.evaluate((id) => window.tinymce?.get(id)?.getContent(), fieldId)`.
- **The wizard Steps rail collapses when it overflows.** Non-current pills are
  clipped to 1px, and `force: true` clicks are silent no-ops. Use
  `SubmissionWizardPage.gotoStep()`/`expectStep()`
  (`apps/ojs/playwright/pages/SubmissionWizardPage.js`). The pattern handles
  expansion, end-anchored name matching and clicks swallowed by a re-render.
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
- **A real wizard submit fires `AssignEditors`**, which auto-assigns the
  section's editors. So `participants` on submitted scenarios is additive.
  Seeding `participants: []` WITHOUT `submitted` is what produces a genuine
  needs-editor state.
- **Reviewer-select copies the email template into TinyMCE client-side.** An
  uninitialized editor loses the body, and the save 500s on a null message.
  Wait for the editor's `initialized` before selecting. `ReviewStagePages`'s
  `addReviewer` does this; the 450ms modal slide used to mask the problem.

## Live-probe cookbook (spec verification)

Throwaway probes that check spec claims against the running app. These idioms
cost half a session to rediscover. One caveat first: the campaign's method
(RUNBOOK) forbids exploring a feature through hand-built requests, so the
request-context idioms below are for verifying a specific claim, never for
exploration.

- **Authenticate with Playwright request contexts, never bare curl.** Log in
  through the real UI form, then fire probes through `context.request` so the
  cookies ride along. `page.evaluate(() => window.pkp?.currentUser?.csrfToken)`
  supplies the CSRF header for mutating calls. curl login is a trap:
  multilingual journals 302 `/login` → `/en/login`, so a naive scrape reads an
  empty page and every later request runs anonymous.
- **An anonymous XHR to a legacy grid op returns a plausible JSON denial**
  ("You don't currently have access to that stage…"), indistinguishable from
  a real role denial. NEVER trust a DENIED verdict without (a) proof the
  session is live (an API GET returning 200) and (b) a positive control: a
  plainly entitled actor running the SAME op and getting ALLOWED.
- **Legacy grid-op URLs**: `.../$$$call$$$/grid/<path>/<op-name>` with the op
  HYPHENATED (`read-review`, not `readReview`) and the header
  `X-Requested-With: XMLHttpRequest`. A camelCase name or a missing header
  gives an opaque 500.
- **REST verbs vary per route** (`confirmReview` is PUT). A wrong verb can
  surface as a 500, not a 405. Check the `Route::` registration before
  concluding anything from an error status.
- **Scenario seeding in probes**: users are minted ONLY by the context
  scenario's `users[]` (an explicit `password` is honored, otherwise it is
  `username+username`). The submission scenario resolves usernames but never
  creates them. Multilingual fields accept a locale map (`{"en": …}`); a bare
  string is wrapped under the context's primary locale (`scenarios.md`).
- **Dual-role traps**: an author-editor probe needs a user genuinely enrolled
  in BOTH groups who is also the submitter. A bare stage assignment without
  the global author role does not trip author checks. A second `participants`
  entry for the same user rides on `build()`'s firstOr semantics (see
  `scenarios.md`).

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
npm run probe-servers -- --start                    # once per session: php -S per app at base+50, and +90
PROBE_FEATURE=U03 PROBE_AGENT=g1 node bin/probe.js all my-probe.js   # or ojs|omp|ops; ONLY=ojs,omp narrows
```

A script calls `forEachApp(fn)`; `fn` receives one app's bag: `{app,
name, root, baseURL, port, api, mail, users, contextPath, url(path),
variant('validation')}`. `api` is the `_test` client with that app's own
key, `mail` the shared Mailpit, `baseURL` the probe server (base port + 50),
`variant('validation')` the +90 server with email validation and ALTCHA on.
Everything per app travels in the bag, never in `process.env`, so one
process holds all three apps.

```js
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag} =
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

What each helper gives you: `launch(app)` is a 1280×900 Chromium with
animations off and a response listener that records URL, method, status and
size (never a body) of every `/api/` call and every status ≥ 400 into
`run-<app>.json`. `screen(page)` is the screen as data: the aria snapshot of
the main region (the body when the page has no `main`) and of every open
dialog, plus the verbatim `innerText` of header and main, because aria
snapshots normalise punctuation. `record(name, data)` writes JSON,
`shot(page, name)` a PNG, `loc(page, description, locator)` a row in
`locators.md` (selector, match count, visibility) for the test author.
`idle(page)` is `waitForJQueryIdle`; `tag(prefix)` makes a scratch tag that
follows the tag conventions above. `signIn` uses the roster password rule,
so it works for scratch users too.

Must not, in a probe script: assertions or `expect`; the test runner or its
fixtures; a generic request caller (drive the UI, or the `_test` API through
`api`); page objects (a probe reads the screen, it does not model it);
`clearAll` on Mailpit; edits to any config; `networkidle`; `waitForTimeout`;
starting a server (the probe servers are started once, outside scripts).
Tests never import the kit: `npm run lint:probe-imports` fails when
`playwright/probe` appears under `apps/` or `shared/playwright/{tests,pages,support}`.

Two premises that cost a smoke run: a scratch context has no technical
support contact, and the validation email's sender is that contact, so a
registration on the +90 server 500s until a manager sets it (Settings ›
Contact); and the frontend has no `main` landmark, so `screen()` gives you
the body there.

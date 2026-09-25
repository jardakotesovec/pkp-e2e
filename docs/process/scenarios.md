# Scenario API & Mailpit

The `/api/v1/_test/*` endpoints build realistic application state in one
POST. This file documents what
the endpoints accept today, the facts tests rely on, and how to assert on
email through Mailpit. Builders follow PRINCIPLES A2 and A3.

## How the endpoints work

The routes are site-wide: `/index.php/index/api/v1/_test/…`. They are gated
by the `X-Test-Key` header, which must match the `TEST_API_KEY` environment
variable of the PHP server. Without the variable the whole namespace answers
404. With a wrong header it answers 403. See `harness.md` for the variable
and for `bin/mount.js`, which copies the PHP code into the app checkouts.

Every mutating request runs inside one database transaction and under a
mail fake. A failed build rolls back, so it never leaves half-created
state. Mail sent while seeding is dropped, but each mailable is still built
the way the app's mailer builds it before sending, so the `email_log` rows
the app writes next to a send carry the compiled subject and body, as they
do after a real send. Only mail sent by the test's own
actions reaches Mailpit. The acting user during a build is the installer's
`admin` account.

Validation is strict. There is no JSON schema. The builders read the request
through the `Spec` reader (`shared/php/classes/testing/Spec.php`), and any
key no builder consumes fails the request with a 400 that names the key in
dotted form (`specKey`). The builder code is therefore the authoritative list
of accepted keys. The lists below are kept in step with it.

Multilingual fields (`name`, section `title` and `abbrev`, publication
`title`, `abstract`, `subtitle`, `plainLanguageSummary`) accept a locale map such as `{"en": "…"}`. A bare
string is wrapped under the context's primary locale. Pass a locale map when
the test needs a specific locale.

## `POST` / `GET bootstrap`

The base seed for a fresh database. The setup project posts the app's
`apps/<app>/playwright/fixtures/bootstrap.js` payload. A warm call (context
already present) does nothing and answers `{seeded: true, warm: true}`. The
`GET` form is the warm/cold probe and answers `{installed, seeded}`.

Payload keys:

- `context` with `path` (required), `name`, `acronym`, `description`,
  `primaryLocale`, `supportedLocales`, `supportedSubmissionLocales`,
  `contactName`, `contactEmail`, `enabled`.
- `sections[]` (OJS, OPS) or `series[]` (OMP). The first declared section
  renames the default section the app creates on context creation (OJS
  "Articles", OPS "Preprints") instead of adding a second one. OMP creates no
  default series. Section fields, OJS: `abbrev` (required), `title`,
  `policy`, `wordCount`, `abstractsNotRequired`, `identifyType`. OPS: `abbrev`
  (required), `path`, `title`, `policy`, `wordCount`, `abstractsNotRequired`.
  OMP series: `path` (required), `title`, `description`.
- `categories[]` with `path` (required), `title`, and nested `children[]`,
  seeded by the same code as the context scenario's `categories[]` below.
- `issues[]` (OJS only) with `volume`, `number`, `year` (all required) and
  `published`.
- `users[]` with roles and sub-editor assignments. Same shape as the context
  scenario's `users[]` below.

## `POST scenarios/context`

Creates a scratch journal, press or preprint server.

Keys:

- `tag` (required). At most 32 characters, a single alphanumeric token with
  no hyphens (see `patterns.md` for tag conventions). It becomes the context
  `path` unless you set one, and a second context with the same path fails
  with a 400.
- `context`: `path` (defaults to the tag), `name` (defaults to "Scratch
  context {tag}"), `acronym`, `description`, `primaryLocale`,
  `supportedLocales`, `supportedSubmissionLocales`, `supportedFormLocales`,
  `contactName`, `contactEmail`, `enabled`. `supportedSubmissionLocales`
  mirrors the Languages settings grid's submission toggles and keeps the
  metadata locales in step, exactly as the grid does. A scratch context
  needs `supportedLocales` to include a locale before that locale's URL
  segment (`/fr_CA/`) works there; the seeded journals already carry it as
  a UI language. `supportedFormLocales` mirrors the same grid's "Forms"
  column: a list of locale codes, each already in `supportedLocales`, the
  primary locale among them (the grid refuses to untick it; anything else
  is a 400). Each listed locale is ticked the way the grid ticks it (that
  locale's default settings texts restored, the reviewer recommendations'
  titles added in it on a journal or press, then the list saved through
  the context service), so every settings form and the Highlights panel
  carry one field set per listed locale: "Add Highlight" shows the
  "French" and "English" toggles and "Title in French" beside "Title". A
  context created without the key has the primary locale alone under
  "Forms", and its forms are single-language even with French under "UI".
- `sections[]` (OJS, OPS): same shape as in the bootstrap payload. The first
  entry renames the default section. OMP's context scenario does not accept
  a `series[]` list yet and answers 400 on the key.
- `categories[]` (the three apps): the bootstrap payload's shape and
  seeding code, each `{path, title?, children[]?}`, `children` a nested
  list of the same shape (subcategories, to any depth). Each category is
  created the way Settings › Journal (Press, Server) › "Categories" ›
  "Add Category" › "Save" creates it with "Name" and "Path" filled and
  the rest of the window left as it opens (no description, no cover
  image, no "Editorial Assignments", the "Order of …" list on
  "Publication date (newest first)"); a child the way the parent row's
  "More Actions" › "Add" does. `title` is a string (under the primary
  locale) or a locale map, default the path; an empty string reads as
  absent. Refusals (400, before the context exists): a path with
  anything but letters, digits, `/`, `.`, `_` and `-`, a path used twice
  anywhere in the list, a title locale the context's forms lack (add it
  to `context.supportedFormLocales` first), a missing path. Seeded after
  the sections, before `users[]`. The response lists every category as
  `categories` (`id`, `path`, `parentId`), depth first. The visitor's
  page of one is `catalog/category/{path}` (OPS
  `preprints/category/{path}`), and the Categories tab lists only the
  top-level ones until a row's "Expand sub-categories" is pressed (U10
  harness, 2026-09-24, three apps driven). A scratch context created
  without the key has no category: the submission lists' "Filters"
  window then offers no "Categories" (the U22, U23 and U28 suites rely on
  it on a scratch context), and on a journal the home page's "Include a
  listing of categories" row has nothing to list.
- `issues[]` (OJS only; OMP and OPS answer 400 on the key): the bootstrap
  payload's shape, each `{volume, number, year, published?}` (`volume`
  and `year` whole numbers, `number` a string or a whole number, all three
  required; `published` a boolean, default false). Each issue is created
  the way Issues › Future Issues › "Create Issue" › "Save" creates it with
  those three boxes filled and the form's "Title" box unticked (the form
  arrives with it ticked and then refuses an empty title): shown as "Vol.
  {volume} No. {number} ({year})", no title, its access status derived
  from the journal's publishing mode as the form derives it (open on a
  fresh journal), an empty title and description row in each form locale
  (the bootstrap's issues have neither row; nothing on screen differs). A `published` issue is then
  published the way the row's "Publish Issue" › "OK" publishes it with
  "Send an email about this to all registered users." unticked (the box
  arrives ticked; ticked, the screen also queues an email job per batch
  of the journal's users, which the seed does not): published today and
  made the journal's current issue, so with
  several the last published entry is "Current". Issues are created in
  list order after `users[]`. A published submission lands in one through
  the submission scenario's `issue` key below (U08 harness, 2026-09-24).
  The response lists the created `issues` (`id`, `volume`, `number`,
  `year`, `published`); an issue's page is `issue/view/{id}`.
  An entry's `coverImage`, `{file, altText?}` (U13 harness, 2026-09-24),
  is the form's "Cover image": `file` an image fixture basename (as for
  the submission's `files[]`, e.g. `profile-image-400.png`; anything but
  an image is a 400, as the form refuses it), uploaded before "Save" and
  stored as the form stores it, `cover_issue_{id}_{locale}.png` under the
  journal's public files, set for the primary locale (the manager's
  interface language). The create form has no alt-text box: `altText` is
  the box the issue's "Edit" › "Issue Data" tab shows beside the stored
  cover, saved there. The key is the context scenario's alone (the
  bootstrap payload answers 400 on it). A published article with no cover
  of its own shows its issue's cover on its page.
- `users[]`: throwaway accounts. Each entry takes `username` and `roles`
  (both required, roles non-empty), `givenName`, `familyName`, `email`
  (default `<username>@mail.test`), `password` (default: the username
  twice), `sections` or `series` (sub-editor assignments, by section abbrev
  or series path), and `orcid` plus `orcidIsVerified` for a pre-set ORCID
  iD, stored the way the submission key `author` below stores it
  (`orcidIsVerified: true` carries the sign-in completion's live
  permission, `false` the iD alone). Role keys are the app's default
  user-group keys. An unknown key fails
  with a 400 that lists the app's whole set. An entry naming an account
  that already exists (`admin`, a roster user) adds the roles to that
  account instead of creating one: the one way to give the site
  administrator a non-manager role in a scratch context, after which
  their manager role can be ended on their own edit page (U14 claim
  check K1, 2026-09-16); the screens never end a user's last role in a
  context, so a site administrator with no role there is unreachable (U42
  claim check, 2026-09-24). See `users.md` for the keys and
  their traps. A scratch context's reviewer is created here too: the seeded
  reviewers are not enrolled on a scratch context, so they are absent from
  its Add Reviewer search and refused the wizard.
  Three more per-entry keys feed the About pages (U07 harness, 2026-09-23,
  three apps):
  - `affiliation` (a string, or a locale map; a bare string lands under
    the context's primary locale): the Profile › Contact "Affiliation",
    the line "Editorial Masthead" and "Editorial History" print under the
    name. The Contact tab cannot save it without "Country*", so a by-hand
    affiliation always comes with a country; the seeded account has none
    (nothing on the About pages reads it).
  - `masthead`: a map from a role key of the entry (`roles` or
    `pastRoles`) to `true`, "Appear on the masthead" (every role's
    default), or `false`, "Does not appear on the masthead": the per-role
    choice of the invitation and of the users list's "Edit" page (its
    roles table's "Journal Masthead" select). A member seeded `false` is
    left off "Editorial Masthead" (and "Editorial History") for that
    role; the choice is per role. `false` on a reviewer role is a
    400: the table prints "Appear on the masthead" there and offers no
    choice. The screen's change sends the member an email the seed does
    not, and on OMP and OPS answers 500 after saving the choice (U06's
    register: the `USER_ROLE_MASTHEAD_UPDATE` template is missing there);
    the seeded row equals the saved one.
  - `pastRoles[]`, each `{role, dateStart?, dateEnd?}` (`YYYY-MM-DD`,
    start ≤ end ≤ today; both default to today): a role period that has
    ended, given and then ended the way the "Edit" page's "Remove Role"
    ends it (`endAssignments`: the end stamped now, the masthead and
    history lists refreshed). "Editorial History" lists the member under
    the role with "<start year> – <end year>" ("2026 – 2026" with the
    defaults, all a screen can make), and "Editorial Masthead" no longer
    does. An earlier start or end is a state no screen makes (the
    invitation moves a past start to today, and "Remove Role" ends now):
    the builder passes the start through the role service and writes the
    end onto the ended row (D9). `roles` stays required and non-empty:
    the screens refuse to remove a user's last role. The screen's
    "Remove Role" emails the member; the seed does not.
  `affiliation` and `pastRoles` are 400s on an account that already
  exists (the roster, `admin`): only a new account takes them.
  `disabled: true` disables the new account the way Settings › Users &
  Roles does (the row menu's "Disable User", the reason box left empty,
  "OK": `disabled` 1 and an empty reason, as on screen; U37 harness,
  2026-09-23, three apps). It is refused on an account that already
  exists, since a roster account is shared by every worker. The account
  is disabled when the context is created, before any submission seed,
  so a disabled participant seeded into `participants[]` or `tasks[]`
  gets none of the "Discussion added." rows or emails a seeded item
  sends: that is the state after an item saved while they were
  disabled, and it differs from "disabled after the item" only in the
  first message's row and email they would have had.
- `orcid`: the state of the ORCID settings tab, saved through the same
  service the tab's form uses. The defaults below apply only when the
  `orcid` key is given at all; a context created without it arrives with
  ORCID off (seed-facts.md "Install defaults", 2026-09-04). Keys `enabled`
  (default true), `apiType`
  (default Public Sandbox), `clientId` and `clientSecret` (dummy defaults),
  `city`, `sendMailToAuthorsOnPublication`. The OAuth exchange can never
  complete on a test install, because outbound HTTP fails fast at the
  dead-port proxy in `config.test.inc.php`, so dummy credentials are as good
  as real ones for every screen this state gates.
- `review` (OJS, OMP): the fields of Settings › Workflow › Review › "Setup"
  and "Reviewer Guidance", validated and saved the way those forms' save
  is. Keys, named as the forms name them: `defaultReviewMode`
  (`anonymous`, `doubleAnonymous`, `open`, or the form's 1/2/3),
  `defaultReviewPublicVisibility`, `restrictReviewerFileAccess`,
  `reviewerAccessKeysEnabled`, `reviewerSuggestionEnabled`,
  `numWeeksPerResponse`, `numWeeksPerReview`, `numReviewsPerSubmission`, the
  four reminder thresholds (`numDaysBeforeReviewResponseReminderDue`,
  `numDaysAfterReviewResponseReminderDue`,
  `numDaysBeforeReviewSubmitReminderDue`,
  `numDaysAfterReviewSubmitReminderDue`, whole days 0–14), `showEnsuringLink`,
  and the localized `reviewGuidelines`, `competingInterests` and, on OMP
  only, `internalReviewGuidelines`. A key the app's forms lack is a 400.
  OPS has no Review tab and answers 400 on the whole key, like
  `reviewRounds[]`.
- `reviewForms[]` (OJS, OMP): review forms created and activated the way
  the "Review Forms" grid does. Each entry: `title` (required, localized),
  `description` (localized), `active` (default true), and `elements[]` of
  `question` (required, localized), `description`, `type`, `required`
  (default false), `included` (the item's "Included in message to author"
  box, default true) and `options`. `type` is one of the grid's item types,
  `smalltextfield`, `textfield`, `textarea`, `checkboxes`, `radiobuttons`,
  `dropdownbox` (or its number 1–6); the last three need `options`, a list
  of response labels (or a locale map of lists). OPS answers 400.
- `copyrightNotice` (localized): the Copyright Notice of Settings ›
  Workflow › Submission › "Author Guidance", saved the way that form's
  save is. A scratch context has none until it is set. With one set, the
  wizard's "Review" step ends in a "Confirmation" section whose "Yes, I
  agree to the copyright statement." box must be ticked before "Submit"
  enables.
- `metadata`: the items of Settings › Workflow › Submission › "Metadata",
  each set to one of the words `off` (the item's box unticked), `enable`
  ("Do not request … during submission"), `request` ("Ask the author …")
  or `require`, exactly as that screen saves them. Items: `keywords`,
  `subjects`, `disciplines`, `agencies`, `coverage`, `rights`, `source`,
  `type`, `citations`, `fundingStatement`, `funders`, `dataAvailability`,
  `dataCitations`, `plainLanguageSummary`; an item the app's context
  schema lacks is a 400, and so is any other word. A fresh context has
  `keywords`, `citations` and `funders` at `request` and the rest off. An item at
  `require` is a submit blocker: the wizard's "Details" step shows its
  field and "Review" reports it until it is filled.
- `citationsMetadataLookup` (boolean): the same screen's "References
  Metadata Lookup" box, "Enable references structuring and metadata
  lookup", saved as that form saves (the screen posts the whole form,
  `citationsMetadataLookup=true` among it; stored as `1` / `0`). A fresh
  context has no row, which reads as off, so `publicknowledge` has lookup
  off. The form posts the box whether or not "Enable references metadata"
  is ticked, so the key does not read `metadata.citations` either. With
  it on, every reference added afterwards, typed or seeded, queues the
  lookup's job chain (one row in the `jobs` table per reference, first
  job `ExtractPidsJob`); the test install runs no job runner, so the
  chain never runs and the reference stays at processing status 0, not
  processed. Applies to the three apps alike; a non-boolean is a 400 (U42
  harness, 2026-09-24).
- `enablePublisherId`: the same screen's "Publisher ID" boxes, a list of
  the values of the boxes to tick, saved as that form saves (the screen
  posts `enablePublisherId[]=…` per ticked box, `enablePublisherId=` with
  none; stored as a JSON list, `[]` for none). The values are the app's
  own boxes, read from its form: a journal `publication` ("Enable for
  Publications"), `galley` ("Enable for Galleys"), `issue` ("Enable for
  Issues"), `issueGalley` ("Enable for Issue Galleys"); a press
  `publication` ("Enable for Monographs"), `chapter` ("Enable for
  Chapters"), `representation` ("Enable for Publication Formats"),
  `file` ("Enable for Files"); a preprint server `publication` ("Enable
  for Preprints") and `galley` ("Enable for Galleys"). Another app's
  value (OPS `issue`, which the preprint server's context schema allows
  but its screen does not offer), an unknown one, a value named twice
  and anything but a list of strings are 400s. A fresh context has no
  row, which reads as every box unticked, so `publicknowledge` has
  publisher IDs off; `[]` is the state after a manager unticks every box
  and saves. The list is stored in the order given (the screen stores
  the order the boxes were ticked; nothing reads the order). The screen's
  "Save" also writes every other item of the form; the key writes this
  row alone (U44 harness, 2026-09-24, three apps).
- `submissionAcknowledgement`: who gets the "Submission Confirmation"
  email of Settings › Workflow › Emails, `allAuthors` (the default),
  `submittingAuthor` or `off`; with it `copySubmissionAckPrimaryContact`
  (boolean, "Notify Primary Contact") and `copySubmissionAckAddress` (a
  string, "Notify Anyone", comma-separated as the box is typed; on OMP
  the press schema allows a single address, so a list is a 400 there as
  on the screen). Saved as that form saves: `off` and an empty address
  store no row, and a context saved at `off` reopens the Emails screen
  with no "Submission Confirmation" option selected, as it does after a
  by-hand save (U21's register).
- `postedAcknowledgement` (OPS only, boolean): the "Preprint Posted"
  option of Settings › Workflow › Emails, `true` "Send an email to all
  authors." (the install default) or `false` "Do not send an email.",
  saved as that form saves (the OPS `EmailSetupForm`'s own field, stored
  as `1` / `0`). It is what `SendPostedAcknowledgement` reads when a
  preprint is posted, so at `false` the "Preprint Posted Acknowledgement"
  is not sent while the version notice still is (U49 scenario 15). A
  non-boolean is a 400; OJS and OMP answer 400 on the key, as on any key
  their context schema lacks.
- `enablePublicComments` (boolean): the "Enable Public Comments" box of
  Settings › Website › the "Content" tab › the "Comments" side tab, saved
  as that form saves (its whole request is `enablePublicComments=true`, a
  form-encoded POST to `contexts/{id}`; stored as `1` / `0`). The tab is
  lib/pkp's, so the key applies to the three apps alike. Every fresh
  context carries the row at `0`, so `publicknowledge` and a scratch
  context without the key have comments off, and every comments scenario
  runs on a scratch context seeded `true`. With it on, a published
  article's landing page carries the two comments blocks (OJS only; a
  press's or preprint server's landing page has none) and every
  moderator's side menu the Content › Comments entry. A non-boolean is a
  400 (U14 harness, 2026-09-16).
- `restrictSiteAccess` (boolean): the first box of Settings › Users &
  Roles › the "Site Access Options" tab, "Users must be registered and
  log in to view the journal site." ("…press site." on OMP, "…server
  site." on OPS), saved as that form saves (one form-encoded POST to
  `contexts/{id}` with `X-Http-Method-Override: PUT`, carrying every box
  of the tab; stored as `1` / `0`). The form is lib/pkp's, so the key
  applies to the three apps alike. A fresh context has no row, which reads
  as unticked (seed-facts). The key writes the `restrictSiteAccess` row
  alone and leaves the tab's other boxes as the context has them.
  With it on, a signed-out visitor who opens the context's home page, a
  published article's (preprint's) page or its galley's address
  (`…/view/{id}/pdf`) lands on `{context}/login?source=…`; the context's
  own Login page stays open, and a Reader who signs in there reads the
  page and opens the galley. Seeding into such a context is unaffected
  (the scenario endpoint is site-wide), so a `published` submission is
  seeded after the key as on any context. A non-boolean is a 400 (U13
  harness, 2026-09-25).
- `enableAnnouncements` (boolean), `announcementsIntroduction` (localized
  text) and `numAnnouncementsHomepage` (a whole number of zero or more, or
  null for the box emptied): the three fields of Settings › Website › Setup
  › the "Announcements" tab ("Enable announcements", "Introduction", called
  "Additional Information" on a press, and "Display on Homepage"), saved as
  that form saves (one form-encoded POST to `contexts/{id}`, the Vue form
  sending PUT as a POST with an `X-Http-Method-Override` header, so a
  `waitForResponse` on method PUT never matches; stored as `1` /
  `0`, the text per locale, the number as typed). The tab is lib/pkp's, so
  the keys apply to the three apps alike, and it shows the text and the
  number only while the box is ticked. A fresh context has no row for any
  of the three: announcements off, no introduction, no home page block.
  A non-boolean, a non-string text, a negative number or text in the
  number are 400s (U12 harness, 2026-09-17).
- `sidebar`: the "Sidebar" list of Settings › Website › Appearance ›
  "Setup", a list of block plugin names in the order the sidebar shows
  them, saved as that form saves (the same PUT; stored as a JSON list). The
  names are what the form posts, the plugin's registry name: the
  lowercased class name for a stand-alone block (`informationblockplugin`,
  `languagetoggleblockplugin`, `browseblockplugin`, `subscriptionblockplugin`)
  and `AnnouncementFeedBlockPlugin` for the block the OJS Announcement Feed
  plugin provides. The form offers only the blocks of plugins enabled in
  the context, and the builder refuses the rest the way the save does
  (a 400 naming `sidebar` with the form's own message), so on OJS the feed
  block needs `plugins: {announcementfeedplugin: {enabled: true}}` in the
  same request. Applies to the three apps alike; a fresh context has no
  block placed. Not a list of strings: a 400.
- `roles`: a map from a role key (the keys of `users[].roles`, e.g.
  `sectionEditor`) to `{recommendOnly?, permitMetadataEdit?,
  permitSettings?, masthead?, stages?}` (at least one; the first four are
  booleans, `stages` a map, below):
  the "Role Options" boxes of Settings › Users & Roles › Roles, the role's
  "Settings" › "Edit" window ("This role is only allowed to recommend a
  review decision and will require an authorised editor to record a final
  decision.", "Permit submission metadata edit.", "Consider role in
  masthead list" and "Permit changes to Settings"). Saved
  by running that window's own form, so the save is the screen's: the
  role's flags, the audit-log line, and the role's stages saved again from
  the boxes the window shows. That last part is a parity fact: the window
  has a box for each workflow stage but none for the Done stage (6) the
  installer gives most roles, so a role saved through the key, as by the
  screen, loses its Done-stage row (OJS Section editor `1,3,4,5,6` becomes
  `1,3,4,5`, OPS Moderator `5,6` becomes `5`; U35 harness, 2026-09-22,
  three apps), and a manager-level role is saved with every workflow stage,
  as the form always saves it, so seed `roles.manager` only once a screen
  that saves the Journal Manager role has been driven. The roles the key
  names are saved before `components`, `taskTemplates[]` and `users[]`, so a
  context seeded with it has no assignment the metadata change could
  rewrite; the rewrite of existing assignments is a screen action. With
  `recommendOnly: true` the "Assign" window pre-ticks "Assignment
  privileges" for that role and `participants[]` defaults to it; with
  `permitMetadataEdit: false` it leaves "Permissions" unticked. Refusals
  follow the window: an unknown role key, `recommendOnly: true` on a role
  below sub-editor level (the window offers the box for the Journal
  Manager's and the Section Editor's levels only), `permitMetadataEdit:
  false` on a manager-level role (the form saves it on whatever is posted)
  and a non-boolean are 400s. The three apps alike.
  `masthead` (U07): `true` lists the role's members who chose to appear
  on "Editorial Masthead" under the role's name, `false` leaves the role
  off it and off "Editorial History"; any role takes it (on a reviewer
  role it changes nothing: reviewers are listed by their completed
  reviews). Install defaults: ticked on `editor`, `sectionEditor`,
  `externalReviewer` and `editorialBoardMember` (OPS: `sectionEditor`,
  "Moderator", and `editorialBoardMember`). A role ticked or unticked on
  screen after the masthead was last read shows so on the next load, three
  apps (driven 2026-09-23). `permitSettings` (U07): `false` on a
  manager-level role other than the Journal Manager (OJS and OMP `editor`
  and `productionEditor`) takes the Settings pages from its members: no
  "Settings" in the side menu, and a Settings address redirects to a page
  reading "The current role does not have access to this operation.".
  `true` below manager level is a 400 (the window disables the box there),
  and so is `false` on `manager`: its row has no "Settings" link, and the
  window disables the box on the acting user's only settings role, which
  `manager` is for the seeding admin. OPS has no manager-level role but
  `manager`, so the key cannot remove the Settings pages there.
  `stages` (U39): the same window's "Stage Assignment" boxes, a map from
  a stage word (those of `taskTemplates[].stage`: `submission`,
  `internalReview` on OMP only, `review`, `copyediting`, `production`,
  the only one on OPS) to `true` (ticked) or `false` (unticked); a box
  the map does not name keeps the state the installer gave it, so
  `roles: {copyeditor: {stages: {submission: true}}}` saves a
  journal's or a press's Copyeditor with Submission and Copyediting
  (`1,4`, the Done stage dropped as above), which the Roles list then
  shows ticked under both columns. Refusals follow the window: another
  app's stage word, a box the window disables for the role (a
  manager-level role shows no box, since its save always stores every
  stage; a reviewer role only its review boxes; a reader none), a
  non-boolean, an empty map, and a map that leaves no box ticked (the
  form's save then keeps the stored stages rather than clearing them)
  are 400s. Saved before `taskTemplates[]`, so a template's `roles`
  offers the role on the stage it gained. The three apps alike (U39
  harness, 2026-09-24: OJS and OMP Copyeditor with Submission, OPS
  Editorial Board Member with Production).
- `plugins`: a map from a plugin's lowercased class name (the Plugins
  grid's `plugin` id, e.g. `announcementfeedplugin`) to `{enabled,
  settings?}`. `enabled` (boolean, required) is the grid's "Enabled" box
  for that context, written as the grid writes it (the plugin's `enabled`
  setting for the context and the audit-log line; the grid's toast is
  not mirrored); `settings` is a map of setting name to scalar value,
  each written as the plugin's own settings window writes it
  (`Plugin::updateSetting`; the Announcement Feed window's are
  `displayPage`, one of `all`, `homepage`, `announcement`, and
  `recentItems`, a whole number above zero). A name that matches no
  installed plugin, a plugin the grid cannot enable or disable, a site-wide
  plugin (its state is global) or a non-boolean `enabled` are 400s. The
  Announcement Feed plugin is OFF on every fresh journal, `publicknowledge`
  included: its `settings.xml` is never installed (the plugin does not
  declare it as a context settings file), so a fresh journal has no
  `enabled` row, the Plugins grid lists it unticked, the feeds answer 404
  and the Appearance "Sidebar" list lacks the block until a manager ticks
  the plugin. Every feed scenario therefore seeds the plugin on (U12
  harness, 2026-09-17). "Site-wide" is asked the way the context's grid
  asks it, inside the context: the Custom Block Manager counts as
  site-wide only on Administration › Site Settings, so
  `plugins: {customblockmanagerplugin: {enabled: true}}` enables it for
  the scratch context on the three apps (the grid's "Custom Block
  Manager" row ticked, its "Settings" link offering "Manage Custom
  Blocks", whose window opens on "No custom blocks have been created.").
  The key seeds no block: `settings` on it is a 400, and blocks are added
  in that window. It is OFF on every fresh context, `publicknowledge`
  included (no `enabled` row). The Usage Event plugin stays refused as
  site-wide (U09 harness, 2026-09-24).
  The URN plugin (`urnpubidplugin`) is off on every
  fresh journal and press too, and its settings window always stores
  every one of its keys, so a seed gives every key the window writes,
  `urnCheckNo` at least: without it the article's "Identifiers" page
  renders empty (its form arrives with no fields), while `urnCheckNo:
  false` shows the URN box. On OPS `urnpubidplugin` is a 400, since a
  preprint server has no URN plugin (U44 claim check K1, K2, 2026-09-24).
- `themeOptions` (U13 harness, 2026-09-24, three apps): Settings ›
  Website › Appearance › "Theme", a map from an option of the context's
  theme (a scratch context always has the "Default Theme") to its value,
  e.g. `{displayStats: 'bar'}` ("Usage statistics display options": `none`
  "Do not display submission usage statistics chart for reader.", the
  default, `bar` "Use bar type of the chart for usage statistics
  display.", `line` "Use line type of the chart for usage statistics
  display."). A choice list takes one of its values, a group of boxes a
  list of them, a single box (`useHomepageImageAsHeader`, the summary box)
  `true` or `false`, a text box a string; an option the theme lacks and
  any other value are 400s naming the theme's options. Saved as the tab's
  "Save" saves: the tab posts every option of the theme as it shows them,
  the changed ones replaced (a box as `"true"` / `"false"`), so the
  options the seed does not name are stored at their shown value too
  (`typography notoSans`, `baseColour #1E6292`, …), as after a by-hand
  save; applied last in the build. Parity fact: a journal's "Journal
  Content Organization" shows (and so stores) "Include the current issue's
  table of contents" once the journal has an issue and "Include recent
  most published articles" before, so a seed with `issues[]` stores the
  first, as a manager saving the tab after creating them would. A fresh
  context has no row for any option: the tab shows the defaults
  (`displayStats` none, no chart), so every chart scenario seeds
  `themeOptions` on a scratch context.
- `components`: Settings › Workflow › Submission › the "Components" tab
  (its list "Article Components", "Monograph Components" on a press,
  "Preprint Components" on a preprint server), a map from a component's
  name to `false` or `{metadata?, dependent?, supplementary?, required?}`.
  A name among the components every new context gets, as the list shows
  it in the primary locale ("Article Text", "Research Instrument", …,
  "Other"; a press's "Book Manuscript", "Glossary", …), is that row's
  "Settings" › "Delete" with `false` (refused while a file uses it, as the
  grid refuses; in the database the row is disabled, not dropped, and on
  screen the Components list no longer shows it and no upload list offers
  it) or its "Settings" ›
  "Edit" › "Save" with an object; any other name is "Add a Component" ›
  "Save" with the name in the primary locale. `metadata` is the window's
  "File Metadata" list, `document`, `artwork` or `supplementary`
  ("Supplementary Content"); `dependent` and `supplementary` its two "File
  Type" boxes; `fileVariants` its "File Variants" box ("These files
  support file variants types, such as 'web' or 'high resolution'
  images."; ticked at install on "Image" alone, and `{Multimedia:
  {fileVariants: true}}` is U47's Settings bullet 2 state, "HTML
  Stylesheet" on a press, which has no Multimedia); `required` its
  "Require with Submissions" (`true` is "Yes,
  require submitting authors to upload one or more of these files.").
  Unset, an edit keeps the stored value and an added component gets the
  window's own start: Document, every box unticked, "No", an empty
  "Key". Both saves run the grid's own form, so the rows are the
  screen's (U36 harness, 2026-09-23, three apps; `fileVariants` U47
  harness, 2026-09-24, three apps). An unknown name with
  `false`, an edit that sets nothing, another word for `metadata` and a
  non-boolean box are 400s. Parity fact: "Add a Component" saves the new
  component at position 0, the first default's own position, so the list
  and the upload lists show the two in no fixed order (the grid and the
  wizard's list of one context differed; the same on screen and seeded).
- `taskTemplates[]`: templates of Settings › Workflow › "Tasks and
  Discussions", each `{stage, title, type?, dueInterval?, roles?,
  include?, message?}`. `stage` (required) is a stage word, `submission`,
  `review` (the external review), `internalReview` (OMP only),
  `copyediting` or `production` (the only one on OPS); another word is a
  400 naming the app's own. A `title` matching a template the new context
  already holds on that stage (the installed ones, named in the primary
  locale: "Discussion (Submission)", "Assign Editor", "Request Copyedit",
  …) is that row's "More Actions" › "Edit" › "Save", keeping what the
  entry does not set; any other title is the stage's "Add template" ›
  "Save". `type` `task` is "Enter task information" ticked, and a task
  needs `dueInterval`, the "Due Date" list's value: `P1W` ("1 week from
  the creation date"), `P2W`, `P3W`, `P4W`, `P1M`, `P1M15D` ("1.5
  months"), `P2M`, `P2M15D` or `P3M`; a discussion refuses it. `roles`, a
  list of role keys (those of `users[].roles`), is "Limit access to
  specific roles" with those boxes ticked; the window offers only the
  roles that work on the stage, so another is a 400. `include` (boolean)
  is "Automatically add this task and/or discussion when a submission
  reaches the stage", the list's "Auto-add at stage". `message` is the
  "Discussion" box (a bare string posted as a paragraph); a new template
  without one gets "Seeded template text for {title}.", since the box is
  required. The body the window posts goes through the templates API's own
  rules and controller, so every row is the screen's (U37 harness,
  2026-09-23, three apps). With `include` on, every later
  seeded submission that reaches the stage gets the item the application
  makes by itself, at the submit for the first stage and at the decision
  for a later one: "Created by: system", no participants (so only
  manager-level people see it), a task due after the interval with an
  empty "Task Owner:", its first message the template's text.
- `libraryFiles[]`: files of the context's Publisher Library (Settings ›
  Workflow › "Publisher Library", "Press Library" on OMP, "Preprint
  Server Library" on OPS), each `{name, type, description?,
  publicAccess?, file?}`, added the way the tab's "Add a file" window
  adds one (its upload, then "OK"), acting as `admin`. `name` (required,
  localized, at most 255 characters, not empty in the primary locale) is
  "Name"; `type` (required) a label of the "Type" list: `Marketing`,
  `Permissions`, `Reports` or `Other`, and on OMP also `Contracts`
  (another label is a 400 naming the app's list); `description`
  (localized) the "Description" box, empty by default; `publicAccess`
  (boolean, default false) the "Public Access" box; `file` a fixture
  basename as for the submission's `files[]`, default the app's PDF
  fixture (`article.pdf`, OPS `preprint.pdf`). The stored file is named
  after the uploaded one with the type code (`article-PER.pdf`; `-1`, `-2`
  after the code when the context already holds that name), and the
  response's `libraryFiles` gives it as `fileName` with the file's `id`,
  the number of the public address
  (`<context>/libraryFiles/downloadPublic/<id>`). The rows, their settings
  and the stored file are the screen's (U39 harness, 2026-09-24, three
  apps driven). On OMP the type codes are the positions of the press's
  own "Type" list (Contracts 0, Marketing 1, … Other 4), not lib/pkp's
  `LibraryFile` constants; the screen stores the same.
- `announcementTypes[]`: the "Announcement Types" tab's types, each
  `{name}` (localized, required in the primary locale), created the way the
  tab's "Add Announcement Type" window saves. `announcements[]`: the
  Announcements page's announcements, each `title` (localized, required
  in the primary locale), `descriptionShort` and `description`
  (localized rich text, as the panel's "Short Description" and
  "Announcement" boxes hold it: `<p>…</p>`), `dateExpire` (`YYYY-MM-DD`
  as the "Expiry Date" box is typed; any other shape is the panel's own
  refusal as a 400; a past date is accepted, so an expired announcement is
  seedable) and `type` (the primary-locale name of an entry of
  `announcementTypes[]`). Each is created the way the panel's "Save" is
  (the announcements API's add: the same validation against the context's
  form locales, the same model write, then the same queued notification
  for every user of the context with "Send an email…" unticked, so the
  job queue holds one job per seeded announcement until a test drains it;
  no email). Seeded after `users[]`, so the scratch users are among those
  notified, as they would be after a by-hand add. The image is not
  seedable (the panel builds it). The response lists the created
  `announcementTypes` and `announcements` with their ids, which the
  announcement's page address (`announcement/view/{id}`) needs. A
  scratch context's announcements page needs `enableAnnouncements: true`
  in the same request to be reachable (U12 harness, 2026-09-17).
  Announcements seeded in one request share a posted-date second, so
  their order on the public list and in the panel is arbitrary (it
  differed between OJS and OMP for one seed): a test that asserts order
  seeds distinct titles it finds by search, or adds the newest by hand
  (U12 claim check K4, 2026-09-17).

Users are created here and nowhere else. The submission scenario resolves
usernames but never creates them. The response returns `tag`, `contextId`,
`path`, the created `users` (id and username), `announcementTypes` (id and
name), `announcements` (id and title), `components` (`id`, `name`,
`action`: `added`, `edited` or `removed`, in the order seeded),
`taskTemplates` (`id`, `title`, `stage`, `action`: `added` or `edited`),
`libraryFiles` (`id`, `name`, `type`, `fileName`, `originalFileName`,
`publicAccess`, in the order seeded), `categories` (see `categories[]`)
and on OJS `issues` (see `issues[]`).

## `POST scenarios/submission`

Walks a submission to a declared end state through the same services the
wizard and the workflow screens use.

Keys:

- `tag` (required), `context` (required, the context's url path),
  `submitter` (required, an existing username).
- `title` (default "Submission {tag}"), `abstract` (default "Seeded abstract
  for {tag}."; sections that require an abstract need one, and the default
  satisfies them), `locale` (default: the context's primary locale).
- `submitted` (default true). An explicit `false` produces a true
  wizard-resumable draft: no `dateSubmitted`, `submissionProgress` set, and
  the author keeps metadata editing rights. It appears in the author's
  Incomplete list.
- `decisions[]`: real decision names, resolved per app (`sendExternalReview`,
  `accept`, `requestRevisions`, …: the lowercased class name of the app's
  decision type). An unknown name fails with a 400 that lists the app's
  roster. A decision that moves the submission into a review stage
  (`sendExternalReview`, OMP's `sendInternalReview`) creates that round and
  seeds the next `reviewRounds[]` entry into it; `newExternalReviewRound`
  (and OMP's `newInternalReviewRound`) creates its round but consumes no
  entry, so that round gets no reviewers, and every entry left after the
  decisions builds a further round of its own.
- `reviewRounds[]`, each with `files[]` (see `files[]` below) and
  `reviewers[]` of `{username, status, reviewForm, recommendation,
  comments}` where `status` is `invited`
  (default), `accepted`, `declined` or `completed`, and `reviewForm` is the
  exact title of one of the context's active review forms (seeded through
  `reviewForms[]`), attached the way the reviewer row's "Edit" window
  attaches it; a missing or inactive title fails with a 400 that names the
  active titles. A form becomes uneditable on screen the moment a request
  carries it, so text to type on the form (a second language, a renamed
  item) is typed before the reviewer is seeded. A reviewer named here
  leaves the Add Reviewer search, so a script that both seeds a request and
  opens Add Reviewer seeds a spare `externalReviewer` in the context's
  `users[]`. `completed` is a review accepted and submitted through the
  reviewer wizard's own step forms: the editor's row reads "Review
  Submitted" with "Read Review", and the reviewer's list shows it under
  "Completed". Its two optional inputs are step 3's: `recommendation` (OJS
  only: `accept`, the default, `pendingRevisions`, `resubmitHere`,
  `resubmitElsewhere`, `decline` or `seeComments`, resolved against the
  journal's active recommendations; a 400 on OMP, whose step 3 has no such
  list) and `comments` (the "For author and editor" text, default "Seeded
  review comments for {tag}.", stored as the paragraph TinyMCE posts). Both
  are a 400 on any other status, and `completed` refuses a review form with
  required questions, as the wizard does. A third, `dateCompleted`
  (`YYYY-MM-DD`, today or earlier; `completed` only, a 400 otherwise),
  backdates the submitted review: the wizard completes it today, then
  every date of the assignment (requested, notified, accepted, completed,
  both due dates) moves by the same number of days, so it reads as a
  review requested, accepted and submitted around that day; the
  submission, round, notifications and activity log keep today's dates
  (D9: no screen submits a review on another day). A review submitted
  last calendar year is what lists its reviewer under "Peer Reviewers in
  Previous Year" on "Editorial Masthead" (OJS and OMP; on OMP only an
  external-review round counts), with the sentence naming that year
  (U07 harness, 2026-09-23). A seeded `accepted` assignment
  opens the wizard on step 1 (the on-screen accept lands on step 2). These
  are the only per-reviewer keys. Due dates and the review method are not
  parameters:
  the builder stamps them exactly as the Add Reviewer form does, from the
  context's `numWeeksPerResponse` and `numWeeksPerReview` and its
  `defaultReviewMode` (double-anonymous when unset). Any other key fails
  with a 400.
- `participants[]` of `{username, role, recommendOnly, canChangeMetadata}`:
  extra stage assignments for people other than the submitter, the same
  row the workflow's Assign Participant form writes, without that form's
  email and notification. `recommendOnly` and `canChangeMetadata`
  (booleans) are that window's "Assignment privileges" and "Permissions"
  boxes; each defaults to the role's own setting, as the window pre-ticks
  it (the context key `roles`), so an install-default Section Editor is
  seeded with the permission and without the limit. A seeded
  `recommendOnly: true` row reads "Only allowed to recommend an editorial
  decision" under the person's role in the Participants panel. Refusals
  follow the window: `recommendOnly: true` on a role below sub-editor level
  and `canChangeMetadata: false` on a manager-level role are 400s (U35
  harness, 2026-09-22, three apps).
- `published` (default false). Requires `submitted: true`.
- `author`: `{orcid, orcidIsVerified}` on the submitter's contributor record.
  `orcidIsVerified: true` stores what ORCID's own sign-in leaves when the
  emailed link completes, the verified mark plus a live permission: a
  fixture access token (`test-orcid-access-token-<tag>`, a fixture like the
  dummy client credentials, since ORCID's service is unreachable), the
  scope the app requests for the context's API type (`/authenticate`
  public, `/activities/update` member), a refresh token and an expiry
  twenty years out, the lifetime ORCID's tokens carry. `false` stores the
  iD alone, the typed-in, unauthenticated state. The app's own gates read
  the token, not the mark, so the two states differ on screen: with the
  ORCID tab's author-email toggle on, recording Accept queues the
  "Submission ORCID" request for the unauthenticated contributor and
  nothing for the verified one (U04 scenario 8; read from the queue table
  after seeded Accepts, 2026-09-13, OJS and OMP), and the contributor form
  shows the verified one's solid-icon iD with Delete and no "Request
  verification" (the Contributors list itself shows no iD). A verified iD
  whose token the app has since dropped as expired, a state a deposit
  produces, has no key.
- `reviewerSuggestions[]` (OJS, OMP): the entries of the wizard's "Reviewer
  Suggestions" step, each `{givenName, familyName, email, affiliation,
  suggestionReason}`, created the way the step's "Add Reviewer Suggestion"
  window creates them, before the submit. `givenName` and `email` are
  required and `familyName` is optional; `affiliation` (default "Seeded
  affiliation for {tag}") and `suggestionReason` (default "Seeded suggestion
  reason for {tag}.", stored as the paragraph the rich-text box posts) are
  required on the window, so the seed fills them. The name, affiliation and
  reason boxes are multilingual: a bare string lands under the context's
  primary locale; a locale map must carry that locale and may name only the
  context's form locales. The window's refusals are the seed's: an invalid
  address or a second entry with the same address is a 400. The context's
  `review.reviewerSuggestionEnabled` must be on, because the step exists
  only then (a 400 otherwise); OPS answers 400. The address is what the
  editor's panel matches against accounts, so an entry carrying a seeded
  user's address (`<username>@mail.test`) is "a person with an account".
  No entry is ever marked approved or turned into a reviewer: that is the
  panel's "Add Reviewer", driven on screen.
  An address once turned into a reviewer through "Create New Reviewer" or
  "Enroll Existing User" is an account with the Reviewer role for every
  other submission of the context, so a scenario that needs the Create or
  Enroll path seeds a fresh address per submission. Live-driven 2026-09-06,
  OJS and OMP (`.reports/U31/cc-K3.md`).
- `userComments[]`: reader comments on the published publication, each
  `{user, text, approved, reports}`. `user` (required) is an existing
  username, the writer; `text` (required) the comment; `approved` (default
  `false`) leaves it pending or marks it approved the way the Comments
  page's "Approve Comment" does (`approvedAt` now, `approvedByUserId` the
  seeding admin, a manager of every scratch context); `reports[]`, each
  `{user, note}` (both required), the reports the landing page's "…" ›
  "Report" dialog files. The comment is created as the landing page's
  "Submit" creates it (`POST comments`) and the report as the dialog's
  "Submit" does (`POST comments/{id}/reports`), and each fires the
  moderators' task the screens fire: one "A comment has been submitted and
  is pending review by a moderator." row per manager and site admin of the
  context, one "A report was submitted for a comment and requires review by
  a moderator." row per report (the controller's own fan-out; no email).
  Refusals follow the screens: the key needs `published: true` (a 400
  otherwise; the box exists on a published landing page only), a report
  needs `approved: true` (nobody but the writer sees a pending comment, so
  only an approved one can be reported) and a reporter other than the
  writer (one's own menu has no "Report"); an unknown username, an empty
  text or note and a non-boolean `approved` are 400s. Text and note are
  stripped as posted text is (`stripUnsafeHtml`), so a `<script>` tag in
  either is dropped. The key applies wherever the Comments page exists,
  so OMP and OPS accept it too, with the seeded rows listed on their
  Comments page; the landing-page blocks are OJS's alone. The key does not
  read the context's `enablePublicComments` (the API does not either):
  seeded comments on a comments-off context exist and list on the Comments
  page, which is the "switched off with comments kept" state.
  A batch seeded in one call is created within the same second and the
  Comments page (newest first) lists it in no fixed order, and past
  "Items per page" rows the older ones land on page 2: seed a comment a
  test must find by row in its own later call, or open it by its
  address `?commentId=N` (U14 claim check K3, 2026-09-16).

- `files[]` (OJS, OMP): files on the Submission stage's "Submission
  Files" list, each `{file, genre?, uploader?, note?}`. `file` is a
  fixture basename, as for `galleys[]` below (`article.pdf`, `notes.md`,
  `article.html` for an HTML file with "Dependent Files"); the list shows
  the fixture's own name. `genre` is the component, by the name the
  upload lists show ("Article Text", "Book Manuscript", "Other", …, or one
  a `components` seed added); it must be one they offer (enabled, not a
  dependent one such as "Image": that is offered only by "Upload a
  Dependent File"), and it defaults to the first main-work component
  ("Article Text", a press's "Book Manuscript"). `uploader` (default the
  submitter) decides the path: the submitter's file is the submission
  wizard's "Files" panel ("Add File", then the component's button),
  uploaded before the submit, so a `submitted: false` draft carries it
  too; anyone else's is the workflow's "Submission Files" › "Upload"
  wizard after the submit, acting as that person, who must be offered it
  (the site admin, a manager of the context, or a sub-editor or assistant
  in this request's `participants[]`; anyone else, or any other uploader
  on a draft, is a 400). `note` is a note on the file, the file's "More
  Actions" › "More Information" › "Notes" › "Add Note", written by `admin`
  (the Notes tab reads "admin admin" as its writer); a draft has no
  "More Information", so a note there is a 400. Each
  `reviewRounds[].files[]` entry, `{file, genre?}`, is a file on that
  round's "Files for Review": "Upload/Select Files" › "Upload Review
  File" by `admin`, then the window's "OK" with the new row ticked (the
  file is marked viewable), before the round's reviewers are added; each
  seeded reviewer is then given every file of the round, as the "Add
  Reviewer" form's file list, all ticked, gives them, so the reviewer's
  step 1 lists them under "Review Files". Every file is written as its
  screen writes it (U36 harness, 2026-09-23, OJS and OMP driven), the
  files' uploader aside: a round file's uploader and its log rows name
  `admin`, where a screen upload names the editor. OPS answers 400 on
  both: a preprint server shows no workflow file list.
- `galleys[]` (OJS, OPS): galleys on the submission's current publication,
  each `{label, locale, file}` or `{label, locale, urlRemote}`, created the
  way the workflow's "Galleys" page creates them, after the decisions and
  before a publish (an editor builds the galleys, then publishes, so a
  `published: true` seed carries them published). `label` is required (the
  "Create New Galley" window's own rule); `locale` defaults to the
  submission's locale and must be one the window's list offers (the
  context's submission locales); the window itself preselects the
  context's primary language instead, so a seeded galley on a submission
  in another language differs from a by-hand one left at the window's
  default (U46 ccK2, 2026-09-24); exactly one
  of `file` or `urlRemote` is named (a 400 otherwise). A seeded galley's file reads
  back only through the publication's "Preview" › galley link ›
  "Download" (its suggested file name); the Galleys page shows only
  "<label> <language>" (U36 K5, 2026-09-23). On OPS a seeded galley's file
  is what gives a preprint its "More Information" window ("Information
  Center: <label>", with "History" and "Notes"; U38 claim check,
  2026-09-23). `file` is a basename
  under `apps/<app>/playwright/fixtures/files/` (`article.pdf` on OJS,
  `preprint.pdf` on OPS; `bin/mount.js` copies the folder into the
  checkout, so a new fixture needs a re-mount) and is stored as the
  wizard "Upload a File Ready for Publication" stores it: a real file in
  the submission's directory, a submission file at the proof stage hung on
  the galley, named after the fixture, of the genre the wizard's list
  offers first ("Article Text" / "Preprint Text"; the list preselects
  nothing, and the seed has no `genre` key), and the wizard's four
  activity-log rows. `urlRemote` is the window's "Remotely hosted content"
  galley, with no file. Each galley is created acting as `admin`, so the
  file's uploader and the log rows' user are `admin`, where a screen
  upload names the editor; everything else, the notification rows
  included, is what the screen leaves (parity ledger 2026-09-19); on OPS
  the Author's "Change File" is refused on a file someone else uploaded,
  so it is always refused on a seeded galley (U46 OPS3). Seeded galleys,
  like by-hand ones, are all stored at position 0, so the page's order is
  loose until an order is saved (U46 A7). No key makes a second version:
  a test uses the header's "Create New Version". OMP
  answers 400: a press has publication formats, not galleys.
  Two more per-entry keys (U13 harness, 2026-09-24, OJS and OPS driven):
  `urlPath`, the window's "URL Path", refused as the window refuses it
  (letters, digits and single `.`, `-`, `_` between them; not a number;
  not a URL Path a galley listed before it has), so the galley's link
  reads `…/view/{article}/{urlPath}`; and `genre`, the upload wizard's
  component, by the name its list shows ("Data Set", "Other", …), one of
  those the list offers (enabled, not dependent: "Image", "HTML
  Stylesheet" and "Multimedia" are 400s, the wizard never offers them);
  without it the first the list offers ("Article Text", "Preprint
  Text"). A galley of a supplementary component ("Research Instrument" to
  "Source Texts", "Other") is listed under the landing page's "Additional
  Files". A `urlRemote` galley takes neither (the window hides "URL Path"
  once the remote box is ticked and opens no wizard): both are 400s there.
  OJS has `article.xml` too, a small JATS article ("A JATS fixture
  article", an abstract, one section, one reference) for an XML galley,
  which the "eLife Lens Article Viewer" lays out on the journal's page;
  a preprint server has no XML reader, so OPS has no XML fixture, and no
  `notes.md` either (its text fixture is `not-an-image.txt`).

- `tasks[]`: discussions and tasks on a stage's "Tasks & Discussions"
  panel, each `{title, creator, participants, type?, stage?, owner?,
  dateDue?, started?, message?}`, saved after everything else in the
  request (decisions, rounds, galleys, publish) as the panel's "Add" ›
  "Save" saves them. `title` is "Name"; `creator` (required) the username
  of the person who pressed "Add"; `participants` (required) the usernames
  ticked under "Participants", the creator included when they are ticked
  (the window pre-ticks them). `type` is `discussion` (the default) or
  `task`; a task needs `owner` (one of `participants`, the "Task owner"
  radio) and `dateDue` (`YYYY-MM-DD`), and `started` is the drop-down,
  `true` (the default) "Begin Task Upon Saving", `false` "Create Task
  (Do Not Start)"; a discussion refuses all three. `stage` is a stage word
  as for the context's `taskTemplates[]`, default the submission's
  current stage, and must be one the submission has reached (a later
  panel is not on screen yet). `message` is the first message (default
  "Seeded message for {tag}.", a bare string posted as a paragraph). The
  window's JSON body goes through the tasks API's own rules and
  controller, acting as the creator, so the refusals are the window's
  (Rule 8: participants assigned to that stage or manager-level, the
  creator among them unless manager-level, two for a discussion, one
  owner for a task, the anonymous-review rules; a 400 with the app's
  text) and every row is the screen's: the item, its participants, the
  head note, the History's "created" (and "initiated") line, one
  "Discussion added." Tasks row and one email-log row per participant and
  the creator (mail is faked), and on Copyediting and Production the
  stage notices' update (U37 harness, 2026-09-23, three apps driven). The
  one lifted rule: the window refuses a due date before today, so a past
  `dateDue` stands for a task whose due date has passed since it was
  saved; the item's other dates are the seed's time, so its History says
  it was created after its due date. A draft (`submitted: false`) refuses
  the key. The three apps alike.
- `libraryFiles[]`: files of the submission's Submission Library (the
  workflow header's "Library"), each `{name, type, description?, file?}`,
  the same values as the context's `libraryFiles[]`, added after
  everything but `tasks[]` the way the "Submission Library" window's "Add
  a file" adds one (its upload, then "OK"), acting as `admin`. The
  window has no "Public Access" box, so `publicAccess` is a 400, and a
  draft (`submitted: false`) refuses the key (no workflow, no "Library").
  The response's `libraryFiles` has the same fields as the context's. The
  rows, their settings and the stored file are the screen's, and the
  window lists a seeded file as it lists a by-hand one (U39 harness,
  2026-09-24, three apps driven). The key works on `publicknowledge`
  submissions too: a Submission Library file belongs to its submission.
  The stored name, though, is picked from the whole context's library
  (both libraries, every submission), so on `publicknowledge`, where
  other workers seed the same fixture, it is not predictable
  (`article-MAR.pdf` or `article-MAR-3.pdf`), and a test that asserts
  the downloaded name (U39 Rule 8a) seeds its submission in a scratch
  context, or reads `fileName` from the response. Two workers seeding at
  once can even get the same stored name (neither sees the other's
  uncommitted row) and share one stored file, so a test that deletes a
  library file seeds it in a scratch context.
- `citationsRaw`: the wizard's "Details" step "References" box, a string
  (one reference per line, as typed) or a list of lines (joined with
  newlines; a null or empty entry is a blank line). Saved the way the
  step's save sends the box (its PUT to the publication, whose save
  rebuilds the version's reference list from the text), before the submit
  and as the submitter, so a draft carries it too. The rows are the
  screen's: one reference per non-blank line in line order, ends trimmed
  and inner runs of spaces shrunk to one, a repeated line kept as a
  second reference (the wizard's rule, not the References page's "Add",
  which drops a repeat); with lookup off no DOI is kept from the text
  (the wizard path's own behavior, U42 A7), with lookup on each reference
  queues the chain (`citationsMetadataLookup` above). The key does not
  read the context's References setting: references seeded on a context
  with `metadata.citations: 'off'` are the "switched off with references
  kept" state. A string that is not
  text is a 400. The three apps alike (U42 harness, 2026-09-24).
- `dataCitations[]`: data citations on the current publication, each
  `{title, relationshipType, identifierType?, identifier?, repository?,
  year?, authors?, url?}`, added the way the Data Citations table's "Add
  Data Citation" › "Save" adds one (the panel's body through the data
  citations API's own add), in list order, before the submit and as the
  submitter (the wizard's "Data" section and the workflow's "Data" page
  post the same body). `title` (required) is "Title";
  `relationshipType` (required) the "Relationship type" list's value,
  `supporting`, `generated`, `analyzed` or `non-analyzed`;
  `identifierType` the "Identifier type" list's label, `DOI`,
  `Accession`, `PURL`, `ARK`, `URI`, `ARXIV`, `ECLI`, `Handle`, `ISSN`,
  `ISBN`, `PMID`, `PMCID` or `UUID`, and `identifier` the "Identifier"
  box (each needs the other); `repository` "Repository"; `year` a
  whole number, "Year" (four digits); `authors[]` the "Creators" rows,
  each `{givenName?, familyName?, orcid?}`; `url` "URL". The panel's
  refusals are the seed's 400s (a missing title or relationship type,
  another word for either list, an identifier invalid for its type, a
  year not four digits, a malformed address), and an identifier typed as
  an address is stored bare, as on screen (`https://doi.org/10.1234/xyz`
  becomes `10.1234/xyz`). Every row has the order 0 a panel save gives
  it, so the table lists them in the order seeded until someone saves an
  order. The key does not read the context's Data Citations setting
  (stored data citations outlive the setting being switched off). The
  response lists `dataCitations` (`id`, `title`, in the order seeded).
  The three apps alike (U42 harness, 2026-09-24).
- `mediaFiles[]`: media files on the current publication's "Media" page,
  each `{file, genre?, resolution?, name?, pair?}`, added the way the
  page adds them, acting as `admin`, after the galleys and before a
  publish (so a `published: true` seed carries them on the published
  version): every entry is a card of one "Add Media File" › "Upload Media
  File" window (its upload, then one "Upload Files" for all of them),
  then each `name` is that row's "Edit Metadata" › "Save", then, if any
  entry has a `pair`, one "Batch Link Media" › "Link Media". Each step
  runs the media files API's own action on the body the window sends.
  `file` (required) is a fixture basename, as for `galleys[]`
  (`figure.png`, a 120×80 PNG, is the image `article.html` and
  `preprint.html` name). `genre` is "What kind of media is this?", a
  component name as the list shows it (every component marked as a
  dependent file: "Multimedia", "Image", "HTML Stylesheet" on a new
  journal or preprint server, "Image" and "HTML Stylesheet" on a new
  press, or one a `components` seed ticked `dependent` on); it defaults
  to "Image". `resolution` is "File resolution type", `web` (the
  default, "Web resolution") or `high_resolution` ("High resolution"),
  the latter only for a component with "File Variants" ticked.
  `name` is "Name of the file" (default the fixture's own name, as the
  upload names it): it is what an HTML galley's `src` or `href` has to
  match for a reader to see the file. `pair` is a label two entries
  share, one `web` and one `high_resolution` of the same component: the
  two are linked as the web file's "Batch Link Media" row set to the
  other links them, the shared details copied from the web file. The
  window's refusals are the seed's 400s (a component the list does not
  offer, a `high_resolution` it greys out, an empty name, a `pair` that
  is not one file of each resolution in one component), and a draft
  (`submitted: false`) refuses the key: the page is on the workflow.
  The rows, the stored files, the Activity Log lines and the page's list
  are the screen's, the uploader included, since the screen was driven
  as `admin` (U47 harness, 2026-09-24, three apps driven; parity
  ledger). All entries of one seed are one "Upload Files", so they share
  their upload second, and the page's newest-first list shows them in
  no fixed order among themselves (a pair stays together). The response
  lists `mediaFiles` (`submissionFileId`, `file`, `name`, `genre`,
  `resolution`, `variantGroupId`, null for a file with no counterpart,
  in the order seeded). No key makes a second version: a test uses the
  header's "Create New Version", which copies them (U47 Rule 9). A reader
  fact for the published side: the HTML galley plugin serves a reader who
  is not signed in a copy of the galley's page cached for 24 hours under
  the galley's id, built at the first such view and dropped by nothing
  (not by a media change, not by `reset:<app>`, which leaves
  `checkouts/<app>/cache/` alone), so after a reset a new galley can
  inherit an old install's cached page with the images unresolved; a
  signed-in reader always gets a fresh page (U47 harness, 2026-09-24).
- `publicationFormats[]` (OMP): publication formats on the current
  publication, each `{name, file?}`, every one built through to the state
  a reader sees, the way the "Publication Formats" page builds it, acting
  as `admin`, after the media files and before a publish: "Add
  publication format" with `name` in "Name" (the "Publication Format"
  list left on its preselected "Digital (on physical carrier) (DA)", the
  other boxes empty) and "OK"; for a `file`, the format row's "Change
  File" upload (the proof stage, the component the wizard's list offers
  first, "Appendix" on a new press, as for `galleys[]`), then the file
  row's "Set Terms", "Open Access", "Save"; then the format row's
  "Awaiting Approval" › "OK"; and, after the publish (at the end of the
  build on an unpublished seed), its "Not Available" › "OK". So the format
  reads "Approved" and "Available", and its file "Open Access", while the
  file's own "Awaiting Approval" stays (the reader does not need it).
  `name` is required, a string (the submission's language) or a locale
  map over the press's submission languages that fills the submission's
  one; `file` is a fixture basename, as for `galleys[]` (`article.html`
  names `figure.png`, so with `mediaFiles: [{file: 'figure.png'}]` and
  `published: true` the book page lists the format and its "HTML" link
  opens the file with the image resolved, "HTML Monograph File" being on
  in a new press). A draft (`submitted: false`) refuses the key. A press
  with a public-identifier plugin (URN) enabled for publication formats
  ticks an "Assign" box in the approval window that the seed cannot
  honour, so that seed is a 400: build such a format on screen. A new
  press can be such a press without anyone enabling URN: plugin settings
  are cached for 24 hours per context id, and `reset:<app>` leaves
  `checkouts/<app>/cache/` alone, so a scratch press whose id an earlier
  install used can inherit that install's URN settings (seen on context
  297, U47 harness pass 2). The
  rows (the format, its file, the Activity Log lines, the notifications)
  and the book page are the screen's (U47 harness pass 2, 2026-09-25,
  parity ledger). The response lists `publicationFormats` (`id`, `name`
  in the submission's language, `submissionFileId`, null with no
  `file`). OJS and OPS answer 400: a journal and a preprint server have
  galleys (`galleys[]`).

- The version's display values (U13 harness, 2026-09-24, OJS and OPS
  driven), typed by the editor (`admin`) on the workflow's publication
  pages after everything but the galleys and the publish, each page's
  fields saved in that page's own "Save" (a PUT to the publication), in
  the shape the page posts them:
  - "Title & Abstract": `subtitle` (a string or a locale map; posted as
    typed) and `plainLanguageSummary` (the same; typed text posted as a
    paragraph, `<p>…</p>`, markup kept).
  - "Metadata": the term lists `keywords`, `subjects`, `disciplines` and
    `supportingAgencies` ("Supporting Agencies"), each a list of terms
    under the submission's locale or a locale map of lists, one chip per
    term (stored as the chips store them, in order); on OJS
    `articleNumber` ("Article Number", a string).
  - "Publication Settings" (OPS "Preprint entry"): `categories`, a list
    of category paths of the context (seed them with the context's
    `categories[]`), selected in that order; `coverImage` `{file,
    altText?}`, "Cover Image" and its alt-text box under the submission's
    locale (an image fixture, e.g. `profile-image-400.png`, uploaded as
    the box uploads it and moved to the context's public files as
    `submission_{id}_{publicationId}_coverImage_{locale}.png`); `urlPath`,
    "URL Path".
  Every refusal is the page's own, a 400 naming the key: a URL Path that
  is a number, has other characters, or is another submission's; a locale
  the submission's metadata languages lack; an unknown or repeated
  category path; a cover that is not an image. The keys need
  `submitted: true` (a draft has no publication pages) and do not read
  the context's Metadata items or its "Article Number" setting, which
  only decide what the pages offer: the landing page shows what is
  stored, so a term list seeded on a context with the item off is the
  "switched off, terms kept" state (seed `metadata` too for the offered
  one). With `published: true` the values are the published version's.
  A seeded version reads as a typed one on each page (the same chips,
  categories, cover preview and alt text, URL Path) and in the rows,
  which equal the screen's, the Activity Log's one "metadata updated"
  line per page saved included. OMP answers 400 on every one of these
  keys: a press keeps its cover, categories and URL Path on the
  "Catalog Entry" page, which no parity drive has read.

App-specific keys:

- OJS: `section` (abbrev; defaults to the journal's first section) and
  `issue` (`{volume, number, year}` matching a seeded issue, used when
  `published` is true). `published: true` into an issue not yet published
  gives a scheduled article (status 5, the workflow's "Assign To Future
  Issue and Schedule Only"), not a published one; an article published at
  once into a future issue comes only from the workflow's "Assign To
  Future Issue and Publish Immediately" (U10 claim check K2, 2026-09-24).
- OMP: `series` (path) and `seriesPosition`, both optional; `workType`
  (`monograph`, the default, or `editedVolume`); and per review round
  `stage: internal | external` (default external).
- OPS: `section` (abbrev or path; defaults to the server's first section).
  `reviewRounds` is rejected with a 400, because OPS has no review stage,
  and so is `reviewerSuggestions`, because OPS mounts no reviewer
  suggestions and its wizard has no such step, and `files`, because a
  preprint server shows no workflow file list.
- OMP: `galleys` is rejected with a 400, because a press has publication
  formats and no "Galleys" page (`publicationFormats[]` above is the
  press's counterpart; OJS and OPS reject that key the same way).

Facts tests rely on, all parity-checked against the UI path:

- A submitted seed carries the same notifications the real submit endpoint
  creates, and the submitter is the publication's primary contact.
- Seeded submissions carry no files unless `files[]` or
  `reviewRounds[].files[]` names them (a `galleys[].file` or
  `publicationFormats[].file` proof file and `mediaFiles[]` aside). A test whose behavior under test is the upload itself uploads
  through the panel under test. The wizard's required-genre check blocks a
  seeded draft's submit until a file of the required component is on it.
  Review-round files are also grant-based; see `patterns.md`: a reviewer
  seeded on a round before the file existed is not given it.
- A real wizard submit auto-assigns the section's editors on
  `publicknowledge` only (the install's first context; a scratch context
  gets none, `seed-facts.md`), so `participants` on a submitted seed is
  additive there. Seeding `participants: []` together with
  `submitted: false` is what produces a genuine needs-editor state.
- A seeded participant is not everything the screen's "Assign" leaves
  (U35 harness, 2026-09-22, three apps): the submission's Activity Log has
  no "participantAdded" line for it, and an editor seeded on a submitted
  seed leaves the "needs an editor" task rows
  (`NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_REQUIRED`, one per manager) in
  place, where the screen's "Assign" of an editor deletes them. A test
  about the task, the log line or the "Needs editor" state assigns the
  editor on screen.
- An author-editor state needs a user enrolled in both groups who is also
  the submitter; a bare stage assignment without the global author role
  does not trip author checks. A second `participants` entry for the same
  user rides on `build()`'s firstOr semantics ("Decision behaviour worth
  knowing" below). On a scratch context, such a user in `participants[]` as
  `sectionEditor` with throwaway `externalReviewer`s in
  `reviewRounds[].reviewers[]` reaches U38 Rule 9's state on OJS and OMP
  (U38 claim check, 2026-09-23).
- Seeded reviewer suggestions sit where the wizard's do: the editor's
  workflow lists them under "Reviewers Suggested by Author" on the
  Submission stage with no row action, and on a review round with a
  "<name> More Actions" menu on each row. On a seeded draft the wizard
  still opens on "Upload Files"; its "Reviewer Suggestions" step is the
  fifth, four "Continue"s on.
- Seeded comments read on screen as by-hand ones do (U14 harness,
  2026-09-16, OJS driven, OMP and OPS read): the writer sees a pending one
  under "Your comment will be visible when the editor approves it" and
  everyone the approved ones, the sidebar's "All Comments (N)" counting the
  approved ones only; the Comments page lists each with its Status cell
  ("Hidden/Needs Approval", "Approved", "Approved, Reported"), and the
  moderators' Tasks panels carry the rows. Two timing facts: every comment
  of one seed shares its `created_at` second, so the on-screen order among
  them (newest first) is not fixed, and a seeded approval is stamped in
  the comment's own second where a by-hand one lands later.
- Seeded discussions and tasks read on screen as by-hand ones do (U37
  harness, 2026-09-23, three apps): the rows under "Yet to begin" or "In
  progress", "Created by: {username}" or "Task Owner: {username}", the
  Due Date. A task seeded with a past `dateDue` reads as overdue: the
  row stays in its group with "This task is overdue. Remind the task
  owner to complete it as soon as possible" first in "Activity", and its
  window's badge reads "Overdue". Items seeded in one request share their
  `created_at` second, so the panel's oldest-first order among them is
  not fixed: a test that asserts order seeds them in separate calls.
- A seeded galley reads on screen as a by-hand one does (U33 harness,
  2026-09-19, OJS and OPS driven): the "Galleys" page lists it as
  "<label> <language>" with the row's menu, and on OJS the assigned
  editor's "Assign a user to create galleys…" / "Awaiting Galleys." notice
  is gone from the Production entry, the galley row being what the notice
  logic counts (a remote galley counts too). A seeded submission with no
  `galleys` keeps the notice, as before.

The response returns `tag`, `submissionId`, `publicationId`, `stageId`,
`status`, `submissionProgress`, `reviewRounds[]` (`id`, `round`, `stageId`),
`reviewAssignments[]`, `reviewerSuggestions[]` (`id`, `email`), `dataCitations[]` (`id`, `title`),
`userComments[]` (`id`, `user`, `approved`, `reports[]` of report ids, in
the order seeded), `galleys[]` (`id`, `label`, `submissionFileId`, null
for a remote galley), `files[]` (`submissionFileId`, `file`,
`fileStage`, `reviewRoundId`, null on "Submission Files", and `uploader`;
the root entries in order, then each round's), `tasks[]` (`id`,
`title`, `type`, `stage`, in the order seeded), `libraryFiles[]` (as
the context's), `mediaFiles[]` and `publicationFormats[]` (above). `stageId`
is the submission's stored stage after the build, not the stage the screen
names: on OPS `published: true` leaves it at 6 (`WORKFLOW_STAGE_ID_DONE`,
the posted state), while an unposted preprint reads the Production stage's
5 (U31, 2026-09-06). It does not echo the title: a test that matches
the submission by title keeps the value it sent. On a scratch context the
seeded submission sits in no editor's `assigned-to-me` view (the default
Editor Dashboard view) until someone is assigned; list it under the "active"
view or assign a participant.

Implementation: `shared/php/api/v1/_test/PKPTestController.php` and the
builders in `shared/php/classes/testing/` (`PKPBootstrapSeeder`,
`PKPContextScenarioBuilder`, `PKPSubmissionScenarioBuilder`, `Spec`,
`UserSeeder`, `ContextFactory`, `LibraryFileSeeder` (both `libraryFiles[]`
keys), and `ApiCall`, which runs an app API
controller's own action on the JSON body a screen sends, for the keys
that save through one). Each app subclasses them under
`apps/<app>/php/api/v1/_test/` and `apps/<app>/php/classes/testing/`. The
JavaScript client is `pkpApi` in `shared/playwright/support/api.js`
(`bootstrapProbe`, `bootstrap`, `createContext`, `createSubmission`).

## The base context has plain defaults

`publicknowledge` is seeded with the fixture data above (sections,
categories, issues, users) on top of the app's own install defaults, and
stays that way: no settings passthrough enriches it, and no test changes a
setting there. What those defaults are, screen by screen and dated:
`seed-facts.md`.

## Configuring a scratch context

A scenario that runs with a setting at its non-default end (TEMPLATE
"Coverage", its decision rule) gets a scratch context
from `POST scenarios/context` created with that setting through a
passthrough key, the way `orcid` works today. A passthrough saves what the
settings form's form-encoded POST would (values as strings, an emptied text
box as null: the app's schema refuses the PHP constants the form config
carries), and `psql <app>_test` is the parity ground truth (U21 harness
run, 2026-09-07). A key family the API does
not have yet is recorded in the list below with its shape, so it is built
once, the same way, for every feature that needs it; a built family leaves
the list.

## Field shapes not built yet

These keys do not exist. They are ideas recorded from an earlier harness.

- Submission: `contributors[]` (`givenName`, `familyName`, `email`, no
  account: the second "Authors" box of the author-response request, U30);
  `reviewRounds[].reviewers[].files[]` (a reviewer's uploaded file, the
  "Attach Review Files" source, U30; U38 uploads it on screen at the
  reviewer's step 3); `reviewRounds[].reviewers[].status:
  'cancelled'` (U30, the readiness question); `reviewRounds[].revisionsUploaded`
  (the author's "Upload" is refused on a round where revisions were not
  requested, U30); `reviewRounds[].reviewers[].status: 'complete'` (the
  editor-confirmed "Mark as Complete" state the minimum-reviews count needs;
  `completed` is the reviewer's submit, U34); `files[].list` (a file on
  a later list, "Draft Files", "Copyedited Files" or "Production Ready
  Files": `files[]` seeds "Submission Files" and a round's "Files for
  Review" only, U36); `commentsForEditor`; `metrics` (OJS only: `views?`,
  `downloads?`, `months?`).
- Publication: `metadata.datePublished` (without it, publish stamps today).
- Decision: `toAuthor`, `toReviewers`, `toEditor`.
- User: `users[].notifications`, the Profile › Notifications pairs
  (`{settingName: {enabled, email}}`); U35 S6 and S8, like U12 and U05, set
  them on the person's own Notifications tab until it exists.
- Context: an option to skip `admin`'s manager enrolment in the new context
  (every `createContext` enrols the site administrator as a manager; the
  "site admin with no manager role" state is reachable only through the
  screens: `admin` seeded in `users[]` with one more role ends its manager
  role on its own Users & Roles › Edit page and signs in again, seed-facts,
  U38 claim check 2026-09-23).
- Context passthroughs: `notifyAllAuthors` (Settings › Workflow › Emails
  "Notify All Authors", U30), `reviewerRecommendations[]` (Settings ›
  Workflow › Review "Reviewer Recommendations", U29), the remaining
  submission-intake settings (the checklist and the privacy statement,
  U58), `submitWithCategories`, `publishingMode`, DOI
  settings (`enableDois`, `doiPrefix`, `doiVersioning`, `enabledDoiTypes`,
  `registrationAgency`, `doiCreationTime`), ISSNs (the online ISSN
  is typed on Masthead, U13), `licenseUrl` (copied
  into a publication when it is published, so it must be set before a
  `published` seed; sync rr14, 2026-09-22), OJS
  `issues[].accessStatus` (and an issue's title or description;
  `issues[]` itself is built, U08, its cover too, U13), OJS `subscriptions[]` where
  `'expired'` seeds an active row with a past end date, and OJS `payments`
  (`enabled`, `currency`, `paymentPluginName`, `manualInstructions`,
  `publicationFee`; the instructions gate is in seed-facts, U34).
- Context passthrough: `enableArticleNumber` (Settings › Workflow ›
  Submission › "Metadata", "Enable article number metadata"): the
  "Metadata" publication page offers "Article Number" only with it
  ticked; the submission key `articleNumber` does not read it (U13).
- Context: `country` (a scratch context has none, so the first Settings ›
  Journal › "Masthead" save and Hosted Journals › "Edit" ask for one before
  anything else saves; U07 claim check 2026-09-23, U13 claim check
  2026-09-25).
- Section: `sections[].hideAuthor` (OJS), the section form's "Omit author
  names for section items from issues' table of contents."; it is ticked
  on screen (U13 claim check K5, 2026-09-25).
- Galley of a dependent component: `galleys[].genre` refuses "Image" and
  "HTML Stylesheet" (400) as the galley upload wizard does not offer them,
  so no galley of either is seeded or uploaded (U13 claim check K2,
  2026-09-25).
- Named scenario fixtures (`submission-draft`, `submission-in-review`,
  `submission-in-round-2`, `submission-published`) and a typed scenario
  client. Until a suite shows the need, tests call
  `pkpApi.createContext()` and `createSubmission()` directly.
- An enriched second journal in the bootstrap fixture for the first
  reader-facing feature (article landing page, issues, catalog browse),
  rather than touching `publicknowledge` (maintainer, 2026-09-04).

## Decision behaviour worth knowing

- Decision constants are easy to misread. `Decision::PENDING_REVISIONS = 4`
  (not 1) and `ReviewRound::REVIEW_ROUND_STATUS_REVISIONS_REQUESTED = 1`
  (not 8). Grep before quoting.
- `requestRevisions` followed by `newExternalRound` overwrites round 1's
  status (reset to `PENDING_REVIEWERS` by `runAdditionalActions`). Read
  "round 1 closed with revisions" from the decision history, not from
  `review_rounds.status`.
- `NewExternalReviewRound` has two wizard steps (notifyAuthors and
  PromoteFiles), not one.
- The Copyediting notice ("Assign a copyeditor using the Assign link in the
  Participants list." / "Awaiting Copyedits.") shows only on a submission
  that reached Copyediting through `accept` from a review round; a
  `skipExternalReview` seed (or an on-screen "Accept and Skip Review")
  never shows it, so a notice scenario seeds `accept`. The box is read by
  its level-3 "Notification" heading, not by a `notices` selector. Seeded
  submissions carry no Copyediting files (`files[]` seeds "Submission
  Files" only), so a copyediting decision or list scenario
  uploads through the lists' own "Upload/Select Files" window or the
  Submission stage's "Upload" first. U32 claim check, 2026-09-18/19.
- The Production notice ("Assign a user to create galleys using the Assign
  link in the Participants list." on OJS; "Awaiting approval." on OMP)
  shows for an assigned editor after `sendToProduction` on both the
  `accept` and the `skipExternalReview` path, unlike the Copyediting
  notice above. U33 claim check, 2026-09-19.
- A user seeded in `participants[]` is not offered by that submission's
  "Assign" form (the form lists only users not yet assigned to the stage),
  so a scenario that assigns through the form seeds the user in the
  context and leaves them out of `participants[]`. U33 claim check,
  2026-09-19.
- `participants[]` with `role: 'sectionEditor'` seeds a Moderator on OPS.
  U33 claim check, 2026-09-19.
- On the Postgres test database a Participants "Assign" or "Notify" with a
  message typed and no predefined message chosen answers 500, so a script
  that types a message picks a template first. U35 claim check,
  2026-09-22.
- `Repo::stageAssignment()->build()` uses `firstOr`. Re-assigning the same
  user and role silently keeps the existing row and drops new flags such as
  `canChangeMetadata`. If a participant needs different flags from the
  automatic author assignment, use a different user as the submitter.
- A second `reviewRounds[]` entry builds round 2 with its reviewer, which
  is the one way to reach "Cancel Review Round" with a reviewer on it. A
  declined preprint (OPS) opens on its publication tab ("Title & Abstract"),
  with "Revert Decline" on the Production entry. A decision wizard opened
  by a hand-typed address without `ret` closes on "View Submission" and
  "View All Submissions". U34 claim check, 2026-09-20.
- "Request Revisions", "Resubmit for Review", "Accept Submission" and
  "Decline Submission" on a round with completed reviews carry a "Notify
  Reviewers" page, so a one-page read of them misses "Record Decision".
  The OJS reviewer wizard's step 3 needs `select[name="reviewerRecommendationId"]`
  set before "Submit Review" completes (silent otherwise; OMP has no list).
  The press's Production notice "Awaiting approval." is a level-3 heading
  of its own, not under a "Notification" heading. U34 claim check,
  2026-09-20.


## Mailpit

`pkpMail` (`shared/playwright/support/mail.js`, available as a fixture)
wraps Mailpit's HTTP API. Start Mailpit locally with
`brew services start mailpit`. The URL comes from `MAILPIT_URL` (default
`http://127.0.0.1:8025`).

Mailpit is one shared instance. Every parallel worker and all three fleets
write into the same inbox. The rules below follow from that.

- **Scope every read by a unique throwaway recipient** that names the app
  and the test, for example `u53top-omp@mail.test`. This is the only scoping
  the install supports: Mailpit tags do not exist here, because nothing sets
  `X-Tags`. `pkpMail` refuses any read without a recipient. Mailpit's
  `to:` search matches the To header only: a Cc or Bcc recipient is not
  found by it (U30 claim check K2).
- **`contains` is a content marker, not a scope.** It searches a substring
  in subject and body. Use it when the test controls some text in the
  message. It supplements the recipient scope and never replaces it. On a
  scratch context whose path is the seed tag, every mail carries the tag
  (the context name, the throwaway addresses), so `contains: tag` matches
  everything; use a phrase the test controls, such as the seeded title.
- **Pair every absence claim with a positive control.** Wait for a message
  you expect to arrive the same way, then assert that the target message did
  not. The control also bounds the wait, so the test never waits on
  silence. `expectNone` does this for you. The inbox-wide message count is
  no evidence of silence: at Mailpit's 500-message cap it never moves,
  so only a recipient-scoped read with a sent control proves that nothing
  went out (U14 claim check K4, 2026-09-16).
- **The cheapest positive control is a discussion.** It needs the opener's
  box plus one more of the stage's participants (one alone is refused with
  "At least two participants are required for a discussion."), and it
  mails every ticked box, the opener's included, so a no-mail control on an
  account never sends that control itself.

Note on the word "tag": everywhere else in these docs it means the seed tag
from `patterns.md`. Mailpit tags are a different thing and are not used.

The API:

- `find({to, contains, subject?, timeoutMs?, poll?})`: the canonical
  assertion. Polls Mailpit search scoped by recipient and content marker
  until a message matches, and returns the newest match. Default timeout
  20 s, poll 500 ms. `subject` goes into the query quoted whole, so a
  subject that itself carries quotes (`Your review for "{title}" has been
  cancelled`) matches nothing: pass a quote-free fragment or use `contains`
  (U34 tojs, 2026-09-20).
- `expectNone({to, contains, afterControl: {to, contains}})`: the negative
  assertion done right. Waits for the control message first, then asserts
  zero matches for the target.
- `count({to, contains, subject})`: number of matches for a recipient-scoped
  search. Use it for exactly-N claims after a bounding `find()`. An
  unbounded count proves nothing about silence.
- `inboxFor(email)`: a polling read of one recipient's inbox; prefer
  `find` for an assertion.
- `messageCount()`: total messages in the inbox, any recipient. Useful to
  assert that seeding produced no mail.
- `fullMessage(id)` and `extractLink(html, linkText)`: body access and
  click-the-link flows. `extractLink` handles single- and double-quoted
  hrefs.

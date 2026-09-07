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
`title`, `abstract`) accept a locale map such as `{"en": "…"}`. A bare
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
  (required), `path`, `title`, `policy`. OMP series: `path` (required),
  `title`, `description`.
- `categories[]` with `path` (required), `title`, and nested `children[]`.
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
  `supportedLocales`, `supportedSubmissionLocales`, `contactName`,
  `contactEmail`, `enabled`. `supportedSubmissionLocales` mirrors the
  Languages settings grid's submission toggles and keeps the metadata
  locales in step, exactly as the grid does. A scratch context needs
  `supportedLocales` to include a locale before that locale's URL segment
  (`/fr_CA/`) works there; the seeded journals already carry it as a UI
  language.
- `sections[]` (OJS, OPS): same shape as in the bootstrap payload. The first
  entry renames the default section. OMP's context scenario does not accept
  a `series[]` list yet and answers 400 on the key.
- `users[]`: throwaway accounts. Each entry takes `username` and `roles`
  (both required, roles non-empty), `givenName`, `familyName`, `email`
  (default `<username>@mail.test`), `password` (default: the username
  twice), `sections` or `series` (sub-editor assignments, by section abbrev
  or series path), and `orcid` plus `orcidIsVerified` for a pre-set ORCID
  iD. Role keys are the app's default user-group keys. An unknown key fails
  with a 400 that lists the app's whole set. See `users.md` for the keys and
  their traps. A scratch context's reviewer is created here too: the seeded
  reviewers are not enrolled on a scratch context, so they are absent from
  its Add Reviewer search and refused the wizard.
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

Users are created here and nowhere else. The submission scenario resolves
usernames but never creates them. The response returns `tag`, `contextId`,
`path` and the created `users` (id and username).

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
- `reviewRounds[]`, each with `reviewers[]` of `{username, status,
  reviewForm, recommendation, comments}` where `status` is `invited`
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
  required questions, as the wizard does. A seeded `accepted` assignment
  opens the wizard on step 1 (the on-screen accept lands on step 2). These
  are the only per-reviewer keys. Due dates and the review method are not
  parameters:
  the builder stamps them exactly as the Add Reviewer form does, from the
  context's `numWeeksPerResponse` and `numWeeksPerReview` and its
  `defaultReviewMode` (double-anonymous when unset). Any other key fails
  with a 400.
- `participants[]` of `{username, role}`: extra stage assignments for people
  other than the submitter, the same row the workflow's Assign Participant
  form writes, without that form's email and notification.
- `published` (default false). Requires `submitted: true`.
- `author`: `{orcid, orcidIsVerified}` on the submitter's contributor record,
  a pre-verified ORCID iD without the OAuth flow.
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

App-specific keys:

- OJS: `section` (abbrev; defaults to the journal's first section) and
  `issue` (`{volume, number, year}` matching a seeded issue, used when
  `published` is true).
- OMP: `series` (path) and `seriesPosition`, both optional; `workType`
  (`monograph`, the default, or `editedVolume`); and per review round
  `stage: internal | external` (default external).
- OPS: `section` (abbrev or path; defaults to the server's first section).
  `reviewRounds` is rejected with a 400, because OPS has no review stage,
  and so is `reviewerSuggestions`, because OPS mounts no reviewer
  suggestions and its wizard has no such step.

Facts tests rely on, all parity-checked against the UI path:

- A submitted seed carries the same notifications the real submit endpoint
  creates, and the submitter is the publication's primary contact.
- Seeded submissions carry no files. A test that needs "the author's
  uploaded file" uploads it through the panel under test. The wizard's
  required-genre check blocks a seeded draft's submit until a file is
  uploaded. Review-round files are also grant-based; see `patterns.md`.
- A real wizard submit auto-assigns the section's editors, so `participants`
  on a submitted seed is additive. Seeding `participants: []` together with
  `submitted: false` is what produces a genuine needs-editor state.
- An author-editor state needs a user enrolled in both groups who is also
  the submitter; a bare stage assignment without the global author role
  does not trip author checks. A second `participants` entry for the same
  user rides on `build()`'s firstOr semantics ("Decision behaviour worth
  knowing" below).
- Seeded reviewer suggestions sit where the wizard's do: the editor's
  workflow lists them under "Reviewers Suggested by Author" on the
  Submission stage with no row action, and on a review round with a
  "<name> More Actions" menu on each row. On a seeded draft the wizard
  still opens on "Upload Files"; its "Reviewer Suggestions" step is the
  fifth, four "Continue"s on.

The response returns `tag`, `submissionId`, `publicationId`, `stageId`,
`status`, `submissionProgress`, `reviewRounds[]` (`id`, `round`, `stageId`),
`reviewAssignments[]` and `reviewerSuggestions[]` (`id`, `email`). `stageId`
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
`UserSeeder`, `ContextFactory`). Each app subclasses them under
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
passthrough key, the way `orcid` works today. A key family the API does
not have yet is recorded in the list below with its shape, so it is built
once, the same way, for every feature that needs it; a built family leaves
the list.

## Field shapes not built yet

These keys do not exist. They are ideas recorded from an earlier harness.

- Submission: `contributors[]` (`givenName`, `familyName`, `email`, no
  account: the second "Authors" box of the author-response request, U30);
  `reviewRounds[].reviewers[].files[]` (a reviewer's uploaded file, the
  "Attach Review Files" source, U30); `reviewRounds[].reviewers[].status:
  'cancelled'` (U30, the readiness question); `reviewRounds[].revisionsUploaded`
  (the author's "Upload" is refused on a round where revisions were not
  requested, U30); `commentsForEditor`; `userComments[]` (`user`, `text`, `approved?`, needs a published
  publication); `metrics` (OJS only: `views?`, `downloads?`, `months?`).
- Publication: `galleys[]` (`label`, `locale?`, and either `file`, a basename
  under `apps/<app>/playwright/fixtures/files/`, or `urlRemote`);
  `metadata.datePublished` (without it, publish stamps today);
  `mediaFiles[]` (`variantType` of `web` or `high_resolution`, `file?`,
  `name?`, `genre?`, `group?`).
- Decision: `toAuthor`, `toReviewers`, `toEditor`.
- Context passthroughs: `notifyAllAuthors` (Settings › Workflow › Emails
  "Notify All Authors", U30), `reviewerRecommendations[]` (Settings ›
  Workflow › Review "Reviewer Recommendations", U29), the submission-intake
  settings U21's scenarios would run against (built with U58), `supportedFormLocales` (Website › Setup ›
  Languages "Forms" column; the settings forms stay single-language until
  it is set, U29), `copyrightNotice`, `enablePublicComments`,
  `submitWithCategories`, `publishingMode`, `enableAnnouncements`, DOI
  settings (`enableDois`, `doiPrefix`, `doiVersioning`, `enabledDoiTypes`,
  `registrationAgency`, `doiCreationTime`), metadata modes (`keywords`,
  `citations`), ISSNs, `plugins: {pluginName: {enabled, settings}}`
  keyed by the plugin's lowercased class name, OJS
  `issues[]` with `accessStatus`, and OJS `subscriptions[]` where
  `'expired'` seeds an active row with a past end date.
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
- `Repo::stageAssignment()->build()` uses `firstOr`. Re-assigning the same
  user and role silently keeps the existing row and drops new flags such as
  `canChangeMetadata`. If a participant needs different flags from the
  automatic author assignment, use a different user as the submitter.

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
  silence. `expectNone` does this for you.

Note on the word "tag": everywhere else in these docs it means the seed tag
from `patterns.md`. Mailpit tags are a different thing and are not used.

The API:

- `find({to, contains, subject?, timeoutMs?, poll?})`: the canonical
  assertion. Polls Mailpit search scoped by recipient and content marker
  until a message matches, and returns the newest match. Default timeout
  20 s, poll 500 ms.
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

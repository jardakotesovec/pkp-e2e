# Scenario API & Mailpit

The `/api/v1/_test/*` endpoints build realistic application state in one
POST. Use them instead of driving the UI for setup. This file documents what
the endpoints accept today, the facts tests rely on, and how to assert on
email through Mailpit.

Two rules from `PRINCIPLES.md` govern the builders behind these endpoints.
A seeded state must match what a real user would have produced through the
UI (A2). A builder grows only when several tests need the same state (A3).
Every builder change gets a row in `docs/tracking/parity-ledger.md` before it
merges.

## How the endpoints work

The routes are site-wide: `/index.php/index/api/v1/_test/…`. They are gated
by the `X-Test-Key` header, which must match the `TEST_API_KEY` environment
variable of the PHP server. Without the variable the whole namespace answers
404. With a wrong header it answers 403. See `harness.md` for the variable
and for `bin/mount.js`, which copies the PHP code into the app checkouts.

Every mutating request runs inside one database transaction and under
`Mail::fake()`. A failed build rolls back, so it never leaves half-created
state. Mail sent while seeding is dropped. Only mail sent by the test's own
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

Creates a scratch journal, press or preprint server. Use it whenever a test
needs to change anything at journal level. The base context
`publicknowledge` is read-only for tests.

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
  locales in step, exactly as the grid does.
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
  their traps.
- `orcid`: the state of the ORCID settings tab, saved through the same
  service the tab's form uses. Keys `enabled` (default true), `apiType`
  (default Public Sandbox), `clientId` and `clientSecret` (dummy defaults),
  `city`, `sendMailToAuthorsOnPublication`. The OAuth exchange can never
  complete on a test install, because outbound HTTP fails fast at the
  dead-port proxy in `config.test.inc.php`, so dummy credentials are as good
  as real ones for every screen this state gates.

Users are created here and nowhere else. The submission scenario resolves
usernames but never creates them. The response returns `tag`, `contextId`,
`path` and the created `users` (id and username).

## `POST scenarios/submission`

Walks a submission to a declared end state through the same services the
wizard and the workflow screens use. Tests never script the journey to their
starting point.

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
  `acceptFromReview`, …). An unknown name fails with a 400 that lists the
  app's roster.
- `reviewRounds[]`, each with `reviewers[]` of `{username, status}` where
  `status` is `invited` (default), `accepted` or `declined`. These are the
  only per-reviewer keys. Due dates and the review method are not
  parameters: the builder stamps them exactly as the Add Reviewer form does,
  from the context's `numWeeksPerResponse` and `numWeeksPerReview` and its
  `defaultReviewMode` (double-anonymous when unset). Any other key fails
  with a 400.
- `participants[]` of `{username, role}`: extra stage assignments for people
  other than the submitter, the same row the workflow's Assign Participant
  form writes, without that form's email and notification.
- `published` (default false). Requires `submitted: true`.
- `author`: `{orcid, orcidIsVerified}` on the submitter's contributor record,
  a pre-verified ORCID iD without the OAuth flow.

App-specific keys:

- OJS: `section` (abbrev; defaults to the journal's first section) and
  `issue` (`{volume, number, year}` matching a seeded issue, used when
  `published` is true).
- OMP: `series` (path) and `seriesPosition`, both optional; `workType`
  (`monograph`, the default, or `editedVolume`); and per review round
  `stage: internal | external` (default external).
- OPS: `section` (abbrev or path; defaults to the server's first section).
  `reviewRounds` is rejected with a 400, because OPS has no review stage.

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

Implementation: `shared/php/api/v1/_test/PKPTestController.php` and the
builders in `shared/php/classes/testing/` (`PKPBootstrapSeeder`,
`PKPContextScenarioBuilder`, `PKPSubmissionScenarioBuilder`, `Spec`,
`UserSeeder`, `ContextFactory`). Each app subclasses them under
`apps/<app>/php/api/v1/_test/` and `apps/<app>/php/classes/testing/`. The
JavaScript client is `pkpApi` in `shared/playwright/support/api.js`
(`bootstrapProbe`, `bootstrap`, `createContext`, `createSubmission`).

## The base context has plain defaults

`publicknowledge` is seeded with the fixture data above (sections,
categories, issues, users) on top of the app's own install defaults. There
is no settings passthrough that enriches it. A test that needs a setting
changed drives the settings UI on a scratch context, never on
`publicknowledge`.
What those defaults are, screen by screen and dated: `seed-facts.md`.

## Field shapes not built yet

These keys do not exist. They are ideas recorded from an earlier harness, to
be built at the recorded shape when a feature needs them, each with a parity
row.

- Submission: `commentsForEditor`; `reviewerSuggestions[]` (`givenName`,
  `familyName`, `email`, `affiliation?`, `suggestionReason?`);
  `userComments[]` (`user`, `text`, `approved?`, needs a published
  publication); `metrics` (OJS only: `views?`, `downloads?`, `months?`).
- Publication: `galleys[]` (`label`, `locale?`, and either `file`, a basename
  under `apps/<app>/playwright/fixtures/files/`, or `urlRemote`);
  `metadata.datePublished` (without it, publish stamps today);
  `mediaFiles[]` (`variantType` of `web` or `high_resolution`, `file?`,
  `name?`, `genre?`, `group?`).
- Reviewer: `reviewForm: "<title>"` attaching an existing active review form
  by exact title, seeded first through a context `reviewForms[]` list.
- Decision: `toAuthor`, `toReviewers`, `toEditor`.
- Context passthroughs: `copyrightNotice`, `enablePublicComments`,
  `submitWithCategories`, `publishingMode`, `enableAnnouncements`, DOI
  settings (`enableDois`, `doiPrefix`, `doiVersioning`, `enabledDoiTypes`,
  `registrationAgency`, `doiCreationTime`), metadata modes (`keywords`,
  `citations`), review setup (`defaultReviewMode`,
  `reviewerSuggestionEnabled`, `numWeeksPerResponse`, `numWeeksPerReview`,
  reminder thresholds), ISSNs, `plugins: {pluginName: {enabled, settings}}`
  keyed by the plugin's lowercased class name, `reviewForms[]`, OJS
  `issues[]` with `accessStatus`, and OJS `subscriptions[]` where
  `'expired'` seeds an active row with a past end date.
- Named scenario fixtures (`submission-draft`, `submission-in-review`,
  `submission-in-round-2`, `submission-published`) and a typed scenario
  client. Until a suite shows the need, tests call
  `pkpApi.createContext()` and `createSubmission()` directly.

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
  `X-Tags`. `pkpMail` refuses any read without a recipient.
- **`contains` is a content marker, not a scope.** It searches a substring
  in subject and body. Use it when the test controls some text in the
  message. It supplements the recipient scope and never replaces it.
- **Pair every absence claim with a positive control.** Wait for a message
  you expect to arrive the same way, then assert that the target message did
  not. The control also bounds the wait, so the test never waits on
  silence. `expectNone` does this for you.
- **Never call `clearAll()` from a parallel spec.** It empties the shared
  inbox for everyone. Only a dedicated serial infrastructure spec may call
  it, and none exists today.

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
- `inboxFor(email)` and `latestTo(email)`: polling reads for one recipient.
  `latestTo` can still race two mails to the same recipient, so prefer
  `find`.
- `messageCount()`: total messages in the inbox, any recipient. Useful to
  assert that seeding produced no mail.
- `fullMessage(id)` and `extractLink(html, linkText)`: body access and
  click-the-link flows. `extractLink` handles single- and double-quoted
  hrefs.
- `clearAll()`: deletes the whole inbox. See the rule above.

# Regression: creating a submission 500s for users without a profile affiliation

*Upstream-ready report (pkp/pkp-lib), prepared 2026-09-01 by the e2e QA
agent. Canonical register entry: U21 A11 (`docs/specs/U21-submission-wizard.md`);
CI ledger row U21-A11 (`docs/tracking/ci-triage.md`).*

## Summary

Since the `i13003-author-order-fix` branch merged (pkp-lib
`6f0a39733af9c4af76f2712035b67fbed6f2d6cd`), any user submitting **as an
Author role** whose profile has **no affiliation** gets a server error the
moment their submission is created — the wizard never opens. The break is
the interaction of one new commit with one long-standing line:

- `9e2fbac214f6b92bdfaba9671d1aabe37c26c713` ("pkp/pkp-lib#13003 Fix
  addAffiliation() for fresh and lazy-loaded authors") rewrote
  `Author::getAffiliations()` (classes/author/Author.php:225) from
  `return $this->getData('affiliations') ?? collect();` to a
  `hasData()` guard that returns the stored value as-is.
- `Repository::newAuthorFromUser()` (classes/author/Repository.php:270,
  unchanged since pkp/pkp-lib#11030) stores a **literal null** when the
  user has no affiliation to migrate:
  `$author->setAffiliations($migratedAffiliations ? [$migratedAffiliations] : null);`
  — `migrateUserAffiliation()` returns null for an empty/blank user
  affiliation (classes/affiliation/Repository.php:262-264), and
  `setAffiliations(?iterable)` happily stores the null, so
  `hasData('affiliations')` is **true** and the new guard never repairs it.

`getAffiliations()` is typed `: iterable`, so returning the stored null
throws:

```
TypeError: PKP\author\Author::getAffiliations(): Return value must be of
type Traversable|array, null returned  (Author.php:230)
```

The throw fires inside `DAO::insert()` (classes/author/DAO.php:172
iterates `$author->getAffiliations()`), i.e. on `Repo::author()->add()` of
the freshly built author. The production path is
`PKPSubmissionController::add()` → `newAuthorFromUser()`
(api/v1/submissions/PKPSubmissionController.php:736) → `Repo::author()->add()`
— every Author-role submitter without a profile affiliation hits it.

An affiliation-less user is legitimate state, with a nuance (thanks to
maintainer testing, 2026-09-01): the **registration page** enforces
affiliation **client-side only** — the template hard-codes `required`
on the input (`templates/frontend/components/registrationForm.tpl:52`)
while `RegistrationForm` has no server-side affiliation validator and
`schemas/user.json` marks it `nullable` — so browser registrations get
one, but the **admin/invitation "add user" flow doesn't require it**,
and API/import/scripted paths can skip it. Users created there (or
pre-existing data) are the affected population.

## Steps to reproduce (app only, no test harness)

1. OJS `main` @ `d44b186c22` (pkp-lib @ `6f0a39733a`), PHP 8.3,
   PostgreSQL 16. Any journal.
2. A user enrolled as Author whose profile **Affiliation is empty** —
   create one via the admin "add user" / invitation flow (which, unlike
   the registration page's client-side `required`, doesn't ask for an
   affiliation).
3. Log in as that user → Dashboard → "Start A New Submission" → fill the
   start form (title, section, checkboxes) → **Begin Submission**.

Confirmed by maintainer testing (2026-09-01, independent OJS QA
instance): all of these crash at "Begin Submission" —

- a fresh user created via the admin "add user" flow with no affiliation;
- an existing user whose affiliation was **removed via the edit-profile
  section** (the blank-string save folds into the same null return —
  `array_filter` guard, classes/affiliation/Repository.php:261-264);
- a **multi-role** user (extra role added to an author-only account) —
  role mix doesn't shield the path.

One repro gotcha to rule out first: **a stale checkout** — the crash
only exists at/after the `6f0a39733a` merge; an install a few days
behind `main` passes and looks like a non-repro. Code note: the author
record is only created when submitting under an **Author** group
(`PKPSubmissionController::add()` gates on `ROLE_ID_AUTHOR`) — a
manager/editor submitting under a non-author group won't hit it.

Observed: the underlying `POST /api/v1/submissions` returns
**HTTP 500** `{"error":"TypeError: PKP\\author\\Author::getAffiliations():
Return value must be of type Traversable|array, null returned"}` and the
wizard never opens (the UI waits on a redirect that never comes).
Expected: submission created, wizard opens on Upload Files.

Counterfactual (verified live, 2026-09-01): insert the single
`user_settings` affiliation row the profile form would write for the same
user, repeat the identical request → **HTTP 200**, submission created.
The missing affiliation is the discriminating variable.

## Impact

- User-visible hard break: affected authors cannot start a submission at
  all (server error, no message in the UI — the start form just hangs).
- Every author-creating flow that migrates from a user record is exposed,
  not just the wizard.
- On the e2e install it also 500s the suite's seeding endpoint (which
  calls the same public `Repo::author()->newAuthorFromUser()`), redding
  ~100 of 129 OJS e2e tests — first red CI run: pkp/ojs Actions run
  33536204412 at `d44b186c22` ("Submodule updates"); the previous pointer
  `13b621e424` was green. OMP/OPS `main` still pin a pre-merge pkp-lib
  and will inherit the break at their next submodule bump.

## Suggested fix (either side of the mismatch)

- Make `getAffiliations()` null-tolerant again, e.g. treat a stored null
  like missing data:

  ```php
  public function getAffiliations(): iterable
  {
      if (!($this->getData('affiliations') ?? null)) {
          $this->setAffiliations(collect());
      }
      return $this->getData('affiliations');
  }
  ```

- and/or stop storing null in `newAuthorFromUser()`
  (classes/author/Repository.php:270):

  ```php
  $author->setAffiliations($migratedAffiliations ? [$migratedAffiliations] : collect());
  ```

  (Tightening `setAffiliations(?iterable)`'s signature to reject null
  would surface any other null writers at the write site instead of at a
  later read.)

## Evidence trail

- Full-suite reproduction on a fully synced checkout (submodules,
  `composer install`, `npm ci`, `npm run build`, fresh DB): 21✓ /
  everything seeding-or-creating a submission red.
- Pure-UI confirmation: the U21 S1 e2e test (drives the real "Begin
  Submission" button, no API seeding) fails at the wizard-open wait.
- Direct probe: plain curl session (login form → session cookie + CSRF)
  against `POST /api/v1/submissions` — 500 without affiliation, 200 with;
  nothing from the e2e harness in the path.
- Breaking diff: `git diff 13b621e424..6f0a39733a -- classes/author/`
  (the `getAffiliations()` hunk in `9e2fbac214`).
- Maintainer bisect confirmation (2026-09-01, independent QA instance):
  at `ecd12271ed` (the breaking commit's direct parent) an
  affiliation-less author submits successfully; at `9e2fbac214` the same
  flow 500s — first-bad/last-good verified on both sides. Also verified
  not present in 3.3, 3.4 or 3.5 (admin-created affiliation-less authors
  submit fine there).

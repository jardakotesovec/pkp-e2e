# API coverage

The apps' REST API (`/index.php/<context>/api/v1/…`) is checked three ways.
Each answers one question, and each has one home.

| Question | Where the answer lives | What runs it |
|---|---|---|
| Who may call each route, and does it stay inside its own context and submission? | a **permission grid** in the spec that owns the rule, and the route's Gate in the **route registry** | the private **matrix** |
| What does a route do with what the screens never send? | the owning spec's **API checks** ("Through the API") | `shared/playwright/tests/api/`, in every app's `shared` project on CI |
| Do the screens' own calls work, and which routes do they reach? | nothing to write: the UI suites already make them | the **traffic map** of a CI run |

Nothing here repeats a screen test. A route the screens already call with
the inputs that matter is covered by them; the API adds the personas the
screens never sign in as and the inputs they never send.

## The route registry

`docs/tracking/api-routes.md` lists every route of the three apps, one
table per controller, generated from the app checkouts, with two
hand-kept columns:

- **Owner**: the feature whose rule the route implements (a FEATURE-MAP
  id), or `parked` while its controller sits in `UNASSIGNED.md`. A
  controller that serves several features is split route by route.
- **Gate**: the grid the route follows, as `U40#edit-gate` (the spec
  `U40-…md`, the table after its `api-grid-edit-gate` anchor); with a
  trailing `!` (`U61#administration!`) for its refused cells only, where an
  allowed call would harm the shared installs or reach an outside service;
  `none: <reason>` when it has none on purpose (no role rule applies, no
  test install holds the resource); `—` for a route no one has looked at
  yet, which fails the check.

`npm run api-routes -- --write` regenerates the file and keeps the hand
columns; `--gate <gate> <route…>` sets a Gate; `--check` is the lint: a
route in code but not in the file, a row whose route is gone, an Owner
that is not a feature, a route not gated, a grid no route's Gate names,
and a grid that does not parse, has a column that is no state, allows no
one, or is not whole (a submission grid names every persona of
the set, a context grid every role, and one that reads both submissions
reads the one in review too, on the apps its routes run on). `npm run
backlog` prints the check's problems every day.

## Permission grids

A grid is a table in the spec that owns the permission rule, right after
`<a id="api-grid-<name>"></a>` and a short intro naming the rule it
restates and the routes that follow it, usually at the end of "Actors &
permissions". It says, cell by cell, what the spec's prose already says,
so a program can check it:

```markdown
| Persona | Unpublished | Published |
|---|---|---|
| manager | ✓ | ✓ |
| submitter {OJS OMP} | — | — |
| submitter {OPS} | ✓ | — |
| assigned reviewer | — | — |
```

- **Rows** are personas, by the labels of
  `shared/playwright/support/personas.js`: a submission grid names them in
  full, a context grid may use the plainer aliases (`author` for `other
  author`). A persona an app has no role for
  (no reviewer on a preprint server) is skipped there by itself; an app
  badge is only for a row whose cells differ by app, split into one row
  per badge, as `submitter` above.
- **Columns** are states. `Unpublished` and `Published` are the persona
  set's two main submissions, `Review` the one in review, and `Draft`
  the submitter's draft (made per cell for a route that only a draft
  takes). A rule about the context rather than a submission
  has `Context`, and `Site` where the site has the same thing in
  Administration (the route called on `index`):

  ```markdown
  | Persona | Context | Site |
  |---|---|---|
  | manager | ✓ | — |
  | site admin | ✓ | ✓ |
  | reader | — | — |
  ```

- **Cells** are `✓` (allowed), `—` (refused) or `?` (an open question, the
  register entry linked; not checked).
- **One grid per rule, not per feature.** The routes of contributors,
  citations and funding all follow the publication metadata spec's edit
  gate; the reads of a submission, its versions and their contributors all
  follow the workflow screen's `submission-read` grid. A feature with a
  rule of its own (announcements, institutions) carries its own grid.

The grid states what the product intends, the way the prose does: what
the screens allow. It is written from the spec's rule, then checked by the
matrix. A cell says whether the persona may call the route at all; what
an allowed persona's answer withholds (a reviewer's contributor list,
emptied while the review is anonymous) is an API check's.

### The personas

`seedPersonas()` builds, per run, a scratch context with one throwaway
user per persona, a second context whose manager is the outsider, and two
submissions in the first: one in Copyediting (sent to review, its review
completed, accepted; a preprint server has no review), the other the same
and published (on a journal, in the context's one published issue; on a
preprint server both carry a "PDF" galley, its only files); a
journal or press has a third, in review, the reviewer's
review accepted and not yet submitted (a grid's `Review` column, skipped
on a preprint server). The participants are the assigned section editors
(one with "Permit submission metadata edit" off), the assigned assistant
(a copyeditor) and the assigned review assistant (a funding coordinator,
whose role works on the review stage); the reviewer completed the round. The `site admin` is the
installer's admin, who holds the manager role in every context it creates,
as a site's administrator does in the journals they set up. The base
context is never used, because a submit there assigns its section editors
automatically.

No grid names the **derived personas** (`personas.js` DERIVED): a manager
of the set's second context who is only a reader or an author here, and a
section editor, submitter and reviewer of a fourth submission of the set.
The matrix reads each against the refused cells of the row it stands for,
so a role taken from the wrong context, or an assignment checked against
the wrong submission, fails the grid without a row of its own.

### The matrix

The matrix lives in the private security repo
(`../pkp-e2e-sec/api-matrix/`), because a cell that disagrees with its
grid is often a security weakness, and a public check would publish it. It
reads the registry and the grids from this repo and makes these passes:

- **The grids.** Every gated route, as every persona, in every state;
  a route fails with the list of cells that disagree. An allowed answer
  must also not carry the second persona set's tag (its context path,
  usernames and titles carry it): another context's data in an answer
  the caller may have. The site admin's answers, the site's, and the few
  routes that list across the install by design are left out. Nor may a
  persona that sits on no submission but its own (a reader, an author, a
  reviewer, an assistant) get an answer carrying the title of the set's
  fourth, unpublished submission: a list holding rows it should not. A column
  the persona set cannot read fails (a Review column on a preprint server
  aside), and so does a route of which no cell was read. A grid that
  allows no one on an app its route runs on fails there too, unless the
  route's `routes.js` entry says why (`noneOn`: a preprint server has no
  review, no reviewer, no identifier plugin).
- **The foreign passes.** Every gated route that names a child resource (a
  funder, a comment, an announcement), the resource made elsewhere and
  requested at the persona set's own address by the first persona its
  grid allows and, when it differs, by the least privileged one too (a
  submitter reaching another submission's child through their own): made
  in a second persona set (another context), and for a route under a
  submission, on the set's other submission; a read that names its
  submission in its query names another context's there. A control first
  makes the same call on the set's own child, which must not be refused.
  A 2xx is a leak; a refusal, or a 4xx where the control had a 2xx, holds
  the guard. The version passes do the same for every route under
  `publications/{publicationId}`, with the version swapped for one of the
  other context's or the other submission's.
- **The foreign body pass.** A route that takes its children's ids in the
  body rather than the path (an order, a link, a flag), called at the
  persona set's own address with two children made in those same places.
  An order answers 200 whether or not it touched a row, so the pass reads
  the outcome: what the call would change about the foreign pair stays as
  it was. A control first makes the call on two of the set's own children,
  whose read must change, so a body the route stopped reading fails
  instead of passing for nothing. Each such route gets an entry in the
  matrix's `routes.js` (its child, its body, the read of what it changes),
  or one that says why it needs none; a self-test fails a route whose
  input names an id without either.
- **The context move pass.** An edit of a context's child that has a read
  at the same address, sent with the second persona set's context id in
  its body: the child still answers at home, and not at the other
  context's address.

A call answered 401, 403 or 404, or a 2xx whose body is an error alone,
counts as refused; any other answer, a 400 for an empty body included, as
allowed; a 5xx is a finding of its own. A write is sent an empty body and
a read no query, unless the route checks them before its caller, or a
read names its submission only in its query: then the matrix's
`routes.js` gives it a valid one that changes nothing the next cell reads
(the submission's own language for the language change). A
foreign call and its control both stopped by a 4xx prove nothing, and fail
until the route has its body or query. The Playwright config adds an
`api-matrix` project only where that folder sits next to the clone; CI
never runs it, and neither does a run that does not name it. A whole run
takes 5 to 13 minutes per app:

```bash
npx playwright test -c configs/ojs.config.js --project=api-matrix --no-deps
```

A disagreeing cell is judged like any finding: the grid is wrong (the
screens allow it too and the spec said otherwise: fix the grid, and the
prose if it was wrong), the product question is open (a ❓ entry and a `?`
cell), or the API lets someone do what the screens refuse, which goes to
the security repo by its `security_policy.md` and is listed in the
matrix's `known.js` until it is fixed.

## API checks

What a route does with input the screens never send, a filter they never
use, or a value they would refuse in the browser is an **API check**: a
numbered item in the owning spec's "Through the API" block, at the end of
"Canonical scenarios", and one test of the same number and title:

```markdown
### Through the API

API1. **A funder without a name is refused** {OJS OMP OPS}

   Given: a Journal Manager, a submission with no funders.

   - **No name**: add a funder with an empty name through the API:
     refused (400) with an error on the funder, and the list stays empty.
   - **Control**: the same request with a name is stored and listed.
```

- **Only gaps.** A check exists because no screen sends that request, or
  because no screen shows what the answer withholds (the reviewer's reads
  under anonymous review). A route the screens call with the input that
  matters, and whose answer they show, needs none.
- **Never who may call.** That is the grid's, and naming another
  context's or submission's resource, in the path, the body or the query,
  is the foreign passes': a refusal (401, 403, 404) of it, or a foreign id
  silently honoured, is the matrix's. An API check may assert input
  validation (a 400 or 422 with an error on the field that names the
  foreign id), what an allowed persona's answer withholds, and that an add
  or an edit naming another context lands or stays in this one (asserting
  where it is, not the status): guards that hold. A guard that does not
  hold is a security finding, never a public check.
- **Tests** live in `shared/playwright/tests/api/U<nn>-<feature>.api.spec.js`,
  app-neutral, so every app's `shared` project runs them on CI. A test is
  named `API<n>: <the item's title>`, seeds a scratch context through the
  `scratch` fixture (`support/api-scratch.js`), calls through its users'
  clients, and asserts the status and what changed.
  `node docs/process/lint/lint-spec.mjs --tests <spec>` matches items and
  tests both ways.

## The traffic map

With `PKP_API_TRAFFIC=1` (CI sets it), every API call the suites make is
logged per test (`shared/playwright/support/api-traffic.js`), and each CI
shard uploads its log. `npm run api-traffic -- <run-id>` maps a run's logs
onto the registry (`--local` this clone's own, `--clear` empties them
first): per feature, which routes the screens reach, as which roles and
with which query keys, which only API checks reach, which nothing reaches,
and every 5xx answer with the test that met it (`--against <run-id>` marks
the ones an earlier run met too). Read it when adding API
coverage to a spec: a route the screens never reach is where API checks
pay.

## Probing

`npm run api-call -- <app> <username|-> <METHOD> <path> [json]` sends one
call to the app's probe server (`npm run probe-servers -- --start`), signed
in as that user the way the tests sign in (`-` for nobody; `--context
index` for the site), and prints the status and the body.
`npm run api-call -- <app> --scratch` makes a scratch context and its
manager first, for probing writes away from the base context.
`npm run api-call -- <app> --personas <METHOD> <path> [json]` seeds a
persona set and prints the call's status as every persona in every state
(`{submissionId}` and `{publicationId}` filled per state, in the path or
its query), the table a grid is compared with; `--full` prints a whole
body.

## Adding API coverage to a spec

Done as a revision of the shipped spec (RUNBOOK "Revising a shipped
feature"), one spec at a time:

1. **Owners.** The registry rows for the spec's routes name it.
2. **Gates.** Each route gets the grid of the rule it follows, or
   `none: <reason>`; a rule with no grid yet gets one in the spec that
   owns it.
3. **Matrix.** Add a maker to the matrix's `makers.js` for each new child
   resource, and a `routes.js` entry for a route that needs a body, a
   submission of its own or names children in its body (the matrix's
   README, "Adding a route"); run the matrix on all three apps, and judge
   every disagreeing cell (above).
4. **API checks.** From the traffic map and the spec's Rules and Fields:
   the inputs, filters and refusals the screens never send. A value the
   form refuses is a gap only if the browser refuses it: when the server
   does, the screens already send it (`npm run api-call` shows which).
   Write them into "Through the API", then the tests.
5. **Green and lint**: the API tests on all three apps,
   `npm run api-routes -- --check`, the spec lint with and without
   `--tests`.

## Keeping it true

- **A diff that touches `api/`** (the upstream session, MAINTENANCE sync
  step 4): `npm run api-routes -- --write`, each new route its Owner and,
  on a feature with grids, its Gate the same day, then the whole matrix on
  the three apps.
- **Weekly** (the housekeeping session): the whole matrix on the three
  apps, so a maker broken by an upstream change does not rot unseen.
- **Daily** (the upstream session): the "Server errors" section of the
  traffic map of the latest `main` CI run, `--against` the run before it;
  a new 5xx no spec records is a finding (a 🐞 entry, or the security repo
  when its body shows server internals).

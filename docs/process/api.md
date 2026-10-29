# API coverage

The apps' REST API (`/index.php/<context>/api/v1/…`) is checked three ways.
Each answers one question, and each has one home.

| Question | Where the answer lives | What runs it |
|---|---|---|
| Who may call each route? | a **permission grid** in the spec that owns the rule, and the route's Gate in the **route registry** | the private **matrix** |
| What does a route do with what the screens never send? | the owning spec's **API checks** ("Through the API") | `shared/playwright/tests/api/`, in every app's `shared` project on CI |
| Do the screens' own calls work, and which routes do they reach? | nothing to write: the UI suites already make them | the **traffic map** of a CI run |

Nothing here repeats a screen test. A route the screens already call with
the inputs that matter is covered by them; the API adds the personas the
screens never sign in as and the inputs they never send.

## The route registry

`docs/tracking/api-routes.md` lists every route of the three apps, one
table per controller, with two hand-kept columns:

- **Owner**: the feature whose rule the route implements (a FEATURE-MAP
  id), or `parked` while its atlas atom sits in `UNASSIGNED.md`. A
  controller that serves several features is split route by route.
- **Gate**: the permission grid the route follows, as `U40#edit-gate`
  (the spec `U40-…md`, its anchor `api-grid-edit-gate`), or `—` when no
  grid covers it yet.

`npm run api-routes -- --write` regenerates the generated columns from the
app checkouts and keeps the hand-kept ones; `npm run api-routes -- --check`
is the lint: a route in code but not in the file, a row whose route is
gone, an owner that is not a feature, a gate that names no grid, or a grid
that does not parse. The upstream session runs `--write` when a diff
touches `api/` and gives each new route its owner the same day.

## Permission grids

A grid is a table in the spec that owns the permission rule, right after
`<a id="api-grid-<name>"></a>`, usually at the end of "Actors &
permissions". It restates a rule the spec already states in words, cell by
cell, so a program can check it:

```markdown
| Persona | Unpublished | Published |
|---|---|---|
| manager | ✓ | ✓ |
| submitter {OJS OMP} | — | — |
| submitter {OPS} | ✓ | — |
| site admin | ? [A18](#a18) | ? [A18](#a18) |
```

- **Rows** are personas, by the labels of
  `shared/playwright/support/personas.js`. A persona an app has no role for
  (no reviewer on a preprint server) is skipped there by itself; an app
  badge is only for a row whose cells differ by app, split into one row
  per badge, as `submitter` above.
- **Columns** are states. `Unpublished` and `Published` are the persona
  set's two submissions; a rule about the context rather than a submission
  has one column, `Allowed`, and `Site` calls the route on the site
  (`index`) instead of the scratch context.
- **Cells** are `✓` (allowed), `—` (refused) or `?` (an open question in
  the register, linked; not checked).
- **A context's own rule** (announcements, institutions) reads like this,
  `Site` where the site has the same thing in Administration:

  ```markdown
  | Persona | Allowed | Site |
  |---|---|---|
  | manager | ✓ | — |
  | site admin | ✓ | ✓ |
  | reader | — | — |
  ```

- **One grid per rule, not per feature.** The routes of contributors,
  citations and funding all follow the publication metadata spec's
  edit gate; each route names it in the registry. A feature that has its
  own rule (announcements, institutions) carries its own grid.

The grid states what the product intends, the way the spec's prose does:
what the screens allow. It is written from the spec's rule and checked
against the matrix.

### The personas

`seedPersonas()` builds, per run, a scratch context with one throwaway
user per persona, a second context whose manager is the outsider, and two
submissions in the first: one in Copyediting (sent to review, its review
completed, accepted; a preprint server has no review), the other the same
and published. The participants are the assigned section editors (one with
"Permit submission metadata edit" off) and the assigned assistant (a
copyeditor); the reviewer completed the round. The base context is never
used, because a submit there assigns its section editors automatically.

### The matrix

The matrix lives in the private security repo
(`../pkp-e2e-sec/api-matrix/`), because a cell that disagrees with its
grid is often a security weakness, and a public check would publish it. It
reads the registry and the grids from this repo, calls every gated route
as every persona in every state, and fails a route with the list of cells
that disagree. A call answered 401, 403 or 404 counts as refused; any
other answer, a 400 for an empty body included, as allowed; a 5xx is a
finding of its own. The Playwright config adds an `api-matrix` project
only where that folder sits next to the clone, and CI never runs it:

```bash
npx playwright test -c configs/ojs.config.js --project=api-matrix
```

A disagreeing cell is judged like any finding: the grid is wrong (the
screens allow it too, and the spec said otherwise: fix the grid, and the
spec's prose if it was wrong too), the product question is open (a ❓
entry and a `?` cell), or the API lets someone do what the screens refuse,
which goes to the security repo by its `security_policy.md` and is listed
in the matrix's `known.js` until it is fixed.

## API checks

What a route does with input the screens never send, a filter they never
use, or a value they would refuse in the browser is an **API check**: a
numbered item in the owning spec's "Through the API" block, at the end of
"Canonical scenarios", and one test of the same number:

```markdown
### Through the API

API1. **A funder without a name is refused** {OJS OMP OPS}

   Given: a manager, a submission in Copyediting.

   - `POST …/funders` with no funder name answers 400, and the error names
     the funder field; the Funding list still shows no funder.
```

- **Only gaps.** A check exists because no screen sends that request. A
  route the screens call with the input that matters needs none.
- **Never a role.** Who may call a route is the grid's; an API check
  never asserts a refusal for a persona. That a route stays inside its own
  context and submission (another journal's announcement refused at this
  journal's address, a funder of another submission not reordered) is an
  API check, the way the UI suites assert that a screen leaks nothing: it
  holds a guard that works. A guard that does not hold is a security
  finding, never a public check.
- **Tests** live in `shared/playwright/tests/api/U<nn>-<feature>.api.spec.js`,
  app-neutral (the `appContext` names the app's context and capabilities),
  so every app's `shared` project runs them on CI. A test is named
  `API<n>: <title>`, signs in through `apiAs()`, seeds through the scenario
  API as any test does, and asserts the status and what changed.

## The traffic map

With `PKP_API_TRAFFIC=1` (CI sets it), every API call the suites make is
logged per test (`shared/playwright/support/api-traffic.js`), and each CI
shard uploads its log. `npm run api-traffic -- <run-id>` maps a run's logs (`--local` maps
this clone's own, `--clear` empties them before a fresh local run)
onto the registry: per feature, which routes the screens reach and as
which roles, which only API checks reach, which nothing reaches, and every
5xx answer with the test that met it. Read it when adding API coverage to
a spec: a route the screens never reach is where API checks pay.

## Probing

`npm run api-call -- <app> <username|-> <METHOD> <path> [json]` sends one
call to the app's probe server (`npm run probe-servers -- --start`), signed
in as that user the way `apiAs` signs in (`-` for nobody; `--context index`
for the site), and prints the status and the body: the quick way to see
what a route does before writing its grid or its check.

## Adding API coverage to a spec

Done as a revision of the shipped spec (RUNBOOK "Revising a shipped
feature"), one spec at a time:

1. **Owners.** The registry rows for the spec's routes name it.
2. **Gates.** Each route gets the grid of the rule it follows
   (`npm run api-routes -- --gate U40#edit-gate funders.add …`); a rule
   with no grid yet gets one in the spec that owns it.
3. **Matrix.** Run it on all three apps and judge every disagreeing cell
   (above).
4. **API checks.** From the traffic map and the spec's Rules and Fields:
   the inputs, filters and refusals the screens never send. Write them
   into "Through the API", then the tests.
5. **Green and lint**: the API tests on all three apps,
   `npm run api-routes -- --check`, the spec lint.

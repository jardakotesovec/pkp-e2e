# Runbook: how a feature gets its spec and its tests

This file and `docs/tracking/PROGRESS.md` are the source of truth for the
build. Any session, whether fresh, restarted or resumed after a context
reset, becomes correct by reading these two files. Never rely on what you
remember from the conversation.

**The goal.** Accurate specs that a QA person or product owner can read
without a developer, and per-app Playwright tests derived from those specs
with strong coverage. Every rule in this file exists to serve that goal. When
a rule gets in the way of it, the rule is what changes.

**The spec is the source of truth for the product.** Everything the project
knows about a feature lives in that feature's spec: how it behaves in OJS,
OMP and OPS, where the apps differ, what is broken, and what still needs a
product decision. Tests, coverage views and bug lists are derived from the
specs and must never contradict them.

**Modes.** The banner at the top of `PROGRESS.md` says which mode is active.
Read it before doing anything. **REVIEW** means one feature per session,
then stop for the maintainer's review. **MAINTENANCE** means the resident QA
agent role described in `MAINTENANCE.md`, with this runbook still binding
underneath it.

Paths in every campaign document are relative to the pkp-e2e repo root.
`../e2e_ng/` is the maintainer's private directory outside every repo.

**Words used in these docs.** The *orchestrator* is the session's main
agent; it briefs *subagents* (a *probe agent* drives the screens and
reports facts, a *writing agent* edits a spec, the *reader persona* reads
a spec as a QA person who has never seen the project). A *brief* is the
instruction a subagent gets. The *digest* is the one-page list of
spec-affecting facts distilled from probe reports. The *claim check* tests
a finished spec's own sentences against the running app. A *fleet* is one
app's running test install (server, database, checkout). A *tier* is a
feature's scenario budget (H, M or L). A *scratch* journal, user or
submission is one a test creates for itself. The *atlas* is the frozen
inventory of every screen and action, one *atom* per item, made before
any spec was written.

## Mission, scope & invariants

**Mission.** Document every OJS feature at the business level: actors,
fields, rules, state, permissions and side effects. The spec should be
precise enough that the feature could be rebuilt from it alone, and written
in language a product owner or QA person can read without a developer. The
readers are QA, developers, AI agents, and the test suite built from each
spec's canonical scenarios.

**Scope.** All three apps, anchored on OJS. Any feature reachable in OJS gets
one spec covering its behavior in OJS, OMP and OPS, and tests for each app.
The OMP catalog's reader and management screens are also in scope as
OMP-specific features. Out of scope, and dropped rather than parked: the
catalog's object model and screens OJS never has (chapter and
publication-format authoring, ONIX, marketing and direct sales, and OMP/OPS
Vue managers that are not wired into the OJS workflow page). Extending the
scope is the maintainer's decision. Specs are Markdown, reviewed raw and in
diffs, with inline HTML only where the structure needs it.

**Method.** First enumerate, then document, then map coverage. "Did we miss a
feature?" must be answerable with a grep.

- Phase 0, the surface atlas (`docs/tracking/atlas/`), is complete and
  frozen: 2,163 atoms, each assigned to a feature in `FEATURE-MAP.md` or
  parked in `UNASSIGNED.md`. It did its job, which was to split the apps
  into features. Surfaces added since go into their FEATURE-MAP row, or a
  new row, never into the atlas (MAINTENANCE "Triage").
- Phase 1, the feature specs, is the current phase. This file describes its
  loop.
- Phase 2, the coverage crosswalk, maps every spec scenario against the
  suite. It is still ahead.

**Invariants.** Every iteration keeps these true:

- **Every atom has one owner.** Each atom of the frozen atlas belongs to
  exactly one FEATURE-MAP row, is parked in `UNASSIGNED.md`, or is marked
  out of scope with a reason. The FEATURE-MAP row is the claim: a built
  spec copies its row's atom list into its `atlas-claims` frontmatter, and
  the atlas files themselves are not edited. The count of atoms in rows
  not yet built is the completeness metric. Never force an atom into a
  feature. A wrong grouping is worse than a deferred one. Group by what a
  journal manager would call the thing, never by code module.
- **As built, and intended.** Specs document what the code actually does.
  Behavior that is inconsistent, loses data, contradicts what the screen
  offers, or would surprise a product owner gets a ⚠ marker and a Findings
  register entry with the author's call on bug versus intended. That call is
  non-blocking and is settled on review. A rule that is merely strict is
  usually intended: write it plainly and add a ❓ entry with your lean. A spec
  that silently records bugs as requirements is poison for QA. There is no
  separate bug list; "all bugs" views are computed from the registers.
- **Verified, not just written.** Every spec passes a readability pass (step 5)
  and a claim check (step 7). An ambiguous rule is probed live, never
  guessed from the code.
- **Reachable before documented.** Code existing is not evidence that a
  feature exists. The apps carry screens nobody can reach. Establish that a
  surface is reachable in the current UI first, and record dead candidates
  in `UNASSIGNED.md`. Where a legacy path and a Vue path both do the same
  job, document both and say which one is primary.
- **The screen is the instrument.** The next section explains it.
- **Business language, one statement per fact.** The style rules and the lint
  gate live in `TEMPLATE.md`.

**Campaign definition of done.** The unclaimed atom count is zero. Every
PROGRESS row is `done` or `parked`. Each app's full suite is within the
budget below. The parked list and the register highlights have been reported
to the maintainer.

## The screen is the instrument

This project documents how PKP's applications behave **as their screens
present them**. The unit of documentation is a screen and a role: what a
signed-in user with that role is offered, what happens when they use it, and
where those two disagree. A button that does nothing, a control missing where
a role should have it, a screen that renders for someone it should not, a
message that contradicts what happened: those disagreements are the
deliverable.

The working conditions are ordinary QA conditions, and every brief says so: a
disposable local test install with seeded fixtures and accounts, driven as a
signed-in user of a given role. There are no real users and no real data.

Every probe, claim check and test acts as a signed-in user working the
application's own screens. That includes clicking what is offered, filling in
what is presented, and typing a URL straight into the address bar, which is
ordinary user behavior (a bookmark, a stale link). Visiting a screen and
reporting what it shows is always in scope.

What this project does NOT do: explore features by constructing requests the
application's own screens would never send. No hand-built API calls as
exploration, no credentials carried across sessions, no client except a
browser. The API is still visible, because the browser's own traffic is part
of what the screen shows. An API problem observed while driving a screen is a
real finding and is reported, not parked. Examples: a wrong status code, an
error payload leaking through, a response carrying data the screen never
asked for, a save that silently drops a field. Where it goes:

- **No security dimension**: the feature spec's Findings register, like any
  other finding.
- **Possibly security-shaped** (a guard that may not hold, data a role may
  not be entitled to): the security routing in "What goes where". It is
  verified first, and only confirmed problems stay in the private file.

There is no queue of deferred questions. A suspicion nobody verifies is not
filed anywhere. Either it earns one targeted verification this session, or
the claim it touches gets a ❓ register entry with a stated lean (kept generic
if it is security-shaped), or it is dropped.

Findings are described in whatever words describe them best. The only routing
rule is the security one.

> **Frame** (copy this paragraph verbatim into every probe, claim-check and
> test brief): "This is QA documentation of an application's own screens, on
> a local disposable test install with seeded accounts. Sign in as each role
> and use the screens the way that role would, including typing a URL
> directly to reach one. Record what the screen offers, what happens when it
> is used, and where the two disagree, including any API misbehavior the
> browser's own traffic shows along the way, so the product team can fix it.
> Never construct a request the screens themselves would not send. If a
> claim can only be settled that way, return it as an open question instead
> of probing it. A finding that could plausibly be a security weakness goes
> ONLY into the maintainer's private security file
> (`../e2e_ng/security.md`; on the VM, additionally a direct Mattermost
> message to @jarda.kotesovec and @beaug), never into a spec, test, report
> file or commit,
> because these repos are public. Before writing there, read the whole file.
> If the problem is already recorded (Open or Handled), update that entry
> instead of adding a new one. New entries use the file's fixed entry shape
> and are marked `unverified`. Say THAT you routed something there, and keep
> its content out of everything else."

Detail lives in `.reports/`. What an agent returns to the orchestrator is
short and outcome-shaped. That is context budgeting, not a wording rule.

## What goes where

- **Product findings** (bugs, divergences, oddities, open questions,
  including API misbehavior seen in the browser's own traffic with no
  security dimension) go to the feature spec's **Findings register**. That is
  the only home. Never `app-changes.md`, never a PROGRESS note, never a side
  document.
- **Potential security concerns** go to `../e2e_ng/security.md`, which is
  maintainer-only and outside every repo. Only **verified problems** stay
  there. Decide by substance: a role seeing or doing more than it is entitled
  to, a guard that does not hold, data exposed to the wrong audience,
  anything you would not publish before a fix. An observation enters marked
  `unverified`. Before the session report, the orchestrator dispatches one
  targeted verification probe on the disposable install, through the screens
  where possible. Where only a direct request can settle it, that single
  constructed check is allowed for verification, never for exploration, and
  its content obeys the same quarantine. Confirmed: the entry stays, marked
  `verified` with the date and what was observed. Not confirmed, or not
  verifiable in this environment: the entry is deleted, and if the underlying
  claim still matters the spec gets a generic ❓ entry. The repos are public,
  so such a finding's content never appears in a spec, test, `.reports/`
  file, PROGRESS note or commit message. The claim it would have supported
  is left out or kept generic until the fix ships. The fact of routing is
  never silent: a return or report says "one observation routed to the
  security file, verified" (or "dismissed") so the maintainer knows to look.
  Ordinary UX defects are not security concerns. They go to the register.

  **On the VM** the same file is written, at the same path relative to
  the repo, created with its two headings if absent. In addition, a session
  running there sends a direct Mattermost message to @jarda.kotesovec and
  @beaug with the observation, so they see it without opening the VM. The
  content never appears in a channel post, spec, test or commit. The
  verification probe and the "fact of routing" rule apply unchanged.
  **Writing the file.** Any agent may write it. The quarantine is about where
  content goes, not who writes it. Every write is read-first: read the whole
  file, and if an observation matches an existing entry (same guard, same
  screen, same root cause, even on another app or role), update that entry's
  `observed` line with the date and new context instead of adding another.
  One entry per distinct problem, ever. Every entry uses this shape:

  ```
  ## SEC-YYYYMMDD-<slug> — one-line problem statement
  status: unverified | verified YYYY-MM-DD
  where: <app(s) · screen · role>
  observed: <2–4 lines, what was actually seen>
  verified-by: <the one check that settled it>
  ```

  The file has two sections. **Open** holds the entries above. **Handled**
  holds one line per closed item (`SEC-id — disposition, date`, where the
  disposition is fixed, accepted or dismissed); the maintainer moves entries
  there on review. Handled lines are tombstones: check them before filing,
  and do not re-file a handled problem unless the behavior has demonstrably
  changed (then file a new Open entry naming the old id). If the file is
  absent, create it with the two headings. An absent file or an empty Open
  section means "no open concerns", not "never checked". At session end,
  after the verification pass, leave the file tidy: dismissed entries
  deleted, duplicates merged, every remaining Open entry distinct and
  `verified`.
- **A finding against an unmerged PR** goes to the developer, not to a
  register: the spec describes `main` (MAINTENANCE "A developer's PR fails
  the suite").
- **What a probe saw on another feature's screen** goes to
  `docs/tracking/incidentals.md`: one line naming the owning feature, the
  screen, what was seen and the date, written by the orchestrator from the
  fold logs' "left in `.reports/`" lists and the merge's incidentals. A
  spec author reads their feature's rows at step 2. A row is deleted when
  the owning spec absorbs it, or when a later probe of that screen finds
  it gone.
- **Reports for the team** (`docs/reports/`) are temporary. A report exists
  to hand the team something they need in one piece, usually an
  upstream-ready write-up of a regression. Once the problem it reports is
  addressed, delete the file; the register entry's footnote keeps the
  pointer ("reported 2026-09-01; report in git history").
- **Tracking files hold what is open.** When an item is resolved, delete
  it: a fixed regression's ci-triage row, a merged companion branch's row,
  a report the team has acted on, a PROGRESS note's history. Git history
  keeps everything, so nothing needs a Resolved section and nothing grows
  without bound. The parity ledger and `app-changes.md` record changes
  that are still in effect; a row leaves those when the change is reverted.
  The sync log keeps entries back to the oldest open item and nothing
  older. A flake class keeps its last three incidents.
- **Everything outside the canonical home is one sentence plus a link.** A
  ci-triage row, a sync-log line, a PROGRESS note, a Mattermost post: each
  says what and where in one sentence and links the register entry. The
  long form lives in exactly one place.
- **Build blockers** go to `docs/tracking/app-changes.md`: an app defect that
  had to be worked around or fixed to get tests green (races,
  nondeterministic UI, behavior hostile to a test harness), plus the record
  of any app-code change the campaign made. Nothing else goes there.
- **Scenario-builder parity notes** go to `docs/tracking/parity-ledger.md`.
- **Cross-feature mechanisms** are described fully in one owning spec. Other
  specs link to it (TEMPLATE rule 5).
- **Process learnings** go to this file, TEMPLATE or PRINCIPLES through
  maintainer review, never into a spec.
- **Aggregate views** ("all bugs", coverage) are computed from the specs on
  demand, never maintained by hand.

### Fix stale campaign artifacts when you meet them

Everything the campaign created is a living artifact. When a session finds
one that is stale or wrong, it fixes it in that session as routine
maintenance instead of leaving a debt note. This covers the process docs,
shared and app-side page objects, fixtures and helpers, earlier feature
suites, the lint gate, and the `_test` scenario API (a behavior change there
still gets its parity entry). The usual gate travels with the fix: every
suite the fix touches runs green once before commit (a new suite gets its
author's green plus the final run, step 9), and the session report names
the fix.

Shipped specs are maintainable in the same way. When a session's own live
evidence shows that a claim in a shipped spec is wrong, or a gap sits
squarely in that spec's territory, correct that spec in the same session,
through the spec's own quality bar scaled to the size of the correction. A
writing agent folds the change; the orchestrator never edits a spec inline.
Evidence gets a footnote with the probe date and the verbatim on-screen
strings. A new defect becomes a proper register entry with the next free ID,
and every new or rewritten register entry gets the reader persona (step 5)
on that entry alone before commit, because lint checks references, not
wording. Lint runs to zero on the touched spec, and the session report names every
spec touched and why. The limits: only what this session's evidence
established, no speculative rewrites. A correction too large or too
uncertain to fold confidently becomes that spec's ❓ entry with a stated
lean. A rewrite that changes how a reader would execute a rule or scenario
gets the persona re-read of the rewritten passages (step 5).

Two things maintenance never does: it never changes app code beyond what the
"Build blockers" rule allows (a row in `app-changes.md`, and only when
blocking green or a trivially safe mirror of an existing pattern), and it
never moves content that was routed to the private security file.

## Budget & ceilings

- **Per app: at most 700 tests and 25 minutes** for the full suite on a fresh
  database. The three fleets run in parallel, so wall time does not add up
  across apps. The 25 minutes apply to one CI job: as a suite grows past
  it, the job is sharded (Playwright `--shard`), never the coverage
  reduced. At today's pace (about 130 tests in 7 minutes at 4 workers)
  the first shard split arrives around the 45th feature.
- **Tiers** live in each PROGRESS row: H is 10–13 common scenarios, M is 6–8,
  L is 3–4, give or take one or two by the author's judgment. Each app's
  suite implements the common scenarios plus that app's own, so its count per
  feature is the tier plus the app-specific ones.

## The multi-app rules

Every feature is specified and tested across OJS, OMP and OPS. Test files
cite these rules by number, so the numbers are stable.

1. **One spec, all three apps.** No per-app copies. The body describes shared
   behavior. A claim with no app marker asserts "verified identical in every
   app that has the surface", so the absence of a marker is itself a claim,
   never "not checked yet". No budget allows probing every claim in every
   app, so the evidence bar for an unmarked claim is:
   - for a claim about a shared code path: the subclass-chain check (rule 8).
     An empty chain on the load-bearing path counts as positive evidence;
   - for a claim about permissions, exclusivity or what a screen offers (the
     kinds of claim code-reading gets wrong): additionally a live cross-app
     probe (rule 4);
   - a claim covered by neither is probed, or it gets a marker.
   Divergences carry an inline app marker linking to the Findings register. A
   feature an app does not have gets a title badge such as `{OJS OMP}` and one
   absence paragraph. Absences are written as install facts ("not installed
   by default"), never as impossibilities, and are probed as such.
2. **Scenarios live in the spec, common ones first.** Canonical scenarios are
   the QA-executable description of the feature and the units tests map onto.
   First come the scenarios common to every app that has the feature, then
   the app-specific ones. A per-app difference inside a common scenario is
   marked inline. A scenario an app cannot run is flagged with its analogue
   or its absence.
3. **Tests are written per app, derived from the spec.** Each app's suite
   covers the common scenarios in that app's own context (its roles, seeded
   data and vocabulary) plus its app-specific scenarios. Duplication between
   suites is fine: the spec is the maintained artifact. Standing constraints:
   never assert a 🐞 finding as the contract; a claim parked on an open ❓ is
   not a coverage gap; an absent feature costs one absence test with a
   positive control per assertion; each suite's file header says what it
   deliberately does not cover.
4. **Probing is cross-app by construction.** Every exclusivity claim ("only X
   can", "never shows") gets a read-only control probe in the other apps. A
   probe item that spans apps is owned by one agent driving all fleets, or
   has an explicit merge step. Never split one item by app midway.
5. **Corrections to the OJS text are expected.** Probing OMP and OPS routinely
   disproves what the spec says about OJS itself. A finding that touches
   shared base text is re-checked on OJS before the spec is final. That is
   normal yield, not scope creep.
6. **How old a divergence is guides the verdict.** Behavior untouched since
   the app's early years reads as intent. Behavior that broke during a
   modernization window reads as decay. The verdict lands in the register
   badge plus one sentence of rationale. The commit archaeology stays in
   footnotes and scratch reports.
7. **Divergence or own feature?** A difference that reuses existing machinery
   with different parameters (another stage, another decision, a smaller role
   set) stays a register divergence. Pure reductions never graduate. A
   difference earns its own spec and FEATURE-MAP row when it needs rules of
   its own: screens whose atoms no existing spec claims, or replacement
   scenarios rather than modified ones. The maintainer's test: similar
   features are ONE shared feature only when one is essentially the other
   rebranded, sharing most of the code (rule 8) and the business logic.
   Otherwise they are separate app-specific features even when the intent
   rhymes (the OMP catalog and the OJS archive have their own handlers and
   data model, so they are separate features). Forked-copy code with provably
   identical logic, the usual OJS-to-OPS pattern, counts as one feature, but
   every shared claim there needs probe evidence, because the chain check
   cannot vouch for a copy. OMP/OPS-only surfaces stay out of scope until the
   maintainer extends it.
8. **Look for divergences in the class hierarchy first.** Each app subclasses
   shared lib/pkp classes. For any load-bearing shared class, the first move
   is to read each app's subclass chain. An empty subclass is positive
   evidence of shared behavior. An override is where intended divergence
   lives. A missing override, or an extension point a refactor quietly turned
   into a constant, is the classic silent divergence. Explicit
   `isOJS()`-style branches, registry and seed-file differences
   (`userGroups.xml`, `emailTemplates.xml`) and config-merge survivors are the
   secondary seams, worth grepping once the hierarchy is understood.

## The per-feature loop

**How the work is split.** Heavy work is delegated. The spec author, the
probe agents, the digest agent, the finalizer, the persona, the rewrite and
fold agents, the claim checkers and the test authors are separate
subagents. The orchestrator briefs them, judges results, and is the only
writer of PROGRESS rows and `app-changes.md` entries. Agents run one or two
at a time; on the VM always. `npm run fleet-prep -- --feature U<nn>
[--reset]` prepares the fleets (per app: reset, setup project, probe
server) and writes `.reports/<feature>/fleet.json`, which names the ports.
Every brief points at TEMPLATE or PRINCIPLES rather than paraphrasing their
rules, and carries this sentence verbatim: "Do NOT write to PROGRESS.md or
docs/tracking/app-changes.md; return proposed content in your report
instead." Every probe, claim-check and test brief also opens with the Frame
paragraph, verbatim, before the task.

1. **Claim it.** Set the feature's PROGRESS row to `in_progress`.
2. **Author the spec** at `docs/specs/U<nn>-<feature>.md` (the zero-padded
   FEATURE-MAP row number first, so files sort in map order), following
   TEMPLATE and covering all three apps from the start. Draw on the feature's
   atlas atoms and the code, including its `atlas/affordances-*.md` rows.
   Name every screen, control and message by its on-screen label, taken
   from the templates and locale files the author is reading anyway; the
   probe confirms the label, and the reader never meets a code concept
   where the screen has a word.
   Every affordance on the feature's screens ends up covered by a rule or
   scenario, delegated to another spec with a checkable pointer, or
   explicitly waived. Where the code is ambiguous, do not guess. Put the
   question on the probe list the author returns with the draft. The author
   never probes. Every probe item is phrased as screen actions and
   observations: "as role R, on screen S, do X; record what appears". An
   item names the screen and the question. It may name a string that must
   be quoted exactly, but it never lists the only strings to capture; the
   probe records the whole screen (step 3). When the claim depends on a
   quantity or shape (how many errors, versions or issues; which of two
   actions; a journal with or without X), the item says so and asks for
   the default and the other end. A screen with tabs or steps gets one
   item that changes something and then leaves without saving, because the
   dialogs and losses on the way out are never seen by an item that stays
   on one screen. The author checks each item's premise against
   `docs/process/seed-facts.md` (what the seeded installs contain) and
   reads the feature's rows in `docs/tracking/incidentals.md` (what earlier
   sessions saw on its screens in passing): each row goes on the probe
   list or into the draft.

   **Draft read.** Before the probes run, the reader persona (step 5's
   brief) reads the draft's body once. The author fixes the wording
   stumbles itself; this read is not the gate, step 5's is. Every fact
   stumble (an address the reader cannot reach, a limit that may cut or
   refuse, a step with two ways, a tick that may not survive Save) becomes
   a probe-list item, so the questions a reader will ask are driven before
   the spec is written for them.
   An item that cannot be phrased as screen actions is not probed. The
   claim it would have supported gets a ❓ register entry with a stated lean
   (generic if security-shaped), a marker, or leaves the draft. The list
   includes the cross-app controls from rule 4.
3. **Probe.** The list is farmed out to probe subagents with fresh context,
   tight scope, and facts-only reports written to `.reports/<feature>/`. A
   probe answers "what does this role actually see and get on a running
   install?", through the screens, with the probe kit (patterns.md "Probe
   kit"; the brief carries `PROBE_FEATURE` and `PROBE_AGENT`). Any statement
   about what a UI control does (appears, is enabled, says X, is absent, in
   state Z for role R) is exactly the kind of claim code-reading gets wrong,
   so no such claim ships without being driven live. Three rules bind every
   probe. **Record the screen, not only the answer:** on every screen
   visited, save the kit's `screen()` snapshot first, then answer the item.
   **Name the axis and drive both ends:** when the item names a quantity or
   shape, probe the default and the other end. **Every app, every level:**
   a surface is probed on every app that has it, and a claim naming a set
   of roles is probed with one account per permission level from the
   roster (`users.md`). Probes are throwaway; the tests kept are step 8's.
   Reports record the locator used and separate the claim from incidental
   observations, because an incidental DOM detail is not promotable.
   Reports are written for the digest agent and for the maintainer, who may
   audit them before sign-off.

   **Screen notes.** `.reports/<feature>/screen-notes.md` is the one file
   every agent that drives screens reads first and appends to: per screen,
   the locators that worked, kit gotchas, premise corrections, dialogs that
   appear on the way out, waiting idioms. The kit appends each agent's
   locator table there when its process exits (`patterns.md` "Probe kit");
   the agent adds the rest with `note()` or by hand, in a short section
   under its own id. Later probes, the claim checkers and the test authors
   read it instead of each other's scripts. A brief points at it; nothing
   in it travels by memory or by being retyped into a brief.

   **3b. Digest.** One digest agent reads every probe report and writes
   `.reports/<feature>/digest.md`: the spec-affecting facts and nothing else.
   It is the only evidence artifact step 4 reads. Every correction, new
   fact and open item gets a block, and so does every role-gated or
   exclusivity claim whatever its status:

   > `### D<n> — <one line, product voice: what a person sees or gets, on which screen, as which role>`
   > `Affects:` Rule 9 | Actors row 2 | scenario 3 | register A5 | new
   > `Status:` confirms | corrects | new | undetermined
   > `Apps:` the apps it holds for (per-app difference stated in the line)
   > `Proposed:` 🐞 | ❓ | ✅ | plain claim · rule text | register entry | footnote | drop
   > `Evidence:` report file + item number — a pointer, never a quotation

   A plain confirmation of any other claim is one line in a closing table:
   rule or row · apps · report pointer. A confirmation that adds a word is a
   `corrects` block. Where the apps' strings differ, the block quotes every
   one of them verbatim. Each line reads as product behavior in the spec's
   own voice. Reproduction narrative and quoted report prose stay in
   `.reports/`. An `undetermined` block says only that, plus the one
   observation that would settle it. A fact a report saw in one run, or
   filed as incidental, is `undetermined` with its settling observation or
   a footnote candidate, never `corrects`. `Proposed:` is a suggestion;
   step 4 decides. When a probe premise proved wrong, the digest ends with the
   `seed-facts.md` correction it proposes. Size is the check: at most 120
   lines for an M-tier feature, 200 for H. A digest that will not fit means
   the probes overshot.
4. **Finalize the spec.** A fresh agent folds the digest into the draft. Its
   brief carries the draft path and the digest, and it may open the one
   report behind a digest block when it needs the detail. The digest is raw
   material, not spec content. It still overshoots: trivia, fixture
   accidents, other features' territory, optimistic severity. The finalizer
   includes a finding only at the weight its user impact earns, in product
   voice, and may downgrade or drop anything. What does not clear the bar
   stays in `.reports/`. Findings that belong to another feature go to that
   spec via a link. Where the digest quotes several apps' strings, all of
   them reach the spec; one is never kept as the universal one. One
   finalizer for an M or L feature; an H feature is folded in slices, one
   digest section or one spec section per agent. Small chunks are the
   standing rule for writing work. An agent that stalls on a technical
   limit is respawned on a narrower slice, up to two retries, and nothing
   is left half-folded. A refusal or safeguard flag is not a stall: pause
   per "Model discipline", and never re-press the brief or water down the
   item to get around it.
5. **Readability check.** A separate subagent reads in strict persona: a QA or
   product person who has never seen a campaign document, has no code access,
   and reads only the body above the footnotes. They restate every rule in
   their own words and walk each scenario as a manual test. The brief names
   three kinds of stumble: a verb or noun they cannot map to something on
   screen; any token they cannot resolve from the page itself (a code, an
   ID, a cross-reference that names no feature; the persona has read no
   other spec and must not "recognise" campaign notation); and a step they
   could execute two ways, or an outcome they could not judge pass or fail.
   The brief says the Conventions line's symbols (⚠, the app badges, the
   superscript evidence marks, the front-matter block) are explained on the
   page and are not stumbles. The persona marks each stumble as *wording*
   or *fact* (a stumble no rewrite can settle without new evidence, such as
   whether a limit cuts or refuses). Rewrite the wording stumbles, then run the persona once more
   over the rewritten passages only, because a rewrite is not verified by
   its own writer. A second pass is skipped when the first found zero
   blockers and every friction was fixed. The gate is zero blockers.
   **Every persona report has a consumer.** Fact stumbles go to the next
   agent that drives screens, the claim-check chunk file (step 7) or the
   test authors' briefs (step 8), and the orchestrator's brief names them.
   Wording frictions are rewritten when they change how a reader would
   execute a rule or scenario; the rest are counted in the PROGRESS note
   ("n minor readability frictions open"), so no report is left to a lean.
   Writers avoid most stumbles by writing to TEMPLATE "Write for a reader
   who has only this page".
   **Product-owner read.** After the last fold (step 9), a second persona
   reads the Findings register only, as a product owner deciding what to
   fix: from each entry alone, what a user experiences, and whether it is a
   defect or intended. Entries that fail are reworded by a writing agent.
   One short agent; the register is what the team triages from.
   **Rewrites preserve verified meaning.** The rewrite brief names the digest
   and footnotes behind every claim being reworded and carries verbatim:
   "Preserve the verified meaning — reword the phrasing, never the claim."
   This step runs before the claim check and the tests on purpose: the
   claim check verifies the rewritten wording, so a rewrite that changed a
   claim's substance is caught there, and the tests derive from a checked
   spec.
6. **Lint gate.** Run the lint described in TEMPLATE, and
   `npm run seed-facts -- --check`. The lint checks reference integrity
   only: register and marker integrity, link, anchor and footnote
   resolution, and campaign identifiers a reader cannot resolve. Wording is
   the writer's judgment and is never linted. Zero findings before the claim
   check.
7. **Claim check.** Chunked subagents test every claim in the spec against
   the running app, per app where behavior diverges. The target is our own
   text: catch an inaccurate rule before a QA reader trusts it. The same
   screen-only scope applies, and checkers use the probe kit.
   - **Every line is driven or declared.** The checklist is
     `node docs/process/lint/lint-spec.mjs --claims <spec>`: the whole
     spec, with the risky kinds marked. Nothing is skipped for being dated;
     a footnote date proves a probe ran, not the claim's scope. The only
     claims not driven are the ones the spec itself says have no screen.
     The chunk report's header lists them, and the orchestrator diffs that
     list against the checklist's `no-screen` lines (it must be a subset).
   - **Chunks are screen clusters.** The orchestrator cuts the claims by the
     screen they are settled on, seeded from the spec's "Reference — entry
     points & surfaces" table. A claim naming two screens sits in one chunk
     and its owner drives both. The chunk report stays in spec-section
     order, because the fold needs it that way.
   - **About 40 calls per checker.** A checker that reaches its budget
     writes its report on what it has, lists the remainder, and exits. A
     fresh checker takes the remainder. The brief names the chunk's probe
     cluster, its scripts and the screen notes; the checker starts from
     them and still drives every line.
   - **Merge and fold.** With three or more chunks a merge agent returns one
     change list in the digest format (`claimcheck-merge.md`). With two or
     fewer, the fold agent reads the chunks directly and still writes
     `claimcheck-merge.md` and the fold log, with its "suite-asserted claims
     touched" section, before editing. Every block's Proposed line is
     written in the reader's words (TEMPLATE "Write for a reader who has
     only this page"), on-screen strings quoted, so the fold pastes reader
     language instead of translating checker prose under its budget. The
     fold follows step 4's rules, and before returning reads its own
     folded spans against that TEMPLATE section and fixes what fails; the
     self-read is not the gate, the persona is. A correction replaces a
     sentence; it does not append a clause to it.
     Items that cannot be resolved become ❓ entries with a stated lean.
     After the fold, re-run lint and give the reader persona (step 5) the
     folded spans only; new wording is never verified by its writer.
8. **Write the Playwright tests** from the checked spec, following
   PRINCIPLES and the harness docs. One suite per app, derived from the spec
   (rules 2 and 3), one test per canonical scenario in each app that runs
   it. Seed through the scenario endpoints, reuse or extend page objects,
   scope Mailpit by a unique throwaway recipient (PRINCIPLES A8), and pair
   every "nothing happens" claim with a positive control. Locators,
   dialogs and waiting idioms come from `screen-notes.md`, never from
   re-reading the probe scripts. Run with `--output` to a private directory
   and `--reporter=list`.
9. **Run them green.** Each new suite runs green once by its author against
   the live fleets. A test that contradicts the spec means the spec is
   wrong: the test author returns the finding as a digest-format block with
   a pointer to the run log. When the block alters a claim rather than its
   wording, one fresh checker drives those spans first; a footnote-only or
   register-only change needs no checker. Then one writing agent folds
   everything the run's findings change, register entries included, and
   one persona pass reads the changed spans. The fold happens once, on
   verified facts. Never edit a test to pass a claim the
   app disproves. An app defect that blocks green is worked around and
   recorded in `app-changes.md`. After the last spec change the orchestrator
   runs `npm run test:final -- --feature U<nn>` (the three suites in turn,
   logs under `.reports/<feature>/`). That is the second green. A fix after
   a failed final run re-runs it.
10. **Update PROGRESS.** Status, number of tests per app, and a short note of
    one to three lines. Register highlights are welcome: 🐞 and ❓ counts, the
    finding a reviewer should read first, anything low-confidence. Finding
    detail stays in the register.
11. **Commit.** Everything the campaign produces (specs, docs, shared and
    app-side tests, page objects, builders, PHP overlays) is committed in this
    repo, in one commit stream. `.reports/` scratch is never committed. The
    app checkouts are read-only from the campaign's point of view: the
    mounted PHP copies belong to `bin/mount.js` (edit here, re-run mount,
    never commit them app-side), and changes to the apps themselves happen
    only through maintainer-reviewed PRs to pkp `main`, never from a campaign
    session. The local checkouts are the gitignored `checkouts/<app>` clones
    (`npm run fetch-apps`; see harness.md "The fleets"), and their pkp push
    URLs are disabled by construction.
12. **Report.** What was built, the register highlights, anything
    low-confidence. If anything was routed to the security file, the
    verification pass has already run and the report gives the outcome as
    counts only (verified / dismissed). Open questions stay recorded, not
    resolved; the team settles what it has time for. Then stop; the next
    feature starts in a fresh session.

### Resuming a feature mid-flight

Every gate ends in a file, and `.reports/<feature>/phase-status.md` names
them: one line per gate reached, `<gate> · <date> · <file that proves it>`,
appended by the orchestrator when the gate passes, plus
`security · <date> · none | routed, see private file` after the
verification pass. When PROGRESS shows `in_progress` and the tree holds
uncommitted work, read that file first, check that the named files exist,
and re-run the first gate whose file is missing. What a prior session's
subagents reported is gone; only files count. A mid-feature commit's
PROGRESS note names the last gate reached.

## Model discipline

- **Fable runs everything.** The orchestrator and every subagent, every role.
  No per-role model split, no per-agent model pins (subagents inherit the
  session model), no fallback to another model.
- **Pause on a flag.** If any agent is refused, flagged by safeguards, or
  silently downgraded to a non-Fable model mid-run: discard that attempt's
  output, do not re-press the brief, do not respawn onto another model, and
  do not water down the item to route around the flag. Detect silent
  downgrades from the agent's transcript: grep its JSONL for `"model":`;
  every assistant line must be claude-fable. Spot-check writing agents at
  completion. Record the point reached in the feature's PROGRESS note, log
  the event in the Model-fallback log, and stop for maintainer review. An
  ordinary technical stall (context overflow, tool error, environment
  breakage) is not a flag; the narrower-slice retry applies.
- **Model check at session start.** `/model` must be Fable. A handoff session
  starts on the saved default, not the predecessor's model.
- **Model-fallback log** in PROGRESS holds anomalies only: refusals, flags,
  downgrades, pauses, as date · feature · role · what happened.
- **Small chunks for writing work**, and the digest as the default evidence
  input for spec writers. Both are context hygiene, not censorship. Nothing
  is withheld; the trail behind each digest block stays readable in
  `.reports/` for the feature's duration.
- **Subagent returns are pointers, not findings.** A probe or claim-check
  agent returns where its report is, how many items it covered, and whether
  anything blocked it. The digest agent reads reports; the orchestrator never
  carries their contents.
- **Briefs are the Frame paragraph plus pointers**: the feature, the spec
  path, the report path, `fleet.json` for the ports, `screen-notes.md`,
  the row of "What each role reads", and "follow RUNBOOK step N". Point at
  the rule files; never paraphrase them, and never retype into a brief a
  fact that belongs in the screen notes. A brief for an agent that drives screens names the
  ~40-call budget (step 7).
- **Fresh agents, short transcripts.** An agent that drives screens is
  always fresh. Message an existing agent only when its transcript is
  smaller than what a fresh agent would read. One or two agents at a time.
- **The orchestrator never probes, verifies or edits a spec inline.** Doing
  the work inline is how the controlling agent gets lost, and spec edits
  belong to the writing agents. If context runs low mid-feature: finish the
  current gate, commit what is commit-worthy, and end. A fresh session
  resumes.
- **No status prose, no side plans.** Between gates the files under
  `.reports/<feature>/` and `phase-status.md` are the status; one line per
  gate is enough. No explore or plan agents during a feature: this file is
  the plan.
- **Liveness.** The completion notification is the only reliable subagent
  signal. Never judge by transcript size. Check ground truth with `ls`,
  `wc -l` and `grep -c` (did the file appear, how long is it), or wait.
  Read only what must be judged: the fold log's "suite-asserted claims
  touched" section, the chunk headers' declared list, the surfaces table
  for clustering.

**What each role reads.** The docs stay complete; briefs point at the row.

| Role | Reads |
|---|---|
| Probe agent | the Frame, step 3, "Live-probe etiquette", patterns.md "Probe kit", `seed-facts.md`, `users.md`, the feature's `screen-notes.md` |
| Claim checker | the same, plus the spec, step 7 and its chunk's probe scripts |
| Test author | PRINCIPLES, harness.md, patterns.md, scenarios.md, the spec, `screen-notes.md` |
| Reader persona | the spec body only; the product-owner read, the Findings register only |
| Writing agents (author, finalizer, rewrite, fold) | TEMPLATE (including "Write for a reader who has only this page"), the digest or change list, the spec; the author also reads the feature's rows in `incidentals.md` and the templates and locale files for labels |

### Rejected consolidations

Turned down; do not re-propose one without new evidence. Skipping claims
with a dated footnote (a third of the substantive claim-check catches sat
under dated footnotes). Readability after the claim check behind a
word-list grep (rewrites change claims a grep cannot see). Porting one
app's tests to the others (three independent derivations surface
ambiguities, PRINCIPLES M1; revisit if tests dominate the ledger). One
probe agent per app; digest merged into the finalizer; rewrite merged into
the persona; the spec author writing tests, or the test author as checker;
long-lived driving agents.

## Ops & campaign safeguards

Environment facts (fleets, ports, config, env vars, run commands, recovery)
live in `docs/process/harness.md`. The campaign-side rules are here:

- **Live-probe etiquette.** Use scratch contexts for anything that mutates.
  `publicknowledge` and the seeded users are read-only. Never `clearAll()`
  Mailpit.
- **Database hygiene.** Reset before any full-suite timing run and every 8 to
  10 features.
- **Git.** The pkp-e2e repo is the only push target for campaign work. App
  code is fetched from the pkp remotes, and nothing is ever pushed or
  branched there. A branch, rarely needed, goes to the `jardakotesovec`
  fork; the `checkouts/<app>` clones have pkp push URLs disabled and the
  fork as push default. Verify the remote URL before every push. A bad pushed
  commit gets a follow-up commit, never a force-push.
- **.reports/ retention.** Per-feature reports (probe reports, `digest.md`,
  claim-check chunks and merge) are session-local scratch: required during
  the loop, never committed (the directory is gitignored), and deletable
  after review sign-off. The spec must stand on its own: probe dates and
  verbatim on-screen strings live in its footnotes (TEMPLATE rule 1), never
  citations of report files. A shipped claim disputed later is settled by a
  fresh probe on the current build. The security rule is unchanged: a
  potential security concern never appears even in scratch. Older evidence
  sets that tracking files cite (`.reports/phase0-feature-map/`,
  `.reports/step1-harness/`) were removed from the tip and remain reachable
  in git history.

## Definition of done

- **Per feature**: the spec is `verified` and lint-clean; all three apps are
  covered per the multi-app rules; every affordance atom is covered,
  delegated or waived; each app's suite is green twice, once by its author
  and once in the final run (step 9); the PROGRESS row is
  updated with a short note; everything is committed. Team review of the
  register's verdicts is welcome whenever the team has time, and is never
  a gate.
- **Campaign**: the bar in "Mission, scope & invariants".

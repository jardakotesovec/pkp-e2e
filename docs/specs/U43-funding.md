---
name: funding
scope: Record who funded a submission — funders and their grants — and disclose that funding to readers
apps: [ojs, omp, ops]
shared: pkp-lib
status: draft
atlas-claims: [AFFW-401, AFFW-551, AFFW-552, AFFW-553, AFFW-554, AFFW-555, AFFW-556, AFFW-557, AFFR-063, VUE-039, VUE-061, API-020, SET-014]
---

# Funding {OJS OMP OPS}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

Funding lets a journal record, for each submission, the organizations that
funded the work and the grants behind it, so funders are formally credited
and the information travels with the publication's metadata. Authors can be
asked (or required) to declare funders while submitting; the editorial team
maintains the same list on the workflow's Publication area; readers see the
funders — with links to each funder's public registry record and to grant
DOIs — on the published item's landing page. A funder is identified either
by picking it from the ROR registry (the public Research Organization
Registry of institutions) or by typing a name by hand; each funder can carry
any number of grants (name, number, DOI). The free-text *Funding Statement*
paragraph and the *Data Availability Statement* are separate publication
metadata fields, owned by *Publication metadata* (no spec yet); this spec
owns the structured funders list end to end.

## Actors & permissions

**Editing follows the publication, not this screen**: the funders list is
editable by exactly the people who may edit the submission's publication
metadata at that moment — the gate and its published-state locks are owned
by *Publication metadata* (no spec yet). When the viewer may not edit, the
list is read-only: "Add Funder" and "Order" are grayed out and the row
action menus are absent (Rule 8). During submission, the wizard's Funders
section is the submitting author's own draft and is always editable there.
Publishing does not itself lock the list: a Journal Manager can still add,
edit and reorder funders on a published item, with only the general
"This version has been published" banner as a caution — whether publication
should lock metadata is *Publication metadata*'s question (no spec yet).
<sup>a</sup>

| Action | Who may — and when |
|--------|--------------------|
| **See the Funding list (workflow)** | • any role whose workflow view includes the Publication area — Journal Manager, Site Administrator, and assigned Section Editors, Assistants and the submission's Author — whenever the journal has funding switched on (Rule 2). An assigned Assistant whose group has no access to the submission's current stage gets no Publication entries at all, "Funding" included (stage access is the workflow screen's own rule) <sup>a</sup> |
| **Add / edit / delete / reorder funders (workflow)** | • whoever may currently edit the publication's metadata (see *Publication metadata*, no spec yet); everyone else sees the read-only list (Rule 8)<br>• on a preprint server, that includes the submitting author on their own not-yet-posted preprint — on a journal or press the author's workflow list is read-only [OPS1](#ops1) <sup>a</sup> |
| **Declare funders while submitting (wizard)** | • the submitting author — on the wizard's Details step, only while the journal *asks* or *requires* funder metadata (Rule 2) <sup>b</sup> |
| **See funders on the landing page** | • any reader — on a published item that has funders recorded (Rule 9) <sup>f</sup> |
| **Configure funding for the journal** | • Journal Manager (and a Site Administrator working in the journal) — on the workflow settings' Metadata screen (Settings that modify behavior) <sup>c</sup> |

## Fields & validation

The add/edit panel ("Add Funder" / "Edit Funder") carries two fields. A save
that fails validation is refused in place: the panel shows "Please correct
one error." and the Save button disables until the field is corrected.
<sup>d</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Funder** | Yes | "Search for a funder by name" queries the public ROR registry as you type (from four characters); the field's guidance reads 'Enter the full name of the institution below, avoiding any acronyms and select the name from the dropdown. (e.g. "Simon Fraser University")'. The first, pre-highlighted suggestion is always your typed text itself, styled like a registry match minus the country and registry mark ⚠ [A6](#a6); registry matches follow, each with name, country, the ROR mark and its own registry-record link (announced "Open link in a new tab."). If the registry does not answer, suggestions simply never appear and the field shows no error ⚠ [A9](#a9). Picking a registry match fixes the funder's identity: its registry link appears and its name — taken from the registry, in every registry language available — is not editable by hand. On an install whose server cannot itself reach the registry, the pick errors and the funder saves with no name at all ⚠ [A3](#a3); the registry-name storage on a normally connected install awaits observation ⚠ [A10](#a10). Or pick your typed text — the panel switches to one name box per submission language ("Type the funder name in {language}"), the primary-language box arriving pre-filled with your typed text. The primary language's box is marked required, but a save with any one language filled is accepted ⚠ [A12](#a12). Saving with neither a pick nor a name: "Search and select a Funder or enter a Funder name". A "Delete" button under the chosen funder clears it so you can search again. |
| **Funder Grants** | No | A sub-table of grants ("Add any grants associated with this funder (optional).") — columns **Grant DOI**, **Grant Number**, **Grant Name** — with an "Add" button for new rows and a per-row "Delete". All three cells are optional; a row left entirely blank is silently dropped on save. Grant DOI must look like a DOI ("10.xxxx/…") — anything else is refused with "This is not formatted correctly." on the cell. Grant Number is checked against the funder's grant registry only when the journal's grant-validation setting is on and the funder is one of the supported major funders (Settings that modify behavior); a failed check is meant to refuse the save with "The given grant number could not be validated against the Funder's ROR ID." ⚠ [A11](#a11) |

## Rules & state

1. **One list per submission.** A submission carries one ordered list of
   funders; each funder is a registry-backed or hand-named organization plus
   its grants. The wizard, the workflow and the landing page all present
   this same list.
2. **Availability follows one journal setting.** The Funders setting on the
   workflow settings' Metadata screen has three levels: switched off — no
   "Funding" entry in the workflow and no wizard section, so nothing new
   can be recorded; funders recorded before the switch-off stay visible to
   readers on the published page (Rule 9);
   enabled — the workflow's "Funding" entry appears but authors are not
   asked during submission; ask or require — the wizard's Details step
   additionally shows the Funders section. A new journal starts at "ask".
   <sup>c</sup>
3. **Where it lives in the workflow.** The workflow screen's Publication
   area — titled "Preprint" on a preprint server — gains a **"Funding"**
   entry; it opens a screen headed "Publication: Funding" ("Preprint:
   Funding" on a preprint server) carrying the
   funders list: heading "Funders", the explanation "Add formal funding
   information, ensuring funders are properly credited and appear in the
   publication metadata.", and a table whose one visible column is
   **"Funder Name"** (a second column header, "More Actions", exists for
   screen readers only). An empty list reads "No funders have been added."
   Above the table sit **"Order"** and **"Add Funder"**. <sup>a</sup>
4. **The row.** Each row shows the funder's name; a registry-backed funder
   also carries the ROR mark (the registry's logo) beside it. Grants are
   not shown in the table — they appear in the edit panel and on the
   landing page. Each row's "…" menu offers **"Edit"** and **"Delete"**.
   <sup>a</sup>
5. **Add and edit.** "Add Funder" opens the "Add Funder" side panel
   (Fields & validation); "Edit" opens the same panel titled "Edit Funder",
   prefilled with the funder and its grants. Saving closes the panel and
   the list updates in place. A registry-backed funder's identity is fixed:
   to change which organization it is, clear the Funder field ("Delete"
   under the name) and search again — editing only its grants is the
   ordinary path. <sup>d</sup>
6. **Delete.** "Delete" opens a confirmation ("Delete" / "Are you sure you
   wish to delete this item? This action cannot be undone.") with **"OK"**
   and **"Cancel"**. OK removes the funder and its grants permanently;
   Cancel leaves everything untouched. <sup>e</sup>
7. **Ordering.** "Order" puts the table in ordering mode: each row's "…"
   menu is replaced by up/down arrows (icon-only, with no name assistive
   technology can announce ⚠ [A5](#a5)), and the button relabels **"Save
   Order"**. Moving rows and pressing Save Order persists the sequence;
   the landing page lists funders in this order. A funder added after an
   ordering was saved appears first, above every previously ordered row,
   and keeps that place ⚠ [A7](#a7). <sup>e</sup>
8. **Read-only presentation.** For a viewer who may not edit the
   publication (Actors & permissions), the same list renders with "Add
   Funder" and "Order" grayed out and no "…" menus on the rows. <sup>a</sup>
9. **What readers see.** On a published item's landing page, a **"Funders"**
   block appears when the publication has at least one funder — and not at
   all otherwise. Each funder shows its name; a registry-backed funder's
   ROR mark links to its registry record. Under each funder, its grants:
   the grant name, "Grant Number" with the number, and "Grant DOI" with
   the DOI as a working link. On a press the landing page is the catalog's
   book page; on a preprint server, the preprint's page. <sup>f</sup>
10. **The wizard's Funders section.** While the journal asks or requires
    funder metadata, the wizard's Details step gains a "Funders" section —
    its last section on a journal or preprint server; on a press, Chapters
    follow it — the same list and add/edit panel as the workflow, always
    editable by the submitting author. On a press or preprint server the
    section's table still reads "No funders have been added." after a
    save — and the Review step "None provided" — until the page is
    reloaded; the funder IS saved, only the wizard's display fails to
    refresh ⚠ [A4](#a4). The wizard's Review step lists the funder names
    under "Details", or "None provided". <sup>b</sup>
11. **"Require" warns without blocking.** With the setting at require, an
    author who declared no funders sees a warning on the wizard's Review
    step: "Funders are required." The final submit stays enabled and the
    submission completes anyway ⚠ [A1](#a1). <sup>b</sup>
12. **One list across versions.** The funders list belongs to the
    submission as a whole: every publication version shows — and edits —
    the same list ⚠ [A2](#a2). <sup>g</sup>
13. **Hidden from anonymized review.** Wherever the application prepares a
    publication for a reviewer who must not learn the authors' identity,
    the funders list and the funding statement are withheld along with the
    author names. <sup>h</sup>

## Side effects

- Adding, editing, deleting or reordering funders sends no email, raises no
  notification, and writes no activity-log entry — the list simply changes.
  <sup>e</sup>
- Picking a registry funder stores a local copy of its ROR registry record
  (names in all registry languages, the registry link); invisible to users.
  When that copy cannot be fetched, the funder is left nameless
  ([A3](#a3)). <sup>d</sup>
- Funding metadata travels outward with the publication: it is carried in
  DOI registration and metadata export (see *DOI registration & Crossref*
  and the export plugins' features) and, on a journal, feeds the
  Publication Facts Label plugin's "funders" fact when that plugin is
  enabled — those surfaces belong to their own features.

## Settings that modify behavior

All on the workflow settings' **Metadata** screen, in its "Funders" section
("Identify the Funders and Funder Grants associated with the submission."):
<sup>c</sup>

- **"Enable funder metadata"** with, once ticked, the submission-time
  choice: "Do not request funder metadata from the author during
  submission." / "Ask the author for funder metadata during submission." /
  "Require the author to add funder metadata before accepting their
  submission." — the three levels of Rule 2 (off / enabled / ask /
  require). Unticking and later re-ticking the box does not restore the
  saved level: the choice arrives reset to "Do not request…" and the
  manager must pick their level again ⚠ [A8](#a8).
- The **"Funder Grant ID validation"** section ("Enable grant ID
  validation for supported funders (using the Zenodo API)."), checkbox
  **"Enable Grant ID validation."**: when on, a grant number entered for
  one of the supported major funders (NIH, NSF, European Commission,
  Wellcome Trust and some two dozen others) is checked against that
  funder's public grant registry on save, rejecting numbers the registry
  does not know [A11](#a11). When the registry service is unreachable,
  the check is skipped silently and the save goes through. <sup>d</sup>
- The neighboring **"Funding Statement"** setting on the same screen
  governs the free-text statement field, owned by *Publication metadata*
  (no spec yet).

## Cross-feature interactions

- *Publication metadata* (no spec yet) — owns who may edit a publication
  and the published-state policy this feature's editing rides on,
  including that publishing warns rather than locks (Actors &
  permissions); owns the Funding Statement and Data Availability Statement
  fields and their landing-page display.
- *[Submission wizard](U21-submission-wizard.md)* — owns the wizard shell
  (steps, Review, submit); this spec owns the Funders section it mounts
  (Rules 10–11).
- *Article landing page & reading* (no spec yet; the press counterpart is
  the OMP catalog's book page) — owns the landing screen; the Funders
  block on it is described here (Rule 9) as this feature's reader surface.
- *Contributors & affiliations* (no spec yet) — home of the ROR registry
  lookup machinery the Funder field reuses.
- The search machinery can filter submissions by funder; any reader-facing
  exposure of that belongs to the search feature.

## Canonical scenarios

Common to all three apps (OMP/OPS vocabulary per the
[application glossary](GLOSSARY.md)):

1. **Record and revise funding in the workflow** — Journal Manager: open a
   submission's workflow, Publication area, "Funding". The list reads "No
   funders have been added." Press "Add Funder", type a funder name, pick
   the typed text itself from the top of the suggestions, confirm the
   primary-language name box (it arrives pre-filled with your typed
   text), and add one grant row (name, number, DOI
   "10.1234/example"); Save. The row shows the typed name. Add a second
   funder by searching a well-known funder and picking its registry
   match — the name and registry link appear in the panel; Save. The row
   shows the funder with the ROR mark (on an install whose server cannot
   reach the registry this leg errors and saves nameless instead —
   [A3](#a3)). Press "Order", move the second funder up, press "Save
   Order" — reload: the order holds. Open the first funder's "…" →
   "Edit" — the panel is prefilled; change the grant number and Save.
   Then "…" → "Delete" on the second funder, "Cancel" (still listed),
   Delete again, "OK" — the row is gone. <sup>s1</sup>
2. **Declare funding while submitting** — Author, on a journal that asks
   for funder metadata: start a submission and walk to the Details step —
   it ends with a "Funders" section. Add a funder there just as in the
   workflow. On the Review step, the funder's name is listed under
   "Details" (on a press or preprint server only after a reload — ⚠
   [A4](#a4)). Complete the submission; sign in as Journal Manager and open
   the new submission's "Funding" — the author's funder is there.
   <sup>s2</sup>
3. **Read a published item's funding** — Reader: on a published article
   whose funders list holds a registry-backed funder with a grant (name,
   number and DOI), open its landing page. A "Funders" section lists the
   funder's name with the ROR mark linking to its registry record, and the
   grant's name, "Grant Number" and "Grant DOI" with the DOI as a link.
   A published article with no funders shows no "Funders" section at all.
   <sup>s3</sup>
4. **The journal opts out** — Journal Manager: on the workflow settings'
   Metadata screen, untick "Enable funder metadata" and save. A
   submission's workflow now shows no "Funding" entry in its Publication
   area, and an author starting a submission gets no Funders section on
   the Details step. Re-tick the setting and pick "Ask the author for
   funder metadata during submission." again (the previously saved level
   is not restored — the choice lands back on "Do not request funder
   metadata from the author during submission." — ⚠ [A8](#a8)) — both
   surfaces are back, the previously recorded funders intact. <sup>s4</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-08-28), unreviewed unless
an entry notes otherwise; the team settles them on spec review. Sorted
🐞 → ❓ → ✅. Each entry opens with the user-observable symptom; mechanism
and evidence live in the entry's footnote.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A3](#a3) | A registry funder picked while the server cannot reach the registry errors and saves permanently nameless | 🐞 | user-visible | — |
| [A4](#a4) | On a press or preprint server the wizard's funders table and Review step still read empty after a successful save | 🐞 | minor | — |
| [A5](#a5) | Ordering arrows and the typed-name boxes are broken for assistive technology | 🐞 | minor | — |
| [A1](#a1) | "Require the author to add funder metadata" warns on the Review step without blocking the submission | ❓ | user-visible | — |
| [A2](#a2) | Every publication version shows and edits the same funders list, though the screen presents funding per version | ❓ | minor | — |
| [A6](#a6) | The typed-text suggestion masquerades as a registry match; real funders get saved unlinked unnoticed | ❓ | user-visible | — |
| [A7](#a7) | A funder added after ordering jumps to the top of the saved order | ❓ | minor | — |
| [A8](#a8) | Re-enabling funder metadata resets the submission-time level to "Do not request" | ❓ | minor | — |
| [A9](#a9) | A failed funder search shows no error — suggestions silently never appear | ❓ | minor | — |
| [A10](#a10) | Registry-name storage on a normally connected install remains unobserved | ❓ | latent | — |
| [A11](#a11) | The grant-number rejection message has never been seen on screen | ❓ | latent | — |
| [A12](#a12) | The primary-language funder name is marked required, yet a save with any one language filled is accepted | ❓ | minor | — |
| [OPS1](#ops1) | The submitting author edits their own unposted preprint's funders | ✅ | user-visible | — |

### All apps

<a id="a1"></a>
**A1 — "Require" warns without enforcing** · ❓ · user-visible.
With funder metadata set to required, an author who declares no funders
sees the "Funders are required." warning on the wizard's Review step — yet
the final submit stays enabled and the submission completes, making the
setting's promise ("before accepting their submission") an advisory.
Question: is the require level meant to block submission, or only to warn?
Lean: oversight — the sibling required-metadata fields are enforced at
submit and this one is not.
Basis: probe. <sup>f-a1</sup>

<a id="a2"></a>
**A2 — Funders are shared across publication versions** · ❓ · minor.
The workflow offers "Funding" under each publication version, but the list
is stored once per submission: all versions show the same funders, and a
grant edited while viewing an old published version reads changed under the
current one too — unlike the other publication metadata, which is
versioned.
Question: is submission-wide funding intended, or should funders version
with the publication?
Lean: intended — funding describes the work, not an edition; but the
per-version presentation invites the wrong expectation.
Basis: probe. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — Registry pick saves a nameless funder when the server has no registry access** · 🐞 · user-visible.
When the journal's server cannot reach the ROR registry, picking a registry
match raises "An unexpected error has occurred. Please reload the page and
try again." — a dialog that can sit over the open panel and swallow the
next click — and the funder still saves, permanently nameless: the workflow
row, the edit panel, the wizard and the published page all show a bare ROR
logo with no text. The name the user just saw in the panel is discarded
rather than kept as a fallback; nothing recovers it short of deleting the
funder and re-adding it once the server can reach the registry.
Basis: probe. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — The wizard does not refresh after a funder save on a press or preprint server** · 🐞 · minor.
On OMP and OPS, saving a funder in the wizard's Funders section leaves the
section's table reading "No funders have been added." and the Review step
reading "None provided" until the page is reloaded. The funder is saved —
the workflow list shows it, and a reload brings both wizard displays
current. On OJS the same displays update in place, so the staleness reads
as a defect, not a design.
Basis: probe. <sup>f-a4</sup>

<a id="a5"></a>
**A5 — Two funder controls are broken for assistive technology** · 🐞 · minor.
In ordering mode the row's up/down arrows are icon-only with no accessible
name to announce. In the typed-name path the primary-language box is
announced with both languages' labels run together, and the second box has
no label at all.
Basis: probe. <sup>f-a5</sup>

<a id="a6"></a>
**A6 — The typed-text suggestion masquerades as a registry match** · ❓ ·
user-visible.
The first, pre-highlighted suggestion under the Funder search is always the
typed text itself, styled like a registry match minus the country and
registry mark. A user searching a real funder can pick it and save an
unlinked, hand-typed look-alike without noticing — two testers working from
these very screens did exactly that.
Question: should the manual option be visually set apart or listed last?
Lean: defect-shaped — the registry link is the feature's point and is
silently lost.
Basis: probe. <sup>f-a6</sup>

<a id="a7"></a>
**A7 — A new funder jumps ahead of a saved order** · ❓ · minor.
A funder added after the list was ordered appears first, above every
previously ordered row, and keeps that place on reload; the published page
shows the same sequence.
Question: intended, or should new funders append after the ordered rows?
Lean: defect — appending is what a saved ordering implies.
Basis: probe. <sup>f-a7</sup>

<a id="a8"></a>
**A8 — Re-enabling funder metadata resets the submission-time level** · ❓ · minor.
Unticking "Enable funder metadata", saving, and re-ticking it does not
restore the saved request level: the radios arrive preselecting "Do not
request funder metadata from the author during submission." — a manager
who saves without noticing silently downgrades the journal from "Ask" or
"Require" to never asking authors.
Question: intended reset, or a lost setting? Lean: minor defect — a saved
choice should survive a toggle, and the silent landing on "Do not
request…" invites an unnoticed policy change.
Basis: probe. <sup>f-a8</sup>

<a id="a9"></a>
**A9 — A failed funder search shows nothing** · ❓ · minor.
When the registry query fails in the browser (service outage or refusal),
funder suggestions simply never appear; the field shows no error or hint,
indistinguishable from "no matches".
Question: should the field say the registry could not be reached? Lean:
defect-shaped — the silence steers users into the typed-name path unaware.
Basis: probe, during an intermittent registry-service outage. <sup>f-a9</sup>

<a id="a10"></a>
**A10 — Registry-name storage unobserved on a connected install** · ❓ ·
latent.
On an install whose server has ordinary internet access, a registry pick is
designed to store the funder's official registry names and show them on the
row, in the wizard and on the published page. Only the failure branch could
be observed ([A3](#a3)), so the working path rests on code reading alone.
Question: does a registry pick on a normally connected install display the
registry name everywhere? Lean: yes, as designed. Settled by one registry
pick on an install with working server internet access.
Basis: code reading; failure branch probed. <sup>f-a10</sup>

<a id="a11"></a>
**A11 — The grant-number rejection message has never been seen on screen** · ❓ · latent.
With grant validation on, a number the registry does not know should refuse
the save with "The given grant number could not be validated against the
Funder's ROR ID." — but when the registry is unreachable the check is
skipped silently (observed: a nonsense NIH grant number saved without
complaint), so whether and where that message renders is unobserved.
Question: does the message appear on the offending grant row? Lean: yes —
the refusal is wired to the row's Number cell. Settled by saving one
invalid number for a supported funder, validation on, on an install with
working server internet access.
Basis: skip branch probed; message text from code. <sup>f-a11</sup>

<a id="a12"></a>
**A12 — The primary-language name is marked required but not enforced** · ❓ · minor.
In the typed-name path the journal's primary language's box is marked
"* Required", yet a save with it empty and only another language's box
filled is accepted: the panel closes and the row shows the other
language's name. The save actually requires a name in any ONE language
(or a registry pick) — the marker promises more than the save enforces.
Question: should the save refuse without a primary-language name, or
should the required marker come off? Lean: the marker is the defect —
the any-one-language rule is what the save enforces and what the list
renders from.
Basis: probe. <sup>f-a12</sup>

### OPS

<a id="ops1"></a>
**OPS1 — The submitting author edits their own preprint's funders** · ✅ · user-visible.
On a preprint server the author's workflow Funding list is fully editable
on their not-yet-posted preprint, while on a journal or press the author's
workflow list is read-only. Matches the preprint model — authors prepare
their own preprint for posting.
Basis: probe. <sup>f-ops1</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — the workflow list and its gate.** UI: `FunderManager.vue`
(ui-library `src/managers/FunderManager/`), mounted by the workflow page's
publication config (`funding` block in `workflowConfigEditorialOJS.js` /
`workflowConfigAuthorOJS.js`, prop `canEdit: permissions.canEditPublication`);
OMP and OPS inherit both blocks whole via the config deep-merge
(`useWorkflowConfigOMP.js` / `useWorkflowConfigOPS.js` — no app override
touches `funding`), and all three apps pin the identical ui-library commit
(`246623e9`, checked 2026-08-28) — positive shared-code evidence for every
client-side claim. The "Funding" menu entry is pushed by all six navigation
builders (author + editorial × 3 apps, `useWorkflowNavigationConfig*.js`)
under the same guard `publicationSettings.supportsFunders`, which
`PKPDashboardHandler::index()` sets from the context's `funders` setting;
app dashboard handlers do not override it (chain check clean). Read-only
presentation: the top buttons receive `isDisabled` when `canEdit` is false
(`PkpButton` prop via fall-through) and `FunderManagerCellActions.vue`
hides the row menu (`v-show="canEditPublication"`). Table strings:
`submission.funders` ("Funders"), `submission.funders.description`,
`submission.funders.column.name` ("Funder Name"),
`submission.funders.emptyFunders` ("No funders have been added."). The
role roster in the Actors row is the workflow screen's own access rule —
owned by the workflow/stage features; not separately verified here.
Live-probed 2026-08-28: the read-only rendering (grayed buttons, no row
menus) confirmed for the author and for a stage-assigned Assistant; an
assigned Assistant whose group lacks access to the current stage got an
EMPTY Publication nav group (no "Funding" entry at all); a manager-level
account added, edited and reordered funders on ALREADY-PUBLISHED items on
all three apps, with only the "This version has been published" banner
shown. Screen headings live-confirmed the same day: page title
"Publication: Funding" on OJS and OMP, "Preprint: Funding" on OPS — the
OPS app locale recasts the publication term to "Preprint"
(`locale/en/submission.po` override of `submission.publication`) and the
page title follows it; OPS nav group "Preprint", sr-only column header
"More Actions".

<a id="fn-b"></a>
**b — the wizard section and the require warning.**
`PKPSubmissionHandler::getDetailsStep()` appends section id `funders`
(type `SECTION_TYPE_FUNDERS`, name `submission.funders`) when the
context's `funders` setting is `request` or `require`; `wizard.tpl` mounts
`<funder-manager>` for that type with no `canEdit` prop (defaults to
editable). Subclass chains: OJS and OPS do not override `getDetailsStep()`;
OMP's override calls the parent and only appends its chapters section —
inherited-shared on all three. Review step: `review-details.tpl` renders
the funder names (or `common.noneProvided`) and, at `require` with an
empty list, a warning notification with `submission.funders.required`
("Funders are required.") — a display-only notification, not an entry in
the wizard's blocking `errors` set (A1; warn-only live-confirmed
2026-08-28, see f-a1). Live-probed 2026-08-28: the section renders last on
the OJS and OPS Details steps; OMP's Chapters section follows it; on OMP
and OPS the section's table and the Review step failed to refresh after
save (A4, f-a4).

<a id="fn-c"></a>
**c — the setting.** Context schema `funders`
(`lib/pkp/schemas/context.json`): `in:0,enable,request,require`, default
`request`. Field: `PKPMetadataSettingsForm` (`FieldMetadataSetting
'funders'`, label `manager.setup.metadata.funders`, options
`…noRequest/request/require` verbatim as quoted in Settings that modify
behavior) plus `FieldOptions 'funderGrantValidation'` (`showWhen:
'funders'`; section title "Funder Grant ID validation", description
"Enable grant ID validation for supported funders (using the Zenodo
API).", checkbox label "Enable Grant ID validation." — three distinct
strings, live-read 2026-08-28). Live-probed 2026-08-28: fresh scratch
contexts start ticked at "Ask the author…" (`request` default) on all
three apps; unticking removes the workflow entry and wizard section,
re-ticking restores both with recorded funders intact — but resets the
request level to "Do not request…" (A8, f-a8). With the setting off,
funders recorded earlier stayed on the published item's landing page
(live-probed 2026-08-28, OJS scratch journal; the landing templates
render funders without consulting the setting — fn-f's identical markup
on all three apps). All three apps' `MetadataSettingsForm` subclasses call the
parent constructor and only add publisher-id fields — the Funders section
is inherited-shared. Screen access (workflow settings) is the settings
features' rule, not re-verified here. Pin note: the OJS checkout's pkp-lib
(`87999c45`) carries one commit OMP/OPS's pin (`a9767b7f`) lacks —
"Restore type-aware empty value fallback for form field configs", 18
files across the shared form-field config layer, the funders setting's
own field classes included (checked 2026-08-28). Every funder behavior
probed this day — the A8 reset included — was identical on both pins.

<a id="fn-d"></a>
**d — the add/edit panel and validation.** Form: `FunderEditForm`
(`PKP\components\forms\funder\FunderEditForm`, fields `FieldFunder` +
`FieldFunderGrants`), served once per page by `PKPDashboardHandler::index()`
and `PKPSubmissionHandler` state; modal `FunderEditModal.vue`, titles
`submission.funders.addFunder.title` ("Add Funder") /
`submission.funders.editFunder.title` ("Edit Funder"). `FieldFunder.vue`:
search label `submission.funders.funder.searchPhraseLabel` ("Search for a
funder by name") over `FieldAffiliationsRorAutoSuggest` (queries
`https://api.ror.org/v2/organizations` from the browser, suggestions from
four typed characters, `allowCustom: true` — accepting the typed string is
the manual path); a registry pick stores `ror` + `rorObject` and POSTs the
registry record to the local `rors/` API (the Side-effects cache); manual
path renders one `FieldText` per submission language, the primary marked
required (enforced as any-one-language — A12, f-a12).
Server validation (`PKP\funder\Repository::validate()`): name-or-ror
required (`submission.funders.funderNameOrRorRequired`), ROR id shape and
grant DOI regex from `lib/pkp/schemas/funder.json`; the funders API
(`PKPFunderController::add()/edit()`) blanks the manual name whenever a
ROR is set and drops grant rows with no name, number and DOI before
validating. Registry-name fallback: `Funder::name()` maps the stored ROR
record's names onto the submission's languages when no manual name exists.
Grant-number check: `Repository::validate()` queries
`https://zenodo.org/api/awards` only when `funderGrantValidation` is on
AND the funder's ROR is in `Repository::AWARD_FUNDERS` (26 funders);
failure adds `submission.funders.grantNumberInvalid`; any request error is
swallowed (`continue`) — the silent skip, live-confirmed 2026-08-28: on a
scratch journal with validation on, a nonsense grant number for NIH (a
supported funder) saved without complaint while the registry was
unreachable (A11, f-a11). Panel validation live-confirmed the same day:
no-funder message, DOI-format message, blank grant row silently dropped,
and the failed-save summary "Please correct one error." with Save
disabled; panel strings byte-identical on OMP/OPS.

<a id="fn-e"></a>
**e — delete, ordering, silence.** Delete:
`useFunderManagerActions.js::fundersDeleteFunder()` — dialog title
`common.delete`, message `common.confirmDelete` ("Are you sure you wish to
delete this item? This action cannot be undone."), buttons `common.ok` /
`common.cancel`, then DELETE `…/funders/{id}`. Ordering:
`FunderManagerSortButton.vue` toggles `grid.action.order` ("Order") /
`grid.action.saveOrdering` ("Save Order");
`FunderManagerCellActions.vue` swaps the row menu for `TableCellOrder`
up/down while sorting; save PUTs the id sequence to `…/funders/order`
(`PKPFunderController::saveOrder()`, sequence numbers written 1..n;
`getMany` orders by sequence — a never-reordered funder holds sequence 0,
which is why a newly added funder lists FIRST among previously ordered
ones: A7, live-probed 2026-08-28, held on reload). Delete dialog and
ordering flow live-confirmed 2026-08-28. Silence: `PKPFunderController`
writes no email, no
notification and no event-log entry on any of its five operations (code
reading — the controller's methods touch only the funder rows).

<a id="fn-f"></a>
**f — the reader block.** OJS `templates/frontend/objects/
article_details.tpl` (`#funding-data`): section heading
`submission.funders`, per funder the localized name plus the ROR icon
(`$rorIdIcon`, assigned by `ArticleHandler`) linking to `$funder->ror`;
per grant `grantName`, `submission.funders.funder.grant.number` ("Grant
Number"), `submission.funders.funder.grant.doi` ("Grant DOI") linking
`https://doi.org/{grantDoi}`; the whole section skipped without funders.
OMP `monograph_full.tpl` (catalog book page, icon from
`CatalogBookHandler`) and OPS `preprint_details.tpl` (icon from
`PreprintHandler`) carry byte-identical funder markup — forked copies,
each probed live 2026-08-28: identical rendering on the OJS article page,
OMP catalog book page and OPS preprint page (heading, name, ROR-mark link
to the registry record opening in the same tab, grant name / "Grant
Number" / "Grant DOI" as a `doi.org` link), and the absence control —
a published item with no funders — showed no block on any of the three.
The same template file also renders the Funding Statement
and Data Availability sections — owned by *Publication metadata* per the
campaign's ownership split.

<a id="fn-g"></a>
**g — submission-wide storage.** `lib/pkp/schemas/funder.json` keys a
funder by `submissionId` only (required prop; no publication id);
`PKPFunderController::getMany()` filters by the authorized submission and
ignores the `{publicationId}` in its own route; `saveOrder()` likewise.
The publication's `funders` payload (`Publication maps Schema::mapByProperties`,
case `funders`) attaches the submission's full list to every version.

<a id="fn-h"></a>
**h — anonymized review.** `PKP\publication\maps\Schema::mapByProperties()`:
with `$anonymizeAuthors` set (the flag the review surfaces pass for
author-anonymous review types), the `funders` array is emptied and
`fundingStatement` nulled in the mapped payload — withheld at the source.
Live-probed 2026-08-28 (OJS): an anonymous-review reviewer's publication
payload arrived with `funders` emptied while the Open-review control
carried the full funder — but no reviewer-facing screen renders funders in
either mode, so the withholding is observable (and testable) only in the
payload the browser receives, never as a UI difference. The
funding-statement leg remains code-read.

<a id="fn-s1"></a>
**s1 — scenario 1 seeding.** One scratch submission (any stage before
publication) in the seeded journal; Journal Manager account. Needs the
journal's funders setting at its default ("ask" or any enabled level).
The registry leg needs internet BOTH browser-side (the suggestions come
live from the public registry) and server-side (the record cache) — the
campaign's test installs block server-side egress, so there the registry
leg deterministically fails per A3 and suites cover the typed-name path
plus A3's failure shape instead. "Search a well-known funder" — e.g.
"National Institutes of Health"; the grant DOI needs only the right
shape, not a real DOI (validation is format-only unless the
grant-validation setting is on).

<a id="fn-s2"></a>
**s2 — scenario 2 seeding.** A roster author account; journal at the
default funders level ("ask"). The wizard reaches Details after Files;
the section sits at the step's end. The manual-name path avoids the
internet dependency if the registry is unreachable.

<a id="fn-s3"></a>
**s3 — scenario 3 seeding.** One scratch submission published with a
registry-backed funder carrying one fully filled grant, and one published
without funders as the absence control. On a press the landing page is
the catalog book page; on a preprint server the posted preprint's page.
Live-run 2026-08-28 on all three apps, absence controls clean. Where the
server cannot reach the registry the registry funder renders nameless
(A3): seed a manual funder alongside it for a name assertion.

<a id="fn-s4"></a>
**s4 — scenario 4 seeding.** Scratch journal (the setting is mutated), one
scratch submission with a funder already recorded, plus an author account
for the wizard leg. The "previously recorded funders intact" check is the
re-tick leg's observable.

<a id="fn-f-a1"></a>
**f-a1 — A1 evidence.** Live-probed 2026-08-28 on OJS and OPS (OMP not
run): with the setting at require and no funders declared, the Review step
showed "Funders are required.", Submit stayed enabled, and the submission
completed. Mechanism: the warning in `review-details.tpl` is a
`<notification>` bound to `publication.funders.length` and the `require`
setting — it is not added to the wizard's `errors` object that disables
submit; `PKP\publication\Repository::validate()` enforces
`METADATA_REQUIRE` for the plain-language summary but contains no funders
check at all (grepped 2026-08-28, pinned checkouts). Warn-only is
observable only in isolation: with any other blocking error present
(e.g. the missing-file error), Submit is disabled and the funders warning
is easy to mistake for blocking — the isolated re-run (2026-08-28, OJS: a
draft with an uploaded, genre-assigned file, no funders, require on)
reached "Submission complete".

<a id="fn-f-a2"></a>
**f-a2 — A2 evidence.** fn-g's storage facts. The workflow's version
navigation offers "Funding" under each version
(`getPublicationVersionItems`), while the list is submission-keyed.
Live-probed 2026-08-28 (OJS): a grant edited while viewing the old
published version read changed under the current version too.

<a id="fn-f-a3"></a>
**f-a3 — A3 evidence.** On a registry pick the browser POSTs the registry
record to the local `rors/` API; `PKPRorController::addOrEdit()` ignores
the client-supplied record and re-fetches
`https://api.ror.org/v2/organizations/{id}` server-side — any fetch
failure answers 404, the UI raises the generic error dialog, and the
subsequent funder save stores `ror` with an empty `name` (the funders API
blanks manual names whenever a ROR is set; `Funder::name()` then has no
cached record to fall back on). Live-probed 2026-08-28 on all three apps;
deterministic on the campaign's test installs, whose servers have no
outbound internet access.

<a id="fn-f-a4"></a>
**f-a4 — A4 evidence.** Live-probed 2026-08-28, two runs per app: after a
200 save on OMP and OPS the wizard section's table stayed at "No funders
have been added." and the wizard's Review step read "Funders — None
provided"; a full page reload brought both current (the saved name then
listed). OJS refreshed in place. Same shared `FunderManager` component on
all three (identical ui-library commit) — the per-app difference is
unexplained at code level.

<a id="fn-f-a5"></a>
**f-a5 — A5 evidence.** Live-probed 2026-08-28 (OJS; shared ui-library
components): the `TableCellOrder` up/down buttons expose no accessible
name; in the multilingual name boxes the primary input's accessible name
concatenates both languages' labels and the secondary input has none.

<a id="fn-f-a6"></a>
**f-a6 — A6 evidence.** `FieldAffiliationsRorAutoSuggest` with
`allowCustom: true` renders the typed text as the first option,
pre-highlighted, without the country subscript or ROR icon a registry
option carries. Live-observed 2026-08-28: two independent probe sessions
picked the typed-text option while intending the registry match.

<a id="fn-f-a7"></a>
**f-a7 — A7 evidence.** fn-e's sequence mechanics (new funder holds
sequence 0; ordering writes 1..n). Live-probed 2026-08-28 (OJS): the new
funder listed first above the ordered rows and held that place on reload.

<a id="fn-f-a8"></a>
**f-a8 — A8 evidence.** Live-probed 2026-08-28 on OJS (including after a
fresh page load), OMP and OPS: from a journal saved at "Ask the
author…", untick "Enable funder metadata", save, re-tick — the first
radio, "Do not request funder metadata from the author during
submission.", arrives checked; the saved "Ask" level is not restored.

<a id="fn-f-a9"></a>
**f-a9 — A9 evidence.** Observed 2026-08-28: `ror.org` intermittently
served the query URL without CORS headers, the browser's fetch failed, and
the field rendered no suggestions and no error (console-only failure).
External trigger; the silence is the field's own handling of any failed
query.

<a id="fn-f-a10"></a>
**f-a10 — A10 evidence.** The campaign's test installs block server-side
outbound HTTP, so the `rors/` cache write always fails there (f-a3). The
working path — registry record cached, `Funder::name()` mapping registry
names onto the submission's languages — is code-read only (2026-08-28,
pinned checkouts).

<a id="fn-f-a11"></a>
**f-a11 — A11 evidence.** `Repository::validate()` attaches
`submission.funders.grantNumberInvalid` to the offending row's
`grants.{i}.grantNumber` — the basis for the "appears on the grant row"
lean. Live-probed 2026-08-28 (OJS scratch journal, validation on): only
the unreachable branch was reachable — nonsense NIH grant number
`XXNONSENSE99ZZ` saved silently; message text read from the locale file,
never seen rendered.

<a id="fn-f-a12"></a>
**f-a12 — A12 evidence.** Live-probed 2026-08-28 on OJS, on a scratch
journal with English (primary) + French (Canada) submission languages:
the English box carried the "* Required" marker and the `required`
attribute; clearing it and saving with only the French box filled
("Fonds bilingue FR") was accepted — the panel closed, the stored names
were empty English + the French value, and the row rendered the French
name. Server rule (`PKP\funder\Repository::validate()`,
`submission.funders.funderNameOrRorRequired`): a name in any one language
or a ROR id satisfies the save; no primary-locale check exists. The panel
is the shared `FunderEditForm` on all three apps; the enforcement gap was
probed on OJS only.

<a id="fn-f-ops1"></a>
**f-ops1 — OPS1 evidence.** Live-probed 2026-08-28: the OPS submitting
author's workflow Funding list offered working Add/Edit/Order on their
unposted preprint; the OJS and OMP authors saw the read-only rendering
(fn-a). Mechanism: the publication-edit permission the manager config
passes (`canEditPublication`) evaluates true for the OPS author before
posting.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Funding list (workflow) | workflow screen → Publication → "Funding" | AFFW-401 · VUE-039 |
| "Add Funder" button | above the funders table | AFFW-552 |
| "Order" / "Save Order" button | above the funders table | AFFW-551 |
| Row move up / move down (ordering mode) | funders table rows | AFFW-553 |
| Row "Edit" | funders table row "…" menu | AFFW-554 |
| Row "Delete" | funders table row "…" menu | AFFW-555 |
| Delete confirmation ("OK" / "Cancel") | dialog | AFFW-556 |
| Add/Edit Funder panel (save/cancel) | side panel | AFFW-557 · VUE-061 |
| Funders section in the wizard | submission wizard, Details step | rider on the wizard shell (owned by *[Submission wizard](U21-submission-wizard.md)*) |
| Funders block on the landing page | published item's landing page | AFFR-063 (funders portion; the funding-statement / data-availability portions ride with *Publication metadata* per the campaign's split) |
| Funders API | `submissions/{id}/publications/{id}/funders` (list, get, add, edit, delete, order) | API-020 |
| Funder record shape | — | SET-014 |

## Reference — code anchors

- `lib/pkp/api/v1/funders/PKPFunderController.php` — the five funder
  operations and their role/publication policies.
- `lib/pkp/classes/funder/Funder.php`, `Repository.php`, `maps/Schema.php`
  — model (registry-name fallback), validation (name-or-ror, Zenodo grant
  check), payload mapping; `lib/pkp/schemas/funder.json` — the record
  shape.
- `lib/pkp/classes/components/forms/funder/FunderEditForm.php` +
  `FieldFunder.php` / `FieldFunderGrants.php` — the panel's server-side
  form.
- `lib/ui-library/src/managers/FunderManager/*` — table, store, actions,
  modal (same commit in all three apps);
  `src/components/Form/fields/FieldFunder.vue` / `FieldFunderGrants.vue` /
  `FieldAffiliationsRorAutoSuggest.vue` — the panel's fields.
- `lib/pkp/pages/submission/PKPSubmissionHandler.php`
  (`getDetailsStep()`, `SECTION_TYPE_FUNDERS`) +
  `lib/pkp/templates/submission/wizard.tpl` / `review-details.tpl` — the
  wizard mount and the require warning.
- `lib/pkp/classes/components/forms/context/PKPMetadataSettingsForm.php` +
  `lib/pkp/schemas/context.json` (`funders`, `funderGrantValidation`) —
  the settings.
- `templates/frontend/objects/article_details.tpl` (OJS) /
  `monograph_full.tpl` (OMP) / `preprint_details.tpl` (OPS) — the reader
  block (forked copies).

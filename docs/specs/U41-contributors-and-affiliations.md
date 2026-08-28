---
name: contributors-and-affiliations
scope: Maintain who authored the work — the contributors, their order, roles, ROR-backed affiliations and the primary contact — everywhere the list appears
apps: [ojs, omp, ops]
shared: pkp-lib
status: verified
atlas-claims: [AFFW-146, AFFW-147, AFFW-148, AFFW-149, AFFW-150, AFFW-151, AFFW-152, AFFW-153, AFFW-154, AFFW-155, AFFW-156, AFFW-396, AFFW-532, AFFW-681, AFFW-682, AFFW-683, AFFW-684, AFFW-685, AFFW-686, AFFM-061, AFFM-062, AFFM-063, GRID-051, VUE-033, VUE-034, VUE-056, VUE-093, VUE-094, API-014, API-033, SET-001, SET-003, SET-007, SET-022, JOB-057]
---

# Contributors & affiliations

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

Every publication carries a list of **contributors** — the people (or
organizations) credited as its authors — and this feature is how that list
is maintained and shown. The submitting author builds the list while
submitting; the editorial team maintains it on the workflow's Publication
area; readers see it on the published item's pages. Each contributor has a
name, contact details, one or more **contributor roles** (labels such as
"Author" or "Translator", defined per journal on a settings screen this
feature owns), and any number of **affiliations** — institutions either
picked from the ROR registry (the public Research Organization Registry;
a registry-backed entry carries the **ROR mark**, the registry's logo) or
typed by hand. One contributor per publication is its **primary contact**
(the badge's on-screen words; distinct from the journal's *principal
contact*, the configured identity system emails are sent from). The
feature is one shared implementation across OJS (journals), OMP (presses)
and OPS (preprint servers), and this spec is written in journal terms.
<sup>a</sup>

## Actors & permissions

**Editing follows the publication, not this screen**: the contributors
list is editable by exactly the people who may edit the submission's
publication metadata at that moment — the gate and its published-state
locks are owned by *Publication metadata*
([→ edit gate](U40-publication-metadata.md#edit-gate)). That gate's
published-state behavior holds here unchanged: a published version's
Contributors page shows the same warning banner as the other publication
pages and stays fully editable for the same people. When the viewer
may not edit, the list is read-only: the rows and the "Preview" button
remain, and every other control — "Order", "Add Contributor" and all
row actions — is absent entirely (Rule 9; unlike the Funding list, whose
disabled buttons stay visible grayed out). During submission, the
wizard's Contributors step is the submitting author's own draft and is
always editable there. <sup>a</sup> <sup>b</sup>

| Action | Who may — and when |
|--------|--------------------|
| **See the Contributors list (workflow)** | • any role whose workflow view includes the Publication area — Journal Manager, Editor, Site Administrator, and assigned Section Editors, Guest Editors, Assistants and the submission's Author; the "Contributors" entry is always present, with no setting to remove it (which roles reach the workflow screen at all is the workflow screen's own rule) <sup>a</sup> |
| **Add / edit / delete / reorder contributors, set the primary contact** | • whoever may currently edit the publication's metadata ([→ edit gate](U40-publication-metadata.md#edit-gate)); everyone else sees the read-only list (Rule 9)<br>• on a preprint server, that includes the submitting author on their own not-yet-posted preprint — on a journal or press the author's workflow list is read-only [OPS1](#ops1) <sup>b</sup> |
| **Edit contributors while submitting (wizard)** | • the submitting author — the wizard's Contributors step is always present and always editable (the step's place in the flow and its submit gates belong to the *[Submission wizard](U21-submission-wizard.md)*) <sup>i</sup> |
| **Manage the journal's contributor roles** | • Journal Manager (and a Site Administrator working in the journal) — on the "Contributor Roles" settings screen (Rule 12) <sup>e</sup> |
| **See contributors on reader pages** | • any reader — on a published item's landing page and in the listing pages' author lines (Rules 14–15) <sup>h</sup> |
| **Require competing-interest statements** | • Journal Manager (and a Site Administrator working in the journal) — on the workflow settings' Metadata screen (Settings that modify behavior) <sup>j</sup> |

## Fields & validation

The add/edit panel ("Add Contributor" / "Edit") opens with a
**"Contributor Type"** choice that decides which of the fields below
appear; its guidance warns "Selecting a contributor type will determine
which fields you need to complete in this form. Please note that if you
change the contributor type after you've started filling out the form,
any information you've already entered will not be saved." Fields marked
*multilingual* follow the language-bar behavior of the other publication
forms (see *[Publication metadata](U40-publication-metadata.md)*): only
the submission language's copy is ever required. A save missing a
required field never leaves the form: **"This field is required."**
appears in red under the field, and the form's foot shows **"Please
correct one error."** — **"Please correct {n} errors."** when several —
with a **"Jump to next error"** link until every error is fixed; after a
refused save the Save button stays disabled until an errored field is
edited. <sup>c</sup> <sup>n</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Contributor Type** | Yes | Radio choice: **"Person"** (preselected), **"Organization or group"** or **"Anonymous"** — an entry with no name of its own, shown everywhere as "Anonymous" (Rule 3): for it only Email, Country, Contributor Roles, CRediT roles and Publication Lists remain (no name fields, ROR ID, Homepage URL, Bio Statement or Affiliations) — and of these only Contributor Roles is actually enforced: Email and Country keep their required markers, yet an Anonymous save with both empty is accepted ⚠ [A18](#a18). Switching types leaves what you typed on screen; on save the other type's entries are discarded as the guidance warns — except a typed ROR ID, which silently stays in the saved record ⚠ [A4](#a4). |
| **Given Name** | Yes (Person) | Text, multilingual. Person only. |
| **Family Name** | No | Text, multilingual. Person only. |
| **Preferred Public Name** | No | Text, multilingual. Person only. Guidance: "Please provide the full name as the author should be identified on the published work. Example: Dr. Alan P. Mwandenga" |
| **Organization Name** | Yes (Organization) | Text, multilingual. Organization only. |
| **Email** | Yes | Text; must be an email address. Not enforced for an Anonymous contributor, despite the marker ([A18](#a18)). |
| **Country** | Yes | Drop-down of countries. The submitting author's auto-created contributor can arrive with no country — every later edit of them is then refused until one is chosen ⚠ [A16](#a16). Not enforced for an Anonymous contributor ([A18](#a18)). |
| **ROR ID** | No | Organization only: a plain text box ("Enter organization's ROR ID."), separate from the Affiliations field below; anything typed is accepted without a shape check ⚠ [A4](#a4). |
| **Homepage URL** | No | Must be a web address. |
| **ORCID iD** | No | Person only; present only while the journal has ORCID enabled. The field's states, its "Request verification" flow and iD removal are owned by *[ORCID integration](U04-orcid-integration.md)*. |
| **Competing Interests** | Yes, when shown | Rich text, multilingual; present only when the journal requires competing-interest statements (Settings that modify behavior). Guidance: "Please disclose any competing interests this author may have with the research subject." Saving it empty is stopped as a missing required field (the section's refusal above). On a preprint server the field's label renders as raw code-like text instead of the plain "Competing Interests" ⚠ [OPS2](#ops2). <sup>j</sup> |
| **Bio Statement (e.g., department and rank)** | No | Rich text, multilingual. |
| **Affiliations** | No | The contributor's institution list (any number). Guidance: 'Enter the full name of the institution below, avoiding any acronyms. Select the name from the dropdown and click "Add" to include the affiliation in your profile (e.g. "Simon Fraser University")'. Typing under "Type the institution name in {language}" queries the public ROR registry as you type (from four characters, straight from your own browser); each suggestion shows the institution's name, country, the ROR mark and a link to its registry record — or pick your typed text itself (offered first, as a bare label) to record a hand-typed institution. "Add" appears only once a suggestion is picked — there is no Add button before that, and text typed but never picked is silently dropped when the form is saved ⚠ [A8](#a8). "Add" puts the institution on the list. While a picked entry sits under "Selected", the search box is disabled — add or remove the entry before typing a new query. A registry-backed entry's identity is fixed: its row links to the registry record, its name comes from the registry, and its only action is "Remove institution". A typed entry carries one name box per submission language ("Type the institution name in {language}" — boxes a screen reader announces wrongly ⚠ [A10](#a10)), a completeness status ("{count} of {total} languages completed" while incomplete, "All translations available" once every language is filled — a total that may follow the publication's own language set rather than the journal's ⚠ [A17](#a17)), and both "Edit institution name" and "Remove institution" — the two actions sit behind the row's expander button, named "Click to edit or delete"; a save without the submission language's name is refused with "Please provide affiliation name in the submission primary locale." — misprinted in the form foot's error summary as "Go to Affiliations: [object Object]" ⚠ [A7](#a7). Removing asks "Are you sure?" — "The affiliation {name} will be deleted." (Yes/No). When a registry search fails, an "ROR API Error" dialog explains why (rate-limited, unavailable or deprecated — three distinct messages, each dismissed with "OK"), and the text just searched is left pre-picked as a typed entry. Registry suggestions do not come back after the dialog: they stay off until the Edit panel is closed and reopened, whatever the dialog's own advice says ⚠ [A11](#a11); hand-typed entry keeps working throughout. <sup>d</sup> |
| **Contributor Roles** | Yes | One checkbox per role the journal defines (Rule 11); at least one must be ticked — a save with none is stopped as a missing required field (the section's refusal above). When the journal has exactly one role the field disappears — and, as built, every contributor save from the form then fails, leaving role-less contributors behind ⚠ [A14](#a14). <sup>c</sup> |
| **CRediT roles and the degrees of contribution** | No | Guidance: "Select the CRediT roles of the contributor and the degrees of contribution." — the standard CRediT taxonomy list with a degree per picked role; shown to readers on the landing page (Rule 14). |
| **Publication Lists** | No | One checkbox, ticked by default: "Include this contributor when identifying authors in lists of publications." (Rule 8 — and its as-built limits, ⚠ [A3](#a3)). |

**The "Add Role" / "Edit Role" panel** (the Contributor Roles settings
screen, Rule 12): <sup>e</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Role Identifier** | Yes | Drop-down of the built-in identifier codes (AUTHOR, EDITOR, CHAIR, REVIEWER, REVIEW_ASSISTANT, STATS_REVIEWER, REVIEWER_EXTERNAL, READER, TRANSLATOR, OTHER) — what the role means to the system, e.g. for exports. Fixed after creation: on "Edit Role" the drop-down offers only the role's own identifier. |
| **Role Name** | Yes (enforced for the primary language only) | Text, one box per journal language ("Fill name in all of the languages.") — the words shown on contributor rows, forms and reader pages. Despite the guidance, a save with another language's box left empty is accepted without a word ⚠ [A13](#a13). |

## Rules & state

1. **One list per publication version.** Each version carries its own
   copy of the contributors list. Creating a new version copies every
   contributor — order, roles, affiliations and the primary-contact
   choice included — onto the new version, where it can then be edited
   independently (creating versions is *Publish, schedule & versions*'s,
   no spec yet). <sup>g</sup>
2. **Where it lives.** The workflow screen's Publication area — titled
   "Preprint" on a preprint server — carries a **"Contributors"** entry,
   second in the list right after "Title & Abstract", for every role and
   with no setting that removes it. It opens the contributors list:
   heading "Contributors", with **"Order"**, **"Preview"** and
   **"Add Contributor"** above the rows. <sup>a</sup>
3. **The row.** Each contributor's row shows their full name and one
   badge per contributor role ("Author", "Translator", …); the primary
   contact's row adds a **"Primary Contact"** badge where other rows
   offer **"Set Primary Contact"**, and each row ends with **"Edit"**
   and **"Delete"**. An Anonymous contributor's row is titled with the
   literal word **"Anonymous"** — and that word serves as the name in
   every slot the list feeds: the Delete confirmation's "{name}", the
   three Preview formats (Rule 7) and the reader pages' credits and
   author lines (Rules 14–15), where nothing distinguishes the entry
   from a person actually named Anonymous. The row never shows the contributor's affiliations,
   although the list reserves a line under the name for exactly that
   ⚠ [A1](#a1). <sup>a</sup>
4. **Add and edit.** "Add Contributor" opens the side panel of Fields &
   validation; "Edit" opens the same panel prefilled. Saving closes the
   panel, updates the row in place, and refreshes the preview formats
   (Rule 7). <sup>c</sup>
5. **Delete.** "Delete" opens a confirmation titled "Delete Contributor":
   "Are you sure you want to remove {name} as a contributor? This action
   can not be undone." — "Delete Contributor" removes the contributor
   with their affiliations permanently; "Cancel" leaves everything
   untouched. The last contributor deletes the same way, with no extra
   warning: the emptied list shows "No items found." beneath the
   unchanged "Order", "Preview" and "Add Contributor" buttons, and
   Preview's three formats simply show nothing. Deleting the primary
   contact leaves the publication with no primary contact at all,
   without any warning or replacement ⚠ [A2](#a2). <sup>f</sup>
6. **Ordering.** "Order" puts the list in ordering mode: "Preview" and
   "Add Contributor" give way to a **"Cancel"** button, "Order" itself
   relabels **"Save Order"**, and each row shows up/down arrows (named
   "Increase position of {name}" / "Decrease position of {name}" for
   assistive technology). "Save Order" persists the sequence everywhere
   the list appears; "Cancel" restores the order from before. Until
   "Save Order" has been used once, a newly added contributor ties the
   auto-created submitting author for first position: the panel, the
   three Preview formats and the reader pages each resolve the tie on
   their own and can disagree, varying between loads ⚠ [A15](#a15).
   Once an order has been saved, every list and author string follows
   it, and later additions join at the end. <sup>f</sup>
7. **Preview — the three display formats.** "Preview" opens "List of
   Contributors" ("Contributors to this publication will be identified
   in the following formats."), a two-column table (Format / Display)
   of the strings the rest of the system uses:
   - **"Abbreviated"** — a short author line built from the first
     contributor alone: their family name — or their given name when
     they have no family name; an organization's Organization Name;
     the word "Anonymous" for an Anonymous contributor — plus "et al."
     when there are several, so the string is never empty while any
     contributor exists (which contributor is "first" is unstable
     until an order has been saved, [A15](#a15));
   - **"Publication Lists"** — the full format below, restricted to
     contributors ticked for publication lists (Rule 8);
   - **"Full"** — every contributor's name followed by their own roles
     in parentheses, the entries joined by semicolons — e.g. "Daniel
     Barnes (Author); Carlo Corino (Author); Alan Mwandenga
     (Translator)"; contributors sharing a role are never grouped under
     one parenthesis. <sup>a</sup>
8. **The publication-lists tick.** Unticking "Publication Lists" on a
   contributor is meant to keep them out of the author lines on listing
   pages while the landing page still credits them. As built, the tick
   governs the Preview's "Publication Lists" format everywhere, but of
   the reader-facing listings only a press's catalog lists honor it — a
   journal's and a preprint server's listings show the unticked
   contributor anyway ⚠ [A3](#a3). "Abbreviated" ignores the tick
   either way: it is built from the first contributor of the full list,
   even one unticked from publication lists — so the two formats can
   disagree about who leads the author line. <sup>a</sup> <sup>h</sup>
9. **Read-only presentation.** For a viewer who may not edit the
   publication (Actors & permissions — on a journal or press the
   submission's own Author is such a viewer), the same list shows only
   the rows — names and role badges — and the "Preview" button; "Order",
   "Add Contributor" and every row action are absent. The "Primary
   Contact" badge disappears with them, so a read-only viewer cannot
   tell which contributor is the primary contact ⚠ [A6](#a6).
   <sup>b</sup>
10. **The primary contact.** Exactly one contributor at a time can be
    the version's primary contact — the address editorial
    correspondence about the work is directed to. "Set Primary Contact"
    moves the badge immediately, with no confirmation. The submitting
    author's own contributor record arrives as the primary contact
    (created on submission — see *[Submission wizard](U21-submission-wizard.md)*).
    Readers never see the choice: no reader page marks any author as a
    contact. A publication can be left with no primary contact
    ([A2](#a2)). <sup>b</sup> <sup>g</sup>
11. **Contributor roles are journal records.** The roles offered on the
    contributor form are the journal's own list, maintained on the
    "Contributor Roles" settings screen (Rule 12). A new journal or
    preprint server starts with two: "Author" (identifier AUTHOR) and
    "Translator" (identifier TRANSLATOR); a new press starts with four —
    those two plus "Chapter Author" (also identifier AUTHOR) and
    "Volume editor" (identifier EDITOR). The submitting author's
    auto-created contributor gets the journal's first AUTHOR-identifier
    role. <sup>e</sup>
12. **The Contributor Roles screen.** Settings → Workflow → Submission →
    **"Contributor Roles"**: a table of **"Role Name"** and **"Role
    Identifier"** with **"Add Role"** above it and "Edit" / "Delete
    Role" behind each row's "…" menu. Add and edit use the panel of
    Fields & validation; a successful save reports "Contributor role
    saved". <sup>e</sup>
13. **Deleting a role.** "Delete Role" opens a type-to-confirm dialog —
    'Are you absolutely sure you want to delete "{identifier}" role?' —
    whose warning lists the two preconditions (at least one AUTHOR role
    must remain; no contributor may still hold the role) and whose
    confirm button stays disabled until the identifier is typed back
    exactly. A role any contributor of any submission still holds is
    refused: "One or more contributors are using this role. Change the
    role to another before delete." The journal's last AUTHOR-identifier
    role can never be deleted ("Last AUTHOR role cannot be deleted.").
    Either refusal appears as a modal "Error" dialog dismissed with
    "OK"; when both would apply, the in-use refusal is the one shown.
    The type-to-confirm dialog's confirm button is mislabeled with a
    whole warning sentence — "Are you sure you wish to delete this
    item? This action cannot be undone." — where a short "Delete" label
    belongs ⚠ [A12](#a12). A deleted role's confirmation reads "Role
    Deleted" — '"{identifier}" has been successfully deleted.'
    <sup>e</sup>
14. **What readers see on the landing page.** A published item's landing
    page — the article page; the catalog's book page on a press; the
    preprint's page on a preprint server — credits every contributor in
    list order: name, affiliation names (a registry-backed affiliation's
    ROR mark links to its registry record — a link assistive technology
    cannot name ⚠ [A9](#a9)), contributor role names,
    ORCID iD (verified or unauthenticated icon — see
    *[ORCID integration](U04-orcid-integration.md)*), and any CRediT
    roles. Contributors with a Bio Statement additionally get an
    **"Author Biographies"** ("Author Biography" for one) section:
    "{name}, {affiliations}" above each statement — just the name, no
    comma, for a contributor without an affiliation. On a press, a book
    with five or more contributors compacts the credits to a single
    flowed line of names joined by semicolons, without affiliations,
    ROR marks, ORCID icons or role names [OMP1](#omp1); an Edited
    Volume's book page credits its volume editors — each name suffixed
    "(ed)", with the role name — in place of the contributor list
    [OMP2](#omp2). <sup>h</sup>
15. **What readers see in listings.** Issue tables of contents, search
    results, the archive and other listing pages show each item's
    author line in the "Full" format of Rule 7 — names with roles in
    parentheses. Whether a listing omits unticked contributors is
    Rule 8's as-built exception ([A3](#a3)); whether a section hides
    author lines entirely is the section configuration's rule, not this
    feature's. <sup>h</sup>
16. **Affiliation identities and the registry cache.** An affiliation is
    either registry-backed — identified by its ROR record, name shown
    from the registry in every registry language — or typed by hand with
    per-language names (Fields & validation). Registry search runs from
    the user's own browser against the public registry; the first time
    an institution is picked anywhere in the journal, the install also
    stores its registry record through the journal's server, and a
    monthly self-update keeps all stored records current with the public
    registry data set (also run once at install). When the journal's
    server cannot reach the registry for that first pick, the stored
    record never arrives: the pick itself still lands normally, the
    "Add" press raises an error dialog, and the entry is added anyway —
    the affiliation saves, and publishes, with no name at all
    ⚠ [A5](#a5). <sup>d</sup> <sup>k</sup>
17. **Reviewers and anonymity.** Where the review type keeps the
    authors' identity from the reviewer, the contributor list is
    withheld from the data sent to the reviewer's browser — a safeguard
    visible only by inspecting that data; what a reviewer's screens
    show of authorship is the review features' territory
    (*[Review stage & rounds](U26-review-stage-and-rounds.md)*).
    <sup>l</sup>

## Side effects

- Adding, editing, deleting or reordering contributors sends no email,
  raises no notification, and writes no activity-log entry — the list
  simply changes. Changing the primary contact is the one exception: it
  writes a single activity-log entry, "Submission metadata updated"
  (Activity Log & Notes → History), because the choice is saved on the
  publication itself — it too sends no email and raises no
  notification. <sup>f</sup>
- The one email in the flow: requesting a contributor's ORCID
  verification from the form sends that contributor the verification
  email — owned by *[ORCID integration](U04-orcid-integration.md)*.
- Picking a registry-backed affiliation can store a local copy of the
  institution's registry record (names in all registry languages);
  invisible to users (Rule 16).
- Contributor data travels outward with the publication's metadata: DOI
  registration, metadata export and citation displays carry the names,
  roles, affiliations and ORCID iDs — those surfaces belong to their own
  features.
- Changing the submission language copies contributor names (and typed
  affiliation names) into the new language — the change-language flow
  is *[Publication metadata](U40-publication-metadata.md)*'s.

## Settings that modify behavior

- **Competing interests** — workflow settings' Metadata screen, section
  "Competing Interests", checkbox "Require submitting Authors to file a
  Competing Interest (CI) statement with their submission.": when on,
  the contributor form gains the required "Competing Interests" field
  (Fields & validation) on every add and edit. Turning the setting off
  removes the field but keeps any saved statements — they reappear
  intact when it is turned back on. <sup>j</sup>
- **The journal's contributor roles** (Rules 11–13) shape the form's
  Contributor Roles choices — the one-role journal shows no choice at
  all, and cannot save a contributor from the form (⚠ [A14](#a14)).
- **ORCID enablement** decides whether the form carries the ORCID iD
  field — *[ORCID integration](U04-orcid-integration.md)*'s setting.
- Nothing gates the rest: the Contributors entry, the affiliations
  field and the registry lookup are always on, with no journal or site
  setting to disable them. <sup>a</sup>

## Cross-feature interactions

- *[Publication metadata](U40-publication-metadata.md)* — owns the
  "may edit the publication" gate ([→ edit gate](U40-publication-metadata.md#edit-gate))
  and the published-state banners this feature's editing rides on; owns
  the Publication area's shared page furniture around each publication
  page (header, status line, banners) and the change-language flow
  whose name-copying is noted in Side effects.
- *[Submission wizard](U21-submission-wizard.md)* — owns the wizard
  shell: the Contributors step's place, its Review-step presentation
  and submit gates, and the auto-creation of the submitting author's
  contributor record; this spec owns the panel the step mounts — the
  same list, form and rules as the workflow (always editable there).
- *[ORCID integration](U04-orcid-integration.md)* — owns the
  contributor form's ORCID iD field states, the verification request
  and iD removal, and the publish-time checks on contributor iDs.
- *Workflow screen & stage access* (no spec yet) — owns which roles
  reach the workflow screen and its Publication area; this spec's
  Actors rows start from that access.
- *[Funding](U43-funding.md)* — its Funder field reuses this feature's
  registry lookup (<a id="ror-lookup"></a>the search-as-you-type against
  the public ROR registry, the suggestion rows and the install's record
  cache — Rule 16).
- *Institutions* (no spec yet) — the manager-maintained institution
  list for subscriptions and statistics is a separate record set; only
  the registry lookup above is shared.
- *Article landing page & reading* (no spec yet; the press counterpart
  is the OMP catalog's book page) — owns the landing screen; the
  contributor block on it is described here (Rule 14) as this feature's
  reader surface. A press's chapter-level author lists belong to the
  catalog features.
- **User profiles and the masthead** use a separate, plain-text
  affiliation field — not this feature's institution records; the two
  meet only when a new submission copies the submitting author's
  profile affiliation into their contributor record (matching it
  against stored registry records by exact name). <sup>d</sup>

## Canonical scenarios

Common to all three apps (OMP/OPS vocabulary per the
[application glossary](GLOSSARY.md)):

1. **Maintain the contributor list** — Journal Manager: open a
   submission's workflow, Publication area, "Contributors". The
   submitting author is already listed with an "Author" badge and the
   "Primary Contact" badge. Press "Add Contributor": the panel opens on
   "Contributor Type" = "Person"; fill Given Name, Email and
   Country, tick the "Author" role, Save — the panel closes and the new
   row shows the name with an "Author" badge. Add a second contributor
   as "Organization or group": the name fields swap to "Organization
   Name"; fill it, Email and Country, tick "Author", Save.
   Open the person's "Edit", add a Family Name, Save — the row updates.
   Press "Delete" on the organization: the dialog "Delete Contributor"
   asks "Are you sure you want to remove {name} as a contributor? This
   action can not be undone." — Cancel keeps the row; Delete again and
   confirm removes it. <sup>s1</sup>
2. **Reorder and preview the display formats** — Journal Manager, on a
   submission with two Person contributors with distinct family names
   (scenario 1 leaves exactly that: its organization was deleted) whose
   order has been pinned once with "Order" → "Save Order" (until then a
   newly added contributor ties the first row for position and the list
   can come back in either order, [A15](#a15)): press
   "Preview" — "List of Contributors" shows "Abbreviated" as the first
   contributor's family name plus "et al.", and "Full" as both names
   each followed by "(Author)" and separated by a semicolon. Close,
   press "Order": up/down arrows replace the row buttons; move the
   second contributor up and press "Save Order" — reload the page: the
   order holds, and "Abbreviated" in Preview now names the other family
   name. Press "Order" again, move a row, press "Cancel" — the saved
   order is back. <sup>s2</sup>
3. **Move the primary contact** — Journal Manager, on a submission with
   two contributors: the submitting author's row carries "Primary
   Contact" while the other row offers "Set Primary Contact". Press
   "Set Primary Contact" on the other row — the badge moves at once,
   with no confirmation. Delete that new primary contact: the remaining
   row still shows only "Set Primary Contact" — the submission now has
   no primary contact at all, and nothing warned about it. Press
   "Schedule For Publication" — the button in the Publication area's
   header above the pages, beside "Status: Unscheduled" — and continue
   past "Review Publishing Details" (its "Confirm" button) to the final
   confirmation: "All publication requirements have been met." — the
   missing contact is never mentioned (⚠ [A2](#a2)). Back out with
   "Close" — the dialog's only other button is "Publish"; there is no
   Cancel. Nothing is published, yet the header's status may no longer
   read "Unscheduled": the earlier "Confirm" already recorded the
   version choice, so a changed status label with nothing published is
   the expected outcome here, not a failure (the publish dialog's own
   mechanics belong to *Publish, schedule & versions*, no spec yet).
   <sup>s3</sup>
4. **Record affiliations, typed and registry-backed** — Journal Manager,
   editing a contributor: under "Affiliations", type a made-up
   institution name of four or more characters, pick the typed text
   itself from the suggestions, press "Add" — the institution joins the
   list with "Edit institution name" and "Remove institution" behind
   its row-expander button ("Click to edit or delete"). On a journal
   with a second submission language (enabled on Settings → Website →
   Languages — see *[Publication metadata](U40-publication-metadata.md)*'s
   language settings), "Edit institution name" opens one name box per
   language with a "{count} of {total} languages completed" status. Then type a real university's
   name and pick the suggestion that shows its country and the ROR
   mark — the entry's row links to the registry record and offers only
   "Remove institution". Known exception: on an install whose server
   cannot reach the registry, the picked suggestion still shows
   normally but pressing "Add" raises an "Error" dialog — the entry is
   added anyway and saves without a display name ([A5](#a5)). Save the
   contributor;
   reopen Edit — both institutions are there. Remove one: "Are you
   sure?" — "The affiliation {name} will be deleted."; "Yes" removes
   it. <sup>s4</sup>
5. **Manage the journal's contributor roles** — Journal Manager:
   Settings → Workflow → Submission → "Contributor Roles". The table
   lists "Author" (AUTHOR) and "Translator" (TRANSLATOR) — on a press
   also "Chapter Author" and "Volume editor" (Rule 11). Press "Add
   Role", pick identifier EDITOR, name it in every language ("Fill
   name in all of the languages."), Save — "Contributor role saved"
   and the row appears. On a submission, edit a contributor and tick
   the new role — its badge joins the row. Back on the settings screen,
   "Delete Role" on the new role now refuses after the type-to-confirm
   with a modal "Error" dialog: "One or more contributors are using
   this role. Change the role to another before delete." — "OK" returns
   to the list with the role still there. Untick the role on the
   contributor, then delete the role again: type the identifier into
   the confirm box — the confirm button, labeled with a whole warning
   sentence (⚠ [A12](#a12)), enables only on an exact match — and the
   dialog "Role Deleted" confirms. Now try "Delete Role" on "Author":
   while the submission's contributor still holds the "Author" role,
   the same in-use "Error" dialog refuses again (with both refusals
   applicable, the in-use one is shown — Rule 13). Move the contributor
   off the role (tick "Translator", untick "Author", Save — on a press
   also delete "Chapter Author" the same way, so "Author" is the last
   AUTHOR-identifier role; "Chapter Author" shares the identifier
   AUTHOR, so its dialog also asks for "AUTHOR" — the role deleted is
   the one whose row's "…" menu was opened) and try once more: the
   "Error" dialog now reads "Last AUTHOR role cannot be deleted." <sup>s5</sup>
6. **Readers see the contributors** — Reader: on a published item with
   two contributors — one with a typed affiliation, a Bio Statement and
   two roles, listed first, the order pinned with "Save Order" before
   publishing ([A15](#a15)) — open the landing page. The authors block
   credits both in list order: names, the affiliation name, and each
   contributor's role names; an "Author Biography" section — headed in
   the singular, since only one contributor has a Bio Statement
   (Rule 14) — shows "{name}, {affiliation}" above the statement. A listing page naming
   the item (an issue's table of contents; a press's catalog list; the
   preprint server's archive) shows the author line as names with roles
   in parentheses. On a press, a book with five or more contributors
   compacts the credits to a single flowed line of names joined by
   semicolons — no affiliations, ROR marks, ORCID icons or role names
   ([OMP1](#omp1)); where one of the five has an affiliation, its only
   trace is a dangling comma after the name (⚠ [A1](#a1)).
   <sup>s6</sup>
7. **Keep a contributor out of publication lists** — Journal Manager,
   then Reader: edit the second of two contributors and untick "Include
   this contributor when identifying authors in lists of publications.";
   Save. "Preview" now omits them from the "Publication Lists" row
   while "Full" keeps them. On the published item: the landing page
   still credits both; a press's catalog list drops the unticked
   contributor, while a journal's and a preprint server's listings
   still show them (⚠ [A3](#a3)). <sup>s7</sup>
8. **Require competing interests** — Journal Manager: on the workflow
   settings' Metadata screen, tick "Require submitting Authors to file
   a Competing Interest (CI) statement with their submission." and
   save. Editing any contributor now shows a required "Competing
   Interests" field; saving it empty is refused on the form — "This
   field is required." in red under the field, "Please correct one
   error." at the foot; filling it saves. Untick the setting: the field
   is gone from the form. <sup>s8</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-08-28), unreviewed
unless an entry notes otherwise; the team settles them on spec review.
Sorted 🐞 → ❓ → ✅. Each entry opens with the user-observable symptom;
mechanism and evidence live in the entry's footnote.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A1](#a1) | Contributor rows never show affiliations, though the list reserves a line for them | 🐞 | user-visible | — |
| [A3](#a3) | The publication-lists tick is honored only by a press's catalog listings — journal and preprint-server listings ignore it | 🐞 | user-visible | — |
| [A5](#a5) | A registry pick the server cannot cache raises an error dialog, then saves — and publishes — nameless | 🐞 | user-visible | — |
| [A14](#a14) | On a one-role journal no contributor can be saved from the form — every attempt errors, yet creates a role-less contributor | 🐞 | user-visible | — |
| [A15](#a15) | A newly added contributor can land at the top of the list — and of the reader-facing author line — varying between loads | 🐞 | user-visible | — |
| [A7](#a7) | The contributor form's error summary prints "Go to Affiliations: [object Object]" | 🐞 | minor | — |
| [A9](#a9) | The landing page's affiliation ROR link has no accessible name | 🐞 | minor | — |
| [A10](#a10) | The typed affiliation's per-language name boxes are announced wrongly by a screen reader | 🐞 | minor | — |
| [A12](#a12) | The delete-role confirm button is labeled with a whole warning sentence instead of "Delete" | 🐞 | minor | — |
| [OPS2](#ops2) | The contributor form's Competing Interests label renders raw markup on a preprint server | 🐞 | minor | — |
| [A2](#a2) | Deleting the primary contact silently leaves the publication with none | ❓ | user-visible | — |
| [A16](#a16) | The auto-created contributor can arrive without a Country — every later edit is then refused until one is supplied | ❓ | user-visible | — |
| [A4](#a4) | The organization contributor's "ROR ID" box accepts any text without a shape check | ❓ | minor | — |
| [A6](#a6) | The read-only list hides the "Primary Contact" badge — viewers without edit rights cannot see who it is | ❓ | minor | — |
| [A8](#a8) | Institution text typed but never picked is silently dropped on save | ❓ | minor | — |
| [A11](#a11) | After a registry-error dialog the institution search stays dead until the Edit panel is reopened | ❓ | minor | — |
| [A13](#a13) | A contributor role's name saves with a language left empty, despite the required marker | ❓ | minor | — |
| [A17](#a17) | The typed affiliation's "{count} of {total} languages" total may follow the publication's languages, not the journal's | ❓ | minor | — |
| [A18](#a18) | An Anonymous contributor's Email and Country are marked "* Required" but save empty | ❓ | minor | — |
| [OMP1](#omp1) | A book with five or more contributors compacts to bare name-and-affiliation lines | ✅ | user-visible | — |
| [OMP2](#omp2) | An Edited Volume's book page credits volume editors instead of the contributor list | ✅ | user-visible | — |
| [OPS1](#ops1) | The submitting author edits their own unposted preprint's contributors | ✅ | user-visible | — |

### All apps

<a id="a1"></a>
**A1 — Contributor rows never show affiliations** · 🐞 · user-visible.
The workflow's contributor rows (and the wizard's Review list) are built
to show each contributor's affiliation under the name, but the line is
always empty — even for a contributor whose Edit panel holds a saved
affiliation, such as one carried over from the submitter's profile: an
editor scanning the list cannot see any contributor's institution
without opening each Edit panel. The display reads from a field the
contributor data no longer carries. The same dead read reaches a
press's readers: on a book page compacted for five or more contributors
([OMP1](#omp1)), a contributor with an affiliation renders as
"{name}, ;" — the comma that should introduce the affiliation prints
with nothing after it.
Basis: code reading + probe. <sup>f-a1</sup>

<a id="a2"></a>
**A2 — Deleting the primary contact leaves none** · ❓ · user-visible.
Deleting the contributor who is the primary contact removes the badge
from the list entirely: no other contributor inherits it, and no warning
or prompt appears — the publication simply has no primary contact until
someone notices and sets one. The publish flow does not catch it
either: "Review Publishing Details" and the final "Schedule For
Publication" check ("All publication requirements have been met.") pass
with no mention of the missing contact.
Question: should deletion be blocked, warn, or hand the badge to another
contributor? Lean: at least a warning — the deletion is offered without
any hint that the contact point is being lost.
Basis: code reading + probe. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — The publication-lists tick works only on a press** · 🐞 ·
user-visible.
Unticking "Include this contributor when identifying authors in lists of
publications." promises to keep the contributor out of listing pages,
and the Preview's "Publication Lists" row honors it — but on a journal
and a preprint server every reader-facing listing (issue tables of
contents, search results, the archive) shows the contributor anyway.
Only a press's catalog lists apply the tick. The checkbox thus does
nothing reader-visible on two of the three applications.
Basis: code reading + probe. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — The organization "ROR ID" box takes anything** · ❓ · minor.
An organization contributor's form offers a free-text "ROR ID" box that
accepts any string without checking the registry-identifier shape —
unlike the Affiliations field, whose registry entries are always picked
from the registry. A wrong value saves silently and then shows nowhere
but this same box — not on the contributor's row, not on the published
page — while still traveling into metadata exports. The value even
survives a change of contributor type: a contributor saved as a Person
after a type switch silently keeps a ROR ID typed while "Organization
or group" was selected, though the save discards the Organization Name
as the guidance warns — so a Person's stored record can carry an
organization-only ROR ID, with the same export risk.
Question: should the box validate the identifier shape (or be a registry
pick)? Lean: validate — the sibling affiliation machinery already
enforces the shape.
Basis: code reading + probe. <sup>f-a4</sup>

<a id="a5"></a>
**A5 — A registry pick the server cannot cache errors, then saves — and publishes — nameless** · 🐞 · user-visible.
When the journal's server cannot reach the registry (the user's own
browser search still works), the picked suggestion still becomes the
selected entry with its registry link and ROR mark; pressing "Add" then
raises a generic "Error" dialog — "An unexpected error has occurred.
Please reload the page and try again." — yet the entry is added anyway
and saves with no name. Reopening the form shows the entry flagged in red "The primary
language English is required", which misleads twice: the missing name
never blocks any later save, and a registry-backed row offers no name
box — only "Remove institution". On the published page the reader sees
a bare, unlabeled ROR-logo link where the institution name should be.
Same failure family as the Funding list's registry picks
(*[Funding](U43-funding.md)*).
Basis: probe. <sup>f-a5</sup>

<a id="a6"></a>
**A6 — Read-only viewers cannot see who the primary contact is** · ❓ · minor.
For a viewer without edit rights, the contributor rows show names and
role badges only: the "Primary Contact" badge disappears along with the
editing controls, so an assigned participant who may not edit the
metadata has no way to see which contributor editorial correspondence
goes to.
Question: should the badge — information, not an action — stay in the
read-only view? Lean: yes — it states a fact about the publication, and
hiding it reads as a side effect of stripping the action buttons rather
than a choice.
Basis: probe. <sup>f-a6</sup>

<a id="a7"></a>
**A7 — The form's error summary prints "[object Object]" for affiliation errors** · 🐞 · minor.
When an affiliation fails validation on the contributor form, the error
summary at the form's foot reads "Go to Affiliations: [object Object]"
where sibling fields print their message (compare "Go to Country: This
field is required."). The inline message under the field itself is
correct; only the summary line is garbled.
Basis: probe. <sup>f-a7</sup>

<a id="a8"></a>
**A8 — Institution text typed but never picked is dropped without a word** · ❓ · minor.
Typing an institution into the Affiliations search box and saving the
form without picking a suggestion saves the contributor with no
affiliation: the typed text vanishes with no message. A user who missed
that "Add" only appears after a pick can believe they recorded an
affiliation they did not.
Question: should the save warn about (or keep) text left in the search
box? Lean: warn — the pick-then-Add flow is easy to miss.
Basis: probe. <sup>f-a8</sup>

<a id="a9"></a>
**A9 — The landing page's affiliation ROR link has no accessible name** · 🐞 · minor.
On a journal's article page and a preprint server's preprint page, a
registry-backed affiliation's ROR mark is an icon-only link with no
text and no accessible name: a screen-reader user hears an unnamed link
and cannot tell it leads to the institution's registry record.
Basis: probe. <sup>f-a9</sup>

<a id="a10"></a>
**A10 — The typed affiliation's name boxes are announced wrongly** · 🐞 · minor.
In the Affiliations field's typed-entry editor, a screen reader reads
the primary language's box out with both languages' labels run together,
and the second language's box has no label at all — the same defect the
Funding list's typed-name boxes carry
(*[Funding](U43-funding.md#a5)*).
Basis: probe. <sup>f-a10</sup>

<a id="a11"></a>
**A11 — A registry error kills the institution search for the rest of the panel** · ❓ · minor.
After any "ROR API Error" dialog, dismissing it does not bring the
search back: new queries fire no registry lookup and offer only the
typed text itself, until the Edit panel is closed and reopened. The
rate-limited dialog's own advice — "Please wait a moment before
continuing to search." — cannot work in place; only the unavailable
dialog's page-refresh advice does. The text just searched is left
pre-picked as a typed entry, so hand-typed entry keeps working.
Question: should dismissing the dialog (or a short wait) re-enable the
registry search, as the dialogs' wording implies? Lean: yes — two of
the three messages advise retrying, and no retry is possible without
reopening the panel.
Basis: probe. <sup>f-a11</sup>

<a id="a12"></a>
**A12 — The delete-role confirm button is labeled with a whole sentence** · 🐞 · minor.
In the type-to-confirm delete-role dialog (Rule 13), the confirm
button's label is the message "Are you sure you wish to delete this
item? This action cannot be undone." — a warning sentence where a short
"Delete" belongs; no concise confirm label exists in the dialog.
Basis: probe. <sup>f-a12</sup>

<a id="a13"></a>
**A13 — A role name saves with a language left empty** · ❓ · minor.
"Add Role" marks Role Name required in every journal language and its
guidance says "Fill name in all of the languages." — yet a save with a
non-primary language's box empty succeeds, reports "Contributor role
saved", and simply leaves that language's name blank.
Question: should the all-languages requirement be enforced, or the
marker and guidance softened to the primary language? Lean: enforce —
the form promises it twice.
Basis: probe. <sup>f-a13</sup>

<a id="a14"></a>
**A14 — On a one-role journal no contributor can be saved** · 🐞 · user-visible.
When a journal has exactly one contributor role, the form hides the
Contributor Roles field as designed — but saving any contributor from
it then fails with the generic "An unexpected error has occurred.
Please reload the page and try again." toast, every time: the screen
cannot create a contributor at all on such a journal. Worse, each
failed attempt still creates the contributor behind the scenes with no
role — after a reload the list shows the new row with no role badge —
and the intended automatic assignment of the one role never happens.
Basis: probe. <sup>f-a14</sup>

<a id="a15"></a>
**A15 — A new contributor can land at the top of the list, varying between loads** · 🐞 · user-visible.
On a list whose rows were never explicitly reordered, a newly added
contributor receives the same list position as the auto-created
submitting author instead of joining at the end. The panel, the three
Preview formats and the reader pages each resolve the tie on their own,
so they can disagree — the workflow list showing one order while the
landing page and table of contents show the other — and the order can
change between loads. Ordering mode opens in whatever order last
rendered; "Save Order" stamps explicit positions and ends the
instability, after which every ordering claim in this spec holds.
Basis: probe + code reading. <sup>f-a15</sup>

<a id="a16"></a>
**A16 — The auto-created contributor can lack a Country, then every edit demands one** · ❓ · user-visible.
The submitting author's auto-created contributor copies the country
from their user profile — but an account created by an administrator
("Add User") never asks for a country, so the contributor can arrive
without one. Country being required on the contributor form, any later
edit of that contributor — ticking a role, adding an affiliation — is
refused until the editor supplies a Country the author never entered.
Question: should the form accept an edit that leaves an
already-missing Country empty, or should the administrator's account
form require a country as self-registration does? Lean: real friction,
bug-leaning — the form's assumption is broken only by the
administrator-created account path.
Basis: probe + code reading. <sup>f-a16</sup>

<a id="a17"></a>
**A17 — The affiliation completeness total may follow the publication's languages** · ❓ · minor.
On one journal, a fresh typed affiliation reported "All translations
available" on one submission but "1 of 2 languages completed" on
another — suggesting the typed entry's per-language name boxes and
their "{count} of {total} languages completed" total follow the
publication's own language set rather than the journal's.
Question: does the box count follow the publication's languages or the
journal's? Lean: the publication's — the two submissions differed in
nothing else observed; settling it needs two publications on one
journal with differing language sets, comparing each typed entry's box
count and total.
Basis: probe (single observation). <sup>f-a17</sup>

<a id="a18"></a>
**A18 — Anonymous's required markers on Email and Country do not bind** · ❓ · minor.
With "Anonymous" picked as the contributor type, the form marks Email,
Country and Contributor Roles "* Required" — but a save with only a
contributor role ticked is accepted without a word, and the stored
contributor has no email or country. Only Contributor Roles is
enforced: an all-empty save is refused for that field alone, with
Email and Country never flagged.
Question: should Email and Country be enforced for an Anonymous
contributor, or their required markers dropped? Lean: drop the
markers — an entry with no identity of its own plausibly has no
contact details, and nothing downstream is observed to need them.
Basis: probe. <sup>f-a18</sup>

### OMP

<a id="omp1"></a>
**OMP1 — Five or more contributors compact the book page's credits** · ✅ · user-visible.
On a press, a catalog book page with five or more contributors switches
from the full per-contributor blocks to a single flowed line of names
joined by semicolons — no ROR marks, no ORCID icons, no role names, no
CRediT roles. A deliberate layout for long author lists — though as
built the line is names-only: where a contributor has an affiliation,
it renders as a dangling comma with nothing after it (⚠ [A1](#a1)).
Basis: code reading + probe. <sup>f-omp1</sup>

<a id="omp2"></a>
**OMP2 — An Edited Volume credits volume editors** · ✅ · user-visible.
On a press, an Edited Volume's book page shows the volume's editors —
each name suffixed "(ed)", with the role name — where a monograph shows
its contributor list; the catalog's listing line keeps the full
contributor list, and chapter pages carry their own author lines. The
contributors list remains the source the catalog draws from; the swap
is the catalog's presentation choice.
Basis: code reading + probe. <sup>f-omp2</sup>

### OPS

<a id="ops1"></a>
**OPS1 — The submitting author edits their own preprint's contributors** · ✅ · user-visible.
On a preprint server the author's workflow Contributors list is fully
editable on their not-yet-posted preprint, while on a journal or press
the author's workflow list is read-only. Matches the preprint model —
authors prepare their own preprint for posting; the same divergence
holds for the neighboring Funding list.
Basis: probe. <sup>f-ops1</sup>

<a id="ops2"></a>
**OPS2 — The Competing Interests label renders raw markup** · 🐞 · minor.
On a preprint server the contributor form's Competing Interests field
is labeled with raw code-like text — visible link markup around "CI
Policy" plus an unresolved placeholder token — instead of the plain
"Competing Interests" label the other applications show. The guidance
sentence, the required behavior and saving all work as specified.
Basis: probe + code reading. <sup>f-ops2</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — the panel and its mount.** UI: `ContributorsListPanel.vue`
(ui-library `src/components/ListPanel/contributors/`), wrapped by
`ContributorManager.vue` (`src/managers/ContributorManager/`), mounted
by the workflow page's publication config (`contributors` block in
`workflowConfigEditorialOJS.js` AND `workflowConfigAuthorOJS.js` — both
pass `canEdit: permissions.canEditPublication`); OMP and OPS inherit the
block whole via the config deep-merge (`useWorkflowConfigOMP.js` /
`useWorkflowConfigOPS.js` — no app override touches `contributors`), and
all three apps pin the identical ui-library commit (`246623e9`, checked
2026-08-28) — positive shared-code evidence for every client-side claim.
The "Contributors" nav entry is pushed unconditionally by all six
navigation builders (`useWorkflowNavigationConfig{OJS,OMP,OPS}.js`,
editorial + author), right after `titleAbstract`, label
`publication.contributors` ("Contributors"). Panel strings:
`common.order` ("Order"), `grid.action.saveOrdering` ("Save Order"),
`common.cancel`, `contributor.listPanel.preview` ("Preview"),
`grid.action.addContributor` ("Add Contributor"). Preview modal
(`ContributorsPreviewModal.vue`): title `submission.contributors` ("List
of Contributors"), description `contributor.listPanel.preview.description`,
rows `…preview.abbreviated`/`…publicationLists`/`…full` bound to the
publication payload's `authorsStringShort` /
`authorsStringIncludeInBrowse` / `authorsString`
(`PKP\publication\maps\Schema::mapByProperties()`), computed by
`PKPPublication::getShortAuthorString()` (a Person's `familyName ?:
givenName`; an Organization's or Anonymous contributor's full name —
the organization name / the localized "Anonymous"; wrapped in
`submission.shortAuthor` "{$author} et al." when several) and
`getAuthorString()` ("{fullName} ({roles})"
joined by `common.semicolonListSeparator`). The fallback chain
live-probed 2026-08-28 (OJS; shared pkp-lib code, cross-app by path):
with the first contributor an organization, "Abbreviated" read "Probe
Org u41h2 et al."; a person with a given name only, "Solo et al."; an
Anonymous contributor, "Anonymous et al." Anonymous rendering, same
probe: the saved record answers `fullName: "Anonymous"`; the row read
"Anonymous" + role badge, the Delete dialog "Are you sure you want to
remove Anonymous as a contributor?", and Preview's "Publication Lists"
and "Full" rows "Alex Author (Author); Anonymous (Author)". Preview re-fetches the
publication on open, so the strings are server-fresh. Chrome, nav
position ("Contributors" second, area titled "Preprint" on OPS), the
buttons and the three preview formats live-confirmed 2026-08-28 on all
three apps — "et al." already appears at two contributors.
`getShortAuthorString()` applies no publication-lists filter:
live-probed 2026-08-28 (OJS), "Abbreviated" named a first-listed
contributor who was unticked from publication lists while the
"Publication Lists" row omitted them.

<a id="fn-b"></a>
**b — the edit gate, read-only rendering, API roles.** `canEditPublication`
comes from the same permission as the sibling publication features
([→ edit gate](U40-publication-metadata.md#edit-gate) — 
`canEditPublication` via `PublicationCanBeEditedPolicy` /
`Repo::submission()->canEditPublication()`). In the panel, `canEditPublication:false`
HIDES "Order" (`v-if`), "Add Contributor" (`v-if`) and the whole
`#item-actions` slot (Set Primary Contact, badge, Edit, Delete); nothing
is rendered disabled — contrast `FunderManager`, whose buttons gray out.
"Preview" is not gated. API cluster (owned by *Workflow screen & stage
access*'s controller): GET contributors allows Manager, Sub-editor,
Assistant, Reviewer, Author; the four writes (add/edit/delete/saveOrder)
allow Manager, Sub-editor, Assistant, Author behind
`PublicationWritePolicy`; `addContributor`/`editContributor` re-run
`canEditPublication()` inline, `deleteContributor`/`saveContributorsOrder`
rely on the policy alone (`PKPSubmissionController.php`). Primary
contact: the panel PUTs `{primaryContactId}` to the publication itself,
not a contributor endpoint (`setPrimaryContact()` →
`publicationApiUrl`). OPS's `SubmissionController` re-registers publish
ops with author-inclusive roles but touches no contributor route —
contributor endpoints already include Author in the base class (empty
chain on all three apps for author model, affiliation classes and the
contributors cluster). Live-probed 2026-08-28: an OJS and an OMP
author's workflow list renders read-only exactly as described (controls
absent, nothing grayed); an Assistant's controls flip absent→present
with the metadata-edit grant; "Preview" stays offered in every
read-only view. Published-version behavior live-probed 2026-08-28 (OJS,
published scratch version): the Contributors page rendered the
published-version warning banner *Publication metadata* documents
("Warning: This version has been published. Editing it may impact the
published content.") with the full controls, and an add and a delete
both saved with no further warning — warn-but-editable, identical to
the neighboring Title & Abstract and Metadata pages — for the Journal
Manager and (rendering checked) for an Assistant holding the
metadata-edit permission.

<a id="fn-c"></a>
**c — the contributor form.** `PKP\components\forms\publication\ContributorForm`
(byte-identical in the three pinned lib/pkp copies; OPS carries an empty
subclass, OJS/OMP none). Field order and conditions as tabled:
`contributorType` (FieldOptions radio, `ContributorType::getTypes()` —
PERSON "Person", ORGANIZATION "Organization or group", ANONYMOUS
"Anonymous"; all three radios live-confirmed 2026-08-28 on OJS, OMP and
OPS, with the Anonymous field set as tabled), `givenName` (required,
showWhen Person), `familyName`,
`preferredPublicName`, `organizationName` (required, showWhen
Organization), `email` (required), `country` (required, FieldSelect),
`rorId` (showWhen Organization, plain FieldText,
`submission.submit.contributor.rorId` "ROR ID" — no shape validation in
`author.json`, unlike `affiliation.json`'s `ror` regex — A4),
`url`, `orcid` (FieldOrcid, only when `OrcidManager::isEnabled()`),
`competingInterests` (required multilingual FieldRichTextarea, only when
context `requireAuthorCompetingInterests`), `biography`
(`author.bioStatement` "Bio Statement (e.g., department and rank)"),
`affiliations` (FieldAffiliations), `contributorRoles` (FieldOptions
checkboxes of the context's `ContributorRole` rows; collapses to a
hidden pre-set field when the context has exactly one role),
`creditRoles` (FieldCreditRoles), `includeInBrowse` (FieldOptions,
default true, `submission.submit.includeInBrowse.title` "Publication
Lists"). Server validation
(`PKP\author\Repository::validate()`): empty `contributorRoles` →
`api.submission.400.emptyContributorRoles` ("There have to be at least
one assigned contributor role."); competing interests →
`author.competingInterests.required` ("A competing interest statement
is required."). Both are API-side guards with no observed screen path:
live-probed 2026-08-28, the form's client-side required check refuses
first — no request is sent — with "This field is required." under the
field and "Please correct one error." / "Jump to next error" at the
foot (same shape for Country). A four-error empty save showed "Please
correct 4 errors." with the Save button disabled until an errored
field was edited (live-probed 2026-08-28, OJS/OMP/OPS identically). ORCID writes via these endpoints
are refused outright (`api.orcid.403.cannotUpdateAuthorOrcid`) — the
ORCID flows run through their own endpoints (U04). Type switching:
`removeIrrelevantContributorTypeData()` nulls the other type's fields
at save time — except `rorId`, which it misses: a typed ROR ID survived
a cross-type save as Person and reappeared intact on switching the
radio back (live-probed 2026-08-28, "definitely-not-a-ror-id" on an OJS
submission and "omp-garbage-ror" on an OMP one — A4's cross-type half);
client-side a typed value survives the switch untouched (live-probed
2026-08-28), so the guidance's "will not be saved" is a save-time
discard with that one gap. Author records are keyed per publication
(`author.json` requires `publicationId`).

<a id="fn-d"></a>
**d — affiliations.** Model `PKP\affiliation\*` + `author_affiliations`
tables; `affiliation.json`: `ror` (regex
`#^https://ror\.org/0[^ILOU]{6}\d{2}$#`) XOR multilingual `name` —
`Repository::saveAffiliations()` nulls the manual name whenever a ROR is
set; validation strings `author.affiliationRorAndNameEmpty` ("Please
provide a ROR affiliation or at least one affiliation name.") and
`author.affiliationNamePrimaryLocaleMissing`. The first is an API-side
guard with no observed screen path (live-probed 2026-08-28: every
empty-name path from the form — primary box cleared, all boxes
cleared — returns the primary-locale message instead, since the Add
button never exists without a pick and both pick types carry a name).
No count limit exists anywhere (schema, validation, UI). UI `FieldAffiliations.vue` +
`FieldAffiliationsRorAutoSuggest.vue`: browser queries
`https://api.ror.org/v2/organizations` directly (fires from 4 typed
characters, 400 ms debounce); suggestion rows show `ror_display` name,
country, ROR icon and a registry link ("Open link in a new tab.");
`allowCustom: true` offers the typed text as the manual path (primary
locale name only, then per-locale boxes:
`user.affiliations.typeTranslationNameInLanguageLabel`,
`translationsSomeAvailable` "{$count} of {$total} languages completed";
the complete state has its own string, "All translations available" —
live-probed 2026-08-28, as was the Add button appearing only after a
pick).
Row actions: `user.affiliations.translationEditActionLabel` ("Edit
institution name" — absent on ROR-backed rows) /
`translationDeleteActionLabel` ("Remove institution") — both behind the
typed row's expander button, accessible name "Click to edit or delete"
(live-probed 2026-08-28); the search input is disabled while a picked
entry sits in "Selected" (same probe). Delete modal
`user.affiliations.deleteModal.title/message`. Registry-error modals:
`user.affiliations.error.rorApi*` — probed 2026-08-28 (OJS) with
SIMULATED registry answers (the browser's own registry queries were
answered 429 / 500 / 410 by the test harness; the screen's requests
were untouched): each renders once per errored search as a modal
"ROR API Error" with a single "OK" — 429 "Too many requests have been
sent to the ROR API. Please wait a moment before continuing to
search.", 5xx "The ROR API service is currently unavailable. Please
refresh the page or try again later.", 410 "The ROR API service in
this installation is deprecated. Please contact your system
administrator." After any of them the typed text becomes a pre-picked
typed entry and the query watcher stays blocked for the panel's life —
`hasError` is cleared only by a successful fetch, which nothing
in-panel can trigger (A11); a reopened panel searches normally. A registry pick POSTs
to the install's own `rors/` API — `PKPRorController::addOrEdit()`
returns the cached record without any registry call when one exists,
otherwise re-fetches `https://api.ror.org/v2/organizations/{id}`
server-side (10 s timeout; per-user 20/60 s and global 40/300 s rate
limits with their own 429 strings; failure → 404, basis of A5).
Display: `Affiliation::getAffiliationName()` prefers the cached registry
record's names, falling back to the stored manual name. User-profile
bridge: `Repository::migrateUserAffiliation()` exact-name-matches the
profile's plain-text affiliation against the cached registry records
when a submission copies the profile — the profile/masthead field itself
is `user.json`'s plain multilingual `affiliation` string, separate
machinery.

<a id="fn-e"></a>
**e — contributor roles.** Records: `contributor_roles` per context,
schema `contributorRole.json` (`contributorRoleIdentifier` in a
ten-value enum; multilingual `name`); seeded on context creation only —
`PKPContextService::add()` inserts AUTHOR/"Author" and
TRANSLATOR/"Translator" (`default.groups.name.author/translator`); a
press arrives with four (live-probed 2026-08-28: the form's checkbox
group and the Contributor Roles table both list "Author", "Translator",
"Chapter Author" (identifier AUTHOR), "Volume editor" (EDITOR) on a
seeded press — OMP-side seeding); the
auto-created submitting contributor gets the context's first
AUTHOR-identifier role (`Repository::newAuthorFromUser()`). Author↔role
link: `credit_contributor_roles` pivot (XOR with CRediT rows; cascade
delete). Manager UI `src/managers/ContributorRoleManager/*`, mounted
solely at `lib/pkp templates/management/workflow.tpl` (tab id
`contributorRoles`, Settings → Workflow → "Submission" tab, label
`manager.contributorRoles.title` "Contributor Roles") — same mount in
all three apps. Strings: `manager.contributorRoles.add` ("Add Role"),
`.edit` ("Edit Role"), `.name` ("Role Name"), `.identifier` ("Role
Identifier"), `.name.description` ("Fill name in all of the
languages."), `.saved` ("Contributor role saved"), `.delete.role`
("Delete Role"), `.alert.delete.confirmationTitle` / `.message.body`
(type-to-confirm; confirm button = `common.confirmDelete`, disabled
until the typed value equals the identifier), `.alert.deleted` ("Role
Deleted") + `.backToRoles`. On edit the identifier select collapses to
the role's own value; the API additionally discards identifier changes.
API `PKP\API\v1\contributorRoles\ContributorRoleController` (no app
subclass): Site Administrator + Manager only, settings-access policy;
delete-in-use → HTTP 406 `manager.contributorRoles.error.delete.inUse`;
last-AUTHOR-role delete → 406 `api.contributorRole.400.errorDeletingAuthorRole`
("Last AUTHOR role cannot be deleted."). Live-probed 2026-08-28 (screen
+ guards on an OJS scratch journal; screen placement on all three
apps): both refusals render as a modal "Error" dialog with "OK", and
with both applicable the in-use refusal fires first; the
type-to-confirm's confirm button carries `common.confirmDelete` — a
message string used as a button label (A12); a Section Editor (OPS:
Moderator) opening the settings URL directly lands on the
authorization-denied page, "The current role does not have access to
this operation."; a role-name save with the second language empty
returned 200 with a null stored name (A13). `GET identifiers` returns
the enum list the Add panel offers.

<a id="fn-f"></a>
**f — delete, order, silence.** Delete dialog: title + confirm
`grid.action.deleteContributor` ("Delete Contributor"), message
`grid.action.deleteContributor.confirmationMessage` ("Are you sure you
want to remove {$name} as a contributor? This action can not be
undone."). Server: `PKP\author\Repository::delete()` →
`DAO::delete()` nulls `publications.primary_contact_id` when it pointed
at the deleted author (no replacement — A2) and re-numbers the remaining
sequence. Ordering: `Orderer.vue` up/down (`common.orderUp/orderDown`
carry the row title — accessible, unlike the funder arrows); save PUTs
`contributors/saveOrder` (`Repo::author()->setAuthorsOrder()`, 0..n);
"Cancel" restores the pre-ordering snapshot client-side and re-fetches.
New contributors are meant to take `max(seq)+1` (`DAO::getNextSeq()`),
but the method treats a max sequence of 0 as "no contributors" (`if
($seq)` — falsy zero), `Repository::newAuthorFromUser()` leaves the
auto-created author's sequence at 0, and the authors collector orders
by sequence with no tiebreak — so on a never-reordered list the new
contributor ties at 0 (A15); an earlier append-at-end live-confirmation
(2026-08-28, OJS) was a coincidental draw on that tie, the probed list
evidently rendering the tied rows in insertion order. Delete dialog,
ordering mode with the verbatim arrow names,
cancel-restore and the immediate primary-contact move
live-confirmed 2026-08-28 (OJS); same date, the last delete emptied the
list through the standard dialog with no extra warning, leaving
"No items found." under the three header buttons and an empty Preview. Silence: no Mail/Notification/EventLog usage
anywhere in `classes/author/` or `classes/affiliation/` (grepped,
pinned checkouts) — the only email is U04's ORCID verification request.
Live-probed 2026-08-28 (OJS, per-action isolation): add, edit, delete
and reorder each left the activity-log count and the mailbox untouched,
while "Set Primary Contact" alone added exactly one history row,
"Submission metadata updated" — it rides the publication PUT (fn b),
which logs a metadata update without naming the actual change.

<a id="fn-g"></a>
**g — versioning.** `PKP\publication\Repository::version()` clones every
author onto the new publication (id nulled, `publicationId` re-keyed;
affiliations, contributor roles and CRediT roles re-persisted with the
clone; `seq` preserved) and re-points `primaryContactId` at the clone of
the old primary contact. OMP's override additionally re-links chapter
authors (catalog territory); OJS/OPS overrides touch no author code.
Live-confirmed 2026-08-28 (OJS): the new version's copy edits
independently and the "Primary Contact" badge rides onto the clone.

<a id="fn-h"></a>
**h — reader surfaces.** OJS `templates/frontend/objects/article_details.tpl`
(authors section: `getFullName()`, affiliations loop with
`getLocalizedName()` + ROR-icon link to `$affiliation->getRor()`,
`getLocalizedContributorRoleNames()`, ORCID icons, `creditRoles`;
biographies section `submission.authorBiographies` with
`submission.authorWithAffiliation` "{$name}, {$affiliation}"); OPS
`preprint_details.tpl` structurally identical; OMP
`templates/frontend/components/authors.tpl` (book page + chapter pages)
with the <5 / ≥5 branch (OMP1) and the edited-volume `$editors` swap
(OMP2). Listings: OJS `article_summary.tpl` and OPS
`preprint_summary.tpl` print `getAuthorString()` with NO
include-in-browse filter; OMP `monograph_summary.tpl` prints
`getAuthorString(true)` — the sole reader-side consumer of the tick
(A3); `authorsStringIncludeInBrowse` has no template consumer in any
app. No frontend template reads `primaryContactId` (no
corresponding-author marker). The author line's visibility toggle
(`hideAuthor`) is section configuration. Head metadata (Google Scholar
tags) comes from that plugin's feature, not here. Live-probed
2026-08-28: the landing credits held on all three apps (list order,
typed affiliation as plain text, role names, CRediT "{Role} ({Degree})",
biographies heading singular/plural with the comma dropped when there
is no affiliation, nothing marking the primary contact); the unticked
contributor appeared in OJS's issue TOC and search and OPS's archive
and search, was dropped from OMP's catalog listing, and was credited
on all three landing pages; all five listing surfaces printed the
"Full"-format author line. Anonymous credit live-probed 2026-08-28
(OJS, logged out, published scratch article): the landing page's
authors block listed "Anonymous" with role "Author" as a normal
entry — the word appearing exactly once on the page, with nothing
marking it as a placeholder — and the issue table of contents and the
search result line both printed "Alex Author (Author); Anonymous
(Author)".

<a id="fn-i"></a>
**i — the wizard mount.** `PKPSubmissionHandler::getSteps()` pushes the
Contributors step unconditionally (`SECTION_TYPE_CONTRIBUTORS`;
`getContributorsStep()`); the panel is built with `canEditPublication:
true` hard-coded — always editable inside the wizard. Review step
`review-contributors.tpl`: per-author name + "Primary Contact" badge +
role badges; empty-list warning `submission.wizard.noContributors` ("No
contributors have been added for this submission."). Live-confirmed
2026-08-28 (OJS + OPS): the step is fully editable, the submitting
author can delete themselves down to an empty list, and the Review step
then shows the warning verbatim. OMP's handler
carries a functionally identical override of the panel builder; OJS/OPS
none. Step order, gates and the auto-created contributor: U21's
territory (its Rule 5 and probes).

<a id="fn-j"></a>
**j — competing interests.** Context setting
`requireAuthorCompetingInterests` (`context.json`), checkbox in
`PKPMetadataSettingsForm` — `manager.setup.competingInterests`
("Competing Interests") /
`manager.setup.competingInterests.requireAuthors` ("Require submitting
Authors to file a Competing Interest (CI) statement with their
submission.") — rendered on Settings → Workflow → Metadata in all three
apps (no app touches the field). Author-side enforcement:
`PKP\author\Repository::validate()` requires the primary-locale
`competingInterests` when the setting is on
(`author.competingInterests.required` — API-side; from the form the
client-side required check refuses first, see fn c). Form field:
required multilingual `FieldRichTextarea` (`author.competingInterests`
+ `.description`; on OPS the label key is overridden app-side — OPS2,
f-ops2). Live-probed 2026-08-28 (OJS + OMP scratch contexts):
setting placement, field position and required marker as described; a
saved statement survived the setting's untick/re-tick round trip, the
field simply vanishing while the setting was off.

<a id="fn-k"></a>
**k — the registry cache.** Table `rors` + `ror_settings`
(`ror.json`: "this table is a cache of the data dump"). Scheduled task
`PKP\task\UpdateRorRegistryDataset`: downloads the ROR data dump (via
its Zenodo record), verifies the checksum, upserts every record's names
and display locale, never deletes records absent from a new dump;
registered monthly (`PKPScheduler`, `withoutOverlapping`) and run once
at install/upgrade; failures land in the scheduled-task log
("Update ROR registry dataset cache"), invisible on screen. No config
or context setting gates any of it; no app subclasses any ROR class
(empty chains). The install's `rors/` API (Manager, Sub-editor,
Assistant, Author; POST-only in practice — the two GET routes have no
caller in any app's UI at the pinned commits).

<a id="fn-l"></a>
**l — anonymized review.** `PKP\publication\maps\Schema::mapByProperties()`
empties `authors` and the three author strings when mapping for
author-anonymous review contexts; `getContributors` answers the shielded
reviewer with an empty list and `getContributor` refuses. Same
at-the-source withholding as the funders list
(*[Funding](U43-funding.md)*'s probe-confirmed twin); reviewer-screen
presentation is the review features' territory. Live-probed 2026-08-28
(OJS): the author-anonymous reviewer's captured browser traffic carried
an empty contributor list and empty author strings, and no step of the
review wizard named an author; an open-review assignment (control)
carried the full list, with an Authors row in the reviewer's
submission-details view.

<a id="fn-m"></a>
**m — the legacy contributor grid (unreachable).** The pre-3.4
grid (`PKP\controllers\grid\users\author\AuthorGridHandler`, marked
deprecated, with `authorForm.tpl`'s user-group radios,
principal-contact/include-in-browse checkboxes and checkmark cell
templates) has NO mount site in any of the three apps at the pinned
commits — grepped every template, page, class and plugin; only the
class files and autoloader entries exist. OPS lacks the app-side form
subclass the handler instantiates, so its add/edit ops would fail
outright there. Treated as dead code: no screen reaches it, so it is
recorded here and excluded from rules, scenarios and probes.

<a id="fn-n"></a>
**n — pin note.** OJS's pkp-lib pin (`87999c45`) carries one commit
OMP/OPS's pin (`a9767b7f`) lacks — "Restore type-aware empty value
fallback for form field configs", touching the shared form-field config
layer including `FieldAffiliations.php` and `FieldCreditRoles.php`
(checked 2026-08-28). Every contributor-form file compared
(`ContributorForm.php`, panel, templates) is byte-identical across the
pins; behavior differences, if any, would sit in form-field default
handling — the probes run on all three apps regardless.

<a id="fn-s1"></a>
**s1 — scenario 1 seeding.** One scratch submission (any stage before
publication) in the seeded journal, submitted by a roster author so the
auto-created contributor exists; Journal Manager account. The
organization contributor exercises the type switch and A4's ROR ID box
if desired.

<a id="fn-s2"></a>
**s2 — scenario 2 seeding.** The scenario-1 submission with two PERSON
contributors with distinct family names. "et al." from
`submission.shortAuthor`; the format strings refresh because Preview
re-fetches the publication. The opening Save-Order pin is load-bearing:
without it the tied sequences make "Abbreviated" and the row order
nondeterministic (A15).

<a id="fn-s3"></a>
**s3 — scenario 3 seeding.** Same submission; the submitting author's
contributor is the seeded primary contact (created at submission).

<a id="fn-s4"></a>
**s4 — scenario 4 seeding.** The multilingual leg needs a scratch
journal with a second submission language. The registry leg needs
internet browser-side (suggestions come live from the public registry)
AND server-side (the record cache) — the campaign's test installs block
server-side egress, so there the registry leg deterministically shows
A5's shape and suites cover the typed-name path plus that shape.

<a id="fn-s5"></a>
**s5 — scenario 5 seeding.** Scratch journal (roles are mutated); one
scratch submission with a contributor to hold the new role for the
in-use refusal.

<a id="fn-s6"></a>
**s6 — scenario 6 seeding.** One published scratch submission per app
with the contributor set described; on OMP the listing is the catalog
list, on OPS the archive. Run "Order" → "Save Order" once before
publishing so the reader-order assertions are deterministic (A15). The
≥5-contributor OMP leg needs a second
scratch monograph with five contributors.

<a id="fn-s7"></a>
**s7 — scenario 7 seeding.** The scenario-6 publications; re-publish or
edit as needed after the untick. The cross-app assertion pair is the
point: OMP omits, OJS/OPS show (A3).

<a id="fn-s8"></a>
**s8 — scenario 8 seeding.** Scratch journal (the setting is mutated);
any submission with a contributor.

<a id="fn-f-a1"></a>
**f-a1 — A1 evidence.** `ContributorsListPanel.vue` binds the row
subtitle to `localize(item.affiliation)` and
`SubmissionWizardPage.vue::getAuthorName()` appends `author.affiliation`
— but `author.json` carries only the `affiliations` array (no singular
`affiliation` prop), and the ui-library `localize()` of a missing value
returns the empty string. Verified schema + map + helper at the pinned
commits. Live-confirmed 2026-08-28: the empty reserved line sits in the
DOM on OJS, OMP and OPS, workflow list and wizard Review list alike; a
contributor whose Edit panel held a saved affiliation (one migrated
from the submitter's profile) still showed no affiliation text on
either surface. The OMP reader-side symptom, same date: on a
five-contributor book page the one contributor with a (typed, saved)
affiliation rendered as "Ben Beta, ;" in the compacted line —
`submission.authorWithAffiliation` with an empty affiliation value;
the exact template-side mechanism is unverified, but the shape matches
this entry's dead-field read.

<a id="fn-f-a2"></a>
**f-a2 — A2 evidence.** `PKP\author\DAO::delete()` sets
`publications.primary_contact_id = null` where it referenced the deleted
author, before deleting; no repository or UI code path reassigns or
warns (grepped panel + repositories, pinned checkouts). Live-probed
2026-08-28 (OJS): after deleting the primary contact no row carried the
badge, no warning or toast appeared, the DB column read NULL — and the
publish flow ("Review Publishing Details" through the final "All
publication requirements have been met." dialog) passed with no mention
of the missing contact. Backed out with the final dialog's "Close" —
its buttons are Close/Publish only, no Cancel — and the earlier
"Review Publishing Details" Confirm had already set the publication's
status to READY_TO_PUBLISH with `date_published` still null (probed
2026-08-28, OJS), so the workflow's status label changes despite
nothing being published.

<a id="fn-f-a3"></a>
**f-a3 — A3 evidence.** `includeInBrowse` filtering exists in exactly
two places: `PKPPublication::getAuthorString(true)` and the mapped
`authorsStringIncludeInBrowse` payload prop. Template survey (pinned
checkouts): OMP `monograph_summary.tpl` calls `getAuthorString(true)`;
OJS `article_summary.tpl` and OPS `preprint_summary.tpl` call
`getAuthorString()` unfiltered; landing pages loop the full author set;
`authorsStringIncludeInBrowse` has no `.tpl` consumer anywhere.
Live-probed 2026-08-28 cross-app: the unticked contributor showed in
OJS's issue TOC and search and OPS's archive and search, was dropped
from OMP's catalog listing, and was credited on every landing page
(see fn h).

<a id="fn-f-a4"></a>
**f-a4 — A4 evidence.** `author.json` `rorId`: `[nullable]` only — no
regex, no registry check; `ContributorForm` renders it as a plain
`FieldText` for ORGANIZATION. Contrast `affiliation.json` `ror`
(full-URL regex) and the Funder field's registry pick. Live-probed
2026-08-28 (OJS): a nonsense value saved with no message (200),
reappeared only in the Edit panel's own box, and the published article
page's HTML carried no trace of it. Cross-type persistence (2026-08-28,
OJS "definitely-not-a-ror-id" + OMP "omp-garbage-ror"):
`removeIrrelevantContributorTypeData()` clears the other type's name
fields but not `rorId`, so a ROR ID typed under "Organization or group"
survived a save as Person and reappeared on switching the radio back.

<a id="fn-f-a5"></a>
**f-a5 — A5 evidence.** Mechanism chain: the pick POSTs to the local
registry cache; `PKPRorController::addOrEdit()` re-fetches from
`api.ror.org` server-side when the record is not yet cached and answers
404 on failure; `saveAffiliations()` nulls the manual name whenever a
ROR is set; display resolves via the cached record
(`Affiliation::getAffiliationName()`), so no cache row → no name. The
identical server-side chain holds for funders
(*[Funding](U43-funding.md)*, its register's registry-failure finding).
Live-probed 2026-08-28 end-to-end on OJS and OPS (egress-blocked
installs; strings byte-identical): pick → selected chip with registry
URL and ROR mark → "Add" → the install's cache POST fails → "Error"
dialog, entry added regardless, saved with an empty
name and the registry id kept; the reopened row showed the red "The
primary language English is required" with only "Remove institution",
a later save with the nameless row present succeeded, and the
published article/preprint page rendered the affiliation as an
icon-only registry link.

<a id="fn-f-a6"></a>
**f-a6 — A6 evidence.** The badge and "Set Primary Contact" render in
the same per-row actions area (`ContributorsListPanel.vue` `#item-actions`
slot) that read-only viewing removes wholesale (fn b). Live-probed
2026-08-28: an OJS and an OMP author's read-only workflow list showed
names and role badges only — no "Primary Contact" badge on any row.

<a id="fn-f-a7"></a>
**f-a7 — A7 evidence.** Live-probed 2026-08-28 (OJS scratch journal;
shared form): the 400 refusal "Please provide affiliation name in the
submission primary locale." rendered correctly inline under the field
while the foot's error-summary item printed the literal "Go to
Affiliations: [object Object]" — sibling fields print their message
text (e.g. "Go to Country: This field is required.").

<a id="fn-f-a8"></a>
**f-a8 — A8 evidence.** Live-probed 2026-08-28 (OJS; shared field):
with an institution name typed in the search box and nothing picked,
the contributor save returned 200 and both the response and a reload
showed an empty affiliations list — no message anywhere.

<a id="fn-f-a9"></a>
**f-a9 — A9 evidence.** Live-probed 2026-08-28 (OJS + OPS landing
pages, registry-backed affiliation): the ROR mark is an `<a>` holding
only the logo image, with no text, title or ARIA name — an accessibility
scan reads the link out as nothing. OMP's book page renders its own
ROR-mark markup and was not checked (its ≥5-contributor compaction
drops the marks entirely, OMP1).

<a id="fn-f-a10"></a>
**f-a10 — A10 evidence.** Live-probed 2026-08-28 (OJS; shared
ui-library field): in the typed-entry editor the EN box's accessible
name concatenates both languages' labels ("Type the institution name
in English Type the institution name in French (Canada)") and the FR
box has no accessible name — the same shared-component defect the
Funding list's typed-name boxes show.

<a id="fn-f-a11"></a>
**f-a11 — A11 evidence.** Probed 2026-08-28 (OJS) with SIMULATED
registry answers (fn d — route-fulfilled 429/500/410 on the browser's
own registry queries): after each dialog's "OK" the typed text sat as
a selected typed-entry chip with the search input disabled; removing
the chip re-enabled typing, but a fresh query with the registry healthy
again fired zero registry requests and offered only the literal typed
text, for all three statuses; a freshly reopened Edit panel searched
normally. Mechanism: `FieldAffiliationsRorAutoSuggest.vue`'s `hasError`
blocks the query watcher and only a successful fetch clears it — the
dialog's "OK" merely closes.

<a id="fn-f-a12"></a>
**f-a12 — A12 evidence.** Live-probed 2026-08-28 (OJS; shared UI): the
dialog's two buttons read "Are you sure you wish to delete this item?
This action cannot be undone." (the confirm — locale key
`common.confirmDelete`, a message string wired in as the label) and
"Cancel".

<a id="fn-f-a13"></a>
**f-a13 — A13 evidence.** Live-probed 2026-08-28 (OJS scratch journal,
en + fr_CA; shared API): "Add Role" with the French name box empty
returned 200 with `fr_CA: null` stored and the "Contributor role
saved" toast; no validation message anywhere.

<a id="fn-f-a14"></a>
**f-a14 — A14 evidence.** Live-probed 2026-08-28 (OJS scratch journal
reduced to the single "Author" role; shared code): the Add Contributor
save POST returned HTTP 500 — "`PKP\author\Author::getContributorRoles():
Return value must be of type array, string returned`" (the one-role
collapse pre-sets the hidden field as a string where the model demands
an array) — with the generic reload toast and the panel left open;
reproduced three times, each attempt inserting an `authors` row with
no `credit_contributor_roles` link, listed after reload with no role
badge. Deleting the role-less rows worked normally.

<a id="fn-f-a15"></a>
**f-a15 — A15 evidence.** Mechanism: `PKP\author\DAO::getNextSeq()`
computes the next sequence with `if ($seq)` — a max sequence of 0 (the
auto-created author's, left there by `Repository::newAuthorFromUser()`)
reads as "no contributors", so the new row also gets sequence 0; the
authors collector orders by sequence with no tiebreak. Live-probed
2026-08-28 (OJS + OMP, and reproduced independently by both apps' test
authoring the same day): after adding a second contributor both rows
held sequence 0 in the database; the new row rendered FIRST on two
publications and LAST on a third; on one publication the workflow panel
listed "Alex, Beta" while the landing page and issue table of contents
printed "Beta; Alex", and ordering mode opened in the reader pages'
order. "Save Order" stamped 0..n and every surface agreed from then on.
Shared `lib/pkp` DAO with no app override — OPS runs the same code.

<a id="fn-f-a16"></a>
**f-a16 — A16 evidence.** `Repository::newAuthorFromUser()` copies the
profile's country verbatim; self-registration requires a country
(`RegistrationForm`), but the administrator's Add User form
(`UserDetailsForm`) has no country requirement (code-checked
2026-08-28) — an admin-created author account yields a countryless
contributor, and the submission wizard never forces the author to open
their own record, so the gap survives into the workflow. Live-observed
2026-08-28 (OMP + OPS, plus OJS scenario walks on seeded data): editing
such a contributor was refused with the Country requirement until a
country was picked. The campaign's seeded test accounts carry no
country, so test installs hit this on every seeded submission — the
observed frequency is fixture-inflated, but the administrator-created
path is real product surface.

<a id="fn-f-a17"></a>
**f-a17 — A17 evidence.** Observed 2026-08-28 (OJS, one journal, fresh
typed entries): "All translations available" on one submission, "1 of 2
languages completed" on another, same journal languages. The form's
locale list is driven by the publication's languages
(`getPublicationLanguages()`), which would explain the difference;
unsettled pending the two-publication comparison the entry names.

<a id="fn-f-a18"></a>
**f-a18 — A18 evidence.** Live-probed 2026-08-28 (OJS; shared form):
Save on an all-empty Anonymous form was refused client-side with a
single error — "Please correct one error. Go to Contributor Roles:
This field is required. Jump to next error" — Email and Country
unflagged despite their "* Required" markers, no request sent; with
only a role ticked, the save posted and returned 200, the stored
record carrying `"email":null,"country":null` and
`fullName: "Anonymous"`. The throwaway record deleted normally through
the row's Delete dialog.

<a id="fn-f-omp1"></a>
**f-omp1 — OMP1 evidence.** OMP
`templates/frontend/components/authors.tpl`: `count($authors) < 5`
renders the full blocks (ROR icon, ORCID, roles, CRediT); the else
branch renders `submission.authorWithAffiliation` entries. Live-probed
2026-08-28 (five-contributor scratch monograph): one flowed line,
"Alicia Alpha; Ben Beta, ; Carl Gamma; Dana Delta; Erik Epsilon" —
semicolon-joined names, the dangling comma on the one contributor with
an affiliation (A1's footnote).

<a id="fn-f-omp2"></a>
**f-omp2 — OMP2 evidence.** OMP `monograph_full.tpl` passes `$editors`
(with `submission.editorName` labels — the "(ed)" suffix) to
`authors.tpl` for Edited Volumes; chapter pages pass `$chapterAuthors`.
Live-probed 2026-08-28 (scratch Edited Volume): the book page credited
only "Vera Editorova (ed)" with role "Volume editor" while the catalog
listing line kept the full contributor list. Work types and chapters
are catalog territory; recorded here because the reader-facing
contributor block is this spec's surface.

<a id="fn-f-ops1"></a>
**f-ops1 — OPS1 evidence.** The panel's `canEdit` is
`permissions.canEditPublication` in both workflow configs on every app;
that permission evaluates true for the OPS submitting author before
posting — the Funding list shows the same divergence (same gate, same
page, *[Funding](U43-funding.md)* OPS1). Live-confirmed for
Contributors 2026-08-28: the OPS submitting author's workflow list
carries the full controls on their unposted preprint, while the OJS
and OMP author lists are read-only.

<a id="fn-f-ops2"></a>
**f-ops2 — OPS2 evidence.** Observed 2026-08-28 (OPS test authoring):
the field's label renders as the literal text `Competing interests <a
target="_new" class="action" href="{$competingInterestGuidelinesUrl}">CI
Policy</a>`. Mechanism: OPS's app-level `locale/en/author.po` overrides
lib/pkp's `author.competingInterests` key with a legacy pre-Vue string
carrying markup and a template placeholder, and the Vue form renders
field labels as plain text. OJS and OMP take lib/pkp's plain "Competing
Interests" (live-probed 2026-08-28, fn j).

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Contributors list (workflow) | workflow screen → Publication → "Contributors" | AFFW-396 · AFFW-532 · VUE-033 |
| "Order" / "Save Order" button | above the contributors list | AFFW-146 |
| Cancel ordering | above the contributors list (ordering mode) | AFFW-147 |
| "Preview" button | above the contributors list | AFFW-148 |
| "Add Contributor" button | above the contributors list | AFFW-149 |
| Row move up / move down (ordering mode) | contributor rows | AFFW-150 |
| Row "Set Primary Contact" / badge | contributor rows | AFFW-151 |
| Row "Edit" | contributor rows | AFFW-152 |
| Row "Delete" (+ confirmation) | contributor rows | AFFW-153 |
| Panel API plumbing (add/edit/delete/order/primary contact) | — | AFFW-154 |
| Add/Edit Contributor side panel | side panel | AFFW-155 · VUE-093 |
| "List of Contributors" preview | modal | AFFW-156 · VUE-094 |
| Contributors step panel (wizard) | submission wizard, Contributors step | rider on the wizard shell (owned by *[Submission wizard](U21-submission-wizard.md)*) |
| Contributor Roles screen | Settings → Workflow → Submission → "Contributor Roles" | AFFM-061 (Add Role) · AFFM-062 (row Edit) · AFFM-063 (row Delete) · VUE-034 · VUE-056 |
| Contributor roles API | `contributorRoles` (list, get, identifiers, add, edit, delete) | API-014 |
| Contributors API cluster | `submissions/{id}/publications/{id}/contributors` (list, get, add, edit, delete, saveOrder) | rider on the submissions API (owned by *Workflow screen & stage access*, no spec yet) |
| ROR registry lookup API | `rors` (get, list, add-or-edit cache) — the two read routes have no UI caller | API-033 |
| ROR registry cache refresh | scheduled task, monthly + at install | JOB-057 |
| Author record shape | — | SET-003 |
| Affiliation record shape | — | SET-001 |
| Contributor-role record shape | — | SET-007 |
| Registry-record (ROR) shape | — | SET-022 |
| Legacy contributor grid + form (pre-3.4) | UNREACHABLE — no mount site in any app at the pinned commits <sup>m</sup> | GRID-051 · AFFW-681 · AFFW-682 · AFFW-683 · AFFW-684 · AFFW-685 · AFFW-686 |

## Reference — code anchors

- `lib/pkp/classes/author/` — `Author.php`, `Repository.php` (validate,
  newAuthorFromUser, setAuthorsOrder, changePublicationLocale),
  `DAO.php` (primary-contact nulling, seq), `maps/Schema.php`;
  `lib/pkp/schemas/author.json`.
- `lib/pkp/classes/author/contributorRole/` (+
  `creditContributorRole/`, `creditRole/`) — role records, identifier
  enum, pivot; `lib/pkp/schemas/contributorRole.json`;
  `lib/pkp/api/v1/contributorRoles/ContributorRoleController.php`.
- `lib/pkp/classes/affiliation/` — `Affiliation.php` (name resolution),
  `Repository.php` (validate, saveAffiliations,
  migrateUserAffiliation); `lib/pkp/schemas/affiliation.json`.
- `lib/pkp/api/v1/submissions/PKPSubmissionController.php` — the
  contributor endpoint cluster; `lib/pkp/classes/components/listPanels/
  ContributorsListPanel.php` + `lib/pkp/classes/components/forms/
  publication/ContributorForm.php`.
- `lib/ui-library/src/components/ListPanel/contributors/*` (panel, edit
  + preview modals), `src/managers/ContributorManager/*`,
  `src/managers/ContributorRoleManager/*`,
  `src/components/Form/fields/FieldAffiliations.vue` /
  `FieldAffiliationsRorAutoSuggest.vue` (same commit in all three apps).
- `lib/pkp/api/v1/rors/PKPRorController.php`, `lib/pkp/classes/ror/`,
  `lib/pkp/classes/task/UpdateRorRegistryDataset.php`,
  `lib/pkp/schemas/ror.json`.
- `lib/pkp/pages/submission/PKPSubmissionHandler.php`
  (`getContributorsStep()`, `getContributorsListPanel()`) +
  `lib/pkp/templates/submission/wizard.tpl` / `review-contributors.tpl`.
- Reader templates: `templates/frontend/objects/article_details.tpl` +
  `article_summary.tpl` (OJS), `templates/frontend/components/authors.tpl` +
  `objects/monograph_full.tpl` / `monograph_summary.tpl` (OMP),
  `objects/preprint_details.tpl` / `preprint_summary.tpl` (OPS).
- Legacy (unreachable): `lib/pkp/controllers/grid/users/author/
  AuthorGridHandler.php` + `form/PKPAuthorForm.php` +
  `templates/controllers/grid/users/author/*`.

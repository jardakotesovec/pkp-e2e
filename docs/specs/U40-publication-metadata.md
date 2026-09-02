---
name: publication-metadata
scope: Maintain a publication's descriptive metadata — title & abstract, keywords and the other metadata items, data availability statement, submission language, copyright and license — and control who may still edit it once a version is published
apps: [ojs, omp, ops]
shared: pkp-lib
status: verified
atlas-claims: [AFFW-281, AFFW-285, AFFW-379, AFFW-380, AFFW-381, AFFW-382, AFFW-395, AFFW-397, AFFW-400, AFFW-421, AFFW-430, AFFW-457, AFFW-458, AFFW-459, AFFW-711, AFFM-090, AFFM-163, AFFR-065, VUE-085, VUE-090, API-049, API-061, SET-019, SET-032, SET-037, SET-043]
---

# Publication metadata {OJS OMP OPS}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

Every submission carries a *publication*, the face readers eventually see.
This feature is where its descriptive metadata is kept: the title and
abstract, the journal's chosen metadata items (keywords, subjects,
disciplines, supporting agencies, coverage, rights, source, type, funding
statement, publisher ID), the data availability statement, the submission's
language, and the copyright and license that will travel with it. Authors
give a first version of most of this while submitting. From then on the
editorial team maintains it on the workflow screen's Publication area, per
version, until publication. The feature also decides who may still touch it
afterwards: editors are warned, authors are locked out. It owns the journal's
default license settings, the tool that re-stamps every submission with those
defaults, and what readers see of the license and statements on the
published item's page. It is one shared feature of OJS (journals), OMP
(presses) and OPS (preprint servers), written here in journal terms. A
press's readers see the same blocks on the catalog's book page, and a
preprint server's readers on the preprint's page.

## Actors & permissions

Two terms recur below. **Editorial roles** are Journal Manager, Editor,
Section Editor, Guest Editor and the assistant roles (Copyeditor, Layout
Editor, Proofreader). The Site Administrator counts as one when working in a
journal. **May edit the publication** is one gate (Rule 2) shared by every
page in this feature and by the neighbouring publication features
(contributors, citations, funding, galleys). Journal Managers and Editors
always may. Other participants may while their assignment carries the
metadata-edit permission. An Author may only while no version of the
submission is published or scheduled. Which roles reach the workflow screen
and its stages at all is the workflow screen's own rule (see *Workflow screen
& stage access*) and is not restated here. <sup>a</sup> <sup>b</sup>

| Action | Who may — and when |
|--------|--------------------|
| **See the Title & Abstract, Metadata and Data pages** | • Journal Manager, Editor, Site Administrator: on any submission, assigned or not<br>• Section Editor, Guest Editor, assistant roles: while assigned to the submission's current stage. An assistant assigned to another stage sees the "Publication" entry with no pages beneath it (Rule 1)<br>• the submission's Author: on their own submission, in the author view <sup>a</sup> |
| **See the Permissions & Disclosure page** | • the editorial roles above, when they have access to the Production stage (managers always). The page is absent from the author view in every app (Rule 1) <sup>a</sup> |
| **Save changes on any of these pages** | • Journal Manager, Editor, Site Administrator: always, published versions included (Rule 8)<br>• Section Editor, Guest Editor, assistant roles: while their participant assignment carries the metadata-edit permission (Rule 2)<br>• Author: while their assignment carries the permission AND no version is published or scheduled (Rule 9). A journal or press does not grant the permission by default; a preprint server does [OPS1](#ops1) <sup>b</sup> |
| **Change the submission language** | • any editorial role who may edit the publication or publish it, while the submission has exactly one version and is not published (Rule 13). A journal article published into a not-yet-published issue is the exception ⚠ [OJS1](#ojs1). An assistant assigned to the current stage without the metadata-edit permission sees the pages read-only (Rule 10) with no "Change" button; the button appears once their assignment carries the permission. The Author is never offered it, in any app <sup>i</sup> |
| **Set the journal's default copyright and license** | • Journal Manager (and a Site Administrator working in the journal): Settings › Distribution › License. Reaching Settings is the settings features' rule <sup>m</sup> |
| **Reset every submission's permissions to the defaults** | • Journal Manager, Site Administrator: Tools › Permissions (Rule 14) <sup>k</sup> |
| **Read the license, data availability and funding statement blocks** | • any reader: on a published item's landing page (Rule 15) <sup>l</sup> |

## Fields & validation

All fields are per version. Where a field is marked *multilingual*, it is
kept separately per submission language. A form opens in the submission's
language. A language bar at the top of the form offers each other language
as a button. Pressing one shows that language's column ("{Field} in
{language}") beside the submission language's column on every multilingual
field. Only the submission language's copy is ever required (Rule 3). The
one-line editors (Title, Subtitle) keep Bold, Italic, Underline, Superscript
and Subscript behind a "Formatting" menu that appears once the field has
focus. The Abstract, Plain Language Summary and statement editors show a
toolbar of Bold, Italic, Superscript, Subscript and a link button, with no
underline and no lists. A save that fails shows "Please correct one error."
(or "… {n} errors.") under the form, with a "Go to {Field}: {message}" button
for each failing field and a "Jump to next error" button, and marks the
failing field. A save the server refuses additionally shows the toast "The
form was not saved because 1 error(s) were encountered. Please correct these
errors and try again." <sup>c</sup> <sup>d</sup>

**Title & Abstract page** <sup>d</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Prefix** | No | Short text, multilingual. Guidance reads "Examples: A, The". Shown before the title wherever the full title is displayed. |
| **Title** | Yes | One-line rich text, multilingual. Required in the submission language once the submission has been submitted. Saving it empty is refused with "This field is required." |
| **Subtitle** | No | One-line rich text, multilingual. |
| **Abstract** | Journal/preprint server: yes unless the submission's section is set to "Do not require abstracts" [OMP2](#omp2) | Rich text, multilingual. When the section sets an abstract word count, the field shows "Word Count: {n}/{limit}". Over the limit, the counter gains a red error mark and Save is refused with "The abstract is too long. It should be {limit} words or less. It is currently {n} words long." An empty required abstract is refused with "This field is required." [A7](#a7). A press has no per-section abstract policy: the field is optional with no limit [OMP2](#omp2). |
| **Plain Language Summary** | Only when the journal *requires* it | Rich text, multilingual, shown after Abstract. Present only when the journal has enabled plain language summaries (Settings that modify behavior). Shares the abstract's word limit. When the journal requires it, every OTHER Publication page's Save is refused for this field, and storing the summary here does not lift the refusal ⚠ [A1](#a1). |

**Metadata page**. Only the items the journal has enabled appear, in the
settings screen's order. With none enabled the page reads "No metadata
fields are currently enabled." Every item carries a hover tooltip with the
item's help text.
<sup>e</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Keywords**, **Subjects**, **Disciplines**, **Supporting Agencies** | No | Term lists, multilingual. Type a term and press Enter (or pick a suggestion) to add it as a chip with its own "Remove {term}" button. Suggestions are terms already recorded in this journal for that item and language (Rule 7). Any typed term is accepted. |
| **Coverage**, **Rights**, **Source**, **Type** | No | Plain text, multilingual. |
| **Funding Statement** | No | Rich text, multilingual. Shown to readers under "Funding Statement" (Rule 15). The structured funders list is a separate page; see *[Funding](U43-funding.md)*. |
| **Publisher ID** | No | Plain text, single value. Present when the journal enables publisher IDs for publications (see *Identifiers*). |
| **Article Number** {OJS} | No | Plain text. Present when the journal enables article numbers. |

**Data page** <sup>f</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Data Availability Statement** | No | Rich text, multilingual. Present when the journal has enabled the statement. The page itself ("Data") exists when either the statement or data citations are enabled. Its data-citations part belongs to *Citations & references*. |

**Permissions & Disclosure page**. Each field arrives locked with the value
the journal will apply automatically, and an **"Override"** link that unlocks
it for a per-item value (Rule 11). <sup>g</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Copyright Holder** | No | Text, multilingual. Description: "Copyright will be assigned automatically to {holder} when this is published." ("… posted." on a preprint server), naming the journal's default holder (Rule 12). |
| **Copyright Year** | No | A year (whole number). The description names the basis: the article's publication date, or, on a journal set to issue-based copyright, the issue's publication date. |
| **License URL** | No | Must be a web address. Anything else is refused with "This is not a valid URL." Description: "The license will be set automatically to {license name} when this is published." ("… posted." on a preprint server). The name is the license's name for a Creative Commons choice, or the raw address for an "Other license URL". The description and the Override lock are present only when the journal has a default license. Otherwise the field is plain-editable with no description. On a preprint whose author chose a license while submitting, the field arrives filled and unlocked while the description still names the server's default ⚠ [OPS2](#ops2). |
| **Default Chapter License URL** {OMP} | No | On an Edited Volume only: the license chapters inherit unless a chapter sets its own [OMP4](#omp4). |

## Rules & state

1. **Where the pages live.** The workflow screen's Publication area
   (titled "Publication"; "Preprint" on a preprint server) lists the
   entries this feature owns, in this order: **"Title & Abstract"**
   (first), **"Metadata"**, **"Data"** (after References, and only when the
   journal enables the data availability statement or data citations),
   and **"Permissions & Disclosure"**, which appears for editorial roles
   with Production-stage access only. Each opens a page headed
   "Publication: {entry}" ("Preprint: {entry}" on a preprint server)
   carrying one form with a **Save** button. The neighbouring entries
   (Contributors, References, Funding, Galleys/Publication Formats, JATS,
   Issue/Catalog Entry/Preprint Entry…) belong to their own features.
   The author view shows the same pages minus Permissions & Disclosure.
   On a preprint server the author view has no stage screens at all, only
   the Preprint pages and "Production Tasks & Discussions".
   An assistant assigned to a stage other than the submission's current
   one sees the "Publication" entry with no pages beneath it, and "You
   don't currently have access to that stage of the workflow." on the
   other stages. <sup>a</sup>
   <a id="edit-gate"></a>
2. **May edit the publication: the one gate.** A person may save changes
   to a version's metadata when any of these holds:
   - they hold the Journal Manager or Editor role, or are the Site
     Administrator. No participant assignment is needed;
   - they are a participant on the submission whose assignment carries
     the metadata-edit permission. A new assignment starts from the
     role's setting "Permit submission metadata edit." (Settings ›
     Users & Roles › Roles). That setting is on by default for Editor and
     Section Editor, and off for the assistant roles and, on a journal or
     press, for Author. The person adding a participant can tick or untick
     "Allow this person to make changes to the publication, such as the
     title, abstract, metadata and other publication details…" for that
     assignment (see *Stage participants*);
   - for an Author, additionally: no version of the submission is
     published or scheduled (Rule 9).
   The gate is evaluated per submission, not per version. Whoever may
   edit one version may edit them all. <sup>b</sup>
3. **Per version, per language.** Each publication version carries its
   own copy of every field on these pages. The version switch on the
   Publication area chooses which one the pages show and save. Creating
   and switching versions belongs to *Publish, schedule & versions*. Forms
   open in the submission language, which is the only language ever
   required. On a journal with several submission-metadata languages,
   each form carries one language bar: the submission language as a
   label, every other language as a button. Pressing a button shows that
   language's column ("{Field} in {language}", never marked required)
   beside the submission language's column on every multilingual field.
   Each submission-language heading then counts "{n}/{m} languages
   completed". A value typed in the other language saves with the form.
   The form reopens on the submission language alone. <sup>c</sup>
4. **Saving.** Pressing **Save** writes the whole form. "Saving" and then
   "Saved" appear beside the button, and the values are the ones a reload
   shows. A failing save keeps the page open with the error summary
   (Fields & validation) and the offending fields marked. The "Saving"
   note clears without "Saved", and nothing is written. Every successful
   save adds the activity-log line "Submission metadata updated" (Side
   effects). <sup>c</sup>
5. **Title & Abstract.** The title is required in the submission language
   for any submitted submission. On a journal or preprint server, the
   abstract's requirement and word limit follow the submission's section
   ("Do not require abstracts", "Word Count"). A press applies neither
   [OMP2](#omp2). The counter "Word Count: {n}/{limit}" appears only when
   the section sets a limit. An over-limit abstract is refused on Save.
   An empty required one is refused before the save is even sent (Fields
   & validation) [A7](#a7). The Plain Language Summary field follows Rule
   6's enablement. When the journal requires the summary, the Title &
   Abstract page refuses an empty summary like any required field, and
   every other Publication page refuses to save at all ⚠ [A1](#a1).
   <sup>d</sup>
6. **The Metadata page mirrors the journal's metadata setup.** Each item
   on Settings › Workflow › Metadata has an "Enable {item} metadata"
   switch. The Metadata page shows exactly the enabled items (Fields &
   validation), in the settings screen's order. The ask/require choice
   under each switch concerns the submission wizard only (see
   *[Submission wizard](U21-submission-wizard.md)*). Switching an item
   off hides its field but keeps the stored values. Switching it back on
   shows them again. With nothing enabled the page reads "No metadata
   fields are currently enabled." and has no Save button. <sup>e</sup>
7. **Term lists (keywords, subjects, disciplines, supporting agencies).**
   Typing in the field shows suggestions drawn from terms already
   recorded in this journal for the same item and language, on any
   submission. Enter or a click adds the term as a chip. The chip's ×
   removes it. A term nobody has used before is accepted as typed.
   Suggestions are refreshed after each save, so a term added on one
   submission is offered on the next ⚠ [A10](#a10). <sup>e</sup>
8. **A published version warns editors, and stays editable.** On every
   Publication page of a published version, an editorial role sees the
   banner "Warning: This version has been published. Editing it may
   impact the published content." The forms stay editable for whoever
   may edit the publication (Rule 2), and a save changes what readers
   see at once. <sup>j</sup>
9. **A published or scheduled version locks the Author out.** Once any
   version of the submission is published or scheduled, the Author's
   pages become read-only (Rule 10) on every version. The published
   version additionally shows the banner "This version has been
   published and can not be edited." ("This version has been posted and
   can not be edited." on a preprint server). A version that is only
   scheduled shows no banner; Save is simply unavailable. Publishing
   also switches the Author's assignment permission off for good. After
   an unpublish, the pages stay read-only until an editor re-ticks "Allow
   this person to make changes to the publication…" on the Author's
   assignment, which restores saving at once ⚠ [A4](#a4). <sup>j</sup>
10. **Read-only presentation.** A viewer who may not edit the publication
    gets the same pages with the Save button unavailable. The fields
    still look editable ⚠ [A8](#a8). Nothing they type is saved.
    <sup>c</sup>
11. **Permissions & Disclosure: defaults and overrides.** Copyright
    Holder and Copyright Year arrive locked, each with a description
    naming the value the journal will apply and an **"Override"** link.
    License URL is locked the same way only when the journal has a
    default license. "Override" unlocks the field for a per-item value,
    which Save keeps. Once a field holds a value, it opens unlocked on
    later visits. Clearing it and saving returns it to "automatic"
    (Rule 12). <sup>g</sup>
12. **Publishing fills the empty permission fields from the defaults.**
    When a version is published (not merely scheduled), any of the three
    fields still empty is filled once. Copyright Holder comes from
    Settings › Distribution › License: with "Author", the contributors'
    names as one string, each followed by their contributor role in
    parentheses, "Alice Probe (Author)" ⚠ [A11](#a11); with "Journal", or
    no choice saved yet, the journal's name; with "Custom copyright
    statement", the custom text, even when it is empty ⚠ [A12](#a12).
    Copyright Year comes from the item's publication date. On a journal
    set to "Use the issue's publication date" it comes from its issue's
    date instead (the year of publishing when the issue has no date yet).
    License URL comes from the journal's default license, and is left
    empty when the journal has none. The same holder string is what the
    locked Copyright Holder's description announces before publishing
    (Fields & validation). A field already holding a value is never
    overwritten, so an override entered before publishing is what readers
    see (Rule 15). The publish step itself belongs to *Publish, schedule &
    versions*. <sup>h</sup>
13. **Change Submission Language.**
    - **13a — the readout and the button.** Every stage screen shows
      "Current Submission Language: {language}" and nothing after it.
      For editorial roles, every Publication page shows the same readout.
      While the submission has exactly one version and is not published,
      a **"Change"** button follows it, offered to roles who may edit or
      publish (Actors). Once a second version exists or the item is
      published, the button AND the readout leave the Publication pages
      together, while the stage screens keep the readout ⚠ [A6](#a6). A
      journal article published into an issue that is not yet published
      keeps the readout and the button beside "Status: Published", and
      every Confirm on it is refused (13c) ⚠ [OJS1](#ojs1). Whether a
      merely scheduled article offers the button is open ⚠ [A5](#a5).
      The Author's pages never show the button, and their Publication
      pages show no readout (their stage screens do). On a preprint
      server the Author has no stage screen and sees no readout anywhere.
    - **13b — the panel.** Change opens the side panel "Change Submission
      Language For", subtitled with the item's title. It holds the
      required radio list **Submission Language** (the journal's
      submission languages plus the current one, described "This is the
      primary submission language. Changing this will have effects on
      the submission and the metadata entered") and the buttons
      **Cancel** / **Confirm**. With the current language selected there
      is nothing else. Picking a different language reveals, in bold,
      "Before changing the submission language, ensure you have filled
      out the following metadata fields to maintain system integrity.
      Also, note that contributor information and file names will be
      copied from previously entered information." This is followed by
      **Title** (required; "Enter submission title here in {language}. You
      can format your title as needed") and, where the section requires
      abstracts, **Abstract**. The Abstract is marked required and
      enforced ("This field is required.") although its description reads
      "Including the abstract in {language} is recommended. This helps
      ensure that the content is accessible" ⚠ [A14](#a14). A press asks
      for the title only. Each box is pre-filled with any text already
      stored in the chosen language, and Confirm refuses an empty
      required box. Both are dependable only once the freshly opened
      panel has finished its background loading ⚠ [A15](#a15).
    - **13c — Confirm and Cancel.** **Confirm** stores the title (and
      abstract) in the new language and makes it the submission language.
      It copies each file's name and each contributor's names and
      affiliation names into the new language where it had none. It then
      reloads the workflow screen on Title & Abstract, now open in the
      new language, with the old language's copy behind the language bar
      (Rule 3). **Cancel** closes the panel and changes nothing. A change
      the journal refuses (the item gained a second version or was
      published meanwhile, or is the [OJS1](#ojs1) case) shows the toast
      "You can not change language of this submission because it already
      has more than one publication version or a published publication."
      and leaves the panel open with its values. <sup>i</sup>
14. **Reset permissions (Tools › Permissions).** The Tools page's
    "Permissions" tab shows "Reset Article Permissions" ("Reset Monograph
    Permissions" on a press, "Reset Preprint Permissions" on a preprint
    server) with a caution paragraph and a button of the same name. The
    button opens the browser's own OK/Cancel box asking "Are you sure you
    wish to reset permissions data for all articles? This action can not
    be undone." ("… for all preprints? …" on a preprint server; the
    press's wording is older and milder ⚠ [OMP3](#omp3)). Cancel sends
    nothing, but leaves the button greyed until the page is reloaded
    ⚠ [A13](#a13). OK overwrites Copyright Year, Copyright Holder and
    License URL on every version of every submission in the journal with
    the defaults of Rule 12 as computed now. It then shows "Article
    permissions were successfully reset." ("Monograph permissions were
    successfully reset." on a press, "Preprint permissions were
    successfully reset." on a preprint server).
    Per-item overrides are lost, and there is no undo. The tool reaches
    unpublished and declined submissions too ⚠ [A3](#a3). On a journal
    set to the article's publication date, and on a preprint server,
    such an item receives the year 1970 ⚠ [A2](#a2). On a journal set to
    the issue's publication date it receives the current year (a
    published item its issue's year). A press gives the current year.
    <sup>k</sup>
15. **What readers see.** On a published item's landing page:
    - a **"License"** block appears when the item has a License URL or
      the journal has License Terms. With a Creative Commons license it
      shows "Copyright (c) {year} {holder}" (when a holder is set) and
      the Creative Commons badge with its sentence "This work is licensed
      under a Creative Commons … License." With any other License URL it
      shows a link to that address labelled with the copyright statement
      (or "License" when no holder is set). The journal's License Terms
      text follows in either case. With terms but no License URL, the
      block is the heading and the terms alone. On a press the copyright
      statement is a separate line above the block, shown whenever year
      and holder are set even with no license, and the block itself
      carries only the badge or link (always labelled "License") and the
      terms [OMP1](#omp1). With terms but no License URL, the press's
      block shows a "License" link that leads nowhere ⚠ [OMP5](#omp5);
    - a **"Data Availability Statement"** block and a **"Funding
      Statement"** block appear when the respective field is filled, and
      not otherwise, in that order, above the License block.
    The display of keywords, abstract and plain language summary on the
    same page belongs to *Article landing page & reading* (press:
    *Catalog book page*). <sup>l</sup>
16. **The Data page.** With the data availability statement enabled, the
    "Data" page carries the **Data Availability Statement** field. When
    data citations are enabled, it also carries the data-citations list
    owned by *Citations & references*. Disabling the statement removes
    the field but keeps the stored text, which readers continue to see
    (Rule 15). <sup>f</sup>

## Side effects

- Every successful save on any of these pages, and each version the reset
  tool touches, adds one activity-log line "Submission metadata updated",
  attributed to the saving user. When Login As is active, the line names
  the real user, with the impersonated one in an "(acting as {user})"
  suffix. No email or notification is sent. <sup>c</sup>
- Publishing a version fills its empty permission fields (Rule 12). The
  fill is part of the publish action and shows up on the Permissions &
  Disclosure page afterwards. <sup>h</sup>
- Changing the submission language additionally rewrites the submission's
  language, and writes the copied contributor names, file names and
  affiliation names into the new language (Rule 13). <sup>i</sup>
- Reset permissions shows the success toast to the person who ran it and
  nothing to anyone else. <sup>k</sup>
- Publication metadata travels outward with the item (DOI registration,
  export, the published page) through the features that own those
  surfaces. This feature only edits it.

## Settings that modify behavior

- **Settings › Workflow › Metadata**: one section per item. This feature's
  items are Keywords, Subjects, Disciplines, Supporting Agencies,
  Coverage, Rights, Source, Type, Funding Statement, Data Availability
  Statement and Plain Language Summary. The screen also carries other
  features' sections (Competing Interests, References and its metadata
  lookup, Funders and grant-ID validation, Data Citations, Categories).
  The "Enable {item} metadata" box makes the field appear on the Metadata,
  Data or Title & Abstract page (Rules 6, 16). The radio under it ("Do not
  request… / Ask the author… / Require the author…") governs the wizard
  only, with one exception: Plain Language Summary (listed first on the
  screen), whose "Require" is enforced on every publication save
  ⚠ [A1](#a1). The same screen also holds "Publisher ID" in every app
  (per-app checkboxes enable it for publications and the app's other
  objects, which produces the Publisher ID field) and, journal only,
  "Article Number". <sup>m</sup>
- **Settings › Distribution › License**: "Copyright Holder" (Author /
  Journal / Custom copyright statement, with the "Copyright statement"
  text for the last, accepted even when left empty ⚠ [A12](#a12)),
  "License" (the six Creative Commons 4.0 licenses or "Other license URL"
  with an address), "License Terms" (rich text shown to readers, Rule 15),
  and, journal only, the "Copyright Year" basis ("Use the issue's
  publication date", the default / "Use the article's publication date").
  A fresh journal has no holder chosen (Rule 12 then names the journal)
  and shows "Other license URL" selected with an empty address, which
  means "no default license". These feed Rules 11, 12 and 14. <sup>m</sup>
- **Sections › Word Count / "Do not require abstracts"** (journal,
  preprint server): the abstract policy of Rule 5. Owned by the sections
  feature.
- **Roles › "Permit submission metadata edit."** per role, and the
  per-participant "Allow this person to make changes to the
  publication…" checkbox: the assignment side of Rule 2. Owned by the
  roles and stage-participants features.
- **Submission languages** (Settings › Website › Languages): more than
  one submission-metadata language adds the per-field language switch
  (Rule 3) and the choices in Change Submission Language (Rule 13).

## Cross-feature interactions

- *[Submission wizard](U21-submission-wizard.md)*: the wizard owns its
  steps, which fields it asks for and which block submitting. This spec
  owns the fields' meaning, the journal settings that enable them, and
  every edit after the wizard. The wizard's Details step is a slice of the
  Title & Abstract page (no prefix or subtitle; the plain language summary
  appears there when the journal's setting asks for or requires it
  [A9](#a9)) plus keywords. Its "For the Editors" step is the Metadata
  page's asked and required items. On a preprint server its License
  section sets the License URL of Rule 11 before posting. With the
  summary required, the wizard's own saves are hit by the same refusal
  as this feature's pages (A1). What the author then sees is the wizard's
  to describe.
- *Workflow screen & stage access* (no spec yet): owns which roles reach
  the workflow screen, its stages and the Publication area. This spec's
  Actors rows start from that access.
- *Stage participants* (no spec yet): owns the participant assignment and
  its "Allow this person to make changes to the publication…" checkbox
  that Rule 2 reads.
- *Publish, schedule & versions* (no spec yet): owns publishing,
  scheduling, unpublishing and versions, including the "Review Publishing
  Details" panel a journal shows before scheduling. This spec owns the
  edit locks those states impose (Rules 8–9), the permission-field fill
  that publishing performs (Rule 12), the language-change restriction
  (Rule 13), and the record of how a required plain language summary
  reaches that panel (A1). One of that feature's findings shapes this
  spec's scheduled-state checks: on a journal, the panel's "Assign To
  Future Issue and Schedule Only" choice can publish the article at once.
  The dependable way to a scheduled article is to save that choice first
  on the Publication area's "Publication Settings" entry page, then
  re-pick it in the "Schedule For Publication" panel. A further finding
  for that feature was observed while this feature's suites were built:
  the panel's issue-assignment radios race their own preselection, and
  changing them early ends in a server refusal whose raw technical
  message surfaces in a dialog.
- *Issues* (no spec yet): owns issues and their publication date, which
  Rule 12 reads on a journal set to the issue's date.
- *[Funding](U43-funding.md)*, *Contributors & affiliations*, *Citations
  & references*, *Galleys*, *Catalog management* (no specs yet except
  Funding): sibling Publication-area pages that reuse the edit gate of
  Rule 2 ([→ edit gate](#edit-gate)) and the published-version banners of
  Rules 8–9. *Identifiers* has no Publication-area page at the pinned
  commits: DOI management lives on the dashboard's "DOIs" page, and the
  publisher ID on this feature's Metadata page.
- *Import & export* (no spec yet): owns the Tools page and its tab bar.
  The Permissions tab's content is Rule 14.
- *Article landing page & reading* (no spec yet; press counterpart
  *Catalog book page*): owns the landing page. The License, Data
  Availability Statement and Funding Statement blocks on it are described
  here (Rule 15) as this feature's reader surface.

## Canonical scenarios

Common to all three apps (OMP/OPS vocabulary per the
[application glossary](GLOSSARY.md)):

1. **Edit the title and abstract** — Journal Manager: open a submitted,
   unpublished submission's workflow, then the Publication area, then
   "Title & Abstract". The page is headed "Publication: Title & Abstract"
   and shows Prefix (with "Examples: A, The"), Title, Subtitle and
   Abstract, filled with what the author entered. Type "The" as Prefix,
   add a Subtitle, make one word of the Title italic (click into the
   Title, open "Formatting", pick Italic), and change the Abstract. Press
   Save: "Saved" appears beside the button. Clear the Title and Save
   again: the summary "Please correct one error. Go to Title: This field
   is required. Jump to next error" appears with "This field is required."
   under Title, and nothing is saved. Restore the title and Save. Reload
   the page: prefix, subtitle, italic title and abstract are as saved. The
   submission's title in the dashboard list reads with the new prefix.
   The Activity Log shows a new "Submission metadata updated" line.
   <sup>s1</sup>
2. **The Metadata page follows the journal's setup** — Journal Manager,
   on a scratch journal: on Settings › Workflow › Metadata untick every
   "Enable … metadata" box and save. The submission's "Metadata" page now
   reads "No metadata fields are currently enabled." with no Save button.
   Enable Keywords and Coverage. The page shows exactly Keywords and
   Coverage. Type "ocean acidification" in Keywords and press Enter: a
   chip appears with a "Remove ocean acidification" button. Press it and
   the chip goes. Add it again, then a term nobody has used before. Both
   become chips. Save and reload: both chips are there. Disable Coverage
   after filling it, then re-enable it: the value is back. <sup>s2</sup>
3. **The Author before and after publication** — Author, then Journal
   Manager: as the Author, open your own submitted submission's "Title &
   Abstract" (My Submissions › the item › workflow). On a journal or
   press the fields are shown but Save is unavailable, and nothing typed
   persists on reload. On a preprint server the page saves like scenario
   1 [OPS1](#ops1). As the Journal Manager, publish the submission. Back
   as the Author: the published version's Title & Abstract shows "This
   version has been published and can not be edited." ("… has been
   posted and can not be edited." on the preprint server) and Save is
   unavailable, on the preprint server too. Journal Manager: unpublish.
   Author: the page is still read-only, with no banner (⚠ [A4](#a4)).
   Journal Manager: on a stage screen's Participants panel open the
   Author's "Edit Assignment", tick "Allow this person to make changes
   to the publication…", OK. Author: Save works again. Journal only:
   schedule a different submission of the same Author to a future issue
   instead of publishing it (save "Assign To Future Issue and Schedule
   Only" on its Publication area's "Publication Settings" page first,
   then re-pick it in the "Schedule For Publication" panel). Its Title &
   Abstract is read-only for the Author with no banner at all. <sup>s3</sup>
4. **Editing a published version** — Journal Manager, on a published
   item: every Publication page shows "Warning: This version has been
   published. Editing it may impact the published content." Change the
   Abstract on Title & Abstract and Save: "Saved". Open the item's
   landing page as a reader: the new abstract is shown. <sup>s4</sup>
5. **Copyright and license: defaults, override, publish** — Journal
   Manager, on a scratch journal whose Settings › Distribution › License
   holds Copyright Holder "Author", the "CC Attribution 4.0" license and
   a License Terms paragraph: open an unpublished submission's
   "Permissions & Disclosure". Copyright Holder is locked with "Copyright
   will be assigned automatically to {contributor name} (Author) when
   this is published." (the role label is part of the string,
   [A11](#a11)) and an "Override" link. Copyright Year is locked with its
   basis sentence. License URL is locked with "The license will be set
   automatically to CC Attribution 4.0 when this is published." Press
   Override under Copyright Holder, type "Example Society", Save. Publish
   the item. Reopen the page: Copyright Holder "Example Society"
   (unlocked), Copyright Year the current year, License URL the CC
   Attribution 4.0 address, all editable. Open the landing page: the
   "License" block shows "Copyright (c) {year} Example Society", the
   Creative Commons badge with "This work is licensed under a Creative
   Commons Attribution 4.0 International License." and the License Terms
   paragraph. Control: on a scratch journal with no default license and
   no terms, a published item's landing page has no "License" block.
   <sup>s5</sup>
6. **Change the submission language** — Journal Manager, on a scratch
   journal with two submission languages and one unpublished,
   single-version submission in the first language: any Publication page
   reads "Current Submission Language: {first language}" with a "Change"
   button. Every stage screen shows the readout without it. Press
   Change: the panel "Change Submission Language For" names the item and
   offers both languages under Submission Language. Cancel closes it
   with nothing changed. Press again and pick the second language: the
   warning about metadata and copied names appears with a Title box
   (required) in the second language and, in a section that requires
   abstracts, an Abstract box. Type a title, leave the abstract empty,
   Confirm: "This field is required." appears under Abstract and nothing
   is sent ([A14](#a14)). Fill it, Confirm. The screen reloads on Title &
   Abstract, open in the second language with the new title. The readout
   names the second language. The first language's title is still there
   in the column the form's language bar reveals. The contributor's
   "Edit" form shows the given and family names in the second language,
   copied from the first. Controls: on a published item, and on an item
   with two versions, there is neither readout nor "Change" on any
   Publication page (the stage screens keep the readout). The Author's
   pages never show the button. Journal only: an article published into a
   future issue that is not yet published still shows "Change", and
   confirming a change there ends in the toast "You can not change
   language of this submission…" with the panel still open
   ([OJS1](#ojs1)). <sup>s6</sup>
7. **Reset every item's permissions** — Journal Manager, on a scratch
   journal with one published item carrying an overridden Copyright
   Holder (scenario 5), one unpublished submission and one declined
   submission: open Tools › Permissions and press "Reset Article
   Permissions". The browser's own confirm box reads "Are you sure you
   wish to reset permissions data for all articles? This action can not
   be undone." ("… for all preprints? …" on a preprint server; the
   press's sentence is structurally different ⚠ [OMP3](#omp3)). Cancel:
   nothing changes, and the button stays greyed ([A13](#a13)). Reload,
   press again, OK: the toast "Article permissions were successfully
   reset." appears. The published item's Permissions & Disclosure now
   shows the journal's default holder instead of "Example Society", and
   the landing page's copyright line follows. The unpublished and the
   declined submission's pages also carry filled-in values, unlocked, and
   each item's Activity Log gains one "Submission metadata updated" line
   attributed to you ([A3](#a3)). On a journal set to the article's
   publication date, and on a preprint server, their Copyright Year reads
   1970 ([A2](#a2)). On a press it reads the current year. <sup>s7</sup>
8. **Statements reach the reader** — Journal Manager: on Settings ›
   Workflow › Metadata enable "Data Availability Statement" and "Funding
   Statement". The submission's Publication area gains a "Data" entry.
   Enter a statement there and Save. On "Metadata" fill Funding Statement
   and Save. Publish. The landing page shows a "Data Availability
   Statement" block and a "Funding Statement" block with the texts.
   Disable the data availability statement in Settings: the "Data" entry
   disappears from the workflow (data citations off), and the published
   page still shows the statement. <sup>s8</sup>

App-specific:

9. **{OJS} Copyright year from the issue** — Journal Manager, on a
   scratch journal with Copyright Year set to "Use the issue's
   publication date" and a back issue published last year: assign an
   unpublished submission to that issue and publish it. Permissions &
   Disclosure shows Copyright Year = the issue's year, not this year. The
   landing page's copyright line agrees. <sup>s9</sup>
10. **{OMP} A chapter license for an edited volume** — Press Manager: on
    an Edited Volume's "Permissions & Disclosure" a fourth field,
    "Default Chapter License URL", appears locked with an Override link
    describing the license it inherits. On a Monograph the field is
    absent [OMP4](#omp4). Override it with another license address, Save,
    reload: the address is kept. <sup>s10</sup>
11. **{OPS} The license the author chose is already there** — Author,
    then Preprint Server Manager: submit a preprint choosing a license in
    the wizard's License section. As the manager, open its "Permissions &
    Disclosure": License URL holds the chosen address, unlocked (no
    Override link), while the sentence beneath still names the server's
    default license ([OPS2](#ops2)). Post the preprint: the landing page's
    "License" block shows the chosen license's badge and sentence.
    <sup>s11</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-08-28), unreviewed unless
an entry notes otherwise; the team settles them on spec review. Sorted
🐞 → ❓ → ✅. Each entry opens with the user-observable symptom; mechanism
and evidence live in the entry's footnote. Entries marked *basis: code*
were read from the pinned checkouts and await their live drive. An entry
the live drive disproved is retired in place: its badge becomes ✅ and its
wording states the resolution, so IDs stay dense.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A1](#a1) | With Plain Language Summary required, no Publication page but Title & Abstract can be saved, even after the summary is stored, and a journal's pre-scheduling panel is refused silently | 🐞 | user-visible | — |
| [A2](#a2) | Reset permissions stamps Copyright Year 1970 on unpublished items (journal on article-date basis; preprint server) | 🐞 | user-visible | — |
| [A4](#a4) | The Author's edit permission never returns after an unpublish; only a manual re-tick on the assignment restores it | 🐞 | user-visible | — |
| [A15](#a15) | The freshly opened language panel acts before its loading settles: stale guidance and prefill kept (journal), an empty required Title accepted (press), the old language's text stored as the new title (preprint server) | 🐞 | user-visible | — |
| [A13](#a13) | Cancelling the reset-permissions confirm box leaves the button greyed until a reload | 🐞 | minor | — |
| [OJS1](#ojs1) | An article published into a not-yet-published issue keeps "Change", and every language change on it is refused | 🐞 | minor | — |
| [OMP5](#omp5) | With License Terms but no license, the book page shows a "License" link that leads nowhere | 🐞 | minor | — |
| [A3](#a3) | Reset permissions rewrites every submission, unpublished and declined included, and logs one "metadata updated" line per version | ❓ | user-visible | — |
| [A5](#a5) | A scheduled article may still offer and allow Change Submission Language (code reading; the state was not reached live) | ❓ | minor | — |
| [A6](#a6) | The "Current Submission Language" readout leaves the Publication pages once a second version exists or the item is published | ❓ | minor | — |
| [A8](#a8) | Read-only pages keep their fields typeable with Save unavailable | ❓ | minor | — |
| [A10](#a10) | No term suggestion appeared on the Metadata page, even for a term already recorded in the journal | ❓ | minor | — |
| [A11](#a11) | The automatic copyright holder carries the contributor's role: "Copyright (c) 2026 Alice Probe (Author)" on the reader's page | ❓ | minor | — |
| [A12](#a12) | "Custom copyright statement" saves with an empty statement; items then publish with no holder | ❓ | minor | — |
| [A14](#a14) | The language panel's Abstract is required but described as "recommended" | ❓ | minor | — |
| [OMP3](#omp3) | The press's reset-permissions wording is the older text | ❓ | minor | — |
| [OPS2](#ops2) | A wizard-chosen license shows beside a sentence promising the server's default | ❓ | minor | — |
| [A7](#a7) | Retired: an over-limit abstract is refused on Save with its own message, an empty required one before the save is sent | ✅ | retired | re-probe (claude), 2026-08-28 — overturned |
| [A9](#a9) | Retired: the wizard's Details step does show Plain Language Summary at "Ask" and at "Require" | ✅ | retired | re-probe (claude), 2026-08-28 — overturned |
| [OMP1](#omp1) | The book page prints the copyright line outside the License block | ✅ | minor | — |
| [OMP2](#omp2) | A press applies no abstract requirement or word limit | ✅ | minor | — |
| [OMP4](#omp4) | Edited volumes carry a Default Chapter License URL | ✅ | user-visible | — |
| [OPS1](#ops1) | The submitting author edits their own preprint until it is posted | ✅ | user-visible | — |

### All apps

<a id="a1"></a>
**A1 — Requiring a plain language summary blocks every other save** · 🐞 · user-visible.
With Settings › Workflow › Metadata set to "Require the author to provide
a plain language summary…", pressing Save on the Metadata, Data or
Permissions & Disclosure page is refused with "Please correct one error.
Go to plainLanguageSummary: This field is required. Jump to next error".
None of those pages carries the summary field. The message shows a raw
field name, and no field on the page is marked. Storing the summary on
Title & Abstract changes nothing: those pages can never be saved from the
screen while the setting is on, and the entry page next to them
(Publication Settings / Catalog Entry / Preprint entry) is refused the same
way. The requirement is checked against what each save sends rather than
against what the version holds. Publishing does not enforce it: a press
publishes and a preprint server posts without a summary, while on a
journal the "Review Publishing Details" panel's Confirm is refused with
no message and scheduling is never reached (see *Publish, schedule &
versions*). The submission wizard is hit too. At "Require", the start
form's title is dropped without a message, and an empty summary on
Details produces "Error An unexpected error has occurred. Please reload
the page and try again." while the wizard moves on. That leg is recorded
in *[Submission wizard](U21-submission-wizard.md)*.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a1</sup>

<a id="a2"></a>
**A2 — Reset permissions writes the year 1970 on unpublished items** · 🐞 · user-visible.
On a journal set to "Use the article's publication date", and on a
preprint server, the reset tool gives every unpublished or declined
version a Copyright Year of 1970, the year an absent publication date
resolves to. The field then shows "1970", unlocked, on Permissions &
Disclosure. A press writes the current year for items without a date,
and a journal on the issue basis does the same. The value publishes
as-is unless someone notices, because Rule 12 never overwrites a filled
year.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — Reset permissions reaches every submission** · ❓ · user-visible.
The tool's caution speaks of "every published article", but it rewrites
Copyright Year, Copyright Holder and License URL on every version of
every submission in the journal, unpublished and declined included. It
leaves those fields filled and unlocked where they were empty and locked,
and adds one "Submission metadata updated" activity-log line per version,
attributed to the manager who pressed the button.
Question: is the intended scope published items only? Lean: the text
describes the intent and the tool overshoots. But the stamped defaults
on unpublished items are what publishing would have applied anyway (A2
aside), so the visible harm is the log noise and the lost "automatic"
state.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — The Author's edit permission is gone for good after publishing** · 🐞 · user-visible.
Publishing switches off the Author's "Allow this person to make
changes…" permission on every one of their assignments. Unpublishing the
version lifts the published-state lock but not that switch, so the
Author's pages stay read-only, with no banner and no notice, until an
editor opens the Author's "Edit Assignment" on the Participants panel and
re-ticks the permission. That restores saving at once. On a preprint
server, where authors edit their own preprint by default, the author
loses editing after a post/unpost cycle. Rationale: the lock is meant to
follow the published state. The permanent switch-off duplicates it with a
side effect nothing on screen explains.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a4</sup>

<a id="a5"></a>
**A5 — A scheduled article can still change language** · ❓ · minor.
By the code, an article scheduled to a future issue keeps its "Change"
button beside "Current Submission Language", and confirming the change
is accepted. Elsewhere, "scheduled" is treated like "published" (the
Author's lock, Rule 9) and the refusal text speaks of published items.
The live drive did not reach that state from this side: the
pre-publishing panel's "Schedule Only" choice published the article at
once (a *Publish, schedule & versions* finding). The closest reachable
state is OJS1, where the button is offered but the change refused.
Question: should scheduling close the language change as publishing
does? Lean: yes. A scheduled item is already frozen for its issue.
Settled by: the "Change" button on a Publication page whose header reads
"Status: Scheduled", reached through the Publication Settings route
(scenario 6 seeding), and what Confirm does there.
Basis: code. <sup>f-a5</sup>

<a id="a6"></a>
**A6 — The language readout vanishes with the second version** · ❓ · minor.
The "Current Submission Language: {language}" line on the Publication
pages is shown together with its "Change" button. Once a second version
exists (or the item is published), both go from every Publication page,
while the stage screens keep the readout.
Question: should the readout stay without the button? Lean: yes. The
information is still true, and the stage screens show it.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a6</sup>

<a id="a7"></a>
**A7 — Retired: the abstract limit and requirement are enforced** · ✅ · retired.
The concern was that the page might only mark an over-limit or empty
abstract without refusing the save. It refuses both. An over-limit
abstract is rejected on Save with "The abstract is too long. It should
be {limit} words or less. It is currently {n} words long." An empty
required abstract is rejected with "This field is required." before
anything is sent (Fields & validation). No open question remains.
Reviewed: re-probe (claude), 2026-08-28 — overturned (was an open
question). <sup>f-a7</sup>

<a id="a8"></a>
**A8 — Read-only pages look editable** · ❓ · minor.
A viewer who may not edit (an Author on a journal, an assistant without
the permission) gets fields they can type into and a Save button that
does nothing. Nothing tells them the page is read-only until a reload
shows their edits gone.
Question: should the fields be disabled, or a notice shown? Lean: a minor
UX defect. The banner of Rule 9 covers only the published case.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a8</sup>

<a id="a9"></a>
**A9 — Retired: the wizard does ask for the plain language summary** · ✅ · retired.
The draft read the wizard as never showing the field. On the screen, the
Details step shows "Plain Language Summary" at "Ask the author…" and
marks it required at "Require the author…". The Review step lists "Plain
Language Summary None provided" when it was left empty. The setting's
options work as promised. What goes wrong at "Require" is A1's wizard
leg.
Reviewed: re-probe (claude), 2026-08-28 — overturned (was an open
question). <sup>f-a9</sup>

<a id="a10"></a>
**A10 — Term suggestions did not appear** · ❓ · minor.
Typing a term in Keywords that is already recorded on another submission
of the same journal offered nothing but the typed text itself. No
suggestion appeared on any of the three apps' test installs, on the same
or another submission.
Question: are suggestions expected here, or does the lookup need
something this install lacks? Lean: the field is built to suggest, and
the rule stands as written. Settled by one suggestion appearing while
typing a term already recorded on another submission of the same
journal.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a10</sup>

<a id="a11"></a>
**A11 — The automatic copyright holder names the contributor's role** · ❓ · minor.
With Copyright Holder set to "Author", the holder the journal fills in
at publishing is each contributor's name followed by their contributor
role in parentheses, "Alice Probe (Author)". That is the line readers
get: "Copyright (c) 2026 Alice Probe (Author)". The locked field's
description announces the same string beforehand, and the reset tool
writes it too. Identical on a journal, a press and a preprint server.
Question: is the role label meant to be part of the copyright line?
Lean: no. A copyright line names people, not their roles. The string
used here is the byline string that carries roles.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a11</sup>

<a id="a12"></a>
**A12 — An empty custom copyright statement is accepted** · ❓ · minor.
Settings › Distribution › License saves "Custom copyright statement"
with the "Copyright statement" box empty. Permissions & Disclosure then
reads "Copyright will be assigned automatically to  when this is
published.", naming nothing. Publishing leaves Copyright Holder empty,
so the reader's page shows no copyright line and labels a
non-Creative-Commons license link just "License".
Question: should the statement be required once that option is chosen?
Lean: yes. The option has no meaning without a text.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a12</sup>

<a id="a13"></a>
**A13 — The reset button stays greyed after Cancel** · 🐞 · minor.
Pressing "Reset Article Permissions" and answering Cancel in the
browser's confirm box sends nothing and changes nothing. But the button
stays disabled, so a second attempt needs a page reload. Same on a press
and a preprint server.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a13</sup>

<a id="a14"></a>
**A14 — The language panel's Abstract is required but described as recommended** · ❓ · minor.
In "Change Submission Language For", on a section that requires
abstracts, the Abstract box is marked required and Confirm is refused
without it ("This field is required."). Yet its description reads
"Including the abstract in {language} is recommended. This helps ensure
that the content is accessible". Journal and preprint server; a press
shows no Abstract box.
Question: which of the two is intended? Lean: required is right, because
it is the section's own policy. The description is the defect.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-a14</sup>

<a id="a15"></a>
**A15 — The language panel acts before its own loading settles** · 🐞 · user-visible.
Working the "Change Submission Language For" panel right after it opens,
an ordinarily fast click, catches it still loading in the background.
Each app shows a different face. On a journal, the revealed Title and
Abstract boxes keep the OLD language's guidance and prefill for the rest
of that opening. On a press, Confirm on a freshly (re)opened panel is
accepted with the required Title empty: the submission language changes
anyway, and Title & Abstract afterwards counts "0/2 languages
completed". On a preprint server, the new language's boxes open
nondeterministically empty or holding the CURRENT language's text, and
confirming the pre-filled state stores the old language's text as the
new language's title. Once the panel has settled, prefill and refusal
behave exactly as Rule 13b says, and the press's same Confirm is then
refused.
Since: live-observed 2026-08-28 · Basis: probe. <sup>f-a15</sup>

### OJS

<a id="ojs1"></a>
**OJS1 — "Change" stays on an article published into an unpublished issue** · 🐞 · minor.
An article published into a future issue that is not yet published
keeps "Current Submission Language: {language}" with its "Change"
button on every Publication page, beside "Status: Published". Picking a
language and confirming is refused with the toast "You can not change
language of this submission because it already has more than one
publication version or a published publication." A published article
assigned to no issue hides readout and button as Rule 13a says. The
button is offered for a change that always fails: the screen and the
refusal disagree about whether the item counts as published.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-ojs1</sup>

### OMP

<a id="omp1"></a>
**OMP1 — Copyright line outside the License block** · ✅ · minor.
The catalog's book page prints "Copyright (c) {year} {holder}" as its
own line whenever both are set. The "License" block below carries only
the badge (or link) and the press's License Terms. A journal and a
preprint server put the copyright line inside the block and show it
only with a license. Different page, same data: a presentation choice
of the press templates.
Basis: code. <sup>f-omp1</sup>

<a id="omp2"></a>
**OMP2 — No abstract policy on a press** · ✅ · minor.
The press's Title & Abstract page never requires the abstract and shows
no word counter. A press has no per-section abstract settings to apply.
Basis: code. <sup>f-omp2</sup>

<a id="omp3"></a>
**OMP3 — Older reset-permissions wording** · ❓ · minor.
The press's Permissions tab describes the tool as attaching permissions
"permanently" to published content and confirms with "Are you sure you
wish to reset permissions data already attached to monographs?". It
lacks the journal's and preprint server's warning that the action cannot
be undone and may re-license work. The tool does the same thing on all
three.
Question: align the press text with the others? Lean: yes. The caution
is the point of the paragraph.
Basis: code. <sup>f-omp3</sup>

<a id="omp4"></a>
**OMP4 — Default Chapter License URL for edited volumes** · ✅ · user-visible.
On an Edited Volume, the Permissions & Disclosure page adds "Default
Chapter License URL", locked with an Override link describing the
license it inherits (the volume's own License URL, else the press
default). A Monograph has no such field. Chapters are a press-only
object.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-omp4</sup>

<a id="omp5"></a>
**OMP5 — A "License" link that leads nowhere** · 🐞 · minor.
On a press with License Terms and no license address, the book page's
"License" block shows a link labelled "License" above the terms that
points at no address. Clicking it goes nowhere. A journal and a preprint
server show the heading and the terms alone in that case.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-omp5</sup>

### OPS

<a id="ops1"></a>
**OPS1 — The submitting author edits their own preprint** · ✅ · user-visible.
On a preprint server the Author role grants the metadata-edit permission
by default, so the author's Title & Abstract, Metadata and Data pages
save like an editor's until the preprint is posted. On a journal or
press the Author role does not grant it, and the author's pages are
read-only from submission onward. This matches the preprint model:
authors prepare their own preprint for posting.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-ops1</sup>

<a id="ops2"></a>
**OPS2 — The license sentence names the server default beside the author's choice** · ❓ · minor.
On a preprint whose author picked a license in the submission wizard,
Permissions & Disclosure shows License URL filled with that choice and
unlocked (no Override). Yet the sentence beneath still reads "The
license will be set automatically to {server default} when this is
posted." Posting keeps the author's choice. The sentence is wrong, not
the value.
Question: should the sentence follow the stored value, or disappear once
the field is filled? Lean: disappear. It describes the automatic fill,
which will not happen.
Since: live-probed 2026-08-28 · Basis: probe. <sup>f-ops2</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

Ground truth for this draft is the PINNED checkouts (2026-08-28): OJS
`ac67a6dd`, OMP `244a0431`, OPS `94f6bbc5`, each with its `lib/pkp` and
`lib/ui-library` submodules at the pinned state (ui-library `246623e9`
identical in all three; pkp-lib `87999c45` on OJS vs `a9767b7f` on
OMP/OPS — one commit apart, in the form-field config layer). Every
"code" basis below is a reading of those trees; every "live-probed
2026-08-28" note is a drive of the running fleets at those commits
through the screens, on scratch contexts (the seeded journal untouched).

<a id="fn-a"></a>
**a — the pages and their navigation.** Publication-area entries are
pushed by the workflow navigation builders
(`useWorkflowNavigationConfigOJS.js` / `…OMP.js` / `…OPS.js`, editorial
and author variants): `titleAbstract` (`publication.titleAbstract`,
"Title & Abstract"), `metadata` (`article.metadata` /
`submission.metadata` [OMP override] / `submission.informationCenter.metadata`
[OPS] — all render "Metadata"), `dataAvailabilityAndCitation`
(`submission.dataAvailabilityAndCitation.data`, "Data") guarded by
`publicationSettings.supportsDataAvailability || supportsDataCitations`,
and `license` (`publication.publicationLicense`, "Permissions &
Disclosure") pushed only in the editorial builders inside the
`permissions.canAccessProduction` block — the author builders never push
it, in any app. `PKPDashboardHandler::index()` sets `supportsDataAvailability`
from the context's `dataAvailability` setting; the app dashboard handlers
only add payment/issue counts. The pages mount `WorkflowPublicationForm`
via `PublicationConfig.{titleAbstract,metadata,dataAvailabilityAndCitation,license}`
in `workflowConfigEditorialOJS.js` / `workflowConfigAuthorOJS.js`; OMP
and OPS inherit those blocks through the config deep-merge
(`useWorkflowConfigOMP.js` / `useWorkflowConfigOPS.js`, `deepMerge`
merges nested keys, so an app file overrides only the keys it names).
`canAccessProduction`: `useWorkflowPermissions.js` — an editorial role
assigned on the Production stage. The OPS author nav has no "Workflow"
group (`useWorkflowNavigationConfigOPS.js`, author variant): "Preprint"
› the version › the pages, then "Production Tasks & Discussions"
(live-probed 2026-08-28). Live-probed 2026-08-28 (scratch
journal/press/server, manager and author accounts): editorial nav order
as in Rule 1 on all three apps (OJS: Title & Abstract, Contributors,
Metadata, References, [Data,] Funding, JATS XML, Body Text, Galleys,
Media, Permissions & Disclosure, Publication Settings, Create New
Version; OMP and OPS analogous, "Data" after References on all three
when enabled); headings "Publication: Title & Abstract" / "Publication:
Metadata" / "Publication: Permissions & Disclosure" (OPS "Preprint: …");
the author nav carries no "Permissions & Disclosure" on any app (OPS's
author view also has no "Workflow" group). A Copyeditor assigned on the
Copyediting stage of a Submission-stage item (OJS, OMP) saw the
"Publication" entry with no children and "You don't currently have
access to that stage of the workflow." on the other stage screens; on a
Copyediting-stage item the same role reached the pages.

<a id="fn-b"></a>
**b — the edit gate.** Client: `useWorkflowPermissions.js` —
`canEditPublication = submission.canCurrentUserChangeMetadata`, forced
false for an assigned Author when any publication is
`STATUS_PUBLISHED`/`STATUS_SCHEDULED`. `canCurrentUserChangeMetadata`
is mapped by `PKP\submission\maps\Schema::canChangeMetadata()`: true
when one of the current user's stage assignments has `canChangeMetadata`,
else true for an UNASSIGNED user holding `ROLE_ID_SITE_ADMIN` or
`ROLE_ID_MANAGER`. Server (`PKPSubmissionController::editPublication()`,
also `PublicationWritePolicy` → `PublicationCanBeEditedPolicy`): site
admin passes outright; otherwise `Repo::submission()->canEditPublication()`
— true for any user holding a manager-level role in the context
(`_canUserAccessUnassignedSubmissions`, roles in
`UserGroup\Repository::NOT_CHANGE_METADATA_EDIT_PERMISSION_ROLES` =
`[ROLE_ID_MANAGER]`; OJS "Editor" and "Production Editor" are
manager-level groups), else false when a published/scheduled version
exists and the user's assignments are all Author-role, else true iff some
assignment has `canChangeMetadata`. Assignment default:
`stageAssignment\Repository::build()` copies the group's
`permitMetadataEdit`; `registry/userGroups.xml` sets it true for
manager, editor, productionEditor and sectionEditor on OJS/OMP, for
manager, sectionEditor AND author on OPS; assistants have no attribute
(false) everywhere. `AddParticipantForm` (`addParticipantForm.tpl`
checkbox `canChangeMetadata`, label `stageParticipants.canChangeMetadata`)
sets it per assignment and forces true for `ROLE_ID_MANAGER` groups.
Role setting label `settings.roles.permitMetadataEdit` ("Permit
submission metadata edit."). Site Administrator: server bypass explicit
in `editPublication()`; client via the unassigned-admin branch.
Live-probed 2026-08-28 on all three apps: the Assign Participant /
"Edit Assignment" dialogs show the "Permissions" box labelled "Allow
this person to make changes to the publication, such as the title,
abstract, metadata and other publication details. You may wish to
revoke this privilege if the submission has received a final check and
is ready for publication." — unticked by default for a Copyeditor (OJS,
OMP); with it unticked the Copyeditor's (OPS: Moderator's) Title &
Abstract had Save disabled and nothing typed persisted, with it ticked
Save worked and persisted. A Section Editor on the default assignment
saved on all three apps. Roles settings › Author › "Permit submission
metadata edit.": unticked on the journal and press, ticked on the
preprint server. Site Administrator: live-probed 2026-08-28 only as an
administrator who ALSO holds the manager role — every context created
on the test install enrols `admin` as its manager, and both screen
paths to remove that role refuse ("Remove Role You cannot remove the
role. At least one role must be assigned to the user."; the manager's
"Remove User" ends in the generic "Error An unexpected error has
occurred…" dialog). That administrator opened the workflow by URL, saw
the full editorial nav including Permissions & Disclosure, and saved
on all three apps. The pure no-role case rests on the server bypass in
the code; settling observation: the same drive in a context where the
administrator holds no role.

<a id="fn-c"></a>
**c — loading, saving, logging.** `WorkflowPublicationForm.vue` fetches
`submissions/{id}/publications/{pubId}/_components/{formName}`, sets
`form.canSubmit = props.canEdit` (→ `FormPage.vue` disables the submit
button when `!canSubmit`; fields are not disabled — A8), and shows
`noFieldsMessage` when the form has no fields. Route roles for
`_components/{metadata,dataAvailability,titleAbstract,changeLanguageMetadata}`:
MANAGER, SUB_EDITOR, ASSISTANT, AUTHOR; for `identifier` and
`permissionDisclosure`: MANAGER, SUB_EDITOR, ASSISTANT (no author) —
`PKPSubmissionController::getGroupRoutes()`, OMP re-registers
`permissionDisclosure` with the same roles. Save: `PUT
submissions/{id}/publications/{pubId}` → `editPublication()`: policy
+ gate (fn-b), `Repo::publication()->validate()` (400 with per-field
errors), `Repo::publication()->edit()`, which writes the event-log entry
`SUBMISSION_LOG_METADATA_UPDATE` with message
`submission.event.general.metadataUpdated` ("Submission metadata
updated"), `userId` = the real signed-in user (`Validation::loggedInAs()`)
when Login As is active — the rendered row then names them with the
acted-as user in a suffix. No mailable, no notification in `edit()`; `event(new
MetadataChanged($submission))` is fired but no listener exists in the
pinned trees. Form strings: `common.saving`/`form.saved`,
`form.errorOne`/`form.errorMany`, `validator.required`. Localized
loading: `getLocalizedForm()` puts the submission locale first and makes
it the only visible locale; the `locales` list is the context's
submission-metadata locales plus the publication's own languages.
Live-probed 2026-08-28 on all three apps (manager): a successful save
shows "Saving" then "Saved" in the form footer; clearing the Title and
pressing Save sent no request and showed "Please correct one error. Go
to Title: This field is required. Jump to next error" with "This field
is required." under Title; a server-refused save (an invalid License
URL override) showed the field message, the footer summary and the
toast "The form was not saved because 1 error(s) were encountered.
Please correct these errors and try again.", with "Saving" clearing and
no "Saved". Two-language journal (`en` + `fr_CA`): the form opened with
the English column only; the `.pkpFormLocales` bar showed a "French
(Canada)" button and an "English" primary label; pressing the button
showed both columns, French headings "Title in French (Canada)" etc.
with no required marker, English headings "1/2 languages completed" /
"0/2 languages completed"; a French title saved and the form reopened
on English. Same bar on the Metadata page ("Keywords in French
(Canada)"). Login As (live-probed 2026-08-28, OJS scratch journal,
`admin` impersonating a scratch manager via Users & Roles › Login As):
the save's Activity Log row read "2026-08-28 admin admin (acting as
Mona Manager) Submission metadata updated" — the real user named, the
impersonated one in the suffix.

<a id="fn-d"></a>
**d — Title & Abstract.** `PKP\components\forms\publication\TitleAbstractForm`:
`prefix` (`FieldText`, `common.prefix`, description
`common.prefixAndTitle.tip`), `title` (`FieldRichText`, required),
`subtitle` (`FieldRichText`), `abstract` (`FieldRichTextarea`, `isRequired`
+ `wordLimit` from the constructor), plus `plainLanguageSummary`
(`FieldRichTextarea`, label `manager.setup.metadata.plainLanguageSummary`,
inserted after abstract when the context setting is enable/request/require,
required only at `METADATA_REQUIRE`, same word limit). Constructor
callers: OJS and OPS `SubmissionController::getPublicationTitleAbstractForm()`
pass the section's `wordCount` and `!abstractsNotRequired`; OMP does
not override, so the base defaults (limit 0, not required) apply
(OMP2). `FieldRichText.vue` valid elements `b,i,u,sup,sub` (one-line);
`FieldRichTextarea.vue` shows `publication.wordCount` ("Word Count:
{$count}/{$limit}") with an error icon when over. Server-side:
`Repo::publication()->validate()` requires `title[primaryLocale]` when
`submissionProgress` is empty (falling back to the stored title), and
`plainLanguageSummary[primaryLocale]` whenever the context is at
`METADATA_REQUIRE` — evaluated on `$props` (the request body) only (A1).
Live-probed 2026-08-28 on all three apps (manager): field labels Prefix
("Examples: A, The"), Title (required), Subtitle, Abstract (required on
OJS/OPS, plain on OMP); the Title/Subtitle toolbar is hidden until the
editor has focus and consists of one "Formatting" drop-down opening
Bold, Italic, Underline, Superscript, Subscript; the Abstract's visible
toolbar is Bold, Italic, Superscript, Subscript, "Insert/edit link"
(editor setting `bold italic superscript subscript | link`) — the Plain
Language Summary editor showed the same toolbar; Funding Statement and
Data Availability Statement use the same editor component (code). On a
section with word count 20 (OJS, OPS) a 40-word abstract showed "Word
Count: 40/20" with a red inline icon and Save was refused by the server
(400) with "The abstract is too long. It should be 20 words or less. It
is currently 40 words long."; an emptied abstract sent no request and
showed "This field is required." (A7). On OMP: no counter, 40 words and
an empty abstract both saved (OMP2). Plain Language Summary appears
after Abstract once enabled, "* Required" at "Require".

<a id="fn-e"></a>
**e — Metadata page and term suggestions.** `PKPMetadataForm`: fields
added only when `enabled()` — `keywords`/`subjects`/`disciplines`/
`supportingAgencies` (`FieldControlledVocab`, symbolic
`CONTROLLED_VOCAB_SUBMISSION_{KEYWORD,SUBJECT,DISCIPLINE,AGENCY}`;
context key `agencies` for the last), `coverage`/`rights`/`source`/`type`
(`FieldText` with tooltips), `fundingStatement` (`FieldRichTextarea`),
`pub-id::publisher-id` (when `enablePublisherId` contains `publication`),
`articleNumber` (when `enableArticleNumber` — a setting only OJS's
`MetadataSettingsForm` adds). `noFieldsMessage` literal in the workflow
config: "No metadata fields are currently enabled.". Suggestions:
`FieldControlledVocab.vue` GETs `vocabs?vocab=…&submissionId=…&term=…&locale=…`
(`PKPVocabController::getMany()`, roles MANAGER/SITE_ADMIN/SUB_EDITOR/
ASSISTANT/AUTHOR): entries of that vocabulary in the context, in the
requested locale, filtered by the typed term; `allowCustom: true`.
`FieldBaseAutosuggest` also supports a "vocabularies" browser
(`VocabularyModal.vue`), but `PKPMetadataForm` passes none — the modal
serves only the Categories picker (wizard "For the Editors",
`ForTheEditors::addCategoryField()`, and the dashboard filters), so it
is not reachable from this feature's pages (Reference table).
Live-probed 2026-08-28 on all three apps (manager, scratch context):
with every item disabled the page showed "No metadata fields are
currently enabled." with no form and no Save; with everything enabled
the labels ran Keywords, Subjects, Disciplines, Supporting Agencies,
Coverage, Rights, Source, Type, Funding Statement, Publisher ID (OJS
adds Article Number); every item — Keywords through Article Number —
carries a hover tooltip with its help text (Coverage: "Coverage will
typically indicate a work's spatial location (a place name or geographic
coordinates), temporal period (a period label, date, or date range) or
jurisdiction (such as a named administrative entity)."; re-probed
2026-08-28, OJS journal manager, after a first pass missed the last two
— Publisher ID: "The publisher ID may be used to record the ID from an
external database. For example, items exported for deposit to PubMed
may include the publisher ID. This should not be used for DOIs.";
Article Number: "The article number can be used in citations and other
metadata instead of page numbers.");
Coverage disabled → hidden, re-enabled → "Pacific Ocean, 2020" back. A
typed keyword became a chip with a "Remove ocean acidification" button;
an unknown term was accepted; both persisted after Save and reload. The
suggestion lookup is A10's (f-a10).

<a id="fn-f"></a>
**f — Data page.** `PKPDataAvailabilityForm`: one `FieldRichTextarea`
`dataAvailability` (label `submission.dataAvailability`, "Data
Availability Statement"; description
`manager.setup.metadata.dataAvailability.description`) added only when
the context's `dataAvailability` setting is truthy; the controller
passes `(bool) $context->getData('dataAvailability')` and `isRequired`
stays at its default false. The nav entry "Data" additionally exists
for `supportsDataCitations` (`DataCitationManager`, owned by *Citations &
references*). Reader templates render the stored statement without
consulting the setting (fn-l). Live-probed 2026-08-28 on all three apps:
with the statement enabled and data citations off, the "Data" entry
appeared after References and before Funding; the page ("Publication:
Data" / "Preprint: Data") held one Data Availability Statement field
with the description "A short statement describing whether or not the
author(s) have made their research data available and, if so, where
readers may access it." and a Save; the statement persisted; unticking
the setting removed the entry. With data citations on and the statement
off the entry was back, the page showing only the Data Citations list
("No data citations have been added."), no statement field, no Save.

<a id="fn-g"></a>
**g — Permissions & Disclosure.** `PKPPublicationLicenseForm`:
`copyrightHolder` (`FieldText`, multilingual, description
`submission.copyrightHolder.description` with the context-derived
holder: author string / `copyrightHolderOther` / context name),
`copyrightYear` (description `publication.copyrightYearBasis.issueDescription`
when the context's `copyrightYearBasis` is `issue`, else
`…submissionDescription`), `licenseUrl` (description
`submission.license.description` naming the CC option label or the raw
URL). Each has `optIntoEdit` = "no stored value" (licenseUrl: also
"context has a default"), `optIntoEditLabel` `common.override`;
`FieldText.vue` renders the input disabled with the "Override" button
until pressed. OMP `PublicationLicenseForm` extends it and adds
`chapterLicenseUrl` (`publication.chapterDefaultLicenseURL`) when the
submission's `workType` is `WORK_TYPE_EDITED_VOLUME` (OMP4); OPS uses the
base form. Schema: `licenseUrl` validation `url`, `copyrightYear`
integer (`lib/pkp/schemas/publication.json`). OPS's
`LicenseUrlForm` (radio list of CC licenses + "Other license URL") is the
wizard's License section (`SubmissionHandler::getEditorsStep()`), owned
by *Submission wizard*; it writes the same `licenseUrl`. Live-probed
2026-08-28 on all three apps (scratch manager, holder "Author", CC
Attribution 4.0, terms set): the three inputs arrived disabled and empty
with an "Override" button each; descriptions verbatim — "Copyright will
be assigned automatically to Alice Probe (Author) when this is
published." (OPS "… posted."), year sentence OJS at issue basis "The
copyright year will be set automatically when this is published in an
issue.", OMP "The copyright year will be set automatically based on the
publication date.", OPS "… based on the posted date.", license "The
license will be set automatically to CC Attribution 4.0 when this is
published." (OPS "… posted."; with "Other license URL"
`https://example.org/license` the raw address, rendered as a link).
Override → "Example Society" → Save → reload: value kept, input
enabled, no Override; cleared and saved → disabled, empty, Override
back. `not a url` in License URL: refused with "This is not a valid
URL." under the field, the footer summary and the toast of fn-c. On the
control context (no holder chosen, no license, no terms): holder
sentence named the context's name; License URL enabled with no
description and no Override. OPS wizard-created preprint (license "CC
Attribution-ShareAlike 4.0" chosen): License URL filled and enabled, no
Override, description still "The license will be set automatically to
CC Attribution 4.0 when this is posted." (OPS2; the description is a
fixed sentence — whether it also stays beside an editor's override on a
journal was not read).

<a id="fn-h"></a>
**h — publish-time fill.** `PKP\publication\Repository::publish()`:
after `setStatusOnPublish()`, when the new status is `STATUS_PUBLISHED`
(not scheduled) and the field is empty, sets `copyrightHolder`,
`copyrightYear`, `licenseUrl` from
`Submission::_getContextLicenseFieldValue()`. Per app: holder —
`copyrightHolderType` author → `[primaryLocale => $publication->getAuthorString()]`,
context/null → context name, other → `copyrightHolderOther`; license →
context `licenseUrl`; year — OJS: `date('Y')` then, per
`copyrightYearBasis`, `submission` → year of `datePublished`, `issue` →
the issue's `datePublished` year when the publication has an issue with
a date (else stays the current year); OMP: year of `datePublished` when
set; OPS: year of `datePublished` unconditionally (A2 when null).
`getAuthorString()` appends each contributor's localized role names in
parentheses (A11). Live-probed 2026-08-28 on all three apps (scratch
manager; OJS "Schedule For Publication" › "Review Publishing Details" ›
Confirm › "Publish", OMP "Publish", OPS "Post"): with the holder
overridden to "Example Society", the reopened page showed Copyright
Holder "Example Society", Copyright Year "2026", License URL
`https://creativecommons.org/licenses/by/4.0`, all enabled without
Override; without an override the holder became "Alice Probe (Author)";
on the control context (no license) the holder became the context's
name, the year 2026 and License URL stayed empty and editable; with an
empty custom statement the holder published as empty (A12). OJS issue
basis: an article published into a back issue dated 2025-06-15 got
"2025" (landing "Copyright (c) 2025 Alice Probe (Author)"), one
published into a future issue without a date got "2026", an issue-less
one "2026". OJS "Assign To Future Issue and Schedule Only" (saved on
Publication Settings first, then re-picked in the panel; confirmation
"… This will be published when Vol. 2 No. 1 (2027): Future issue 2027
is published. Are you sure you want to schedule this for publication?"
with button "Schedule For Publication"): header "Status: Scheduled",
all three fields still empty, disabled, with Override; the article page
answered 404. The OPS "Post" flow is two-tiered: the Production stage
action reads "Post the preprint" and navigates to the publication
screen, whose "Post" control opens the legacy modal (title "Post the
preprint", confirmation "All requirements have been met. Are you sure
you want to post this?", submit "Post"); after posting the control is
"Unpost", asking "Are you sure you don't want this to be posted?".

<a id="fn-i"></a>
**i — Change Submission Language.** Readout component
`WorkflowChangeSubmissionLanguage.vue`: `submission.list.changeSubmissionLanguage.currentLanguage`
("Current Submission Language:") + `submission.metadataLocales[submission.locale]`
+ link `…buttonLabel` ("Change") `v-if="canChangeSubmissionLanguage"`.
Mounted: on every stage screen's primary items with
`canChangeSubmissionLanguage: false` (editorial AND author OJS configs,
inherited by OMP/OPS); on the Publication pages via
`PublicationConfig.common.getPrimaryControlsLeft` in the EDITORIAL
config only, guarded `submission.status !== STATUS_PUBLISHED &&
submission.publications.length < 2` (OJS block inherited by OMP; OPS
re-states it in `workflowConfigEditorialOPS.js` with the relation
dropdown) with `canChangeSubmissionLanguage` from
`useWorkflowPermissions.js` (= `canPublish || canEditPublication`). The
author configs' `getPrimaryControlsLeft` (OJS, and OPS's override) push
only the version control — no readout on the author's Publication pages.
Modal `WorkflowChangeSubmissionLanguageModal.vue` (title
`…changeSubmissionLanguage.title`, description = the publication's full
title) + `workflowChangeSubmissionLanguageModalStore.js`: fetches
`_components/changeLanguageMetadata` (`ChangeSubmissionLanguageMetadataForm`:
radio `locale` labelled `submission.submit.submissionLocale` with
`…languageDescription`; group `metadata` shown when a different locale is
picked, holding `FieldHTML` `…metadataDescription` and the
`TitleAbstractForm` fields that are `isRequired` — title always,
abstract when the section requires it — de-multilingualized to the
chosen locale, description `…metadataDescription.{title,abstract}`; buttons
`common.confirm`/`common.cancel`), repopulates the boxes from the
publication's stored values on locale change (`setCustom`), PUTs to
`…/changeLocale`, `window.location.reload()` on success. Server
`PKPSubmissionController::changeLocale()` (roles MANAGER/SUB_EDITOR/
ASSISTANT; publication-write policy): refuses with
`api.submission.403.cantChangeSubmissionLanguage` when no locale, more
than one publication, or the publication's status is `STATUS_PUBLISHED`
— `STATUS_SCHEDULED` passes (A5); merges multilingual props, runs
`editPublication()`, then `copyMultilingualData()` (submission-file
`name`; author `givenName`/`familyName`/`preferredPublicName`/
`organizationName`; affiliation `name` — copied from the old locale only
where the new locale is empty), then `edit()` on the submission
(`locale` validated against the context's supported submission locales).
Live-probed 2026-08-28 on all three apps (two-language scratch
contexts, `en` + `fr_CA`; manager, section editor / series editor /
moderator, copyeditor, author): stage screens showed "Current
Submission Language: English" with nothing after it (OJS four stages,
OMP five plus "Marketing", OPS Production); every Publication entry
(OJS 11, OMP 10, OPS 9) showed the readout plus "Change" — rendered as
a `pkpButton`, not an anchor — for the manager and the section editor;
the Copyeditor assigned to ANOTHER stage saw a bare "Publication" entry
and no Publication pages (fn-a); an assistant assigned to the CURRENT
stage with the permission off (OJS, 2026-08-28) reached the pages
read-only — Save present but disabled (Rule 10) — and had the readout
with "Change" in place once an editor ticked her assignment's
permission (the permission-off readout state was not separately
captured; the `canPublish || canEditPublication` guard hides the link,
not the pages);
the Author saw the readout on stage screens only (OJS/OMP) and, on OPS,
no stage screen and no readout on any page. Panel: pre-title line with
the submission id, h1 "Change Submission Language For", subtitle the
title, radio group "Submission Language *" ("Required") with the
description quoted in Rule 13b, options "English" (checked) / "French
(Canada)", buttons "Cancel" / "Confirm"; Cancel closed it, no request.
Picking French: the bold warning quoted in 13b, "Title *" with "Enter
submission title here in French (Canada). You can format your title as
needed" (TinyMCE box, no toolbar), "Abstract *" with "Including the
abstract in French (Canada) is recommended. This helps ensure that the
content is accessible" — shown on OJS and OPS abstract-requiring
sections, absent on their "Do not require abstracts" sections and on
OMP; the Title box opened pre-filled with a French title stored earlier
through Title & Abstract; Confirm with an empty Abstract sent nothing
and showed "This field is required." / "Please correct one error." /
"Go to Abstract: This field is required." (A14). Confirm: `PUT
…/changeLocale` 200, reload on Title & Abstract (`workflowMenuKey`
kept), readout "Current Submission Language: French (Canada) Change",
Title & Abstract open in French with the language bar offering
"English" and "2/2 languages completed", the English title intact
behind it; the contributor's Edit form showed `givenName`/`familyName`
in `fr_CA` filled ("Ada" / "Author") where an untouched submission's
were empty; the file's name is genuinely copied, not merely displayed —
the "Update File Details" form's per-locale name inputs held
`name-fr_CA=""` at upload and the uploaded file's name in `fr_CA` with
"2/2 languages completed" after the change (OJS, journal manager,
2026-08-28); an affiliation saved in English only counted "1 of 2
languages completed" before the change and "All translations
available" after it (same drive). Controls: the
published item (b) and the two-version item (c) showed no readout on
any Publication page and the readout without button on every stage
screen. Refusal: an item published from a second tab, then Confirm in
the first — `PUT …/changeLocale` 403 `{"error":"You can not change
language of this submission because it already has more than one
publication version or a published publication."}`, shown as a top-right
toast with "Close", panel open, no reload — identical on OJS, OMP, OPS.

<a id="fn-j"></a>
**j — the published-state banners.** `PublicationConfig.common.getPrimaryItems`:
editorial config pushes `WorkflowPublicationEditWarning`
(`publication.editorEditWarning`) when
`selectedPublication.status === STATUS_PUBLISHED`; author config pushes
`WorkflowPublicationEditDisabled` (`publication.editDisabled`) under the
same guard. Neither OMP nor OPS overrides `common.getPrimaryItems` in
either variant, so both banners are inherited in all three apps.
Live-probed 2026-08-28: after publishing through the screens (OJS
"Schedule For Publication" › "Publish"; OMP "Publish"; OPS "Post"), the
manager saw "Warning: This version has been published. Editing it may
impact the published content." on Title & Abstract, Metadata and
Permissions & Disclosure, identical on OJS, OMP and OPS (the OPS
workflow header still reads "Published"), Save enabled, and an abstract
edit visible on the public page at once; the Author on the same item
saw Save disabled and the banner "This version has been published and
can not be edited." (OJS, OMP) / "This version has been posted and can
not be edited." (OPS). OJS scheduled item (reached via Publication
Settings › "Assign To Future Issue and Schedule Only", then the header
action; header "Status: Scheduled"): the Author's page had Save
disabled and no banner line at all. The author lock on ALL versions is
the client rule in fn-b plus the server rule; the permanent switch-off:
`PKPSubmissionController::publishPublication()` sets `canChangeMetadata
= 0` on every Author-role stage assignment after `publish()`;
`unpublishPublication()` does not restore it, and `RestrictAuthorAssignment`
/ `UpdateAuthorStageAssignments` re-derive it from the role only on
`SubmissionSubmitted` (A4).

<a id="fn-k"></a>
**k — reset permissions.** `PKPToolsHandler` (roles MANAGER, SITE_ADMIN;
ops `tools`, `permissions`, `resetPermissions`; dispatched by each app's
`pages/management/index.php`): `permissions()` renders
`management/tools/permissions.tpl` — heading and button
`manager.setup.resetPermissions`, paragraph `…description`, form
`#resetPermissionsForm` with `AjaxFormHandler` `confirmText`
`…resetPermissions.confirm`; `resetPermissions()` checks CSRF, calls
`Repo::submission()->resetPermissions($contextId)` — every submission in
the context, every publication: `Repo::publication()->edit()` with
`copyrightYear`/`copyrightHolder`/`licenseUrl` from
`_getContextLicenseFieldValue(null, …)` (fn-h; called WITHOUT the
publication argument, so the year comes from the submission's current
publication) — then a trivial success notification
`…resetPermissions.success`. Tab bar `management/tools/index.tpl`:
`navigation.tools.importExport` ("Import/Export"),
`settings.libraryFiles.category.permissions` ("Permissions"). Strings per
app: OJS "Reset Article Permissions" / "Article permissions were
successfully reset." / confirm and description as quoted in Rule 14;
OPS "Reset Preprint Permissions", confirm "Are you sure you wish to
reset permissions data for all preprints? This action can not be
undone."; OMP "Reset Monograph Permissions", confirm "Are you sure you
wish to reset permissions data already attached to monographs?",
description the older "Copyright statement and license information will
be permanently attached to published content…" text (OMP3). Live-probed
2026-08-28 on all three apps (scratch manager, `/management/tools`,
tabs "Import/Export" / "Permissions"): headings and buttons "Reset
Article Permissions" / "Reset Monograph Permissions" / "Reset Preprint
Permissions"; OJS description "Remove the copyright statement and
license information for every published article, reverting them to the
journal's current default settings. This will permanently remove all
prior copyright and licensing information attached to articles. In some
cases, you may not be legally permitted to re-license work that has
been published under a different license. Please take caution when
using this tool and consult legal expertise if you are unsure what
rights you hold over the articles published in your journal." (OPS the
same with preprint/posted/server wording); OMP "Copyright statement and
license information will be permanently attached to published content,
ensuring that this data will not change in the case of a press changing
policies for new submissions. To reset stored permissions information
already attached to published content, use the button below."; the
button opened a native `confirm()` (dialog type "confirm", no in-page
dialog) with the three texts quoted in Rule 14 / OMP3; Cancel sent no
request and left the button disabled (A13); OK → `POST
…/management/resetPermissions` 200, toast "Article permissions were
successfully reset." / "Monograph permissions were successfully reset."
/ "Preprint permissions were successfully reset."; outcomes per item
in f-a2 / f-a3.

<a id="fn-l"></a>
**l — reader blocks.** OJS `templates/frontend/objects/article_details.tpl`
and OPS `preprint_details.tpl` (forked copies, byte-similar): block
`.item.copyright` headed `submission.license` ("License") when
`$currentContext->getLocalizedData('licenseTerms') || $publication->getData('licenseUrl')`;
inside, with a `licenseUrl`: if `$ccLicenseBadge` (assigned by
`ArticleHandler` / `PreprintHandler` from
`Application::getCCLicenseBadge($licenseUrl)`, which matches the CC
4.0/3.0 URL patterns to the `submission.license.cc.*.footer` badge
markup) → optional `submission.copyrightStatement` ("Copyright (c)
{$copyrightYear} {$copyrightHolder}") paragraph + badge; else an
`<a href=licenseUrl>` labelled with the copyright statement or "License";
then the context's `licenseTerms`. OMP `monograph_full.tpl`: a separate
`.item.copyright` line when `copyrightYear && copyrightHolder`, then
`.item.license` headed "License" under the same `licenseTerms || licenseUrl`
guard holding badge-or-link (link text always "License") + terms
(OMP1; `CatalogBookHandler` computes the badge from the chapter's
license on a chapter request). Statements: all three templates render
`dataAvailability` under `submission.dataAvailability` and
`fundingStatement` under `submission.fundingStatement`, each guarded by
the value only. Live-probed 2026-08-28 as an anonymous reader on all
three apps: with CC BY and terms, OJS/OPS `.item.copyright` = heading
"License", "Copyright (c) 2026 Example Society", the badge, "This work
is licensed under a Creative Commons Attribution 4.0 International
License.", the terms; OMP a separate `.item.copyright` "Copyright (c)
2026 Example Society" between "Versions" and the `.item.license` block
(heading, badge, sentence, terms). No license and no terms: OJS/OPS no
block and no copyright line; OMP the copyright line alone. Terms only:
OJS/OPS heading + terms; OMP heading + `<a href=""> License </a>` +
terms (OMP5). "Other license URL": OJS/OPS `<a href=… class="copyright">
Copyright (c) 2026 Alice Probe (Author) </a>`, OMP the copyright line
plus a link labelled "License"; with the holder empty (A12) OJS/OPS link
labelled "License". Statements: `.item.dataAvailability` "Data
Availability Statement / {text}" and `.item.fundingStatement` "Funding
Statement / {text}" on all three, in that order above the License
block; the data availability block survived disabling the setting.

<a id="fn-m"></a>
**m — settings.** `PKPMetadataSettingsForm` (`FieldMetadataSetting` per
item, options `…enable` / `…noRequest` / `…request` / `…require`; value
stored in the context as `0|enable|request|require` — schema
`context.json`); OJS `MetadataSettingsForm` adds `enablePublisherId`
(checkboxes for publications, galleys, issues, issue galleys) and
`enableArticleNumber`; OMP/OPS add `enablePublisherId` only (OMP:
publications, chapters, publication formats, files; OPS: publications,
galleys). `PKPLicenseForm` (Distribution › License tab, `distribution.tpl`
tab id `license`, label `submission.license`): `copyrightHolderType`
(radio `user.role.author` / `context.context` [“Journal”/“Press”/…] /
`submission.copyrightHolder.other` "Custom copyright statement"),
`copyrightHolderOther` (`submission.copyrightOther` "Copyright
statement", shown for "other"), `licenseUrl` (radio: the six
`Application::getCCLicenseOptions()` 4.0 licenses + "Other license URL"
input), `licenseTerms` (rich text). OJS `LicenseForm` adds
`copyrightYearBasis` (label `submission.copyrightYear`, options
`manager.distribution.copyrightYearBasis.issue` "Use the issue's
publication date" / `…submission` "Use the article's publication date");
OMP and OPS `LicenseForm` are empty subclasses (chain check clean). The
OJS/OMP Distribution tab set comes from `lib/pkp/templates/management/distribution.tpl`,
OPS overrides the file with the same License tab. Live-probed
2026-08-28 on all three apps (scratch manager, Settings › Distribution ›
"License" tab): "Copyright Holder" radios "Author" / "Journal" ("Press"
/ "Server") / "Custom copyright statement" (the last reveals the
statement box; an empty box saved — A12), none selected on a fresh
context; "License" radios "CC Attribution-NonCommercial-NoDerivatives
4.0", "CC Attribution-NonCommercial 4.0", "CC
Attribution-NonCommercial-ShareAlike 4.0", "CC Attribution-NoDerivatives
4.0", "CC Attribution 4.0", "CC Attribution-ShareAlike 4.0", "Other
license URL" + box — a fresh context shows "Other license URL" selected
with an empty box; OJS only "Copyright Year" — "Choose how a default
copyright date is selected for an article. This default can be
overridden on a case-by-case basis. If you "publish as you go", don't
use the issue's publication date." with "Use the issue's publication
date" (selected on a fresh journal) / "Use the article's publication
date", absent on OMP and OPS; "License Terms" rich text with "Enter
public licensing terms you would like to display alongside published
work."; Save. Settings › Workflow › Metadata: "Enable funding statement
metadata" / "Enable data availability statement metadata" boxes as
quoted; the full section-heading roster (2026-08-28, scratch manager,
OJS, in order): "Plain Language Summary, Keywords, Subjects,
Disciplines, Supporting Agencies, Coverage, Rights, Source, Type,
Competing Interests, References, References Metadata Lookup, Funding
Statement, Funders, Funder Grant ID validation, Data Availability
Statement, Data Citations, Categories, Publisher ID, Article Number" —
OMP identical minus Article Number, OPS the same shape: "Publisher ID"
is present on all three apps, "Article Number" on OJS only.

<a id="fn-s1"></a>
**s1 — scenario 1 seeding.** One scratch submission past the wizard (any
stage before publication) in the seeded journal; Journal Manager
account. The dashboard list renders `fullTitle` (prefix + title), so the
prefix check reads there or on the workflow header.

<a id="fn-s2"></a>
**s2 — scenario 2 seeding.** Scratch journal (the metadata settings are
mutated) with one scratch submission. Set Plain Language Summary to off
first, or every Metadata save is refused (A1).

<a id="fn-s3"></a>
**s3 — scenario 3 seeding.** A roster Author's own submitted submission
(the Author must be the submitter — the stage assignment is theirs);
Journal Manager to publish/unpublish. On OJS, publishing needs an issue
(a scratch future issue; "Assign To Future Issue and Publish
Immediately" publishes at once as continuous publication). The
scheduled leg needs a second submission of the same Author: reach the
scheduled state by saving "Assign To Future Issue and Schedule Only" on
Publication Settings FIRST, then re-picking it in the "Schedule For
Publication" panel (opened without that saved choice the panel can
publish instead — *Publish, schedule & versions*). The re-tick leg
is the Author's "Edit Assignment" on any stage screen's Participants
panel (live-probed 2026-08-28, all three apps: unticked after the
unpublish, Save restored the moment it was ticked).

<a id="fn-s4"></a>
**s4 — scenario 4 seeding.** One published scratch submission; the
landing page is the article page (OJS), the catalog book page (OMP), the
preprint page (OPS).

<a id="fn-s5"></a>
**s5 — scenario 5 seeding.** Scratch journal whose License settings are
set as stated, plus a second scratch journal with no default license and
empty License Terms for the absence control. The contributor-names
string in the holder description is `Publication::getAuthorString()`
(names joined with commas/"and", each with its role names in
parentheses — A11). Live-probed 2026-08-28 end to end on all three
apps (fn-g, fn-h, fn-l).

<a id="fn-s6"></a>
**s6 — scenario 6 seeding.** Scratch journal with two submission
languages (Settings › Website › Languages, both as submission AND
submission-metadata languages); one single-version unpublished scratch
submission; for the controls, one published submission and one with a
second version (Publish, schedule & versions' "Create New Version").
For the abstract leg the submission's section must require abstracts
(a section with "Do not require abstracts" shows the Title box only, as
does any press). Live-probed 2026-08-28 on all three apps (fn-i). The
OJS-only leg: an article published with "Assign To Future Issue and
Publish Immediately" into an unpublished future issue (Issues › Future
Issues › "Create Issue"); a seeded published item with no issue is the
hiding control. A5's scheduled case (OJS-only; a preprint server has no
scheduling): reach "Status: Scheduled" by saving "Assign To Future
Issue and Schedule Only" on the Publication Settings page first, then
re-picking it in the "Schedule For Publication" panel — opened without
that saved choice the panel published the article instead (*Publish,
schedule & versions*); the language-change probe did not reach the
state, so the leg is unverified.

<a id="fn-s7"></a>
**s7 — scenario 7 seeding.** Scratch journal (every submission in it is
rewritten); one published item with the scenario-5 override, one
unpublished submission and one declined one (OJS/OMP "Decline
Submission" at the Submission stage; OPS "Decline"). The 1970 leg needs
the journal at "Use the article's publication date" (OJS) or any
preprint server; a press keeps the current year (fn-h). Live-probed
2026-08-28 on all three apps (fn-k, f-a2, f-a3); the declined item
behaved exactly like the unpublished one on each app.

<a id="fn-s8"></a>
**s8 — scenario 8 seeding.** Scratch journal; the "Data" entry's
disappearance needs data citations disabled too (the entry also serves
them). The published page keeps rendering the stored statement (fn-f).

<a id="fn-s9"></a>
**s9 — scenario 9 seeding.** OJS scratch journal at `copyrightYearBasis`
= issue, a published back issue dated last year; the fallback (issue
without a date → current year) is fn-h. Seeding caveat (live 2026-08-28):
"Publish Issue" replaced a Date Published entered before publishing
with today's date, so an article published into it got the current
year — set the issue's date AFTER publishing it (Back Issues › Edit ›
"Issue Data" › Date Published; the issue page then reads "Published:
2025-06-15") and publish the article with "Assign To Current/Back
Issue" — the article then showed Copyright Year "2025" and the landing
line "Copyright (c) 2025 Alice Probe (Author)". The date overwrite is
the Issues feature's matter.

<a id="fn-s10"></a>
**s10 — scenario 10 seeding.** OMP scratch press with one Edited Volume
and one Monograph submission (work type is chosen in the wizard's start
form). Live-probed 2026-08-28 (f-omp4).

<a id="fn-s11"></a>
**s11 — scenario 11 seeding.** OPS roster Author; the wizard's License
section is the OPS `LicenseUrlForm` (fn-g). The Permissions & Disclosure
page is editorial-only, so the check runs as the Preprint Server Manager.
Live-probed 2026-08-28: the wizard's "For Readers" step carried the
"License" section (six CC radios + "Other license URL"); "CC
Attribution-ShareAlike 4.0" chosen; after "Post" the preprint page
showed "Copyright (c) 2026 Alice Probe (Author)", the CC BY-SA badge and
"This work is licensed under a Creative Commons Attribution-ShareAlike
4.0 International License." (f-ops2 for the description).

<a id="fn-f-a1"></a>
**f-a1 — A1 evidence.** `PKP\publication\Repository::validate()`: the
closure "validate the requirement of Plain language summary" adds
`validator.required` on `plainLanguageSummary.{primaryLocale}` whenever
`$context->getData('plainLanguageSummary') === METADATA_REQUIRE` and
`$props['plainLanguageSummary'][$primaryLocale]` is absent — `$props` is
the request body, so any form that does not send the field fails.
`editPublication()` calls `validate()` for every `PUT …/publications/{id}`
(Metadata, Data, Permissions & Disclosure, Issue/Catalog Entry,
Identifiers, the wizard's Details and For the Editors steps); the
wizard's Details form sends the field only when the setting is request
or require, and the start form never does. Code-read 2026-08-28.
Live-probed 2026-08-28 on all three apps
(manager, scratch context at "Require…"): untouched Save on Metadata,
Permissions & Disclosure and the entry page (OJS "Publication Settings")
answered 400 `{"plainLanguageSummary":{"en":["This field is
required."]}}` and showed "Please correct one error. Go to
plainLanguageSummary: This field is required. Jump to next error" with
no field marked; after storing the summary on Title & Abstract the same
saves still answered 400. On OMP/OPS the "Catalog Entry" / "Preprint
entry" page opened next in the same workflow session already showed
that summary with Save disabled — the error state carried over from
the previous form. Title & Abstract itself refused an emptied summary
in the browser with "Go to Plain Language Summary: This field is
required." Publish leg: OMP "Publish" and OPS "Post" completed (200,
"Status: Published"/"Posted") with no summary stored; OJS "Schedule For
Publication" › "Review Publishing Details" › Confirm answered 400 with
the same body, the panel stayed open with no error text. Wizard leg
(author, all three apps): "Begin Submission" created the submission but
the title write answered 400 and the wizard header read "{id} / Author"
with no title and no message; on Details with the summary empty,
Continue answered 400 and the dialog "Error An unexpected error has
occurred. Please reload the page and try again." appeared while the
rail moved to Contributors; with the summary filled, Details saved and
the Review step flagged the lost Title "This field is required."

<a id="fn-f-a2"></a>
**f-a2 — A2 evidence.** `Repo::submission()->resetPermissions()` calls
`_getContextLicenseFieldValue(null, PERMISSIONS_FIELD_COPYRIGHT_YEAR)`
with no publication → the submission's current publication. OJS
(`copyrightYearBasis === 'submission'`): `date('Y', strtotime(null))`
→ `strtotime(null)` is `false` → epoch → "1970". OPS: same expression
under `if ($publication)`. OMP guards with `if ($publication->getData('datePublished'))`
and keeps `date('Y')`. Code-read 2026-08-28. Live-probed 2026-08-28
(scratch manager; OJS switched to "Use the article's publication date"
first): after the reset the unpublished item and the declined item each
showed Copyright Year "1970" on OJS and OPS, "2026" on OMP, with holder
"Alice Probe (Author)" and the CC BY address, all fields enabled without
Override. OJS reset again at "Use the issue's publication date": the
unpublished item and the scheduled item "2026", the article published
in the 2025 issue "2025".

<a id="fn-f-a3"></a>
**f-a3 — A3 evidence.** `resetPermissions()` iterates
`Repo::submission()->getCollector()->filterByContextIds([$contextId])->getMany()`
— no status filter — and every entry of `$submission->getData('publications')`,
each through `Repo::publication()->edit()` (fn-c's log line per call).
Description string `manager.setup.resetPermissions.description`
("…for every published article…"). Code-read 2026-08-28. Live-probed
2026-08-28 on all three apps: the published item lost its "Example
Society" override (holder back to "Alice Probe (Author)", landing line
following); the unpublished and the declined item were rewritten as in
f-a2; the unpublished item's Activity Log gained one new first row
"2026-08-28 {manager's name} Submission metadata updated" (one version,
one line) above the author's own earlier "Submission metadata updated"
rows.

<a id="fn-f-a4"></a>
**f-a4 — A4 evidence.** fn-j: `publishPublication()` zeroes
`canChangeMetadata` on Author-role assignments; `unpublishPublication()`
contains no assignment code; `canEditPublication()` then denies the
author (no published version, but no `canChangeMetadata` assignment
either) and `Schema::canChangeMetadata()` returns false for an assigned
user without the flag. Code-read 2026-08-28. Live-probed 2026-08-28 on
all three apps: after "Unpublish" ("Unpost" on OPS) the Author's Title &
Abstract had Save disabled and no banner (the OPS author had saved
before the post); the manager's "Edit Assignment" for that Author
showed the "Permissions" box unticked; ticking it and pressing OK made
the Author's Save enabled and a title edit persisted.

<a id="fn-f-a5"></a>
**f-a5 — A5 evidence.** Client guard `submission.status !==
STATUS_PUBLISHED` (a scheduled OJS submission carries
`STATUS_SCHEDULED`); server `changeLocale()` refuses only
`$publication->getData('status') === PKPPublication::STATUS_PUBLISHED`.
Code-read 2026-08-28. Not reached live 2026-08-28: on two never-assigned
articles the "Review Publishing Details" panel, opened with no
assignment preselected, produced the "… published immediately as
continuous publication …" confirmation with a "Publish" button although
"Assign To Future Issue and Schedule Only" was checked, and published
(the Publication-Settings-first route schedules correctly — fn-s6); the
Change button was observed instead on the published-into-future-issue
article (f-ojs1).

<a id="fn-f-a6"></a>
**f-a6 — A6 evidence.** fn-i: the readout and the link are one component
pushed under one guard (`publications.length < 2 && status !==
STATUS_PUBLISHED`) in `getPrimaryControlsLeft`; the stage screens push
it unconditionally with the link off. Code-read 2026-08-28. Live-probed
2026-08-28 on all three apps (fn-i): the seeded published item and the
item given a second version through "Create New Version" showed no
readout on any Publication page (OJS 11/11, OMP 10/10, OPS 9/9) and
"Current Submission Language: English" without a button on every stage
screen.

<a id="fn-f-a7"></a>
**f-a7 — A7 evidence.** fn-d's live probe of 2026-08-28 (OJS and OPS,
section with word count 20): the over-limit save was refused by the
server with "The abstract is too long. It should be 20 words or less.
It is currently 40 words long."; the emptied abstract was refused in
the browser with "This field is required." and no request sent. The
code reading that opened the question ("`validate()` checks neither the
abstract's presence nor its length") was wrong on the length half; the
presence half is moot while the browser blocks first.

<a id="fn-f-a8"></a>
**f-a8 — A8 evidence.** fn-c: `canSubmit=false` disables the submit
button in `FormPage.vue`; no `isDisabled` reaches the fields. Code-read
2026-08-28. Live-probed 2026-08-28 (Author on the journal and press;
Copyeditor without the permission on OJS/OMP; Moderator on OPS): the
only read-only signal was the present-but-disabled "Save"; the Prefix
input and the Title editor accepted typing; no notice or banner text
anywhere on the page; a forced click sent nothing; a reload showed the
stored title.

<a id="fn-f-a9"></a>
**f-a9 — A9 evidence.** Live-probed 2026-08-28 (Author, "Start A New
Submission", all three apps): at "Ask the author…" the Details step
listed Title, Keywords, Abstract, Plain Language Summary, References,
Comments for the Editor (OMP "Cover Note to Editor", OPS "Comments for
the Moderator"), and the Review step's Details panel read "… Plain
Language Summary None provided …" when it was left empty; at "Require
the author…" the Details step showed "Plain Language Summary *
Required". The draft's code reading (`Details::__construct()` removing
the field) did not match the running wizard.

<a id="fn-f-a10"></a>
**f-a10 — A10 evidence.** Live-probed 2026-08-28 on all three apps
(manager, scratch context, Postgres test databases): with "ocean
acidification" saved as a keyword on one submission, typing "acid",
"ocean", "acidif" or "Ocean" in Keywords on a second submission — and
"oc" / "ocean acid" on the first — offered only the typed text; the
field's own lookup (`GET vocabs?vocab=submissionKeyword&…&term=…`,
observed in the browser's traffic) answered 200 with an empty list
every time. `PKPVocabController::getMany()` is the path (fn-e); whether
the install's database or the lookup is at fault was not settled — no
MySQL control was available.

<a id="fn-f-a11"></a>
**f-a11 — A11 evidence.** `PKPPublication::getAuthorString()` joins each
contributor's full name with `getLocalizedContributorRoleNames()` in
parentheses; `Submission::_getContextLicenseFieldValue()` (holder type
`author`) and the `copyrightHolder` description of
`PKPPublicationLicenseForm` both use it. Live-probed 2026-08-28 on all
three apps (one contributor "Alice Probe", role Author): description
"Copyright will be assigned automatically to Alice Probe (Author) when
this is published." before publishing; `copyrightHolder` "Alice Probe
(Author)" after publishing without an override and after the reset
tool; reader line "Copyright (c) 2026 Alice Probe (Author)" on the
article page, the book page's copyright line and the preprint page.

<a id="fn-f-a12"></a>
**f-a12 — A12 evidence.** `PKPLicenseForm` has no required rule on
`copyrightHolderOther` for `copyrightHolderType = other`;
`_getContextLicenseFieldValue()` then returns the empty
`copyrightHolderOther`. Live-probed 2026-08-28 on all three apps: the
settings save answered 200 with `copyrightHolderType: "other"`,
`copyrightHolderOther: {en: ""}`; a fresh item's page read "Copyright
will be assigned automatically to  when this is published." (two
spaces); publishing wrote `copyrightHolder: {en: ""}`; with an "Other
license URL" the article/preprint page's link read "License" and the
book page showed no copyright line.

<a id="fn-f-a13"></a>
**f-a13 — A13 evidence.** `permissions.tpl` binds the form through
`AjaxFormHandler` with `confirmText`; the submit button is disabled on
click and only re-enabled by the form's response, which a dismissed
`confirm()` never produces. Live-probed 2026-08-28 on all three apps:
after Cancel (dialog dismissed) no request went to `resetPermissions`,
no toast appeared, the item's Permissions & Disclosure was unchanged,
and the button was still greyed two seconds later; a reload restored it.

<a id="fn-f-a14"></a>
**f-a14 — A14 evidence.** `ChangeSubmissionLanguageMetadataForm` takes
the `TitleAbstractForm` fields that are `isRequired` — the abstract when
the section requires abstracts — and sets their descriptions to
`…metadataDescription.title` / `…metadataDescription.abstract`
("Including the abstract in {$language} is recommended. …"). Live-probed
2026-08-28 (OJS "Articles" section and the OPS "Preprints" section, both
requiring abstracts): "Abstract *" with "Required" and that description;
Confirm with it empty was refused in the browser with "This field is
required." and no request; "Do not require abstracts" sections (OJS,
OPS) and OMP showed no Abstract box.

<a id="fn-f-a15"></a>
**f-a15 — A15 evidence.** Mechanism: the modal store
(`workflowChangeSubmissionLanguageModalStore.js`) repopulates the
metadata boxes (`setCustom`) only once its publication fetch fills
`publicationProps`; until that, the `changeLanguageMetadata` form fetch
and the TinyMCE editors' init settle, the panel renders and accepts input
against stale or empty state. Observed live 2026-08-28 (pinned apps)
while building the suites — Journal/Press/Preprint Server Manager, a
Publication page › "Change": OJS — the boxes revealed by picking the new
language kept the OLD language's guidance and prefill, permanently for
that opening. OMP — Confirm pressed on a freshly (re)opened panel was
accepted with the required Title EMPTY; the submission language changed
and Title & Abstract afterwards showed "0/2 languages completed"
(reproduced ~3 of 5 attempts under test timing). OPS — the new
language's boxes opened nondeterministically empty or holding the
CURRENT language's text, and confirming the pre-filled state stored the
old language's text as the new language's title. Settled-state control:
with the panel left to finish loading, the same OMP Confirm was refused
with "This field is required." / "Please correct one error.", and
prefill matched the stored values on all three apps (fn-i) — Rule 13b's
settled-state claims stand and the suites assert them. The suites' timing
workarounds are the campaign ledger's record
(`docs/tracking/app-changes.md`, row 6; app code unchanged).

<a id="fn-f-ojs1"></a>
**f-ojs1 — OJS1 evidence.** An OJS submission whose publication is
published into an unpublished issue carries the SUBMISSION status
`STATUS_SCHEDULED` (OJS `Repository::updateStatus()` derives it from the
issue), so the client guard `submission.status !== STATUS_PUBLISHED`
(fn-i) keeps the readout and button, while the server refuses on the
PUBLICATION's `STATUS_PUBLISHED`. Live-probed 2026-08-28 (scratch
manager, future issue "Vol. 9 No. 9 (2099): P4 Future Issue" created
via Issues › Future Issues › "Create Issue"): the article published into
it showed "Current Submission Language: English Change" beside "Status:
Published" and the editorial banner on Title & Abstract, and its
article page rendered under "Home / Archives / Vol. 9 No. 9 (2099) …";
Change › French (Canada) › Title + Abstract › Confirm → `PUT
…/changeLocale` 403 with the body quoted in fn-i, shown as the toast,
panel unchanged. The seeded published item without an issue showed no
readout (f-a6).

<a id="fn-f-omp1"></a>
**f-omp1 — OMP1 evidence.** fn-l template comparison (OMP
`monograph_full.tpl` vs OJS `article_details.tpl` / OPS
`preprint_details.tpl`). Code-read 2026-08-28. Live-probed 2026-08-28
(fn-l): the book page's separate "Copyright (c) 2026 Example Society"
row between "Versions" and "License", and the copyright line shown even
with no license and no terms, where the article and preprint pages
showed nothing.

<a id="fn-f-omp2"></a>
**f-omp2 — OMP2 evidence.** fn-d: OMP's `SubmissionController` does not
override `getPublicationTitleAbstractForm()`; `TitleAbstractForm`
defaults `$abstractWordLimit = 0`, `$isAbstractRequired = false`.
Code-read 2026-08-28.

<a id="fn-f-omp3"></a>
**f-omp3 — OMP3 evidence.** fn-k string comparison (`omp/locale/en/manager.po`
vs `ojs/locale/en/manager.po` / `ops/locale/en/manager.po`). Code-read
2026-08-28. Live-probed 2026-08-28: the press's description and confirm
text as quoted in fn-k; the tool's effect identical to the journal's
and the server's (f-a2, f-a3).

<a id="fn-f-omp4"></a>
**f-omp4 — OMP4 evidence.** fn-g: `APP\components\forms\publication\PublicationLicenseForm`
(OMP) adds `chapterLicenseUrl` for `Submission::WORK_TYPE_EDITED_VOLUME`;
schema `omp/schemas/publication.json` `chapterLicenseUrl` (`url`).
Code-read 2026-08-28. Live-probed 2026-08-28 (scratch press manager):
the Monograph's page had no such input; the Edited Volume's showed
"Default Chapter License URL", disabled, empty, with "Override" and
"The license will be set automatically to CC Attribution 4.0 when this
is published."; an override to the CC BY-SA address survived Save and
reload (enabled, no Override); after the volume's own License URL was
overridden to CC BY-NC the chapter field's sentence read "The license
will be set automatically to CC Attribution-NonCommercial 4.0 when this
is published."

<a id="fn-f-omp5"></a>
**f-omp5 — OMP5 evidence.** `monograph_full.tpl` prints
`<a href="{$publication->getData('licenseUrl')}">{translate key="submission.license"}</a>`
whenever there is no CC badge, without checking that `licenseUrl` is
set; the OJS/OPS templates print the link only inside the `licenseUrl`
branch (fn-l). Live-probed 2026-08-28 (control press, License Terms
"Terms-only paragraph omp." and no license): block `<h2 class="label">
License </h2> <a href=""> License </a> <p>Terms-only paragraph omp.</p>`;
the journal and the server rendered heading + paragraph only.

<a id="fn-f-ops1"></a>
**f-ops1 — OPS1 evidence.** fn-b: `ops/registry/userGroups.xml` author
group `permitMetadataEdit="true"`; OJS/OMP author groups carry no such
attribute. Consistent with the live observation recorded for the Funding
page (see *Funding*, OPS1). Code-read 2026-08-28. Live-probed
2026-08-28 (fn-b, fn-j): the preprint author's Title & Abstract saved
before the post and was locked after it; the journal and press authors
were read-only from the start.

<a id="fn-f-ops2"></a>
**f-ops2 — OPS2 evidence.** `PKPPublicationLicenseForm` sets the
`licenseUrl` description from the CONTEXT's `licenseUrl` regardless of
the publication's stored value, and `optIntoEdit` only decides the
lock. Live-probed 2026-08-28 (scratch server; preprint created through
the wizard with "CC Attribution-ShareAlike 4.0" on the "For Readers"
step, where the server default "CC Attribution 4.0" arrived
pre-selected — the wizard's matter): before posting, "Preprint:
Permissions & Disclosure" showed License URL
`https://creativecommons.org/licenses/by-sa/4.0`, enabled, no Override,
description "The license will be set automatically to CC Attribution
4.0 when this is posted."; posting kept the BY-SA address (badge and
sentence on the preprint page).

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| "Title & Abstract" page | workflow screen → Publication → Title & Abstract | AFFW-395 |
| "Metadata" page (+ empty message) | workflow screen → Publication → Metadata | AFFW-397 · AFFW-430 |
| "Data" page (data availability statement) | workflow screen → Publication → Data | AFFW-400 |
| "Permissions & Disclosure" page | workflow screen → Publication → Permissions & Disclosure (editorial roles) | AFFW-421 |
| Published-version banner (editorial) | any Publication page of a published version | AFFW-379 |
| Published-version banner (author) | any Publication page of a published version, author view | AFFW-380 |
| "Current Submission Language" readout | every stage screen (link suppressed) | AFFW-281 |
| "Change" button → Change Submission Language panel | Publication pages (editorial) → Change | AFFW-285 · AFFW-381 · AFFW-382 · AFFW-457 · AFFW-458 · AFFW-459 · VUE-085 |
| Settings › Distribution › License form | Settings → Distribution → License | AFFM-090 |
| Tools › Permissions › Reset permissions | Tools → Permissions → "Reset Article Permissions" | AFFM-163 (tab bar AFFM-161 and page ops ROUTE-018 belong to *Import & export*) |
| License block on the landing page | published item's page | AFFR-065 (the data-availability / funding-statement blocks ride AFFR-063, owned by *Funding*) |
| Term suggestions API | `vocabs?vocab=…&locale=…&submissionId=…` | API-049 |
| Publication forms API | `submissions/{id}/publications/{id}/_components/{titleAbstract,metadata,dataAvailability,permissionDisclosure,changeLanguageMetadata}` + `PUT …/publications/{id}` + `PUT …/changeLocale` (the omnibus controller is *Workflow screen & stage access*'s) | API-061 (OMP's `permissionDisclosure` re-registration; its `catalogEntry` component is *Catalog management*'s) |
| Publication record shape | — | SET-019 (shared), SET-032 (OJS), SET-037 (OMP), SET-043 (OPS) |
| Vocabulary browser modal | not reachable from this feature's pages at the pinned commits — serves the Categories picker in the wizard's "For the Editors" step (*Submission wizard*) and the dashboard filters (*Submissions dashboard*) | VUE-090 (waived here, delegated to those specs) |
| "View submission metadata" modal | its template does not exist in any pinned checkout — dead candidate | AFFW-711 (waived; proposed for the unassigned list) |

## Reference — code anchors

- `lib/pkp/api/v1/submissions/PKPSubmissionController.php` —
  `editPublication()`, `changeLocale()`, `copyMultilingualData()`,
  `getPublication{TitleAbstract,Metadata,DataAvailability,License}Form()`,
  `getChangeLanguageMetadata()`, `publishPublication()` (author flag
  reset); OJS/OPS `api/v1/submissions/SubmissionController.php`
  (title/abstract section policy), OMP's (`permissionDisclosure`).
- `lib/pkp/classes/components/forms/publication/{TitleAbstractForm,PKPMetadataForm,PKPDataAvailabilityForm,PKPPublicationLicenseForm}.php`,
  OMP `classes/components/forms/publication/PublicationLicenseForm.php`,
  `lib/pkp/classes/components/forms/submission/ChangeSubmissionLanguageMetadataForm.php`.
- `lib/pkp/classes/publication/Repository.php` (`validate()`, `edit()`,
  `publish()`), `lib/pkp/classes/submission/Repository.php`
  (`canEditPublication()`, `resetPermissions()`), each app's
  `classes/submission/Submission.php` (`_getContextLicenseFieldValue()`),
  `lib/pkp/classes/submission/maps/Schema.php` (`canChangeMetadata()`).
- `lib/pkp/schemas/publication.json` + app overlays; `lib/pkp/schemas/context.json`
  (metadata and license settings).
- `lib/ui-library/src/pages/workflow/composables/useWorkflowPermissions.js`,
  `useWorkflowConfig/workflowConfig{Editorial,Author}{OJS,OMP,OPS}.js`,
  `useWorkflowNavigationConfig/*.js`;
  `components/publication/{WorkflowPublicationForm,WorkflowPublicationEditWarning,WorkflowPublicationEditDisabled,WorkflowChangeSubmissionLanguage}.vue`;
  `modals/WorkflowChangeSubmissionLanguageModal.vue` + store;
  `components/Form/fields/{FieldControlledVocab,FieldText,FieldRichText,FieldRichTextarea}.vue`.
- `lib/pkp/api/v1/vocabs/PKPVocabController.php` — term suggestions.
- `lib/pkp/pages/management/PKPToolsHandler.php` +
  `lib/pkp/templates/management/tools/{index,permissions}.tpl`.
- `lib/pkp/classes/components/forms/context/{PKPLicenseForm,PKPMetadataSettingsForm}.php`
  + each app's `LicenseForm.php` / `MetadataSettingsForm.php`.
- `templates/frontend/objects/article_details.tpl` (OJS) /
  `monograph_full.tpl` (OMP) / `preprint_details.tpl` (OPS) — reader
  blocks (forked copies); `PKPApplication::getCCLicenseBadge()`.

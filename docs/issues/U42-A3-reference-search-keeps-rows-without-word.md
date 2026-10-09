# "Search references here" keeps references whose text does not contain the typed word

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (code; one free-text References box, no search)
  - 3.4: none (code; one free-text References box, no search)
  - 3.3: none (code; one free-text References box, no search)
- **Introduced** `pkp/ui-library#716` for `pkp/pkp-lib#10692` · [c2f8e07d](https://github.com/pkp/ui-library/commit/c2f8e07d19caa0f6b2385d1ca48fc716d85d07c0) · 2025-09-16 · Božana Bokan (bozana), commits by GaziYucel; widened to numbers and yes/no values by `pkp/ui-library#733` for `pkp/pkp-lib#11902` · [8cecf866](https://github.com/pkp/ui-library/commit/8cecf8665a8ba750401808dd4f22d67abfac6b4e) · 2025-10-24
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U42 [A3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U42-citations-and-references.md#a3)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-09: `pkp/pkp-lib#13475` (for `pkp/pkp-lib#13455`, merged
2026-10-08) removed each reference record's own API address (`_href`)
from what the server sends, and so from what the search reads. That
address held "citations" and "http", so both words used to keep every
reference; for references like the five of the Steps they now keep
none, which is right. The search still reads the record's other hidden
values.

## Summary

"Search references here", on a submission's "References" page, keeps
references whose row does not show the typed text. It also matches
values stored with each reference that no row displays: the reference's
record number, its position in the list, its publication's record
number, its lookup status (0 when no metadata lookup was requested for
it), and a yes/no value saying whether its details (authors, title,
DOI) have been filled in.

So a number typed to find a volume or a page also keeps the references
whose hidden numbers contain it: "5" keeps the fifth reference of a
list where no row shows a 5, and "0" keeps every reference. Words go
right, apart from a few: "false" and "null" keep every reference.
Nothing is changed or lost, and clearing the search shows the whole
list again.

That is with "Enable references structuring and metadata lookup" off,
as it is on a new journal, press or server. With it on, more is stored
out of sight, so more searches keep extra rows: a word held only by a
reference's "Publisher or Host" kept its row, and "true" kept the one
reference whose details were filled in.

## Impact

- **Lost** Nothing.
- **Who** Anyone who opens a submission's "References" page and
  searches it for a number: the editors who may change the list, and
  authors and others who see the page read-only, where the search works
  too. A short number is some reference's position in any long list; a
  year matches a hidden number only once the site's record numbers
  reach the thousands (read in the code, not walked).
- **Way round** Reading the rows that are kept; the references whose
  text holds the typed word are always among them.

Low: no reference is lost from a result; the search adds rows, on
number searches and a few words.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS, OMP or OPS. Its journal,
  press and server ask for references (Settings › Workflow › Submission
  › Metadata, "References"), so the workflow offers "References". No
  submission has a reference.
- "Enable references structuring and metadata lookup", under
  "References Metadata Lookup" on the same page, is off, as it is in
  the dataset and on a new journal, press or server. The install then
  stores a reference's text and, when the text holds one, its DOI. With
  the setting on it also runs a lookup for each reference after "Add",
  and the lookup status is no longer 0, so step 5 no longer keeps every
  row (read in the code).

Steps:

1. Sign in as `dbarnes` and open submission 8, "Traditions and Trends in
   the Study of the Commons" (OJS), 3, "The Political Economy of
   Workplace Injury in Canada" (OMP), or 1, "The influence of lactation
   on the quantity and quality of cashmere production" (OPS).
2. Open "Publication" ("Preprint" on OPS) › "References".
3. Type these five lines into the "References" box and press "Add":

   ```
   Alpha study 2020
   Beta trial 2021
   Gamma report 2022
   Epsilon note
   Zeta final piece
   ```

4. Type `false` into "Search references here" and press Enter.
5. Press the box's "Clear search phrase" (×), type `0` and press Enter.
6. The same with `5`.

**Expected.** Steps 4 and 6 keep no row, since no reference shows
"false" or a 5. Step 5 keeps the three references with a year, not
"Epsilon note" or "Zeta final piece".

**Observed.** Steps 4 and 5 keep all five rows: "Alpha study 2020",
"Beta trial 2021", "Gamma report 2022", "Epsilon note", "Zeta final
piece". Step 6 keeps "Zeta final piece", the fifth reference.

Control: `epsilon` keeps "Epsilon note" alone, `ZETA piece` keeps "Zeta
final piece" alone, and `2021` keeps "Beta trial 2021" alone.

## Cause

The table lists `citationsFiltered` from the ui-library's
`citationManagerStore.js`
(`lib/ui-library/src/managers/CitationManager/citationManagerStore.js`,
lines 250 to 270). For each reference it takes every value of the
reference's record as the REST API sends it (the keys dropped), turns
them into one JSON string with `JSON.stringify()`, and keeps the row
when that string contains each typed word.

The record holds more than the row shows (`lib/pkp/schemas/citation.json`,
mapped by `PKP\citation\maps\Schema::mapByProperties()`):

- `id`, `seq` (the position in the list, from 1) and `publicationId`. A
  typed number that one of them contains keeps the row: step 6's "5" is
  the fifth reference's `seq` and, on a fresh dataset, its `id`.
- `processingStatus`: 0 when no lookup was requested
  (`CitationProcessingStatus::NOT_PROCESSED`), which is every reference
  added with lookup off, so "0" keeps them all. With lookup on it is -2
  (queued), -1 (failed) or 1 to 5 (5 is processed).
- `isStructured`: `false` until the reference has an identifier, a
  title and an author (`Citation::isStructured()`).
- Most fields that are not filled in, sent as `null`, which
  `JSON.stringify()` writes as that word (`date` is sent as `''` and
  `authors` as `[]`).
- With lookup on, words and addresses the row does not show as text:
  `type` and `sourceType` (such as "journal-article" and "journal"),
  `sourceHost` and `sourceIssn`; each author's `orcid` (shown as an
  icon), `openAlex` and `wikidata` (not shown); and the reference's own
  `openAlex` and `wikidata` addresses (shown as badges named "OpenAlex"
  and "Wikidata"). The addresses match "http".
- `rawCitationWithLinks`: the reference's text again, with
  `<a href='…' target='_blank'>` around an http, https or ftp address
  when the text holds one (`Citation::getRawCitationWithLinks()`).

JSON's punctuation is in the string too: `"` keeps all five rows of the
Steps, as `null` does.

The row itself shows less, and what it shows depends on the lookup
setting (`CitationManagerCellCitation.vue`). With lookup off it shows
the reference's text alone. With lookup on it shows the DOI, URL, arXiv
ID, handle and URN; then, for a reference whose details are filled in,
its title and, expanded, its authors, source, date, volume, issue, pages
and text; for any other reference its text; and a badge, "No structured
information found" or "Metadata lookup failed", where one applies.

The first version of the search
([c2f8e07d](https://github.com/pkp/ui-library/commit/c2f8e07d19caa0f6b2385d1ca48fc716d85d07c0))
looked for the whole phrase in every text value of the record, shown or
not.
[8cecf866](https://github.com/pkp/ui-library/commit/8cecf8665a8ba750401808dd4f22d67abfac6b4e)
replaced that with the JSON string. The search now matches each typed
word on its own, and the numbers, the yes/no value, `null` and the
punctuation came in with `JSON.stringify()`.

Nothing on record asks for the search to read values no row shows.
8cecf866 is part of `pkp/ui-library#733` for `pkp/pkp-lib#11902`, whose
list is identifier validation, dropdowns for type and source type, the
lookup setting moved to the journal, and "reprocess all"; the search is
not on it, nor in the commit message. `pkp/pkp-lib#10692`, the
feature's issue, names it only as a line of its test list ("Test Search
citations field"). The filter's own comment, "remove all keys from
object and search in values only", gives its aim: keep field names out
of the match. Hence Kind: defect.

Reach:

- Only the References table filters this way (checked in the code). The
  components that filter in the browser name the fields they search
  (`ManageEmailsPage.vue`: a mailable's `name` and `description`;
  `InsertContent.vue`: an item's `key`, `value` and `description`), and
  the other managers' stores send the phrase to the server.
- With lookup on (walked on OMP): a reference given a URL, a title, an
  author and a "Publisher or Host" in "Edit citation" was kept by a
  word only its "Publisher or Host" (`sourceHost`) held, and by "true".
- With lookup on (code): "5" matches every reference whose lookup has
  completed (status 5), and a word such as "journal" or "book" every
  reference whose stored `type` or `sourceType` holds it.

## Proposed fix

Search the text the row shows, expanded or not, following the row's
mode: with lookup off the reference's text alone; with lookup on also
its identifiers, and for a reference whose details are filled in, the
details the row displays. Once lookup is switched off, a reference
that got a title or a DOI while it was on matches on its text alone,
because its row shows nothing else. A DOI stored with lookup off is
always in the text (`Repository::importCitations()` takes it from
there), so not reading `doi` then loses nothing. Each typed word must
still appear, as today: the components named above match the
whole phrase, but per-word matching is the page's shipped behaviour and
lets an editor search an author with a year. The diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/reference-search-keeps-rows-without-word/fix.diff):

```diff
 				? data.filter((citation) => {
-						// remove all keys from object and search in values only
-						let values = Object.values(citation).map((value) => { … });
-						return searchWords.every((word) => {
-							return JSON.stringify(values).toLowerCase().includes(word);
-						});
+						const text = getSearchableText(citation);
+						return searchWords.every((word) => text.includes(word));
 					})
+		function getSearchableText(citation) {
+			const values = [citation.rawCitation];
+			if (citationsMetadataLookup.value) {
+				values.push(citation.doi, citation.url, citation.arxiv, citation.handle, citation.urn);
+				if (citation.isStructured) {
+					values.push(
+						citation.title, citation.sourceName, citation.date,
+						citation.volume, citation.issue, citation.firstPage, citation.lastPage,
+						...(citation.authors || []).flatMap((author) => [
+							author?.givenName,
+							author?.familyName,
+						]),
+					);
+				}
+			}
+			return values
+				.filter((value) => value !== null && value !== undefined)
+				.join(' ')
+				.toLowerCase();
+		}
```

Tried on `main` on 2026-10-09, on OJS, OMP and OPS with lookup off:
steps 4 and 6 keep no row and step 5 keeps the three references with a
year. The control words keep the same single rows as without the fix,
and clearing the search shows all five. With lookup on (OMP), the
reference edited as in the Cause's "Reach" is found by a word of its
title, its author's family name and its own text, and no longer by the
word only its "Publisher or Host" holds, nor by "true".

**Alternatives**

- Search the same fields whatever the setting: a reference's hidden
  title or DOI would still match with lookup off, the fault this report
  is about.
- Leave out only the ids: the yes/no value, the processing status, the
  empty fields and the fields no row shows would still match.
- Search the row's rendered text in the page: it would miss what a
  structured reference shows only when expanded.

**What goes with it**

- The date matches as stored (`2020-01-05`), while the row shows it
  formatted; a year matches either way.
- The row shows the pages only when both the first and the last are
  set; the fix matches either.
- With the fix, a search that keeps no row shows the empty list's line,
  "The citations list is empty, please add citations above.", as any
  search without a match does today. It reads as if the list had no
  reference; a line such as "No reference matches the search" would
  suit, a wording change apart from this fix.
- A guard: a ui-library unit test of the store's filter, or an
  end-to-end test of the search in pkp-e2e (planned in its spec U42).

Small: one function in one ui-library store, following the
named-fields pattern of the components that filter in the browser,
tried as written.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/reference-search-keeps-rows-without-word/walk.js)
  (helpers in `../pasted-repeat-reference-dropped-saved/lib.js`) takes
  the Steps on PKP's default test dataset, freshly loaded:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/reference-search-keeps-rows-without-word/walk.js`.
  After the Steps the same walk types `citations`, `http`, `null`, `"`
  and the three control words. `MODE=nb` runs the control words alone.
  `MODE=lookup` is the lookup-on walk: `rvaca` ticks "Enable references
  structuring and metadata lookup"; `dbarnes` adds "Delta paper 2023"
  and "Epsilon note", gives the first a URL, a title, an author and a
  "Publisher or Host" in "Edit citation", and searches a word of the
  title, the author's family name, `delta`, the word only "Publisher or
  Host" holds, and `true`.
- Walked on `main` on 2026-10-09, PostgreSQL, pkp/datasets 1a196c3
  (2026-10-08), at OJS 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP 57a9235110
  and OPS fd78a0bcd8 (lib/pkp 27938abd4c), ui-library 38814ea1 on the
  three. `citationManagerStore.js`, `citation.json`, `maps/Schema.php`
  and `CitationManagerCellCitation.vue` are the same in the three
  checkouts. On each app: `false`, `0`, `null` and `"` kept all five
  rows; `5` kept "Zeta final piece"; `citations` and `http` kept none
  ("The citations list is empty, please add citations above."); the
  control words kept one row each. No server error or script error was
  logged.
- Lookup on, without the fix, walked on OMP alone: every one of the
  five searches kept the edited reference's row, "Epsilon note" never.
  What a lookup itself stores (the status after it has run, `type`,
  `sourceType`, the addresses) was not walked: those bullets of the
  Cause are read from `citation.json`, `CitationProcessingStatus` and
  `CitationManagerCellCitation.vue`.
- The lookup setting's default: `citationsMetadataLookup` has no
  default in `lib/pkp/schemas/context.json` and nothing sets it when a
  journal, press or server is created (a search of the app and
  `lib/pkp` for the name); the dataset has it off on the three apps.
- That a year can match a record number (Impact, "Who") follows from
  the code read and was not walked: the dataset's record numbers are
  too small.
- The fix, tried on 2026-10-09 at the same commits:
  `node bin/try-fix.js apply shared/playwright/checks/issues/reference-search-keeps-rows-without-word/fix.diff ojs omp ops`,
  the kept script on the three apps, `MODE=lookup` on OMP, then
  `revert`. With the fix `null` and `"` kept no row either. The control
  words ride in the same walk, with the fix and without it.
- What `pkp/pkp-lib#13475` changed: pkp-lib
  [cf7e3e494c](https://github.com/pkp/pkp-lib/commit/cf7e3e494c3002803c14d55536f4a1337c398963)
  removed `_href` from `schemas/citation.json` and
  `classes/citation/maps/Schema.php`, and made `isStructured` and
  `processingStatus` read-only in the API; both are still sent.
- What the search was meant to read: the bodies of `pkp/pkp-lib#11902`
  and `pkp/ui-library#733`, the comments of `pkp/pkp-lib#11902`,
  `pkp/ui-library#733` and `pkp/pkp-lib#10692`, and the message of
  8cecf866 were read for "search" and "filter" on 2026-10-09.
- 3.5 (code): `stable-3_5_0` at OJS c6e2c3a879 (lib/pkp d702d012dd),
  OMP ddc6abf5a9 and OPS dc8a938ab0 (lib/pkp 8094f06bf5), ui-library
  2576e00a: one "References" box (`PKPCitationsForm`, field
  `citationsRaw`), no `schemas/citation.json` and no `CitationManager`
  in ui-library, so no list and no search to walk.
- 3.4 and 3.3 (code): `upstream/stable-3_4_0` (OJS 4dc0c17acf, lib/pkp
  8bf0ab5072, ui-library ee684b34) and `stable-3_3_0` (OJS a752a1ce8e,
  lib/pkp 8c5b3f7f5c, ui-library 96959f9e): the same free-text box and
  no `CitationManager`.
- Trackers searched on 2026-10-09: `pkp/pkp-lib`, `pkp/ui-library` and
  `pkp/ojs`. `pkp/pkp-lib#13455` lists the removal of `_href` and does
  not mention the search.

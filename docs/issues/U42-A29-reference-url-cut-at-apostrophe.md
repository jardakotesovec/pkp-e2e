# A data citation's URI or PURL, and the address the lookup takes from a reference, are saved cut at an apostrophe

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no reference lookup, no data citations)
  - 3.4: none (code; no reference lookup, no data citations)
  - 3.3: none (code; no reference lookup, no data citations)
- **Introduced** `pkp/pkp-lib#12268` for `pkp/pkp-lib#11902` · [5d1dbf0126](https://github.com/pkp/pkp-lib/commit/5d1dbf0126e5b88012fdeaaccaaac1d486469e64) · 2026-01-29 · Bozana Bokan (bozana)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U42 [A29](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U42-citations-and-references.md#a29)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

An editor who adds a data citation of type "URI" with the address
"https://example.org/kilo's-data" sees it saved, without a word, as
"https://example.org/kilo": the address ends where the apostrophe was.
Type "PURL" is cut the same way, and an address with brackets in it,
such as a Wikipedia page "…/wiki/Estuary_(landform)", loses everything
from the "(" on.

With metadata lookup on, the lookup reads the web address out of each
reference into the reference's "URL" field, and cuts it the same way:
the reference's row on the "References" page links
"https://example.org/kilo", and "Edit citation" shows it in "URL". The
reference's own text stays whole.

Both features exist only on `main` and the `ore` branch, in no 3.x
release, and both are off until a manager turns them on. Once a journal or preprint server
uses them, the cut identifier goes out in its deposits.

## Impact

- **Lost** The data citation's identifier, stored wrong without a
  message. A journal sends it in its JATS XML and its Crossref and
  DataCite deposits, and a preprint server in its Crossref deposit; a
  press sends it in no export, only through the REST API. The
  reference's cut "URL" goes out only in the JATS XML of a reference the
  lookup or an editor completed with title and authors.
- **Who** Editors and authors adding a data citation of type "URI" or
  "PURL", and every reference the lookup processes, whenever the
  address holds an apostrophe or brackets (Wikipedia pages, some
  repositories). Other data citation types (DOI, Handle, ARK and the
  rest) have patterns of their own and keep these characters.
- **Way round** For a data citation, type the apostrophe as "%27" and
  the brackets as "%28" and "%29". For a reference, type the whole
  address into "URL" in "Edit citation" and save: it is kept, until a
  "Reprocess" reads the text again.

Medium: a narrow input, but the wrong identifier is stored silently and
goes out in deposits. That the features are not released yet makes it
cheap to fix, not less severe.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS, OMP or OPS. In it,
  metadata lookup and data citations are off; step 2 turns them on. The
  steps use submission 5 (OJS, "Genetic transformation of forest
  trees"), 4 (OMP, "How Canadians Communicate: Contexts of Canadian
  Popular Culture") or 1 (OPS, "The influence of lactation on the
  quantity and quality of cashmere production"), each unpublished.

Steps:

1. Sign in as `dbarnes`.
2. Open Settings › Workflow › "Metadata", tick "Enable references
   structuring and metadata lookup" and "Enable data citation
   metadata", choose "Ask the author for data citation metadata during
   submission.", and press "Save".
3. Open submission 5 (OJS), 4 (OMP) or 1 (OPS), then "References" in
   its "Publication" ("Preprint") menu. Type these two lines into the
   "References" box and press "Add":

   ```
   Kilo, A. (2024). Kilo's field notes hkq23c. https://example.org/kilo's-page
   Estuary, B. (2024). Estuaries hkq23c. https://en.wikipedia.org/wiki/Estuary_(landform)
   ```

4. Wait until each row shows a web address under it, and open each
   row's "More Actions" › "Edit": read "URL", then press "Close".
5. Open "Data" in the same menu and press "Add Data Citation". Type the
   title "Kilo survey hkq23c", choose the identifier type "URI", type
   the identifier `https://example.org/kilo's-data`, choose the
   relationship type "Supporting data without specifying whether they
   were generated or analyzed (supporting).", and press "Save".
6. Read the new row of "Data Citations".

**Expected.** The rows link, and "URL" holds,
"https://example.org/kilo's-page" and
"https://en.wikipedia.org/wiki/Estuary_(landform)". The data citation's
row shows "https://example.org/kilo's-data".

**Observed.**

| Where | Shows |
|---|---|
| First reference: row link and "URL" | https://example.org/kilo |
| Second reference: row link and "URL" | https://en.wikipedia.org/wiki/Estuary_ |
| Data citation row (saved with 200, no message) | https://example.org/kilo Kilo survey hkq23c |

With lookup off the data citation is cut the same way. The reference's
"URL" is then stored cut too, but "Edit citation" shows only "Edit Raw
Citation" and the row shows the text alone.

## Cause

`PKP\pid\Url::regexes` (`lib/pkp/classes/pid/Url.php`, line 23), the
pattern that finds a web address in text, allows these characters
after the host:

```
[-a-zA-Z0-9@:%_\+.~\#?&//=]*
```

It leaves out the RFC 3986 characters `'`, `(`, `)`, `!`, `$`, `*`,
`,` and `;`, which an address may hold in its path or query, so a match
ends at the first of them. `BasePid::extractFromString()` returns that
match, and every caller stores it:

- `ExtractPidsHelper::execute()` stores it as the reference's `url`,
  both in the lookup's first step (`ExtractPidsJob`) and on "Add" with
  lookup off.
- `DataCitation`'s `saving` hook replaces a "URI" or "PURL" data
  citation's identifier with it (`Purl` extends `Url` with no pattern
  of its own), and `dataCitation\Repository::validate()` checks the cut
  value, which `Url::validationRegexes` (same character list) accepts.

The pattern came with
[5d1dbf0126](https://github.com/pkp/pkp-lib/commit/5d1dbf0126e5b88012fdeaaccaaac1d486469e64)
(`pkp/pkp-lib#11902`). Its PR says the old pattern
(`[^\s\]\[\<\>]*`, the one `Citation::getRawCitationWithLinks()` still
uses) took the `"` that ends an address written as
`<a href="https://pubmed.ncbi.nlm.nih.gov/31382596">`. The new list
stops there, and at the apostrophe and brackets too. Data citations,
which came later (`pkp/pkp-lib#12455`), have used the class since they
began.

Reach:

- The reference's row on the "References" page and "Edit citation"'s
  "URL" (lookup on). Seen on screen.
- "URI" and "PURL" data citations on the "Data" page. Seen on screen.
  By the code, the submission wizard's "Data" section too, which saves
  through the same repository.
- Outputs, read in the code: OJS's JATS XML (`ArticleBack::appendDataCitation()`
  writes a data citation's identifier as a `pub-id`; a reference's `url`
  becomes an `ext-link` only in the `element-citation` of a reference
  with title and authors), its Crossref deposit
  (`ArticleCrossrefXmlFilter::createDataCitationRelatedItemNode()`) and
  DataCite deposit (`DataciteXmlFilter`), OPS's Crossref deposit, and
  the REST API's citation and data citation properties. The Crossref
  deposits send a reference's text or DOI, not its `url`.
- Other data citation types use their own classes: run on today's code,
  a DOI with brackets (`https://doi.org/10.1002/(SICI)1097-4571(199806)49:8`),
  a DOI, Handle or ARK with an apostrophe are kept whole.
- Stored data: references and data citations saved since the pattern
  came hold the cut value.

## Proposed fix

Let the pattern take every character RFC 3986 allows in a path or
query, in both `Url::regexes` and `Url::validationRegexes` (add
`!$'()*,;` to the character list), and take the punctuation that may
follow an address off its end: `BasePid::trimTrailingPunctuation()`
already removes a trailing ".", ",", ";" or ":" and a ")" that closes a
bracket opened before the address, and a short override in `Url` adds
a trailing `'`, `!` and `*` (a closing single quotation mark, an
exclamation mark, Markdown emphasis). The diff, against an app's root:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/reference-url-cut-at-apostrophe/fix.diff).

The `"`, `<` and `>` stay out of the pattern, as `pkp/pkp-lib#11902`
wanted. The fix stays in the class that owns the pattern, so references,
both data citation types (`Purl` inherits it) and their validation all
follow.

Tried on OJS, OMP and OPS `main`: both references link, and "URL"
holds, the whole addresses, and the data citation is saved as typed.
Six control references keep the address they get today: one followed
by a full stop, one in brackets, one in single and one in double
quotation marks, one followed by "!", one in Markdown "**"; so does a
plain "URI".

**Alternatives**

- Add only the apostrophe: addresses with brackets would stay cut.
- Go back to the old `[^\s\]\[\<\>]*`: it takes a `"` or a closing
  quotation mark into the address, which is what the change was for.

**What goes with it**

- Stored data: no 3.x release carries the features, so only installs
  running `main` or the `ore` branch hold cut values. A
  reference's `url` is read again by "Reprocess" (offered with lookup
  on, on rows the lookup did not finish), by "Reprocess all
  references", or fixed by hand in "URL"; a data citation's identifier
  has to be retyped. No migration is proposed.
- Backport: none; 3.5 and older have neither the lookup nor data
  citations.
- Guard: rows in `lib/pkp/tests/classes/pid/PidExtractionTest.php` for
  `Url` and `Purl` with an apostrophe, a bracketed path, a trailing ")."
  and "!", and an address in single quotation marks.

Small: one class in pkp-lib, a pattern and a short override, with
unit tests. This is a proposal; the team decides.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/reference-url-cut-at-apostrophe/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/reference-url-cut-at-apostrophe/lib.js).
  It takes the Steps on a freshly loaded default dataset; with
  `MODE=neighbour` it adds the control references and a plain "URI"
  instead, and with `MODE=wayround` it types the whole address into
  "URL" and adds a "PURL" data citation. Run:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/reference-url-cut-at-apostrophe/walk.js`,
  with `PKP_E2E_LINE=stable-3_5_0` in front for 3.5.
- Walked on `main`, OJS, OMP and OPS, on PostgreSQL (the fault does not
  depend on the database): the Observed on each; the "URL" typed whole
  was kept (saved with 200, read again); the "PURL"
  "https://purl.org/hkq23c/kilo's-term" was saved as
  "https://purl.org/hkq23c/kilo". The lookup's later steps (Crossref,
  OpenAlex, ORCID) reach no service on a test install; the "URL" is set
  in the first step, before them.
- 3.5, walked: the "References" page is one text box with no rows, and
  the menu has no "Data"; `stable-3_5_0` pkp-lib has no
  `classes/pid` and no `classes/dataCitation`.
- Fix trial on `main`, the three apps: with the fix the Steps showed the
  Expected and the "PURL" was saved as typed; the control references
  and the plain "URI" gave the same results with the fix in and after
  it was reverted.
- Tips walked: `main` OJS `3cf9aa91a8`, OMP `178e8b34b2`, OPS
  `5091e916d9`, each on pkp-lib `1f415a07ca`; `stable-3_5_0` OJS
  `0b1ae35f04`, OMP `a150eee76b`, OPS `18506a5b4d`, on pkp-lib
  `5b54f59ed7`. Dataset: pkp/datasets `300c68e` (2026-10-22).
- 3.4 and 3.3, read in the code: pkp-lib `stable-3_4_0` `366030b017`
  and `stable-3_3_0` `126b86bc2e` have no reference lookup and no data
  citations.
- Introduced: `git blame` on line 23 gives `f8c4d3176e`
  (`pkp/pkp-lib#13477`, which only added the `i` flag); the character
  list came with `5d1dbf0126` in `classes/citation/pid/Url.php`, moved
  to `classes/pid/` by `6be6b501c1` (`pkp/pkp-lib#12455` for
  `pkp/pkp-lib#12354`, ajnyga, 2026-04-01), which also added
  `validationRegexes` and the data citations' use of the class. Not in
  any 3.x tag; in the `ore` tags `ore-2026-10-13` and `ore-2026-10-21`.
  Kind is defect: the data citations never kept these characters, and
  the reference lookup kept them only on `main` between 2025-09 and
  2026-01.
- The fixed pattern was also run in PHP on `Url::extractFromString()`
  and `isValid()`: "…/q?a=1;b=2, second" now gives "…/q?a=1;b=2" (it
  gave "…/q?a=1"); "see https://example.org/a!" and
  "**https://example.org/bold**" give the bare address with and without
  the fix; today's pattern keeps "https://example.org/kilo%27s-data"
  and "…/Estuary_%28landform%29" whole and valid (the way round).
- "Reprocess": `useCitationManagerConfig.js` offers the row action only
  with lookup on, for a row not structured or failed; "Reprocess all
  references" shows only with lookup on.
- Upstream search, 2026-10-23: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library issues and PRs for reference, citation, URL,
  address, apostrophe and data citation URI words and for `Url`
  `regexes` and `ExtractPidsHelper`; `pkp/pkp-lib#13477` (closed)
  fixed other identifier faults and left this one; nothing else.
- Not driven: the JATS, Crossref and DataCite outputs and the wizard's
  "Data" section (read in the code).

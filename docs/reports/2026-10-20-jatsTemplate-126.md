# PR review of pkp/jatsTemplate#126, reference identifiers in the JATS XML: the identifiers are marked and the XML is valid; a DOI written inside a publisher's address is marked there

- **Severity** low
- **Effort** small
- **Kind** defect (finding 1), in the PR before its merge; finding 2 is a question
- **Affects**
  - main: OJS with the PR (the plugin ships in OJS alone)
  - 3.5: none (no PR for the line)
  - 3.4: none (code; the PR is for `main` only)
  - 3.3: none (code; the PR is for `main` only)
- **Introduced** `pkp/jatsTemplate#126` and `pkp/ojs#5954` for `pkp/pkp-lib#13563` · open PRs, heads
  [1849b22bae](https://github.com/pkp/jatsTemplate/pull/126/commits/1849b22bae693cc5d94d94528fe88e573aa5404a)
  (on `06e35f8735`, the plugin's `main` and OJS's pointer) and
  [77627efa40](https://github.com/pkp/ojs/pull/5954/commits/77627efa405fa569afdee9f14d3f0853265d5fc6)
  (the pointer bump on `6b4323ced7`) · 2026-10-20 · Kaitlin Newson (kaitlinnewson)
- **Upstream** `pkp/pkp-lib#13563` (open; it lists the two PRs)
- **Tracked in** spec U48 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/13563-main/docs/specs/U48-jats-and-body-text.md#a23), [A24](https://github.com/jardakotesovec/pkp-e2e/blob/13563-main/docs/specs/U48-jats-and-body-text.md#a24) (on the companion `13563-main`) · ci-triage Companion row · Temporary: delete once acted on
- **Checked** 2026-10-20, the PR heads and their base (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

pkp/pkp-lib#13563 asks for a reference that is not structured to carry
its DOI or other identifier in the JATS XML, as a `pub-id` inside its
`mixed-citation`, "when present". The PR does that, and also writes
every `pub-id-type` as one JATS 1.2 allows ("other" otherwise) and
leaves out an empty author group. Walked on PKP's default dataset at the
PR head and at its base, references added on Publication › "References"
(metadata lookup off, as installed), the XML read on the "JATS XML"
page, its "Download", the API and the signed-out download of a
published article:

| Reference text (identifier picked out by the app) | Base `06e35f8` | Head `1849b22` |
|---|---|---|
| "… https://doi.org/10.1234/alpha." | text | `https://doi.org/<pub-id pub-id-type="doi" xlink:href="https://doi.org/10.1234/alpha">10.1234/alpha</pub-id>.` |
| "… doi:10.1234/BRAVO" | text | `doi:<pub-id pub-id-type="doi">10.1234/BRAVO</pub-id>` |
| "… arXiv:2001.12345v2" | text | `arXiv:<pub-id pub-id-type="arxiv">2001.12345v2</pub-id>` |
| "… hdl:10419/67890" | text | `hdl:<pub-id pub-id-type="handle">10419/67890</pub-id>` |
| "… urn:nbn:de:101:1-2007999" | text | `<pub-id pub-id-type="other">urn:nbn:de:101:1-2007999</pub-id>` |
| "… https://example.org/page?a=1&b=2 (accessed 2020)." (a web address only) | text | the address an `ext-link` |
| "Golf … A work with no identifier.", DOI `10.1234/golf` set by hand | text | text, no DOI (finding 2) |
| "… https://onlinelibrary.wiley.com/doi/full/10.1002/abc.124. doi:10.1002/abc.124" | text | the DOI marked inside the Wiley address, which loses its link; the `doi:` form stays text (finding 1) |
| A structured reference with a URN; data citations typed PURL, URI, ECLI, ISSN, UUID | `pub-id-type="urn"`, `"purl"` …: refused by the JATS 1.2 DTD | `pub-id-type="other"`: valid |
| A structured reference or data citation whose one author row has no name | an empty `<person-group/>` | no `person-group` |

The text of every reference is the same on both sides; the 21 documents
of the dataset as loaded are the same bytes; every file of the head is
valid against the JATS 1.2 DTD (the base's are not, on the types above).

| # | Finding | Severity |
|---|---|---|
| 1 | A DOI written first inside a publisher's web address is marked there: the address loses its link and the DOI links to the publisher's page | low |
| 2 | ❓ An identifier set by hand that the reference's text does not hold is left out of the XML | question |

No e2e test reads a reference's identifiers or links: U48 S1 and U19's
JATS record match reference texts with no identifier, which the PR
leaves as they were. The PR's own OJS checks were still queued when
this was written (Evidence).

## Impact

- **Lost**: nothing; finding 1 moves a link: the publisher's address
  stays in the text but is no longer a link, and the DOI's link points
  at the publisher's page instead of doi.org.
- **Who**: readers of the JATS XML (PMC, indexers, the OAI-PMH `jats`
  record) for references whose text holds a publisher's address with the
  DOI in it before the DOI itself.
- **Way round**: none needed to publish; editing the reference's text so
  the DOI comes first avoids it.

Low: the XML stays valid and the DOI is still marked, in the wrong place.

## Steps to reproduce

1. On OJS `main` with pkp/ojs#5954 (jatsTemplate at `1849b22`), PKP's
   default dataset: sign in as dbarnes, open submission 5 ("Genetic
   transformation of forest trees"), Publication › "References".
2. Type in the box `Mike, M. (2009). A publisher page and the DOI.
   https://onlinelibrary.wiley.com/doi/full/10.1002/abc.124.
   doi:10.1002/abc.124` and press "Add". The reference keeps DOI
   `10.1002/abc.124` and the Wiley address as its web address.
3. Open Publication › "JATS XML".

**Expected**: the Wiley address is an `ext-link`, and the DOI is marked
where it is written as a DOI:
`… <ext-link …>https://onlinelibrary.wiley.com/doi/full/10.1002/abc.124</ext-link>. doi:<pub-id pub-id-type="doi">10.1002/abc.124</pub-id>`.

**Observed**:

```xml
<mixed-citation>Mike, M. (2009). A publisher page and the DOI. https://onlinelibrary.wiley.com/doi/full/<pub-id pub-id-type="doi" xlink:href="https://onlinelibrary.wiley.com/doi/full/10.1002/abc.124">10.1002/abc.124</pub-id>. doi:10.1002/abc.124</mixed-citation>
```

The same with a DOI set by hand whose only occurrence in the text is in
such an address (`…/article/view/10.1234/hotel/pdf` gives
`…/article/view/<pub-id …>10.1234/hotel</pub-id>/pdf`), and in plain
text when the reference also holds a link typed as HTML (then no address
of it is made a link).

For finding 2: add `Golf, G. (2015). A work with no identifier.`, set
its DOI to `10.1234/golf` (the "DOI" box of "Edit citation" with lookup
on; here through the citations API, the form's request). The reference
stays unstructured, and its `mixed-citation` holds the text alone. The
PR's own `testMixedCitationPubIds` asserts this ("notInText"), so it is
deliberate; the issue's "if they were to manually enter it" may mean
this case. Question for the author: should such an identifier be added
after the text (JATS lets a `mixed-citation` hold a `pub-id` beside its
text)? Lean: yes.

## Cause

`ArticleBack::tagPubId()` wraps the first case-blind occurrence of the
identifier in a text node of the `mixed-citation` or alone in an
`ext-link`. `Citation::getRawCitationWithLinks()` has already made every
web address a link, so a publisher's address holding the DOI is an
`ext-link` whose text contains it; that link is replaced by the
`pub-id`, which takes the link's `xlink:href`, and the address's other
parts are left as text. Nothing checks that the occurrence is the
identifier as written rather than part of another address.

## Proposed fix

Tried (the PR's six tests: the same five pass, and "Validates against
jats 12" fails as it does at the base on the VM, see Evidence; the
walk and the differential below): skip an occurrence that sits in a web
address the identifier's own `PKP\pid` class does not read it from (the
link's address, or the word in plain text), and look on.

```diff
--- a/classes/ArticleBack.php
+++ b/classes/ArticleBack.php
@@ -23,6 +23,10 @@ use PKP\citation\enum\CitationSourceType;
 use PKP\citation\enum\CitationType;
 use PKP\dataCitation\DataCitation;
 use PKP\i18n\LocaleConversion;
+use PKP\pid\Arxiv;
+use PKP\pid\Doi;
+use PKP\pid\Handle;
+use PKP\pid\Urn;
 
 class ArticleBack extends DOMDocument
 {
@@ -338,6 +342,18 @@ class ArticleBack extends DOMDocument
         }
     }
 
+    /**
+     * Whether text holding an identifier is a web address other than the identifier's own
+     */
+    protected function isInOtherAddress(string $address, string $type, string $pubId): bool
+    {
+        if (!str_contains($address, '://')) {
+            return false;
+        }
+        $pidClass = ['doi' => Doi::class, 'arxiv' => Arxiv::class, 'handle' => Handle::class, 'urn' => Urn::class][$type] ?? null;
+        return !$pidClass || strcasecmp($pidClass::extractFromString($address), $pubId) !== 0;
+    }
+
     /**
      * Append mixed-citation element with HTML converted to JATS, tagging the citation's
      * persistent identifiers where they appear in the text
@@ -363,14 +379,25 @@ class ArticleBack extends DOMDocument
     {
         foreach ((new DOMXPath($this))->query('text() | ext-link/text()', $mixedCitation) as $textNode) {
             $text = $textNode->nodeValue;
-            $position = stripos($text, $pubId);
+            $inLink = $textNode->parentNode->nodeName === 'ext-link';
+            // Skip an occurrence inside another web address, such as a publisher's page holding a DOI
+            $offset = 0;
+            while (($position = stripos($text, $pubId, $offset)) !== false) {
+                preg_match('/\S*$/', substr($text, 0, $position), $before);
+                preg_match('/^\S*/', substr($text, $position), $after);
+                $address = $inLink ? $textNode->parentNode->getAttribute('xlink:href') : $before[0] . $after[0];
+                if (!$this->isInOtherAddress($address, $type, $pubId)) {
+                    break;
+                }
+                $offset = $position + 1;
+            }
             if ($position === false) {
                 continue;
             }
 
             $target = $textNode;
             $pubIdElement = $this->createPubId($type, substr($text, $position, strlen($pubId)));
-            if ($textNode->parentNode->nodeName === 'ext-link') {
+            if ($inLink) {
                 if ($textNode->parentNode->childNodes->length !== 1) {
                     continue;
                 }
```

With it, step 3 reads the expected XML in the walk on a freshly loaded
dataset (the other 14 references and the data citations as at the
head, the files valid), and a DOI written only inside a publisher's
address is not marked (the address stays a link). For
finding 2, not tried: append ` <pub-id …>` after the converted text for
an identifier `tagPubId()` did not find.

## Evidence

- Refs: OJS at the PR head `77627efa40` (lib/pkp `042726ebf6`, both the
  baselines' commits), `plugins/generic/jatsTemplate` at `1849b22bae`;
  the base side the same OJS at `6b4323ced7` with the plugin at
  `06e35f8735`. The PR's base is the tip, so the head is the merge
  result. OJS `main` has moved on by `cc9aa3dee4` (pkp/ojs#5930, a
  pkp-lib pointer bump for pkp/pkp-lib#13509, nothing on citations),
  unread here.
- Walk: `shared/playwright/checks/sync/jatsTemplate-126/references.js`
  on the default dataset, freshly loaded for each side (fleet 1,
  PostgreSQL), as dbarnes: 15 references added through "References",
  three edited by the citations API, 13 data citations (one per
  identifier type), the XML read on the page, "Download", the API, and
  submission 17 republished with three of the references for the
  signed-out download. Head run three times (two before the last three
  references were added), the same XML each time; base twice. The page,
  the download and the API carry the same reference list.
  `checks/sync/jatsTemplate-123/validate-dtd.php`: the head's files
  valid; the base's refused on `pub-id-type` "urn", "purl", "uri",
  "ecli", "issn", "uuid".
- Differential: `checks/sync/jatsTemplate-126/differential.php`, the
  two commits' `ArticleBack` side by side on 5,012 references (the
  PR's cases, edge shapes, and 5,000 put together by a seeded generator
  from words, typed markup and identifiers in their written forms),
  each through the app's `ExtractPidsHelper`, a tenth with a DOI set by
  hand, every seventh structured: in the 4,296 unstructured references
  the text and the markup other than links and identifiers are the same
  at both commits, and every link of the base is a link or a linked
  `pub-id` at the head; 3,352 identifiers marked, 540 hand-set DOIs not
  in the text left out (finding 2), 7 marked inside another address
  (finding 1). The reference list is valid against the DTD at the head
  and refused 270 times at the base (`pub-id-type`). With the tried fix:
  the same, none inside another address.
- The PR's tests on the VM (fleet 1's PostgreSQL), `ArticleBackTest`: at
  the head 5 of 6 pass; the new "Mixed citation pub ids" and "Data
  citation pub id types" fail with the base's `ArticleBack.php`.
  "Validates against jats 12" fails at the head and at the base alike
  ("No declaration for attribute xlink:href of element ext-link"; the
  VM's libxml 2.15 does not match the unbound `xlink:` attributes of an
  imported tree, as at the review of pkp/jatsTemplate#123), while the
  serialized files validate.
- The PR checks of pkp/ojs#5954 (runs 39454956291, 39454955690): "validate"
  green; the e2e shards and the PHPUnit and upgrade matrix still queued
  at the time of writing.

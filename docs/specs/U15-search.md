---
name: search
scope: Readers find published articles by the words in them, narrow the results by publication date, and page through what was found
apps: [ojs, omp, ops]
shared: pkp-lib
status: verified
atlas-claims: [AFFR-083, AFFR-084, AFFR-085, ROUTE-024, ROUTE-048, ROUTE-067, ROUTE-083, SET-054, JOB-027]
---

# Search

> Conventions: ⚠ marks behaviour that is documented as it is today and questioned in the Findings register; `{OJS OMP}` names the apps a sentence holds for; superscript letters point to evidence and can be skipped. The rest: [Reading a spec](GLOSSARY.md#reading-a-spec).

> **One spec, three applications.** The page is written in the words of a
> journal (OJS): "journal", "article", "Journal Manager", "Section Editor".
> Read it on a press (OMP) with "press" for "journal", "book" or "monograph"
> for "article" and Press Manager for Journal Manager; on a preprint server
> (OPS) with "server" for "journal", "preprint" for "article", Preprint
> Server Manager for Journal Manager and Moderator for Section Editor. Two
> on-screen strings follow the map: the search box's hidden label "Search
> articles for" reads "Search preprints for" on a server, and a result's
> date line reads "Downloads: {n} - Submitted {date} - Posted {date}"
> there. The press's Search page is a different page with its own wording,
> described where it differs ([OMP2](#omp2)). The full map is Part II of
> the [application glossary](GLOSSARY.md).

## Purpose

Search is how a reader who does not know where an article lives finds it:
by a word from its title, its abstract or an author's name (the text of
the article's own files is not searched, Rule 3). The reader types
words into the Search page (reached from the "Search" link in the header
of every reader-facing page inside a journal), presses "Search", and gets a list of published
articles that match, each linking to its landing page, with the option to
narrow by publication date and to page through long lists. Behind the page
sits the **search index**: the site's own copy of the searchable text of
every published article, refreshed in the background when an article is
published or unpublished and rebuildable from the command line. This spec
owns the Search page and its forms in the three applications, the results
list, the refinements, the paging, the site-wide search across journals,
the index and what keeps it current, and the search box on a preprint
server's home and archive pages. It does not cover the editorial
dashboard's "Search submissions" box, which finds submissions in the
workflow rather than published content (see
[Submissions dashboard](U23-submissions-dashboard.md#search)); browsing
published content by category (*Categories*), by section or series
(*Sections*) or through a press's catalog (*Catalog browse*); or the
"Search engine indexing" settings that shape what outside search engines
see (*Search-engine metadata & analytics*).

## Actors & permissions

Search is a public reader surface. A **visitor** is anyone using the site
without signing in; a signed-in user of any role searches exactly as a
visitor does and gets the same results (Rule 15). "The Search page" is the
page headed "Search" inside a journal; "the site-wide Search page" is the
same page opened at the site level, outside any journal, on a site that
hosts several journals (Rule 10). A journal "publishes online" unless its
Distribution settings say otherwise (Rule 13). <sup>a</sup>

| Action | Who may, and when |
|--------|--------------------|
| **Open the Search page** | • Any visitor, and any signed-in user, while the journal publishes online<br>• On a journal that does not publish online {OJS}: a signed-in Site Administrator, Journal Manager, Journal Editor, Production Editor, Section Editor, Guest Editor, Subscription Manager, or a holder of an assistant-level role (Copyeditor, Layout Editor, Proofreader, Designer, Indexer, Funding Coordinator, Marketing and Sales Coordinator, Editorial Board Member) gets the page. A signed-in Reader, Author, Translator or Reviewer gets the sentence of Rule 13 instead. A visitor is sent to the Login page [OJS3](#ojs3)<br>• A press has no such gate. A preprint server's gate cannot be reached from its settings screen [OPS2](#ops2) (Rule 13) <sup>l</sup> |
| **Open the site-wide Search page** | • Any visitor, by typing its address (Rule 10 gives its form); no link on the site's pages leads there <sup>i</sup> |
| **Search, refine by date, page through results** | • Anyone who can open the page. There is nothing to sign in for and nothing a role adds <sup>a</sup> |
| **See an article that is not published in the results** | • Nobody, whatever their role: the results hold only articles that have a published version, and a decline alone does not unpublish (Rule 2) <sup>c</sup> |
| **Open a found article** | • Anyone, on an open-access article. On a journal whose content is behind subscriptions, the result is listed for everyone and the article page itself decides what the reader may open (Rule 16) <sup>f</sup> |
| **Rebuild the search index** | • The site's system administrator, from the command line on the server, with the tool named in the Reference table at the end of this spec; no screen offers it (Side effects) <sup>o</sup> |
| **Change what search covers and how it runs** | • The system administrator, in the configuration file (Settings that modify behavior). The Journal Manager sets the results-per-page count and the publishing mode on the journal's own settings screens, described in their owning features (Settings that modify behavior) <sup>n</sup> |

## Fields & validation

Nothing on the Search page is required and nothing is validated: any text,
or none, is accepted, and a date filter is simply applied or not (Rule 9).
The form works with the page's address, so a search can be bookmarked and
shared. <sup>b</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| **Search box** (hidden label "Search articles for", heard through a screen reader or seen in the browser's accessibility inspector, not on screen; the box shows the placeholder "Search") | No | The words to look for. Left empty, or holding only spaces, the page behaves as Rule 5 says. Reloaded with results, the box still holds the words searched. |
| **Advanced filters › Published After** (three selects labelled "Year", "Month", "Day", each starting blank) | No | Keeps only articles published on or after the chosen day (Rule 9). The Year list runs from the earliest to the latest publication date entered on any of the journal's articles, published or not ⚠ [A15](#a15). All three parts must be chosen: a Year with one or no other part is ignored, and the selects then show a date the reader did not choose ⚠ [A1](#a1); a Month or Day without a Year is ignored and the selects go blank. The Day list offers 1 to 31 for every month; a day the month does not have is applied as the following month's date ⚠ [A14](#a14). {OJS OPS} |
| **Advanced filters › Published Before** (the same three selects) | No | Keeps only articles published before the chosen day; the chosen day itself is left out ⚠ [A2](#a2). Same Year list ⚠ [A15](#a15), same all-three-parts rule ⚠ [A1](#a1) and same handling of an impossible day ⚠ [A14](#a14). {OJS OPS} |
| **Advanced filters › By Journal** (a select, first entry blank) | No | On the site-wide Search page of a journal site only (Rule 10): limits the results to one journal, but only on the first page of results, and the select shows blank again after every search [OJS2](#ojs2). Inside a journal the select is absent, and a press or preprint server site never shows one ⚠ [A10](#a10). {OJS} |
| **"Search"** button | — | Runs the search with the box and filters as they stand. |
| Press: **search box** (read out as "Search Query" by a screen reader) and **"Search"** button, at the foot of the Search page | No | The press's Search page carries only these two controls, under the results, and no Advanced filters [OMP2](#omp2). |
| Preprint server: **search box** (read out as "Search Query" by a screen reader) and **"Search"** button in the archive header | No | On the server's home page and its Preprints page (Rule 17). Submitting it opens the Search page with the results for the typed words. {OPS} |

## Rules & state

1. **Where the Search page lives.** Every reader-facing page inside a
   journal (the home page, About, Login, Register, the archive or catalog,
   an article's landing page, Contact, Submissions) carries a "Search" link
   in its header, beside the navigation menu. The link is absent on the
   Search page itself and on the site's own pages outside any journal, and
   the editorial dashboard, My Submissions and the reviewer's assignments
   page, where a signed-in role lands, have their own header without it.
   The link opens the Search page: breadcrumb and heading "Search",
   the search box, the Advanced filters (on a journal or server) and the
   "Search" button, with the results below. The header link belongs to the
   site chrome (*Navigation menus & site chrome*); this spec owns the page it
   opens. <sup>a</sup>
2. **Only published articles are found.** An article is in the results only
   while it has a published version (the one its landing page shows; Rule
   12 for what happens when a newer version is unpublished). A submission still in the
   workflow, a version scheduled for a future issue, an unpublished article
   and a deleted one are never listed, for any user (Actors & permissions).
   A decline alone does not unpublish: a published article that is returned
   to the workflow and then declined keeps its published version, stays in
   the results, and still opens its landing page (the decline itself is
   described in [Submission stage](U25-submission-stage.md)). <sup>c</sup>
3. **What text is searched.** The words are looked for in the article's
   title (with its prefix and subtitle), its abstract and the names of its
   contributors. The text of the article's galleys is not searched: the
   site is built to read plain-text and HTML galleys (and PDF, PostScript
   and Word galleys through a converter the system administrator
   configures, Settings that modify behavior), but as built no galley text
   reaches the index, so a word that appears only in a galley finds nothing
   ⚠ [A11](#a11). Every language the article carries metadata in is
   searched, whatever language the site is being read in. Keywords,
   subjects, section names and funders are not searched by the box (but
   see Rule 14). <sup>c</sup>
4. **How words match.** Matching is on words, not fragments: "publi" does
   not find "Publications" and "quarterl" does not find "quarterly". A word
   does find its regular other forms: "public", "publication" and
   "publications" find each other, as do "study", "studies" and "studied",
   and "note" and "notes"; an irregular form does not: "child" does not
   find "Children". Very common words ("the", "of", "and", "or") are
   dropped: typed alone they find nothing, although every title holds them,
   and typed beside another word they change nothing. Capitalisation does
   not matter. There is no phrase search, no wildcard and no AND/OR/NOT
   syntax: "AND" or "OR" typed between two words changes nothing (they are
   common words, dropped like any other). Quotation marks, commas, full
   stops, brackets, "!", "&" and an apostrophe-s are ignored, but a hyphen
   is not: a hyphenated pair such as "harbour-children" finds nothing even
   when both words are in the title, so type the words with a space.
   How several words combine depends on the
   database the site runs on: on a PostgreSQL site every typed word must be
   found (in any of the searched texts of the same article), on a MySQL or
   MariaDB site an article matching any of the words is listed
   ⚠ [A5](#a5). The test installs run on PostgreSQL, so on them every
   typed word must be found. <sup>d</sup>
5. **The bare Search page.** Opening the Search page, or pressing "Search"
   with the box empty (or holding only spaces) and no filter set, lists every published article of
   the journal, paged like any result list, on a journal or a preprint
   server; a press shows only the search box, with no count and no notice
   ⚠ [A6](#a6). With the box empty but a date filter set, a journal or
   server lists every published article in that date range. <sup>e</sup>
6. **What a result shows.** Each result is the article's summary as the
   journal's listings show it, without galley links: the title (with
   subtitle), the contributors, the published date, and where the journal
   shows them, the cover image and the article's page numbers; on a server
   the date line opens
   with the download count. The title opens the article's landing page
   (*Article landing page & reading*; on a press the catalog's book page,
   *Monograph landing page*). On the site-wide page of a journal site the
   journal's name appears under each title; a press or server site shows
   no such name (Rule 10). On a press the results are book summaries two to
   a row, each with its cover, title, contributors and date [OMP2](#omp2).
   <sup>f</sup>
7. **Counts and the empty result.** Above the results, a journal or server
   carries a status line that only a screen reader (or the browser's
   accessibility inspector) shows: "Found one item." when one
   article was found; with more than one, a journal reads out a raw code
   instead of the count ⚠ [OJS1](#ojs1) and a server still says "Found one
   item." ⚠ [OPS1](#ops1). Under the results sits the visible line "{from}
   - {to} of {total} items", whatever the count. When
   nothing matches, a notice reads "No Results". A press instead shows a
   visible "{N} Titles" count and the line "{N} titles were found which
   matched your search for "{words}"." (or "One title was found which
   matched your search for "{words}"."), each followed by a "Search again"
   link that jumps to the search box at the foot of the page; when nothing
   matches, "No titles were found which matched your search for "{words}"."
   with the same link [OMP2](#omp2). <sup>g</sup>
8. **Paging.** Results come 25 to a page, or whatever the journal's "Items
   per page" setting says (Settings that modify behavior). Under the list
   sit "{from} - {to} of {total} items" and the page links: "<<" and "<" to
   go back, the page numbers, ">" and ">>" to go forward; the current
   page's number is plain text among them. Moving between pages keeps the
   searched words, the date filters and the sort (Rule 14); the box and
   the filters show them still. The site-wide page's journal choice is not
   kept (Rule 10). Page links appear only when there is more than one page.
   A bookmarked or shared address whose page number is beyond the last
   page shows "No Results" with the searched words kept; one whose page
   number is not a number gives a completely empty page instead: no
   heading, no search form, no message of any kind ⚠ [A13](#a13).
   <sup>g</sup>
9. **The date filters** {OJS OPS}. "Published After" keeps articles
   published on the chosen day or later; "Published Before" keeps articles
   published strictly before the chosen day ⚠ [A2](#a2). Both go by the
   article's published date as shown in its summary. A filter counts only
   when its Year, Month and Day are all chosen. A Year with one or no other
   part is ignored, and after the search the selects show a date the reader
   did not choose ⚠ [A1](#a1); a Month, a Day or both without a Year are
   ignored and the selects go blank. The Day list offers 1 to 31 whatever
   the month; a day the month does not have is applied, and shown, as the
   following month's date: 31 September becomes 1 October ⚠ [A14](#a14). The
   Year lists run from the earliest to the latest publication date entered
   on any of the journal's articles, whether or not that article is
   published: an unpublished article backdated to an earlier year widens
   the lists ⚠ [A15](#a15). On a journal where no publication date has ever
   been entered, the lists offer only blank entries and the page still
   opens, reading "No Results". A press has no date filters [OMP2](#omp2).
   <sup>h</sup>
10. **Site-wide search.** On a site that hosts several journals, the Search
    page opened at the site level searches every enabled journal at once;
    whether a journal's own configuration should govern whether its content
    appears there is an open question ⚠ [A16](#a16). Each result opens in
    its own journal. On a journal site each result
    carries its journal's name under the title, and the Advanced filters
    gain a "By Journal" select listing the enabled journals; choosing one
    limits the results to it, but only for the first page: the page links
    drop the choice and list every journal again, and the select shows
    blank after every search, so the reader cannot tell it was applied
    ⚠ [OJS2](#ojs2). A press or preprint server site has the site-wide page
    too, but no such select and no press or server name under the results,
    so results from different presses cannot be told apart ⚠ [A10](#a10).
    Nothing links to the site-wide page: the header's
    "Search" link exists only inside a journal (Rule 1), so the page is
    reached by typing its address: the site's own address followed by
    /index.php/index/search, with no journal's path in between (for
    example https://example.org/index.php/index/search). Type it in full
    rather than extending the address the browser shows once the site's
    home page has opened, which ends in a language code (such as
    /index.php/index/en): adding /index/search after that gives a
    page-not-found error. <sup>i</sup>
11. **Order of results.** Results are not ranked by relevance and are not
    sorted by date or title; they come in the order the database happens
    to return them, which is neither newest-first nor alphabetical,
    though it is the same each time the same search is repeated
    ⚠ [A4](#a4). A sort by title or by published date can be asked for
    only through the page's address (Rule 14). <sup>j</sup>
12. **The index stays current, mostly.** Publishing an article (or a new
    version of it) queues a background refresh of its entry; the article
    becomes findable once that refresh has run: on a live site within
    moments, on a test install only after the site's background jobs have
    been run (the set-up note under Canonical scenarios). Unpublishing an article removes it from the results at
    once; so does unpublishing the issue that holds it {OJS}, and so does
    deleting it (a published article is deleted only after being returned
    to the workflow and declined, [Submission stage](U25-submission-stage.md#delete)).
    Publishing an issue again {OJS} lists its articles only once the
    background job has run, like publishing an article. When an article
    has an older published version, unpublishing the newest version
    removes the article from the results at once, but the older version
    stays public on the landing page and, once the background job has run,
    the article is listed again under that version's title; the words of
    the unpublished newer version still find it ⚠ [A7](#a7).
    Changes made to an already-published article without republishing it
    (a corrected title or abstract, an added contributor, a changed
    published date) do not reach the index: the result shows the new title,
    contributors and date at once, but search keeps finding the old words and not the
    new ones until the article is unpublished and published again, a new
    version is published, or the administrator rebuilds the index
    ⚠ [A3](#a3). When an article has several versions, the words of every
    version, superseded ones included, find it ⚠ [A7](#a7). <sup>k</sup>
13. **A journal that does not publish online** {OJS}. When the journal's
    Distribution settings set the publishing mode to "OJS will not be used
    to publish the journal's contents online.", the Search page is gated. A
    visitor who opens it is sent to the Login page, with no word about why
    ⚠ [OJS3](#ojs3). A signed-in Reader, Author, Translator or Reviewer
    gets, instead of the page, the sentence "This journal does not publish
    its content online." The roles listed in Actors & permissions still get the page.
    The header's "Search" link is shown regardless. A press has no
    publishing mode and no such gate. A preprint server is built with the
    same gate for its posting mode "OPS will not be used to post the
    server's contents online.", but that choice cannot be stored from the
    server's settings screen, so the gate is never met ⚠ [OPS2](#ops2).
    <sup>l</sup>
14. **Refinements no control offers.** The page also honours refinements
    typed into its address that no control on the page offers: words to
    find in the title only, in the abstract only, in the contributors'
    names only, or in the galley text only; a keyword, a subject, a
    section, a category or a funder to match exactly; the name of a
    reviewer whose review of the article was open (not anonymous); and a
    sort by title, ascending or descending ⚠ [A8](#a8). The sort by
    published date the page is built to accept answers an error page
    instead of the results ⚠ [A12](#a12). Paging keeps
    the sort but drops the other address-only refinements. On a press an
    empty search box means the bare page (Rule 5), whatever refinements the
    address carries. These are documented here because a bookmarked or
    shared address can carry them; a reader working the page never meets
    them, and no scenario exercises them. <sup>m</sup>
15. **Signing in changes nothing.** A signed-in user, whatever their roles,
    sees the same Search page and the same results as a visitor: no extra
    filter, no unpublished content (Rule 2), no personal history. The only
    role-dependent behavior is the gate of Rule 13. <sup>a</sup>
16. **What a found article opens** {OJS}. On a journal that restricts
    content to subscribers, articles in restricted issues are listed like
    any other, with no lock or note in the result. Whether the reader may
    open the article is decided on the article page by the subscription
    rules (*Subscriptions & open access control*). <sup>f</sup>
17. **The archive header's search box** {OPS}. A preprint server's home
    page and its Preprints page open with an archive header: a search box
    and "Search" button on the left, the top-level category links on the
    right (the category links belong to *Sections*, which owns those two
    pages). The box is always empty when the page opens. Submitting it
    opens the Search page with the typed words in the box and their
    results below. The box is built to hide while the server's posting mode
    says it will not post online, a state the settings screen cannot store
    (Rule 13, [OPS2](#ops2)). <sup>p</sup>

## Side effects

- Searching writes nothing: no log entry, no notification, no email, and
  no record of what was searched. <sup>a</sup>
- Publishing or unpublishing a version of an article clears the article's
  index entry at once and queues a background job that rebuilds the entry
  from every version of the article: titles, abstracts and contributor
  names, per language (galley text is meant to join them and never does,
  [A11](#a11)). Until the job has run the article is absent from the
  results; when an older version of it is still published, the article
  comes back under that version once the job has run (Rule 12). The
  publishing flow itself is owned by
  [Publish, schedule & versions](U49-publish-schedule-and-versions.md).
  <sup>k</sup>
- Unpublishing an issue removes its articles from the results at once,
  and their landing pages answer a page-not-found error {OJS}; publishing
  the issue again lists them only once the background job has run (Rule
  12). The issue flow belongs to *Issues*. <sup>k</sup>
- Deleting a submission drops its index entries with it at once; nothing
  is queued. No screen deletes a single version of an article, and no
  screen deletes a published article directly: it is returned to the
  workflow, declined and then deleted
  ([Submission stage](U25-submission-stage.md#delete)). <sup>k</sup>
- Installing or upgrading the site rebuilds the whole index. The system
  administrator can rebuild it at any time from the command line (the tool
  is named in the Reference table at the end of this spec), for the
  whole site or for one journal named by its path; on a press or preprint
  server the path is accepted but ignored and the whole site is rebuilt
  ⚠ [OMP1](#omp1) ⚠ [OPS3](#ops3). A rebuild first empties the index, so
  searches return nothing for the articles not yet re-indexed while it
  runs. <sup>o</sup>

## Settings that modify behavior

All search settings are the system administrator's, in the site's
configuration file (config.inc.php), search section; no screen shows them.
<sup>n</sup>

- **The search driver.** The database driver (the default, and what every
  site gets without further setup) keeps the index inside the site's own
  database. The OpenSearch driver hands indexing and querying to an
  OpenSearch server named by the accompanying host, user name, password
  and certificate-check settings; with it, results are ranked by relevance, "Published Before"
  includes the chosen day, and the address-only funder and reviewer
  refinements (Rule 14) accept several values. Everything else in this
  spec describes the database driver, which is what the test installs use.
  <sup>n</sup>
- **The index name** used by an OpenSearch server ("submissions" unless
  changed). <sup>n</sup>
- **Converters for non-text galleys.** One line per file type names a
  program that turns the file into text (the file offers commented examples
  for PDF, PostScript and Word); a line set to an empty value switches off
  even the built-in reading of that type. As built, these lines have no
  reachable effect: no galley text reaches the index whatever they say
  (Rule 3, [A11](#a11)). <sup>n</sup>
- **Two settings with no effect.** "Minimum indexed word length" and "The
  maximum number of search results fetched per keyword" are still listed in
  the file with their explanations, but nothing reads them ⚠ [A9](#a9).
  <sup>n</sup>
- **"Items per page"** on the journal's Settings › Website › Setup › Lists
  screen (a required field, 25 unless changed) sets the results-per-page
  count (Rule 8); the setting belongs to *Appearance & theming*. <sup>g</sup>
- **The publishing mode** on the journal's Distribution settings gates the
  page (Rule 13); the setting belongs to *Subscriptions & open access
  control*. A preprint server's "Posting Mode" on the same screen says
  "Saved" and stores nothing ([OPS2](#ops2)). <sup>l</sup>
- **Requiring sign-in to view the site** (Users & Roles › Site Access
  Options) puts the Search page behind Login like every other reader page;
  that rule is site-wide and not this feature's. <sup>a</sup>

## Cross-feature interactions

- [Submissions dashboard](U23-submissions-dashboard.md#search) owns the
  editorial "Search submissions" box; it searches the workflow, not the
  index, and is unrelated to this page.
- [Publish, schedule & versions](U49-publish-schedule-and-versions.md)
  owns publishing and unpublishing; it keeps one side-effect line ("refreshes
  the search index") and points here for what that means (Rule 12).
- *Navigation menus & site chrome* owns the header's "Search" link
  (Rule 1).
- *Article landing page & reading* and *Monograph landing page* own the
  pages a result opens (Rule 6). *Galleys* owns the files whose text feeds
  the index (Rule 3).
- *Sections* owns the preprint server's home-page archive and Preprints
  pages, whose archive header carries this feature's search box (Rule 17),
  and the section browse pages. *Categories* owns category browse. *Catalog
  browse* owns the press's catalog pages. None of them searches.
- *Subscriptions & open access control* owns the publishing mode (Rule 13),
  the server's "Posting Mode" that does not save ([OPS2](#ops2)), and what
  a subscriber-only article shows when opened (Rule 16).
- [Submission stage](U25-submission-stage.md) owns Decline and Delete
  (Rules 2 and 12); [Workflow screen & stage access](U24-workflow-screen-and-stage-access.md#done)
  owns "Return to Workflow", the step before them on a published article.
  *Issues* owns publishing and unpublishing an issue (Rule 12).
- *Appearance & theming* owns "Items per page", on Settings › Website ›
  Setup › Lists (Rule 8).
- [Funding](U43-funding.md) records the funders the address-only funder
  refinement matches (Rule 14).
- *Search-engine metadata & analytics* owns the "Search engine indexing"
  settings tab, which concerns outside search engines, not this index.

## Canonical scenarios

Common to all three apps, in journal words; the note under the title says
how to read them on a press or a preprint server. Actors are named by
role. Every scenario starts from a *scratch journal*: a throwaway journal
the Site Administrator creates for the test, holding the published
articles the scenario names, each carrying a made-up word that appears
nowhere else on the site. After the articles are published, run the site's
background jobs so that the index holds them (Rule 12): a search that
expects a hit is judged only once the jobs have run. The seeding recipe
the suites use, and how the jobs are run on a test install, are in the
footnote. <sup>s</sup>

1. **Find an article by a word in its title** — a visitor, on a scratch
   journal holding two published articles, each with its own made-up word
   in its title: on the journal's home page press "Search" in the header.
   The page "Search" opens with an empty search box. Type the made-up word
   from one article's title and press "Search". The list holds exactly
   that article: its title, its contributors and its published date, and
   no galley links; the other article is absent. Pressing the title opens
   the article's landing page. Use the browser's Back button to return to
   the Search page: the box still holds the word. <sup>s1</sup>
2. **Abstract and contributor names are searched too** — a visitor: search
   the made-up word that appears only in one article's abstract; exactly
   that article is listed. Search the made-up family name of one article's
   contributor; exactly that article is listed. Search the made-up word
   from one article's title typed all in capitals; that article is listed.
   <sup>s2</sup>
3. **Nothing found** — a visitor: search a made-up word that appears
   nowhere. The list is empty and the page reads "No Results" (on a press:
   "No titles were found which matched your search for "{word}"." followed
   by "Search again", which jumps to the search box). <sup>s3</sup>
4. **Only published articles are found** — a visitor, then the Journal
   Manager: the scratch journal also holds a submission that carries the
   same made-up word in its title but has never been published. Search the
   word: only the published article is listed. Sign in as Journal Manager
   and search again: the same one article, and still not the unpublished
   submission. <sup>s4</sup>
5. **Unpublishing removes, republishing restores** — Journal Manager, then
   a visitor: search the made-up word of a published article and see it
   listed. Open the article's workflow, go to its Publication tab and
   press "Unpublish" ("Unpost" on a server) at the top right. A visitor
   searching the word now gets "No Results" (on a press, the "No titles
   were found…" line), without any wait. Publish it again, then run the
   site's background jobs: until they have run, the visitor's search still
   reads "No Results"; once they have run, it lists the article again.
   <sup>s5</sup>
6. **Paging through a long list** — a visitor, on a scratch journal with 27
   published articles that share one made-up word: search the word. The
   page lists 25 articles, reads "1 - 25 of 27 items", and offers the page
   links "2", ">" and ">>" (the current "1" is plain text). Press "2":
   the page lists the remaining 2, reads "26 - 27 of 27 items", offers
   "<<", "<" and "1", and the search box still holds the word. <sup>s6</sup>
7. **Narrow by publication date** {OJS OPS} — a visitor, on a scratch
   journal with two articles sharing a made-up word, one published on the
   1st of a month and one on the 15th: search the word; both are listed.
   Under "Advanced filters", set "Published After" to the 10th of that
   month (Year, Month and Day all chosen) and press "Search": only the
   article of the 15th is listed, and the three selects still show the
   10th. Set the three "Published After" selects back to their blank
   entries, set "Published Before" to the 10th (again all three parts) and
   press "Search": only the article of the 1st is listed. On a press this
   scenario does not run; check its absence instead: the press's Search
   page shows no "Advanced filters" and no date selects, only the search
   box and "Search" at its foot. <sup>s7</sup>

Journal-specific:

8. **Search the whole site** {OJS} — a visitor, on a site with two scratch
   journals each holding one published article with its own made-up word:
   open the site-wide Search page by typing its address, the site's own
   address followed by /index.php/index/search, for example
   https://example.org/index.php/index/search (no link leads there;
   Rule 10). Search
   the first word:
   the first journal's article is listed with that journal's name under
   its title, and its title opens the article inside that journal. Search
   the second word: the second journal's article, likewise. Under
   "Advanced filters", choose the first journal in "By Journal" and search
   the second word: "No Results", while the select shows blank again
   ([OJS2](#ojs2)). <sup>s8</sup>
9. **A journal that does not publish online** {OJS} — Journal Manager, then
   a visitor and a Reader: on the scratch journal's Settings › Distribution
   › Access, set "Publishing Mode" to "OJS will not be used to publish the
   journal's contents online." and save. A visitor pressing the header's
   "Search" link (still shown) lands on the Login page ([OJS3](#ojs3)). A
   signed-in Reader opening the journal's Search page gets "This journal
   does not publish its content online." instead of the page. The Journal
   Manager, signed in, opens the same address and gets the Search page.
   Set "Publishing Mode" back to "The journal will provide open access to
   its contents." and save; the visitor gets the page again. <sup>s9</sup>

Preprint-server-specific:

10. **Search from the archive header** {OPS} — a visitor: on the server's
    home page, the archive header shows an empty search box and a "Search"
    button above the latest preprints. Type a preprint's made-up word and
    press "Search". The Search page opens with the word in its search box
    and that one preprint listed, its date line reading "Downloads: 0 -
    Submitted {date} - Posted {date}". The same box and button sit at the
    top of the server's Preprints page and behave the same way.
    <sup>s10</sup>

Press-specific:

11. **The press's Search page** {OMP} — a visitor: on the press's home page
    press "Search" in the header. The page "Search" shows the heading and,
    at its foot, a search box and a "Search" button, with no Advanced
    filters and no list. Type a book's made-up word and press "Search":
    the page reads "1 Titles" and "One title was found which matched your
    search for "{word}"." with a "Search again" link, and lists the book
    with its cover, title, contributors and date; the title opens the
    book's catalog page. Press "Search again": the page jumps to the search
    box, which still holds the word. <sup>s11</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-09-02), unreviewed unless
an entry notes otherwise; the team settles them on spec review. Sorted
🐞 → ❓ → ✅ in the summary; the entries below are the source. Each entry
opens with the user-observable symptom; mechanism and evidence live in the
entry's footnote. Basis: *probe* = seen on a running install on
2026-09-02; *judgment* = the author's reading of the application, not seen
running. Impact values: user-visible = real effect in ordinary use · minor
= cosmetic only, however often seen · latent = only in an unusual situation
or configuration · invisible = no reader ever sees it. The Review column
reads "—" until someone has reviewed the entry, then that reviewer's name
and date.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A1](#a1) | A date filter with a Year but not both Month and Day is ignored, and the selects then show a date the reader never chose | 🐞 | user-visible | — |
| [A3](#a3) | Changes made to an article after publication never reach search until it is republished or the index rebuilt | 🐞 | user-visible | — |
| [A9](#a9) | The configuration file lists two search settings that nothing reads | 🐞 | latent | — |
| [A11](#a11) | The text of an article's galleys is never searched, although the site is built to read it | 🐞 | user-visible | — |
| [A12](#a12) | A sort by published date, typed into the address, answers an error page | 🐞 | latent | — |
| [A13](#a13) | A page number in the address that is not a number answers a completely empty page | 🐞 | latent | — |
| [OJS1](#ojs1) | With more than one result, the screen-reader count reads out a raw code | 🐞 | minor | — |
| [OJS2](#ojs2) | On the site-wide page, "By Journal" limits the first page only and never shows as chosen | 🐞 | user-visible | — |
| [OMP1](#omp1) | The index-rebuild tool ignores the press path it is given and rebuilds every press | 🐞 | invisible | — |
| [OPS1](#ops1) | The screen-reader result count always says "Found one item." | 🐞 | minor | — |
| [OPS3](#ops3) | The index-rebuild tool ignores the server path it is given and rebuilds every server | 🐞 | invisible | — |
| [A2](#a2) | "Published Before" leaves out the chosen day itself | ❓ | minor | — |
| [A4](#a4) | Results come in no particular order | ❓ | user-visible | — |
| [A5](#a5) | Whether several words must all match or any one may depends on the site's database | ❓ | user-visible | — |
| [A6](#a6) | The bare Search page lists every published article on a journal or server, and nothing on a press | ❓ | user-visible | — |
| [A7](#a7) | Words from an article's superseded versions still find it | ❓ | latent | — |
| [A8](#a8) | The page honours refinements that no control on it offers | ❓ | latent | — |
| [A10](#a10) | The site-wide Search page of a press or server site has no journal picker and names no press or server under its results | ❓ | minor | — |
| [A14](#a14) | A day the month does not have is offered, and applied as the next month's date | ❓ | minor | — |
| [A15](#a15) | The Year lists follow the dates entered on unpublished articles too | ❓ | minor | — |
| [A16](#a16) | Whether a journal's own configuration should govern its presence on the site-wide Search page | ❓ | latent | — |
| [OJS3](#ojs3) | On a journal that does not publish online, a visitor is sent to Login instead of being told | ❓ | minor | — |
| [OPS2](#ops2) | A server's does-not-post gate cannot be reached from its settings, and would show a raw code if it were | ❓ | minor | — |
| [OMP2](#omp2) | The press's Search page is a different page: one box at the foot, no filters, its own wording | ✅ | user-visible | — |

### All apps

<a id="a1"></a>
**A1 — A partly chosen date filter is ignored, and the selects then lie** · 🐞 · user-visible.
A reader who chooses only a Year under "Published After" or "Published
Before" (or a Year and a Month, or a Year and a Day) and presses "Search"
gets the unfiltered results. The selects then show a date the reader never
chose: a year alone comes back as 30 November of the previous year (or a
blank Year when that year is outside the list), a year and month as the
last day of the previous month, a year and day as that day of the previous
December. A Month or Day chosen without a Year is ignored as well, and the
selects simply go blank. Only a filter with Year, Month and Day all chosen
is applied. The selects invite a partial choice by starting every part
blank.
Basis: probe. <sup>f-a1</sup>

<a id="a2"></a>
**A2 — "Published Before" excludes the chosen day** · ❓ · minor.
An article published on the very day chosen under "Published Before" is
left out, while one published on the day chosen under "Published After" is
kept. The two filters are not symmetric, and a reader picking the same day
in both gets nothing.
Question: should "Published Before" include the chosen day, as the
OpenSearch driver's version of the same filter does?
Lean: include it; "before" a day is a natural reading either way, but the
two drivers should agree.
Basis: probe. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — Post-publication changes never reach search** · 🐞 · user-visible.
An editor who corrects a published article's title or abstract, adds a
contributor or changes its published date without republishing sees the
change on the article page, and even in the search result itself, but
search keeps finding the old words and not the new ones. The article's
index entry is refreshed only when a version is published or unpublished,
or when the administrator rebuilds the index. Before the search engine was
replaced, editing a published article's metadata refreshed its entry.
Since: 2025-08 (about a year). Basis: probe. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — Results come in no particular order** · ❓ · user-visible.
A search that finds several articles lists them in whatever order the
database returns them: not by relevance, not by date, not by title (three
articles dated 2024, 2023 and 2025 came back in that order, and the same
order on every repeat). A reader has no way to ask for a sort from the
page (a sort exists only through the address, [A8](#a8)).
Question: what order should results have, and should the page offer a
sort?
Lean: newest first by default, as the journal's other listings do, with a
relevance order once a ranking driver is in use.
Basis: probe. <sup>f-a4</sup>

<a id="a5"></a>
**A5 — Several words mean different things on different databases** · ❓ · user-visible.
On a PostgreSQL site, typing two words finds only articles containing both;
on a MySQL or MariaDB site it finds articles containing either. The page
gives no hint which applies, and the old search-syntax help is gone.
Question: which combination is intended, and should the page say so?
Lean: "all words" is the more useful default and the one to document;
either way the behavior should not depend on the database.
Basis: probe for the PostgreSQL side, judgment for MySQL and MariaDB.
<sup>f-a5</sup>

<a id="a6"></a>
**A6 — The bare Search page lists everything, except on a press** · ❓ · user-visible.
Opening the Search page with nothing typed lists every published article
of the journal (or server), 25 to a page, before the reader has searched
for anything. On a press the same page shows only the search box, with no
count and no notice. Earlier versions showed only the form everywhere.
Question: is the full listing intended as a browse-everything view, or
should the page wait for a query as the press's does?
Lean: intended enough to keep; it is harmless and gives an empty journal a
clear "No Results". But the three applications should agree.
Basis: probe. <sup>f-a6</sup>

<a id="a7"></a>
**A7 — Superseded versions still find the article** · ❓ · latent.
An article whose second version replaced a word in the title is still
found by the old word, because the index keeps the text of every version,
published or not. A reader who follows the result sees the current version
and no trace of the word they searched.
Question: should only the current published version feed the index?
Lean: yes; a reader cannot see the older text, so finding the article by it
is confusing.
Basis: probe. <sup>f-a7</sup>

<a id="a8"></a>
**A8 — Refinements that no control offers** · ❓ · latent.
The Search page applies refinements carried in its address (title-only,
abstract-only, contributor-only and galley-only words; keyword, subject,
section, category, funder and reviewer matches; a sort by title) for which
the page has no control, and drops all but the sort again when the reader
moves to the next page. The sort by published date it is built to accept
answers an error page ([A12](#a12)).
Question: are these the seeds of a coming advanced-search form, or should
they be documented as an integration surface?
Lean: they are unfinished; until controls exist they should at least
survive paging.
Basis: probe for the title-only, abstract-only, contributor-only and
galley-only words and the sort by title; judgment for the keyword,
subject, section, category, funder and reviewer matches. <sup>f-a8</sup>

<a id="a9"></a>
**A9 — Two configuration settings do nothing** · 🐞 · latent.
The configuration file's search section still carries "Minimum indexed
word length" and "The maximum number of search results fetched per
keyword", each with an explanation of its effect, but nothing reads either
value. An administrator tuning them changes nothing.
Since: 2025-08 (about a year). Basis: judgment. <sup>f-a9</sup>

<a id="a10"></a>
**A10 — No journal picker and no journal name on a press or server site** · ❓ · minor.
On a site hosting several presses (or servers), the site-wide Search page
searches all of them but offers no "By Journal" select to narrow to one, as
a journal site's page does, and its results carry no press or server name,
so two books from different presses look alike until opened. A journal
site names the journal under each title.
Question: should the press and server pages carry the same select and name
the press or server under each result?
Lean: yes; the machinery behind the select is shared, and both the select
and the name are missing only from the two page templates.
Basis: probe. <sup>f-a10</sup>

<a id="a11"></a>
**A11 — Galley text is never searched** · 🐞 · user-visible.
A reader who searches a word that appears only in the text of an article's
plain-text or HTML galley gets "No Results", on every application, however
long after the article was published, while a word from the same article's
title finds it. The site is built to read those galleys into the index (and
PDF, PostScript and Word galleys through a configured converter), and the
configuration file still documents the converters, but no galley text ever
reaches the index. Search therefore covers titles, abstracts and
contributor names only. Full text was searchable before the search engine
was replaced, so this reads as a regression, not a choice.
Since: 2025-08 (about a year). Basis: probe. <sup>f-a11</sup>

<a id="a12"></a>
**A12 — The sort by published date answers an error page** · 🐞 · latent.
A reader who opens a bookmarked or shared Search address that asks for the
results sorted by published date, in either direction, gets an error page
instead of the results, on a journal and on a preprint server. The page is
built to accept that sort (Rule 14), and the sort by title works. Nothing
on the page offers the sort, so only a typed or shared address meets it.
Basis: probe. <sup>f-a12</sup>

<a id="a13"></a>
**A13 — A malformed page number answers a completely empty page** · 🐞 · latent.
A reader who opens a bookmarked or hand-edited Search address whose page
number is not a number gets a completely empty page (no heading, no search
form, no message of any kind), on all three
applications; a page number beyond the last page shows "No Results" with
the searched words kept, as expected. Only a typed or shared address meets
it.
Basis: probe. <sup>f-a13</sup>

<a id="a14"></a>
**A14 — An impossible day is offered and rolled into the next month** · ❓ · minor.
The Day list under "Published After" and "Published Before" offers 1 to 31
whatever the Month chosen. A reader who chooses 31 September and presses
"Search" gets the filter applied as 1 October, and the selects then read
that date; 31 February becomes 3 March in a year whose February has 28
days. The reader is not told, and the date shown is not the one chosen.
Question: should the Day list follow the chosen month, or an impossible
date be refused rather than silently moved?
Lean: refuse or follow the month; a silently changed date is the same
surprise as [A1](#a1).
Basis: probe. <sup>f-a14</sup>

<a id="a15"></a>
**A15 — The Year lists follow unpublished articles' dates too** · ❓ · minor.
The Year lists under both date filters run from the earliest to the latest
publication date entered on any of the journal's articles, published or
not: a submission that has never been published but carries a publication
date two years back adds those years to the lists, while it stays out of
the results. A reader who chooses one of those years finds nothing.
Question: should the Year lists be built from published articles only?
Lean: yes; a year in which the journal published nothing is a dead
choice.
Basis: probe. <sup>f-a15</sup>

<a id="a16"></a>
**A16 — Whether a journal's own configuration governs its presence on the site-wide page** · ❓ · latent.
The site-wide Search page lists the content of every journal on the site
(Rule 10). Whether a journal's own configuration should decide whether
its content appears there is open.
Question: should a journal's own configuration govern whether its content
appears on the site-wide Search page?
Lean: it should; a journal's own settings ought to hold wherever its
content is listed.
Basis: judgment. <sup>f-a16</sup>

### OJS

<a id="ojs1"></a>
**OJS1 — The plural result count reads out a raw code** · 🐞 · minor.
The status line read to screen readers above the results says "Found one
item." for a single result, but with two or more it reads the raw code
"##search.searchResults.foundPlural##" instead of "Found {N} items.", on
every page of the results and on the bare page. A reader using assistive
technology hears the code.
Basis: probe. <sup>f-ojs1</sup>

<a id="ojs2"></a>
**OJS2 — "By Journal" is dropped by the page links and never shows as chosen** · 🐞 · user-visible.
On the site-wide Search page, choosing a journal under "By Journal" limits
the first page of results to that journal, but the page links drop the
choice: page 2 is the whole site's listing and the total jumps to the
site's own count (28 items on page 1 became 175 on page 2, seven pages,
on one install). And after any search the select
shows its blank entry again, although the results were limited, so the
reader cannot see that a journal is in force.
Basis: probe. <sup>f-ojs2</sup>

<a id="ojs3"></a>
**OJS3 — A visitor is asked to sign in instead of being told** · ❓ · minor.
On a journal that does not publish online, a visitor who presses the
header's "Search" link lands on the Login page, with no word that the
journal does not publish; the sentence "This journal does not publish its
content online." is shown only after signing in, to a Reader, Author,
Translator or Reviewer.
Question: should a visitor see the sentence directly?
Lean: yes; a Login page suggests the content is there for members, which
is not what the setting means.
Basis: probe. <sup>f-ojs3</sup>

### OMP

<a id="omp1"></a>
**OMP1 — The rebuild tool ignores the press path** · 🐞 · invisible.
The command-line index rebuild accepts a press path, refuses an unknown
one with "The given press path "{path}" could not be resolved to a press.",
and then rebuilds the index for every press on the site regardless of the
path given.
Basis: judgment. <sup>f-omp1</sup>

<a id="omp2"></a>
**OMP2 — The press's Search page is its own page** · ✅ · user-visible.
The press's Search page has one search box and "Search" button at its
foot, no Advanced filters, a visible "{N} Titles" count, its own found /
not-found sentences quoting the searched words, a "Search again" link, and
results shown as book summaries two to a row. The machinery behind it is
the same. The page has been the press's own since the press application
was built, so it reads as a design choice rather than drift.
Basis: probe. <sup>f-omp2</sup>

### OPS

<a id="ops1"></a>
**OPS1 — The screen-reader count always says one** · 🐞 · minor.
The status line read to screen readers above the results says "Found one
item." whenever anything was found, however many items the page lists
(seen with 3, 7 and 25).
Basis: probe. <sup>f-ops1</sup>

<a id="ops2"></a>
**OPS2 — A server's does-not-post gate cannot be reached, and would show a raw code** · ❓ · minor.
A preprint server is built to gate its Search page, and to hide the archive
header's search box, while its posting mode says "OPS will not be used to
post the server's contents online.", and to show a signed-in Reader a
sentence that exists in no language, so a raw code would appear in its
place. But the "Posting Mode" choice on Settings › Distribution › Access
says "Saved" and stores nothing (a defect of *Subscriptions & open access
control*, cited here), so the gated state cannot be reached: with the mode
"set", every visitor and every role still got the Search page and the
archive box.
Question: should a server have this gate at all, and if so, a working
setting and a sentence for it?
Lean: as built the gate is dead code and the sentence missing; either
remove the gate or make the setting store and add the sentence.
Basis: judgment. <sup>f-ops2</sup>

<a id="ops3"></a>
**OPS3 — The rebuild tool ignores the server path** · 🐞 · invisible.
As [OMP1](#omp1): the command-line rebuild accepts and checks a server
path, then rebuilds every server on the site.
Basis: judgment. <sup>f-ops3</sup>

### Seen on the way, owned elsewhere

- The workflow's header shows the raw code "##common.help##" where the help
  button's label belongs, on all three applications:
  [Workflow screen & stage access](U24-workflow-screen-and-stage-access.md).
- On a journal, a Publication Stage chosen in "Review Publishing Details"
  is saved even when the publish is then refused, and only a new version
  recovers: [Publish, schedule & versions](U49-publish-schedule-and-versions.md).
- A preprint server's "Posting Mode" on Settings › Distribution › Access
  says "Saved" and stores nothing: *Subscriptions & open access control*
  (cited in [OPS2](#ops2)).
- On a journal, a Subscription Manager who signs in lands on an
  access-denied page instead of a dashboard:
  [Login & sessions](U01-login-and-sessions.md).

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — the page and its handler chain.** `PKP\pages\search\SearchHandler`
(`lib/pkp/pages/search/SearchHandler.php`), ops `index` and `search`, both
running `search()`; dispatched by each app's `pages/search/index.php`.
**Chain check** (multi-app rule 8): OJS `APP\pages\search\SearchHandler`
and OPS's add only `authorize()` with `OjsJournalMustPublishPolicy` /
`OpsServerMustPublishPolicy` (fn-l); OMP's subclass is empty. OJS and OPS
`index.php` also route an op `similarDocuments` that no handler implements
(dead; any address using it errors). `setupTemplate()` marks the page
publicly cacheable unless the context has `restrictSiteAccess`; the
sign-in-to-view gate itself is `RestrictedSiteAccessPolicy`, site-wide.
Header link: `lib/pkp/templates/frontend/components/header.tpl`,
`.pkp_navigation_search_wrapper`, rendered `{if $currentContext &&
$requestedPage !== 'search'}`, string `common.search` "Search"; no app or
default theme overrides `header.tpl`. No user-dependent branch exists in
the handler or the result builder (fn-c), and the handler and engine only
read. Live-probed 2026-09-02 on scratch contexts of all three apps: the
header of a context's home and About pages holds exactly one "Search" link
(OJS header texts in order: the journal name, "Current", "Archives",
"About", "Search", "Register", "Login"; OMP "Catalog" in place of the first
two; OPS "Archives"); the Search page's own header holds none, and the site
home's header holds only "Register" and "Login". The link opens a page
titled "Search | {journal}", heading "Search", breadcrumb "Home / Search".
Signed-in Journal Manager, Section Editor and Reader saw, field by field,
the same page, controls, status line, paging and results as a visitor.
Re-checked 2026-09-02 on all three apps as a visitor: the header "Search"
link (`href` `…/<context>/search`) was present on the context's home,
About, Login, Register, Archives (OMP "Catalog"; OPS `preprints`),
article / book / preprint landing, Contact and Submissions pages; absent
on the Search page and on the site home, site Search and site Login pages
(header "Register | Login"). Signed in as every default role: the page a
role lands on after login (`/dashboard/editorial…`; Author and Translator
`/dashboard/mySubmissions`; Reviewer `/dashboard/reviewAssignments`; the
Reader lands on the journal home) has no "Search" link in its header and
no link ending in `/search` anywhere on it.

<a id="fn-b"></a>
**b — the forms.** OJS and OPS: `<app>/templates/frontend/pages/search.tpl`
(app-side copies; diff 2026-09-02: identical except OPS omits the
`searchContext` select block, sets no `role="form"`, and reads
`$results->count` as a property, fn-g). Form `form.cmp_form method="get"`
posting to the page's own address; box `input#query name="query"` with
sr-only label `search.searchFor` and placeholder `common.search`; fieldset
legend `search.advancedFilters`; `{html_select_date_a11y}` twice
(`PKPTemplateManager::smartyHtmlSelectDateA11y()`, each select with a
leading blank option, years `start_year..end_year`); OJS-only
`select#searchContext` `{if $searchableContexts}`; `button.submit`. Hook
points `Templates::Search::SearchResults::AdditionalFilters` and
`::PreResults`: no bundled plugin registers either (grep 2026-09-02). OMP:
`omp/templates/frontend/pages/search.tpl` includes
`components/searchForm_simple.tpl` after the results. OPS archive form:
fn-p. Live-probed 2026-09-02, verbatim: hidden label "Search articles for"
(OPS "Search preprints for"), placeholder "Search", legends "Advanced
filters", "Published After", "Published Before", select labels "Year",
"Month", "Day"; Year offers a blank entry then the published years ("2026"
alone on a context published only this year; "2024", "2025", "2026" on one
whose articles span 2024 and 2026), Month a blank then "Jan" … "Dec", Day a
blank then "1" … "31"; button "Search". "By Journal" appears only on the
site-wide page of the journal site (blank entry, then every enabled
journal by name). OMP: a form read out as "Book Search" holding one box
read out as "Search Query" (no placeholder, no visible label) and a
"Search" button, under the results when there are any and directly under
the heading otherwise.

<a id="fn-c"></a>
**c — what is indexed and what is returned.**
`PKP\search\SubmissionSearchResult::builderFromRequest()` builds a Laravel
Scout `Builder` (query = `query`, wheres `contextId`, `publishedFrom/To`,
`title`, `abstract`, `author`, `body`; whereIns `reviewers`, `categoryIds`,
`sectionIds`, `keywords`, `subjects`, `funders`; `orderBy`/`orderDir`).
`DatabaseEngine::buildQuery()` (`lib/pkp/classes/search/engines/`) selects
from `submissions_fulltext` joined to `submissions`, restricted to
submissions having a publication with `status = STATUS_PUBLISHED`;
`SubmissionSearchResult::newCollection()` then drops any hit whose
*current* publication is not published. Chain: OJS
`APP\search\SubmissionSearchResult::newCollection()` adds `issue` and
`issueAvailable` to each row (subscription check via `IssueAction`), but
no template reads `issueAvailable` (grep 2026-09-02), hence Rule 16; OMP
and OPS subclasses are empty. Index content:
`PKP\jobs\submissions\UpdateSubmissionSearchJob::handle()` upserts one
`submissions_fulltext` row per (submission, publication, locale) with
`title` = `getFullTitles()`, `abstract`, `authors` = concatenated
`getFullNames()`, and `body` meant to hold galley text (never filled,
f-a11). No locale filter in the query, so every language row matches.
Keywords/subjects/sections/categories/funders are filters (`whereIn`), not
searched text. Live-probed 2026-09-02, all three apps: a word placed only
in the abstract, a family name placed only on a contributor, the title word
typed in capitals, and a word placed only in the French title (site read in
English, no language switcher shown) each listed exactly the one article; a
never-published submission carrying the same title word as a published one
was never listed, for a visitor, a Journal Manager, a Section Editor or a
Reader. A published article returned to the workflow ("Return to
Workflow" → "Confirm") and declined ("Decline Submission" → "Record
Decision"; stage bubble "Declined") stayed listed and its result opened the
live landing page, on all three apps. OJS subscription case: an article in
an issue whose Access tab reads "Subscription" (the journal's Publishing
Mode set to "The journal will require subscriptions to access some or all
of its contents.") was listed with exactly the same markup as an open one
(title, contributors, date; no icon, label or note) and its landing page
opened for the visitor; the article carried no galley, so what the page
does with a file was not observed.

<a id="fn-d"></a>
**d — word matching.** `DatabaseEngine::buildQuery()` applies
`whereFullText(['title','abstract','body','authors'], $query)`. Laravel's
grammar renders that as `MATCH (…) AGAINST (? IN NATURAL LANGUAGE MODE)` on
MySQL/MariaDB (any-word, ranked but the ranking is discarded by the
`GROUP BY` + `pluck`) and as `to_tsvector('english', …) @@
plainto_tsquery('english', ?)` on PostgreSQL (all words, English stemming,
stop words dropped, punctuation ignored). The fleets are PostgreSQL
(harness.md), so live evidence covers the all-words side only. No syntax
layer exists anymore (the `searchSyntaxInstructions` template block is
empty). Live-probed 2026-09-02, identical on OJS, OMP and OPS, against
"Publications quarterly of brenthollow", "The vintrofal study" and three
"Notes on …" titles: "publication", "publications" and "public" each
listed the quarterly; "publi" and "quarterl" listed nothing ("No Results";
press: "No titles were found which matched your search for
"quarterl"."); "quarter" and "quarterly" one hit; "study", "studies" and
"studied" one hit; "note" and "notes" three hits; "AND" alone nothing.
With "Notes on tarnoble", "Notes on belquist" and "Notes on tarnoble and
belquist" published, `tarnoble belquist`, `"tarnoble belquist"`,
`tarnoble AND belquist` and `tarnoble OR belquist` each listed only the
third; the box echoed the text as typed, quotation marks included.
Re-checked 2026-09-02, identical on OJS, OMP and OPS, against "Children
of the uckaharbour" (abstract "…children who ran the uckaharbour and kept
running it.") and "Uckasubtok study" (abstract "…the uckasubtok
measurement."): "Children" and "children" one hit; "child", "childs" and
"CHILD" "No Results"; "ran", "run", "running", "runs" one hit;
"uckaharbour" and "uckaharbours" one hit, "ucka" and "harbour" none;
"study" and "studies" two hits, "stud" none; "measurement", "measure",
"measuring" one hit; "the", "of" and "the of" "No Results" although every
title holds them; "the uckaharbour" and "uckaharbour the study" one hit;
`uckaharbour,` `(uckaharbour)` `uckaharbour!` `"uckaharbour"`
`uckaharbour.` `uckaharbour's` and `uckaharbour & children` one hit;
`ucka-harbour` and `uckaharbour-children` "No Results" (both words of the
second are in the title); `uckaharbour uckasubtok` and `uckaharbour OR
uckasubtok` "No Results"; `???` "No Results". Mechanism: PostgreSQL's
`plainto_tsquery('english', …)` drops English stop words, and parses a
hyphenated pair into the whole plus its two parts, all of which must
match, so it finds only text that was hyphenated the same way.

<a id="fn-e"></a>
**e — the bare page.** `SearchHandler::search()` always runs the builder;
with an empty `query` the `->when($builder->query, …)` clause is skipped
and the SQL returns every published submission of the context. OJS/OPS
templates render whatever comes back; OMP's `search.tpl` opens with `{if
$query == ''}` and renders nothing but the form. Live-probed 2026-09-02:
on a scratch journal and server with five published articles, the bare
page and an empty "Search" both listed all five, "1 - 5 of 5 items"; the
press's bare page and empty search showed the heading, breadcrumb, box and
button only, with no count, no status text and no notice. Re-checked
2026-09-02 on all three apps: a box holding three spaces behaved exactly
as an empty box (the bare listing with the box shown empty; the press's
box-only page); a 600-character string, `<b>uckaharbour</b>` (shown
literally) and `???` were accepted without any error.

<a id="fn-f"></a>
**f — result summaries.** OJS: `frontend/objects/article_summary.tpl` with
`showDatePublished=true hideGalleys=true heading="h3"` and `journal=
$result.context` (outside a context the journal name is the subtitle span;
inside, title + subtitle); authors via `getAuthorString()`, `pages`, date
`date_format:$dateFormatShort`. OPS: `preprint_summary.tpl` with the same
flags; its `.details` line renders `publication.galley.downloads` then
`submission.dates`. OMP: `monograph_summary.tpl` (cover, `seriesPosition`,
full title, `getAuthorString(true)`, `datePublished`
`date_format:$dateFormatLong`), wrapped two per `.row` by `search.tpl`.
Landing links: `article/view/{id}` · `catalog/book/{id}` ·
`preprint/view/{id}`, prefixed with the result's own context path.
Live-probed 2026-09-02, verbatim: OJS "The vintrofal study" / "Zelda
Zorvakilen (Author)" / "2026-09-02"; OPS the same title and contributor
line, then "Downloads: 0" - "Submitted 2026-09-02 - Posted 2026-09-02";
OMP the default cover image (empty alternative text, linking to the book),
"The vintrofal study", "Zelda Zorvakilen (Author)", "September 2, 2026",
two summaries side by side when two were found. No galley links anywhere;
the title landed on the article page, the catalog book page and the
preprint page respectively, each headed "The vintrofal study"; the box
still held the word afterwards. The press's series position was not
observed (no seeded book had a series), so the body does not claim it.

<a id="fn-g"></a>
**g — counts and paging.** `PKPHandler::getRangeInfo($request, 'search')`:
page from `searchPage`, size from the context's `itemsPerPage` (schema
default 25; `lib/pkp/schemas/context.json`) or `[interface]
items_per_page` at site level; `$builder->paginate($count, 'submissions',
$page)` → `LengthAwarePaginator`. OJS `search.tpl`: sr-only `div[role=
status]` with `search.searchResults.foundSingle` / `foundPlural` passed a
`count`; the `en` locale entry for `foundPlural` carries no plural form, so
`LocaleBundle::translatePlural()` yields null and `Locale::translate()`
prints the key wrapped in `##` (OJS1). OPS: the same block reads
`$results->count` (a property the paginator lacks → null), so the plural
branch never fires (OPS1). OMP: `catalog.browseTitles` with
`$results->total()`, `catalog.foundTitlesSearch` / `foundTitleSearch` /
`noTitlesSearch`, `search.searchAgain` → a named anchor `search-form` on
the form. Pagination: `{page_info}` → `navigation.items`; `{page_links
name="search" …}` → `smartyPageLinks()` carrying `query`, `searchContext`,
`dateFrom*`, `dateTo*`, `orderBy`, `orderDir` only. Live-probed
2026-09-02, verbatim: OJS status "Found one item." with one result and
"##search.searchResults.foundPlural##" with 2, 3, 5, 7 and 25 (every
page, and the bare page); OPS "Found one item." with 1, 3, 7 and 25; OMP
"1 Titles" / "2 Titles" / "27 Titles" above "One title was found which
matched your search for "upcsoloq"." / "2 titles were found which matched
your search for "upebrindle"." / "27 titles were found which matched your
search for "upcpagetok"." and, with nothing found, no count and "No titles
were found which matched your search for "nowhereqix"."; each sentence is
followed by "Search again", which adds the anchor to the address and
scrolls the page to the form (the box keeps the word; focus does not move).
OJS/OPS with nothing found: "No Results". Paging with 27 hits, all three
apps: "1 - 25 of 27 items" with links "2", ">", ">>" and a plain-text "1";
after "2": "26 - 27 of 27 items" with links "<<", "<", "1" and a plain-text
"2"; the box kept the word, and Published After set to 2026 / Jan / 1
before searching was still selected on page 2. "Items per page":
re-checked 2026-09-02 on OJS at Settings › Website › Setup › Lists, field
"Items per page * Required", hint "Limit the number of items (for example,
submissions, users, or editing assignments) to show in a list before
showing subsequent items in another page.", value 25 (the same field and
hint on OMP and OPS; the Website page's tabs are Appearance, Setup,
Plugins, and Lists sits under Setup); set to 2 and saved, a five-hit
search read "1 - 2 of 5 items" with links "1 2 3 > >>"; restored to 25.
Stale paging, 2026-09-02, all three apps: `searchPage=1` and `=0` page 1;
`searchPage=9` beyond the last page → "No Results" (press: "No titles were
found which matched your search for "uckaharbour"."), the box holding the
word, no paging line; a non-numeric value is f-a13.

<a id="fn-h"></a>
**h — date filters.** Two parsers disagree. Display:
`SearchHandler::_assignDateFromTo()` builds `dateFrom`/`dateTo` for the
selects from the `date{From,To}{Year,Month,Day}` user vars, defaulting a
missing month/day, and the resulting date is then re-split for the selects
one day early. Query: `SubmissionSearchResult::builderFromRequest()` calls
`$request->getUserDateVar('dateFrom')` with **no defaults**, and
`PKPRequest::getUserDateVar()` returns `null` when month or day fails
`FILTER_VALIDATE_INT` in range 1..12 / 1..31, so a year-only or
year-month choice yields no filter (A1). `DatabaseEngine`:
`whereDate('p.date_published', '>=', $publishedFrom)` and
`whereDate('p.date_published', '<', $publishedTo)` (A2; `OpenSearchEngine`
uses `gte`/`lte`), inside a `whereExists` over any published publication of
the submission. Year range: `Repo::publication()->getDateBoundaries()`
(MIN/MAX `date_published` over the context's publications) →
`yearStart`/`yearEnd`; with no dates both are "" and the year loop yields a
single blank entry. Live-probed 2026-09-02 on OJS and OPS with two
articles published 2024-06-01 and 2024-06-15 (dates set through
"Publication Date" / "Date Posted" before publishing): Published After
2024 / Jun / 10 listed the 15th only, and the selects still read "2024",
"Jun", "10"; Published Before 2024 / Jun / 10 listed the 1st only;
Published After Jun 15 listed the 15th; Published Before Jun 15 listed the
1st only; Published Before Jun 1 gave "No Results"; Published Before Jun 16
listed both. Year 2025 alone under either filter listed both articles and
the selects then read "2024", "Nov", "30"; 2025 + Jun listed both and read
"2025", "May", "31"; 2024 alone read a blank Year, "Nov", "30". The Year
lists read blank, "2024", "2025", "2026" (the third article was published
2026-09-02). A journal with nothing published opened its Search page with
two blank Year entries in each list, full Month and Day lists, and "No
Results".

<a id="fn-i"></a>
**i — site-wide search.** With no context, `contextId` falls back to
`(int) $request->getUserVar('searchContext')` (0 = all), the SQL `where
context_id` clause is skipped, and `searchableContexts` =
`app()->get('context')->getManySummary(['isEnabled' => true])` is assigned
for the select. Address: `index/search` (`index.php/index/search` without
URL rewriting). OJS's `index.php` adds the must-publish policy only `if
($request->getContext())`, so the site-level page is never gated by it.
Live-probed 2026-09-02 on all three apps: the page opened with heading
"Search" and breadcrumb "Home / Search" and no header "Search" link; a
token from each of two scratch contexts listed that context's one article
and the title opened it inside its own context; the OJS page carried "By
Journal" with a blank entry and ten journals by name, and each OJS result
showed the journal's name ("Upe Alpha Scratch") under the title; the OMP
and OPS pages had no select and their results carried no press or server
name. No link or form on the site home, the site About page (a visitor is
sent to Login there), a context's home, Search or About page targets the
site-wide page; every "Search" link and box targets the context's own page.
Address forms, re-checked 2026-09-02 as a visitor on all three apps:
`<host>/index/search` and `<host>/index.php/index/search` open the page
(it lands on `/index.php/index/en/search`, heading "Search"), as does
`index/search/search?query=…`; `<host>/index.php/index/index/search` (the
home page's shown address plus `/index/search`) and `<host>/index.php/search`
give "404 Not Found".

<a id="fn-j"></a>
**j — order.** `DatabaseEngine::buildQuery()` adds `ORDER BY` only when
the builder carries one (`orderBy=title|datePublished`, and `featured` on
OMP); otherwise the query ends in `GROUP BY s.submission_id` with no
ordering, so PostgreSQL returns rows in an implementation-defined order.
`OpenSearchEngine` returns hits by score. Live-probed 2026-09-02, all three
apps: three articles sharing a word, dated 2024-03-10, 2023-11-05 and
2025-07-20 through the workflow's date field, came back in that order
(neither date order) in six searches; the bare page of the same context
listed seven articles in an order that followed neither their numbers nor
their titles, identically on repeated loads.

<a id="fn-k"></a>
**k — index currency.** Listener
`PKP\observers\listeners\UpdateSubmissionInSearchIndex` subscribes to
`PublicationPublished` and `PublicationUnpublished` (dispatched from
`PKP\publication\Repository::publish()` / `unpublish()`; OJS's overrides
call the parent) and calls `engine()->update([submission])`.
`DatabaseEngine::update()` deletes the submission's `submissions_fulltext`
rows synchronously, then `dispatch(new UpdateSubmissionSearchJob($id))`
(`timeout` 180 s; the job iterates **all** `publications` of the
submission, whatever their status, A7). On the test installs `[queues]
job_runner = Off`, so the job runs only when the harness drains the queue
(`shared/playwright/support/jobs.js`, serial project only); on a live site
the queue worker picks it up. Unpublish is immediate twice over: the rows
are deleted synchronously and the SQL requires a published publication.
Deletion: `submissions_fulltext.submission_id` and `.publication_id`
carry `ON DELETE CASCADE` (`SubmissionSearchMigration`). No other
dispatcher exists (grep 2026-09-02 for `EngineManager`,
`UpdateSubmissionSearchJob` and `submissions_fulltext` across
`lib/pkp/classes`, `lib/pkp/api`, `lib/pkp/controllers` and the apps'
`classes/`): nothing on `Repo::publication()->edit()`, galley or author
changes (A3). Archaeology: the engine replacement is pkp/pkp-lib#8920
(`b44cf277`, 2025-08-01) with follow-ups through 2026-07-16; the dropped
edit-time refresh was the pre-replacement
`SubmissionSearchIndex::submissionMetadataChanged()` path. Live-probed
2026-09-02, all three apps: "Unpublish" (OPS "Unpost") → the visitor's next
search read "No Results" with no queue run; publishing again → still "No
Results" until the queue ran, then listed. Editing the title of a published
version and pressing "Save" (banner "Warning: This version has been
published. Editing it may impact the published content.") → the result
showed the new title at once, the old word found it and the new word did
not, before and after a queue run; "Create New Version" and publishing 1.1
→ both words found it once the queue ran. A published date changed through
the workflow's date field showed in the result at once. OJS: "Unpublish
Issue" on the issue holding a found article → "No Results" at once, the
control article still found. Delete path: "Return to Workflow" → "Decline
Submission" → "Delete" ("Are you sure you want to permanently delete this
submission?") → "No Results" at once, no queue run; no screen offered
"Delete" while the article was published.
Re-checked 2026-09-02, all three apps. Versions: with 1.0 and 1.1 both
published, "Unpublish" (OPS "Unpost") on 1.1 ("Unpublish Are you sure you
don't want this to be published? Unpublish Cancel") → the entry read
"Status: Unpublished" with "Preview" and "Publish"; the visitor's search
found neither version's word at once, the landing page still answered with
the 1.0 title, and after a queue run both words found the article, listed
under the 1.0 title (`UpdateSubmissionSearchJob` indexes every
publication, A7; `Repository::unpublish()` reverts the current
publication to 1.0). The unpublished 1.1 offered only "Preview" and
"Publish" / "Post" and no delete, so the version-deletion cascade
(`ON DELETE CASCADE`) has no screen behind it. Contributors: "Add
Contributor" on a published article, saved → the result line read the new
name at once ("… Uckb Authorson (Author); Nova Uckbnewcontrib (Author)
…"), while searching the new family name gave "No Results" before and
after a queue run. Issue (OJS): "Unpublish Issue" ("Are you sure you want
to unpublish this published issue?") → the article's word "No Results" at
once and its landing page "404 Not Found"; "Publish Issue" again → still
"No Results" until the queue ran, then listed (`Repo::issue()->publish()`
republishes its publications through the same listener).

<a id="fn-l"></a>
**l — the must-publish gate.** OJS
`APP\security\authorization\OjsJournalMustPublishPolicy` (message key
`user.authorization.journalDoesNotPublish`): permits `ROLE_ID_MANAGER`,
`ROLE_ID_SITE_ADMIN`, `ROLE_ID_ASSISTANT`, `ROLE_ID_SUB_EDITOR`,
`ROLE_ID_SUBSCRIPTION_MANAGER` holders in the context; otherwise denies
when `publishingMode == PUBLISHING_MODE_NONE`. A denied policy sends an
anonymous user to Login and a signed-in one to `user/authorizationDenied`
with the message. Default group names per level (`registry/userGroups.xml`,
OJS): manager = Journal Manager, Journal Editor, Production Editor;
sub-editor = Section Editor, Guest Editor; assistant = Copyeditor, Designer,
Funding Coordinator, Indexer, Layout Editor, Marketing and Sales
Coordinator, Proofreader, Editorial Board Member. OPS
`OpsServerMustPublishPolicy`: same minus the subscription manager; its
message key `user.authorization.serverDoesNotPublish` is defined in **no**
locale file of OPS or lib/pkp (grep 2026-09-02), and `ops/schemas/context.json`
has no `publishingMode` entry at all, so the setting form's value is
discarded on save. OMP has no `publishingMode` and no such policy. The
header link has no such check. Live-probed 2026-09-02, OJS: Settings ›
Distribution › Access, "Publishing Mode" radios "The journal will provide
open access to its contents.", "The journal will require subscriptions to
access some or all of its contents.", "OJS will not be used to publish the
journal's contents online." (none checked on a fresh journal); with the
third chosen and "Saved": the header still showed "Search" for everyone; a
visitor pressing it landed on the Login page; a Reader, an Author and a
Reviewer got a page reading "This journal does not publish its content
online."; Journal Manager, Section Editor, Copyeditor, Subscription Manager
and Site Administrator got the Search page. Restoring open access gave the
visitor the page again. Re-checked 2026-09-02 with every default OJS group
plus the Site Administrator, twice on two scratch journals: Journal
Manager, Journal Editor, Production Editor, Section Editor, Guest Editor,
Subscription Manager, the eight assistant-level groups and the Site
Administrator got the Search page; Reader, Author, Reviewer, a user holding
Reader and Author, and Translator (an author-level default group,
`ROLE_ID_AUTHOR`, hence outside the policy's permitted list) got the page
`user/authorizationDenied?message=user.authorization.journalDoesNotPublish`
reading "This journal does not publish its content online."; the visitor
got `login?source=…/search`. The header showed "Search" for every actor. OPS: "Posting Mode" radios "The server will
provide open access to its contents.", "OPS will not be used to post the
server's contents online."; choosing the second and "Save" showed "Saved",
but after reload neither radio was checked and the save's response carried
no posting mode; visitor, Preprint Server Manager, Moderator, Editorial
Board Member, Reader, Author and Site Administrator all got the Search
page and no raw code appeared anywhere. OMP: Distribution offers the tabs
"License", "DOIs", "Search Indexing", "Payments", "Statistics", no Access
tab and no publishing mode; a visitor got the Search page.

<a id="fn-m"></a>
**m — address-only refinements.** Builder parameters with no form control
(fn-c): `title`, `abstract`, `author`, `body` (each a full-text match on
one column), `keywords[]`, `subjects[]` (exact match on the controlled
vocabulary's `name`/`identifier`), `sectionIds[]`, `categoryIds[]`,
`funders[]` (first value only on the database driver; ROR or lower-cased
name, via `Collector::filterByFunder`), `reviewers[]` (first value only;
LIKE on the reviewer's names/affiliation, open + public + confirmed
reviews, context-scoped), `orderBy=title|datePublished` +
`orderDir=asc|desc`. `page_links` forwards only `query`, `searchContext`,
the date parts, `orderBy` and `orderDir`. Live-probed 2026-09-02 by typing
addresses, all three apps: `author=` with a contributor's family name kept
the 27 hits and an unknown name gave nothing; `title=` with an
abstract-only word gave nothing while `abstract=` with it found all 27;
`orderBy=title&orderDir=asc` listed a, aa, b … and `desc` the reverse, and
the "2" link carried the sort; the "2" link carried no `author`, `title`
or `abstract` (the total went from 27 to 28 on page 2 after `abstract=`).
On the press, an empty `query` with any refinement showed the bare page.
Re-checked 2026-09-02 by address: `title=`, `abstract=`, `author=`
(either case), `body=` (nothing, A11) and `orderBy=title` with `asc` /
`desc` held on OJS, OMP (bare page with an empty `query`) and OPS;
`orderBy=datePublished` with either `orderDir` answered "HTTP 500" on OJS
and OPS (not tried on OMP; the engine passes `datePublished` to an SQL
`orderBy` that has no such column). `keywords[]`, `subjects[]`,
`sectionIds[]`, `categoryIds[]`, `funders[]` and `reviewers[]` were not
exercised (no article carried such metadata), so those remain judgment.

<a id="fn-n"></a>
**n — configuration.** `config.TEMPLATE.inc.php` `[search]` (identical in
OJS, OMP, OPS, diff 2026-09-02): `driver = database` (engines registered
in `PKPContainer` as `database` → `DatabaseEngine`, `opensearch` →
`OpenSearchEngine`), `search_index_name = "submissions"`,
`opensearch_hosts/username/password/ssl_verification/debug`,
`min_word_length = 3`, `results_per_keyword = 500`, `index[<mime>]`
helper lines. `min_word_length` and `results_per_keyword` are read by no
PHP file (grep 2026-09-02 outside the config templates), A9. The test
config (`config.test.inc.php`) keeps `driver = database` and no
`index[…]` lines. Not live-probed (no screen).

<a id="fn-o"></a>
**o — the rebuild tool and install.** `tools/rebuildSearchIndex.php`
(per app; atlas CLI-029): optional switches, optional context path
(OJS `JournalDAO::getByPath`, exit with
`search.cli.rebuildIndex.unknownJournal`; OMP/OPS likewise with
`unknownPress`/`unknownServer`), then `flush()`, `deleteIndex()`,
`createIndex()` and `update()` in chunks of 100 over
`filterByContextIds([$journal?->getId() ?? SITE_CONTEXT_ID_ALL])`. OMP
and OPS assign the resolved context to `$press` / `$server` but filter on
the never-set `$journal` → always all contexts (OMP1, OPS3; the OJS copy
is correct). `DatabaseEngine::flush()` truncates `submissions_fulltext`;
`createIndex()`/`deleteIndex()` are no-ops on the database driver and
create/drop the mapping on OpenSearch. `Installer::rebuildSearchIndex()`
flushes and re-updates everything at install/upgrade. Not run (no screen).

<a id="fn-p"></a>
**p — the OPS archive header.**
`ops/templates/frontend/components/archiveHeader.tpl` (included by
`pages/indexServer.tpl` and `pages/preprints.tpl`; atlas AFFR-078,
owned by *Sections*, search portion cited here) includes
`components/searchForm_archive.tpl`: `{if !$currentServer ||
$currentServer->getData('publishingMode') != PUBLISHING_MODE_NONE}` →
`form.pkp_search role="search" aria-label="Preprint Search"` posting GET
to `search/search`, `input name="query" value="{$searchQuery}"` (the
variable is never assigned, so the box is always empty), button
`common.search`. Live-probed 2026-09-02: the server's home page and its
Preprints page (heading "Archives") each carried a form read out as
"Preprint Search" with an empty box read out as "Search Query" (no
placeholder) and a "Search" button; typing a word and pressing "Search"
opened the Search page with the word in the box and its two results,
"1 - 2 of 2 items". The hiding clause could not be observed (fn-l: the
posting mode does not store).

<a id="fn-s"></a>
**s — seeding for the scenarios.** Scratch contexts and published
submissions come from the scenario API (`docs/process/scenarios.md`):
`POST scenarios/context`, then `createSubmission` with `published: true`,
a chosen `title`, `abstract`, and contributor names (OJS accepts a
published seed without an `issue`; `metadata.datePublished` for scenario
7's two dates, or set the date through the workflow's "Publication Date" /
"Date Posted" field before publishing). Publishing through the API
dispatches the index job exactly as the UI does, so every scenario that
expects a hit must run in the serial project and call `runJobs()` after
seeding and after any republish (fn-k). Use one made-up token per article
(whitespace-free, letters only, e.g. `zq{tag}title`), since PostgreSQL
full-text drops digits-only tokens and stems words. On shared fleets
another session's drain may run this session's jobs first; count results,
not jobs.

<a id="fn-s1"></a>
**s1** — Two published articles in a scratch journal, each with its own
token in the title; header link `a.pkp_search` → `search`; expect one
`li` in `ul.search_results` (OMP: one `.obj_monograph_summary`).
Live-probed 2026-09-02 on all three apps (fn-a, fn-f).

<a id="fn-s2"></a>
**s2** — Tokens placed in `abstract` and in a contributor's `familyName`
only; the capitals step relies on the database's case folding
(PostgreSQL `to_tsvector` lower-cases). Live-probed 2026-09-02 on all
three apps (fn-c).

<a id="fn-s3"></a>
**s3** — Strings: `search.noResults` "No Results" (OJS/OPS);
`catalog.noTitlesSearch` and `search.searchAgain` (OMP). Live-probed
2026-09-02 (fn-g).

<a id="fn-s4"></a>
**s4** — The unpublished sibling: `createSubmission` with `submitted:
true`, `published: false`, the same token in its title; sign in as the
scratch journal's manager. Live-probed 2026-09-02 on all three apps
(fn-c).

<a id="fn-s5"></a>
**s5** — Unpublish through the workflow's publication area ("Unpublish";
OPS "Unpost"; *Publish, schedule & versions*); the removal needs no queue
drain (fn-k); the republish needs `runJobs()` before the visitor's second
search. Live-probed 2026-09-02 on all three apps (fn-k).

<a id="fn-s6"></a>
**s6** — 27 published articles sharing one token; page size is the
scratch context's `itemsPerPage` default 25. Strings `navigation.items`;
links from `smartyPageLinks()`. Live-probed 2026-09-02 on all three apps
(fn-g).

<a id="fn-s7"></a>
**s7** — `metadata.datePublished` of the 1st and 15th of a past month;
choose all three parts of each filter (A1). The "before the 10th" step is
unaffected by A2. Live-probed 2026-09-02 on OJS and OPS with 2024-06-01
and 2024-06-15 (fn-h).

<a id="fn-s8"></a>
**s8** — Two scratch journals, one article each; site-level address
`<host>/index/search` (or `<host>/index.php/index/search`; appending
`/index/search` to the home page's shown `…/index.php/index/en` gives
"404 Not Found", fn-i); `select#searchContext` "By Journal". Live-probed
2026-09-02 (fn-i, f-ojs2).

<a id="fn-s9"></a>
**s9** — Settings › Distribution › Access, publishing mode radio
`manager.distribution.publishingMode.none`; message
`user.authorization.journalDoesNotPublish`; a fresh scratch journal has no
radio checked, so "restore" means choosing open access. Live-probed
2026-09-02 (fn-l).

<a id="fn-s10"></a>
**s10** — `section.archiveHeader_search form.pkp_search` on `index` and
`preprints`; `submission.dates` string preceded by the download count.
Live-probed 2026-09-02 (fn-p).

<a id="fn-s11"></a>
**s11** — `catalog.browseTitles` renders "1 Titles" (no singular form);
`catalog.foundTitleSearch`; named anchor `search-form`. Live-probed
2026-09-02 (fn-g).

<a id="fn-f-a1"></a>
**f-a1** — fn-h: `getUserDateVar()` returns null when a part is missing,
and the display path re-selects the parts from a date one day earlier than
the chosen period. Live-probed 2026-09-02 on OJS and OPS: Year 2025 alone
→ unfiltered results, selects "2024" / "Nov" / "30"; 2025 + Jun → "2025" /
"May" / "31"; 2024 alone → blank Year / "Nov" / "30". Re-checked
2026-09-02 on OJS and OPS under both filters: 2026 + Day 2 with no Month →
unfiltered, selects blank Year / "Dec" / "2"; Sep + 2, Sep alone and Day 2
alone (no Year) → unfiltered, all three selects blank; 2026 + Sep →
"2026" / "Aug" / "31"; 2026 + Dec → "2026" / "Nov" / "30".

<a id="fn-f-a2"></a>
**f-a2** — fn-h: `whereDate(…, '<', $publishedTo)` versus the OpenSearch
`lte` range. Live-probed 2026-09-02: Published Before 2024 / Jun / 15 left
out the article published 2024-06-15; Published After the same day kept it.

<a id="fn-f-a3"></a>
**f-a3** — fn-k: the only dispatchers are the publish/unpublish listener,
the installer and the CLI; the pre-2025 `submissionMetadataChanged()` hook
on `Repo::publication()->edit()` has no successor. Multi-app rule 6: broke
in a modernization window (pkp/pkp-lib#8920, 2025-08) → decay, not choice.
Live-probed 2026-09-02 on all three apps: a title edited and saved on the
published version was shown in the result at once, but only the old word
found it, before and after a queue run.

<a id="fn-f-a4"></a>
**f-a4** — fn-j. Live-probed 2026-09-02: the order was neither date order,
and it was the same on every repetition, so the earlier "not necessarily
the same twice" wording was dropped.

<a id="fn-f-a5"></a>
**f-a5** — fn-d. The PostgreSQL side live-probed 2026-09-02 (all words
required; quotes, AND and OR change nothing); the MySQL/MariaDB side is
judgment from Laravel's `whereFullText` grammar.

<a id="fn-f-a6"></a>
**f-a6** — fn-e. Live-probed 2026-09-02 on all three apps.

<a id="fn-f-a7"></a>
**f-a7** — fn-k: `UpdateSubmissionSearchJob::handle()` loops
`$submission->getData('publications')` without a status filter; the
`newCollection()` status check is on the current publication only.
Live-probed 2026-09-02 on all three apps: after version 1.1 with a new
title word was published and the queue ran, the old title word still found
the article.

<a id="fn-f-a8"></a>
**f-a8** — fn-m. Live-probed 2026-09-02 by address on all three apps
(`author`, `title`, `abstract`, `body`, `orderBy=title` with
`orderDir`); the sort survived "2", `abstract` did not. The keyword,
subject, section, category, funder and reviewer parameters were not
exercised (fn-m); `orderBy=datePublished` is f-a12.

<a id="fn-f-a9"></a>
**f-a9** — fn-n. Judgment from a repository-wide grep; no screen to probe.

<a id="fn-f-a10"></a>
**f-a10** — fn-b, fn-f, fn-i: the OPS `search.tpl` copy lacks the
`searchContext` block and OMP's `searchForm_simple.tpl` has no select,
while `searchableContexts` is assigned by the shared handler on all three;
OMP's `monograph_summary.tpl` and OPS's `preprint_summary.tpl` render no
context name, while OJS's `article_summary.tpl` prints `journal` as the
subtitle outside a context. Live-probed 2026-09-02 on the site-wide page
of each app.

<a id="fn-f-a11"></a>
**f-a11** — `UpdateSubmissionSearchJob::handle()` collects galley files
with `Repo::submissionFile()->getCollector()->filterByAssoc(ASSOC_TYPE_REPRESENTATION,
[$publication->getId()])->filterByFileStages([SUBMISSION_FILE_PROOF])`,
i.e. by the publication's id, whereas a galley file's `assoc_id` is the
galley's own id; the two only coincide by accident, so `$bodies` stays
empty and `body` is never written. `SearchFileParser::fromFileType()` does
accept `text/plain` and `text/html`, so the parsers are not the cause.
Same job in all three checkouts, last touched by pkp/pkp-lib#8920
(2025-08-14); before the replacement `SubmissionSearchIndex` read galleys
by their own ids. Live-probed 2026-09-02 on all three apps: a plain-text
galley and an HTML galley each carrying a unique word were uploaded through
the workflow ("Add galley" → "Create New Galley" → the upload wizard; OMP:
a publication format with approved, available files), the article was
published and the queue run; both words gave "No Results" while the title
word found the article; on OJS and OPS the galleys were served to the
visitor from the landing page with the words inside.

<a id="fn-f-a12"></a>
**f-a12** — fn-m: `SubmissionSearchResult::builderFromRequest()` accepts
`orderBy=datePublished`, and `DatabaseEngine::buildQuery()` then joins
`publications AS cp` and orders by the bare `cp.date_published` inside a
grouped query, without the aggregate the title sort uses
(`MIN(title_current.setting_value)`); PostgreSQL rejects the statement.
Live-probed 2026-09-02 as a visitor: `…/search/search?query=&orderBy=datePublished&orderDir=desc`
and `…&orderDir=asc` answered "HTTP 500" on a journal (OJS) and a server
(OPS); `orderBy=title` with either direction listed the results sorted.
Not tried on a press.

<a id="fn-f-a13"></a>
**f-a13** — fn-g: `PKPHandler::getRangeInfo()` passes the raw
`searchPage` value into the page range (`new DBResultRange($count,
$pageNum)`), so a non-numeric value reaches the paginator unchecked. Live-probed 2026-09-02 as a visitor
on OJS, OMP and OPS: `…/search/search?query=uckaharbour&searchPage=abc`
answered status 500 with an empty body (a blank page, no text);
`searchPage=9` on a one-hit search answered "No Results" with the box
holding the word.

<a id="fn-f-a14"></a>
**f-a14** — fn-h: `SearchHandler::_assignDateFromTo()` builds the date
with `mktime()`, which rolls an out-of-range day forward, and
`PKPRequest::getUserDateVar()` accepts any day 1..31; the Day list is
`smartyHtmlSelectDateA11y()`'s fixed 1..31. Live-probed 2026-09-02 on OJS
and OPS with three articles published 2026-09-02, empty box: Published
After 2026 / Feb / 31 listed all three and the selects then read "2026",
"Mar", "3"; Published Before 2026 / Feb / 31 → "No Results", selects "2026",
"Mar", "3"; Published After 2026 / Sep / 31 → "No Results", selects "2026",
"Oct", "1"; Published Before 2026 / Sep / 31 listed all three, selects
"2026", "Oct", "1". Re-probed 2026-09-03 on OJS and OPS as a visitor,
empty box: "31 September" under either Published After or Published
Before re-rendered the selects as "2026", "Oct", "1" (OJS) and "2024",
"Oct", "1" (OPS), and "31 February" (a 28-day February) as "2026", "Mar",
"3" (OJS) and "2023", "Mar", "3" (OPS). The address kept the raw values
each time (`dateFromMonth=9&dateFromDay=31`, `dateToMonth=9&dateToDay=31`,
`dateFromMonth=2&dateFromDay=31`, `dateToMonth=2&dateToDay=31`) and no
validation message appeared on the page.

<a id="fn-f-a15"></a>
**f-a15** — fn-h: `Repo::publication()->getDateBoundaries()` takes MIN and
MAX `date_published` over the context's publications with no status
filter. Live-probed 2026-09-02 on OJS and OPS: on a journal whose Year
lists read blank, "2026", the Journal Manager set "Publication Date" (OPS
"Date Posted") of a never-published submission to 2024-03-15 and saved
("Saved"); the visitor's Year lists then read blank, "2024", "2025",
"2026" under both filters, while the results still listed the same three
published articles and the dated submission stayed unlisted. Whether a
formerly published article keeps its year after being unpublished was
not observed; the same query, with `unpublish()` leaving `date_published`
in place, points to yes.

<a id="fn-f-a16"></a>
**f-a16** — fn-i. The question was raised on 2026-09-02.

<a id="fn-f-ojs1"></a>
**f-ojs1** — fn-g: `templates/frontend/pages/search.tpl` passes `count`
to `search.searchResults.foundPlural`, whose `en` entry ("Found {$count}
items.") has no plural forms, so `translatePlural()` returns null and the
key prints as `##search.searchResults.foundPlural##`. Live-probed
2026-09-02 with 2, 3, 5, 7 and 25 results, on every page and on the bare
page; "Found one item." with one result.

<a id="fn-f-ojs2"></a>
**f-ojs2** — fn-g, fn-i: `smartyPageLinks()` forwards `searchContext`
but the value is read from the request only when a context is absent,
and the template does not re-select the chosen option. Live-probed
2026-09-02 on the OJS site-wide page: with "Scratch upcpage" chosen and an
empty box, page 1 read "1 - 25 of 28 items"; every page link carried an
empty journal choice; "2" read "26 - 43 of 43 items" and listed articles
from three journals; after every search (including one that gave "No
Results" for the other journal's word) the select showed its blank entry
while the address still carried the chosen journal. Re-checked 2026-09-02
on a fuller site (60 journals in the select): page 1 with "Scratch
upcpage" chosen read "1 - 25 of 28 items 1 2 > >>", the address carried
`searchContext=3`, every page link carried `searchContext=` empty, and "2"
read "26 - 50 of 175 items << < 1 2 3 4 5 6 7 > >>": the whole site's
listing.

<a id="fn-f-ojs3"></a>
**f-ojs3** — fn-l: a denied authorization policy redirects an anonymous
request to `login?source=…`, so the "does not publish" message is reached
only by signed-in users. Live-probed 2026-09-02: the visitor's address
became the Login page with the Search page as its source; Reader, Author,
Translator and Reviewer saw "This journal does not publish its content
online." (fn-l).

<a id="fn-f-omp1"></a>
**f-omp1** — fn-o: `$press` assigned, `$journal` filtered. Judgment from
the tool's source; not run.

<a id="fn-f-omp2"></a>
**f-omp2** — fn-b, fn-f, fn-g: `omp/templates/frontend/pages/search.tpl`
and `components/searchForm_simple.tpl`; OMP's handler and result classes
are empty subclasses, so the difference is entirely in the templates.
Live-probed 2026-09-02: count line, the three sentences, "Search again",
two-per-row summaries and the catalog link, as fn-g and fn-f record.

<a id="fn-f-ops1"></a>
**f-ops1** — fn-g: `{if $results->count > 1}` reads a property the
paginator does not have. Live-probed 2026-09-02: "Found one item." with 1,
3, 7 and 25 results.

<a id="fn-f-ops2"></a>
**f-ops2** — fn-l: the policy's message key exists in no `.po` file of the
OPS checkout (grep 2026-09-02, `locale/` and `lib/pkp/locale/`), and
`ops/schemas/context.json` has no `publishingMode`, so
`OpsServerMustPublishPolicy` and the archive form's `{if}` compare against
a value that is never stored. Live-probed 2026-09-02: "Posting Mode" set to
"OPS will not be used to post the server's contents online." and saved
("Saved"); after reload neither radio checked, the save response without
the setting; every actor got the Search page and the archive box, no
`##…##` text anywhere. The gated state was not reached.

<a id="fn-f-ops3"></a>
**f-ops3** — fn-o: `$server` assigned, `$journal` filtered. Judgment from
the tool's source; not run.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Search page (in a journal) | `{journal}/search` · `{journal}/search/search` (the form posts to the page's own address) | ROUTE-024 · ROUTE-048 (OJS) · ROUTE-067 (OMP) · ROUTE-083 (OPS) · AFFR-083, 084 (OJS/OPS form and results) · AFFR-085 (OMP page) |
| Site-wide Search page | `index/search` (`index.php/index/search` without URL rewriting; the page lands on `index.php/index/{locale}/search`) | ROUTE-024 |
| Header "Search" link | every context page, `header.tpl` (owned by *Navigation menus & site chrome*) | AFFR-007 (cited) |
| Preprint-server archive header search box | server home · `preprints` (archive header owned by *Sections*; search-form portion cited here) | AFFR-078 (rider) · AFFR-027 (home-page include, owned by *Appearance & theming*) |
| Address-only refinements | query parameters listed in fn-m | ROUTE-024 |
| Dead op | `search/similarDocuments` (OJS, OPS): routed, not implemented | ROUTE-048 · ROUTE-083 |
| Config | `config.inc.php` `[search]` | SET-054 |
| Index refresh job | `UpdateSubmissionSearchJob`, queued by publish/unpublish | JOB-027 |
| Index rebuild | `php tools/rebuildSearchIndex.php [journal_path]` | CLI-029 (reference only, per the CLI ruling) |

## Reference — code anchors

- `lib/pkp/pages/search/SearchHandler.php` — the page; `<app>/pages/search/SearchHandler.php` (OJS/OPS: must-publish policy; OMP: empty), `<app>/pages/search/index.php`
- `lib/pkp/classes/search/SubmissionSearchResult.php` — request → builder → result rows; `<app>/classes/search/SubmissionSearchResult.php` (OJS: issue availability; OMP/OPS: empty)
- `lib/pkp/classes/search/engines/DatabaseEngine.php` · `OpenSearchEngine.php` — the two drivers
- `lib/pkp/classes/search/parsers/SearchFileParser.php` · `SearchHTMLParser.php` · `SearchHelperParser.php` — galley text extraction
- `lib/pkp/jobs/submissions/UpdateSubmissionSearchJob.php` · `lib/pkp/classes/observers/listeners/UpdateSubmissionInSearchIndex.php` — the refresh
- `lib/pkp/classes/migration/install/SubmissionSearchMigration.php` · `upgrade/v3_6_0/I8920_ReplaceSearchEngine.php` — the `submissions_fulltext` table
- `<app>/tools/rebuildSearchIndex.php` · `lib/pkp/classes/install/Installer.php::rebuildSearchIndex()`
- Templates: `ojs/templates/frontend/pages/search.tpl`, `ops/templates/frontend/pages/search.tpl` (copies), `omp/templates/frontend/pages/search.tpl` + `components/searchForm_simple.tpl`, `ops/templates/frontend/components/archiveHeader.tpl` + `searchForm_archive.tpl`, `lib/pkp/templates/frontend/components/header.tpl`; `PKPTemplateManager::smartyHtmlSelectDateA11y()`, `smartyPageInfo()`, `smartyPageLinks()`
- `<app>/classes/security/authorization/OjsJournalMustPublishPolicy.php` · `OpsServerMustPublishPolicy.php`
- `config.TEMPLATE.inc.php` `[search]` (identical in the three apps)

# "Done" on a book's chapter list loses the author order of some chapters, dragged or not

- **Severity** medium
- **Effort** medium
- **Kind** regression
- **Affects**
  - main: OMP
  - 3.5: OMP (a book whose contributors were reordered or lost one)
  - 3.4: OMP (code; as on 3.5)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#6850` · [17d6bcdad5](https://github.com/pkp/omp/commit/17d6bcdad54b0df56f4af85452191ebec4c689b1) · 2021-08-30 · Dimitris Efstathiou (defstat)
- **Upstream** `pkp/pkp-lib#10570` (open), covering two other effects of
  the same cause and not the "Order" save: "Create New Version" and the
  native export give a chapter's authors their Contributors-list order;
  `pkp/pkp-lib#10526` (closed, fix in PR `pkp/omp#1754`) fixed the order
  the list reads the authors in (searched 2026-10-08)
- **Tracked in** spec U72 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U72-chapters-work-type.md#a7)
- **Checked** 2026-10-08, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-08: walked again on today's `main` and 3.5. New since the
first report: a skipped author can end on the same stored number as
another author, in chapters nobody dragged too; the "Edit Chapter" way
round lasts only until the next "Done"; and on 3.5 and 3.4 only a book
whose contributors were renumbered meets the fault. The severity, the
effort and the fix are unchanged.

## Summary

On a book's "Chapters" page, a press editor presses "Order", drags a
chapter or a chapter's author, and presses "Done". "Done" saves the
authors of every chapter of the book, but skips an author who is n-th in
their chapter while being (n + 1)-th on the book's Contributors list:
second in the chapter and third on the list, say. No message is shown.

A skipped author keeps the number already stored for them. One who was
first, in a chapter no "Done" has saved yet, stays first: a drag that
moved them down is undone, and the list redraws in the old order. Any
other ends on the same stored number as another author of the chapter,
unless that number already is their new place, and the database decides
which of the two is listed first. The list can then show a dragged order
that was not saved, and a chapter nobody dragged can change its author
order.

That change was seen on screen three ways: after the way round below,
where "Done" with nothing dragged put the old order back; once in 45
"Done"s that only moved a chapter, in the submission wizard; and in the
default dataset once its contributors table was grown to 5,000 rows. On
the default dataset as loaded, the authors sharing a number stayed in
order.

On `main` any book can meet this. On 3.5 and 3.4 a book's contributors
all hold the same number until one is deleted or the Contributors list
is reordered, and only then can the book meet it. "Edit Chapter" sets a
chapter's author order, but only until the next "Done" on the book.

## Impact

- **Lost**: a chapter's author order, as the editor set it or left it.
  The book's public table of contents and the chapter's page list the
  authors by the same stored numbers (read in the code; no change of
  order was looked for there).
- **Who**: a press manager or editor on the "Chapters" page, or the
  submitting author on the wizard's Details step, who presses "Done" on
  a book with a chapter of two or more authors, whatever they dragged.
  A two-author chapter can meet it only when the book's second or third
  contributor is one of its authors, as in three of the default
  dataset's eight two-author chapters. One of them loses a swap
  (submission 12). The other two (submission 17) get two authors on one
  number from any "Done" on that book.
- **Way round**: in "Edit Chapter", untick the author who should come
  last and press "Save", then open the window again, tick them and press
  "Save". The window lists the chapter's authors first and "Save" stores
  the ticked ones in the window's order, so the re-ticked author goes
  last. It takes two saves per author moved, and the next "Done" on the
  book skips the same author again: on submission 12 it put the old
  order back. The wizard opens the same window; the way round was not
  walked there.

Medium: the author order of a few chapters is wrong or left to the
database, nobody is told, and the way round does not outlast a "Done".
It would be high if a published book's page were walked showing a
chapter's authors in an order nobody set, on an install as it stands.
So far the change was seen on the editor's list only, and apart from the
way round only once without growing the database.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OMP `main`, press `publicknowledge`.
- Submission 12, "Connecting ICTs to Development" (internal review), has
  the chapter "Catalyzing Access through Social and Technical
  Innovation", whose authors are Frank Tulus, then Raymond Hyma. On the
  book's Contributors list they are third and fourth, after Laurent Elder
  and Heloise Emdon.
- Submission 17, "Open Development: Networked Innovations in
  International Development" (internal review), has the chapter
  "Introduction", whose authors are Matthew Smith, then Katherine Reilly:
  the first and third on the book's Contributors list. Its next chapter,
  "The Emergence of Open Development in a Network Society", has the same
  two authors.
- [3.5: there a book's contributors all hold `seq` 0 until one is deleted
  or the Contributors list is reordered (Cause), so submissions 12 and 17
  do not show the fault. Of the dataset's books only submission 2, "The
  West and Beyond: New Perspectives on an Imagined Region", has numbered
  contributors: use it, with a new chapter per group, as the brackets
  say.]

A skipped author who was first (the drag is undone):

1. Sign in as `dbarnes`.
2. Open submission 12, "Connecting ICTs to Development", and in its
   workflow open "Chapters" (under "Publication"). [3.5: submission 2,
   the "Publication" tab, then "Chapters"; press "Add Chapter", type the
   title "u72a Chapter", tick "Peter Fortna" and "Gerald Friesen" (the
   third and fourth contributors) and press "Save".]
3. Press "Order" above the chapter list.
4. Under "Catalyzing Access through Social and Technical Innovation", drag
   "Raymond Hyma" above "Frank Tulus". The list now shows Raymond Hyma
   first. [3.5: under "u72a Chapter", drag "Gerald Friesen" above "Peter
   Fortna".]
5. Press "Done".
6. Reload the page and open "Chapters" again.

Skipped authors left on another author's number:

7. Open submission 17, "Open Development: Networked Innovations in
   International Development", and its "Chapters". [3.5: submission 2;
   press "Add Chapter", type the title "u72b Chapter", tick "Alvin
   Finkel" and "Peter Fortna" (the first and third contributors) and
   press "Save".]
8. Press "Order", drag "Katherine Reilly" above "Matthew Smith" under
   "Introduction", and press "Done". The list keeps Katherine Reilly
   first: this drag is saved. [3.5: under "u72b Chapter", "Peter Fortna"
   above "Alvin Finkel".]
9. Press "Order" again, drag "Matthew Smith" back above "Katherine
   Reilly", and press "Done". [3.5: "Alvin Finkel" above "Peter Fortna".]
10. Reload the page and open "Chapters" again.

The way round, then "Done" with nothing dragged [not walked on 3.5]:

11. On submission 12's "Chapters", press the title "Catalyzing Access
    through Social and Technical Innovation", untick "Frank Tulus" in
    "Edit Chapter" and press "Save".
12. Press the title again, tick "Frank Tulus" and press "Save". The
    chapter lists Raymond Hyma, then Frank Tulus, also after a reload.
13. Press "Order", then "Done", dragging nothing.
14. Reload the page and open "Chapters" again.

**Expected**: after step 5 and after step 6 the chapter lists Raymond
Hyma, then Frank Tulus. After steps 9 and 10 "Introduction" lists Matthew
Smith, then Katherine Reilly, and every author of the book's chapters has
a stored number of their own. After steps 13 and 14 the chapter still
lists Raymond Hyma, then Frank Tulus.

**Observed**: each "Done" is accepted, and no message is shown:

```
{"status":true,"content":"","elementId":"0","events":[{"name":"dataChanged"}]}
```

After step 5 the list redraws at once with Frank Tulus, then Raymond
Hyma, and the reload shows the same. On 3.5, "u72a Chapter" goes back to
Peter Fortna, then Gerald Friesen, the same way.

After steps 9 and 10 the list reads Matthew Smith, then Katherine Reilly,
as dragged, but that order is not stored. Both authors (50 and 52) hold
the same number in "Introduction" (chapter 67). In the chapter after it
(68), which nobody dragged, they have done so since step 8:

```
select chapter_id, author_id, seq from submission_chapter_authors
 where chapter_id in (67, 68) order by chapter_id, author_id;
 67 | 50 | 1
 67 | 52 | 1
 68 | 50 | 1
 68 | 52 | 1
```

On 3.5, "u72b Chapter" reads Alvin Finkel, then Peter Fortna, with both
stored at 1.

After step 13 the list reads Frank Tulus, then Raymond Hyma, and the
reload shows the same: both are stored at 1.

Under "Catalyzing Access via Telecommunications Policy" on submission 12,
the same drag of Khaled Fourati above John Valk (the book's sixth and
fifth contributors) is kept.

## Cause

Below, a *place* counts from 1 as the screen does, and a `seq` is the
stored value.

OMP's `ChapterGridHandler::getDataElementInCategorySequence()`
(controllers/grid/users/chapter/ChapterGridHandler.php, line 350) returns
`$author->getSequence()` as an author's current `seq` in the chapter. The
grid's authors come from `Chapter::getAuthors()`, that is
`Repo::author()->getCollector()->filterByChapterId()`.
`APP\author\Collector::getQueryBuilder()` joins
`submission_chapter_authors` and orders by `sca.seq`, but the select is
the parent's `['a.*', 's.locale AS submission_locale']`. So the author's
`seq` is `authors.seq`, their `seq` on the publication's contributor list.
The matching setter, `setDataElementInCategorySequence()`, writes
`submission_chapter_authors.seq`.

"Done" posts each chapter's ids in screen order, the chapter's own id
first. `OrderCategoryGridItemsFeature::_saveRowsInCategoriesSequence()`
(pkp-lib) unsets that first id, so each author's new `seq` is their key
in the posted list: 1, 2, …. It calls the setter only
`if ($newSequence != $currentSequence)`. In step 5 it posts
`{"categoryId":"48","rowsId":["48","36","35"]}`:

- Raymond Hyma (36): new `seq` 1, `authors.seq` 3: the link is rewritten
  with 1.
- Frank Tulus (35): new `seq` 2, `authors.seq` 2: the setter is skipped,
  and the link keeps its old `seq`, 0.

So the chapter stores Tulus at 0 and Hyma at 1, the old order. The author
left behind is usually not the one the editor dragged.

What the skipped author keeps decides what the editor sees. The chapter
window stores a chapter's authors from 0 (`ChapterForm::execute()`), and
"Done" stores the authors it does not skip from 1. A skipped author who
holds 0, the first author of a chapter no "Done" has saved, stays below
every number "Done" writes and stays first, as above. Any other skipped
author holds a number from 1 up, which "Done" gives to whoever now takes
that place: the two share it, unless the skipped author is at that place
themselves.

In step 8 this happens in chapter 68, which nobody dragged: "Done"
rewrites Smith with 1 and skips Reilly (new `seq` 2, `authors.seq` 2),
who keeps the 1 the chapter window gave her. In "Introduction" step 8
stores Reilly at 1 and Smith at 2. Step 9 posts
`{"categoryId":"67","rowsId":["67","50","52"]}`, rewrites Smith (50) with
1 and skips Reilly (52) again. In step 13 "Done" rewrites Hyma with 1 and
skips Tulus, who keeps the 1 the window stored in step 12.

The collector orders a chapter's authors by `sca.seq` alone, so two
authors at one `seq` come in whatever order PostgreSQL's plan for the
query produces. On the default dataset the plan scans `authors` first and
returns the pair by author id. That is Smith, Reilly in steps 9 and 10,
which happens to be the dragged order, and Tulus, Hyma in step 13, which
undoes the way round.

On a larger table the plan differs. With 5,000 rows added to `authors`
by SQL and its statistics gathered, PostgreSQL read
`submission_chapter_authors` first. After a "Done" that had only moved a
chapter of submission 17, "Introduction" and the chapter after it then
listed Katherine Reilly, Matthew Smith, and the next "Done" stored that
order.

The condition needs contributors numbered 0, 1, 2 and so on. On `main`,
`PKP\author\DAO::getNextSeq()` has given each added contributor the next
number since 922f895988 (`pkp/pkp-lib#13003`, 2026-09-01). On 3.5 and 3.4
it reads `if ($seq) { $nextSeq = $seq + 1; }`, and a highest `seq` of 0
is falsy, so every added contributor is stored at 0. They get numbers of
their own only from `resetContributorsOrder()` (a contributor deleted) or
`setAuthorsOrder()` (the Contributors list reordered). With every
`authors.seq` at 0 "Done" skips nobody. A book carried from 3.5 into
`main` keeps its numbers.

In 3.3, `ChapterAuthorDAO::getAuthors()` selected `a.*, …, sca.seq`
("replace the primary_contact and seq with submission_chapter_authors"),
so the same getter read the chapter's `seq`. 17d6bcdad5
(`pkp/pkp-lib#6850`, the repository pattern for authors) removed that DAO
and read chapter authors through the author collector, without the
chapter's `seq`. 92bf36160b (`pkp/omp#1754`, for `pkp/pkp-lib#10526`)
later added the join and the `sca.seq` order, but not the column.

Reach:

- Chapters nobody touched: every "Done" runs the comparison on every
  chapter. On submission 17, a "Done" that only moved the chapter
  "Introduction" above "Preface" stored Matthew Smith and Katherine
  Reilly both at 1 in "Introduction" and in the chapter after it. On the
  dataset as loaded the list read Smith, Reilly in both at each of six
  reads (walked).
- The wizard's Details step draws the same grid. Walked on 2026-10-08 as
  the submitting author on books made for the walk: the same skip left
  two authors of a chapter at one `seq`. The list then read the dragged
  order in two runs and the old order in a third. In one of 45 "Done"s
  that only moved a chapter, two such authors read in one order right
  after "Done" and in the other after a reload.
- "Create New Version": `APP\publication\Repository::version()` links each
  copied chapter's authors with `$oldChapterAuthor->getData('seq')`, the
  contributor `seq`. A new version's chapters therefore list their
  authors in contributor order, not in the order set for the chapter
  (code, not walked).
- Native XML export: `ChapterNativeXmlFilter::createChapterAuthorNode()`
  writes the same value as `chapterAuthor`'s `seq`, and
  `NativeXmlChapterFilter::parseAuthor()` stores it as the chapter's
  `seq` on import (code, not walked).
- REST API: the publication's `chapters[].authors[].seq` is the
  contributor `seq` (`APP\publication\maps\Schema`) (code).
- Readers of the order: the book page, the chapter page and the citation
  and Dublin Core plugins list chapter authors in `sca.seq` order (code).
  `ChapterForm::fetch()` (line 227), `ChapterGridHandler::getChapterData()`
  (line 607) and `Chapter::getAuthorNamesAsString()` read only ids and
  names (code).

## Proposed fix

Have the collector carry the chapter's `seq` as the author's `seq`
whenever it filters by chapter, as 3.3's `ChapterAuthorDAO` did. In OMP's
`classes/author/Collector.php`, inside the `chapterId` branch of
`getQueryBuilder()`:

```diff
             $query->join('submission_chapter_authors as sca', function (JoinClause $join) {
                 $join->on('a.author_id', '=', 'sca.author_id')
                     ->where('sca.chapter_id', '=', $this->chapterId);
             });
+            // An author read for a chapter carries its place in the chapter (submission_chapter_authors.seq)
+            // as its seq, as the chapters grid and the version copy expect: listed after a.*, it replaces a.seq.
+            $query->addSelect('sca.seq');
```

The diff, against the OMP root:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/chapter-author-order-change-lost/fix.diff).
The collector is the one place that joins the chapter's author links, so
one line there fixes the grid's comparison, the version copy and the
native export together. The row then holds two `seq` columns, and the
later one wins: PDO fills a fetched row column by column, as 3.3's query
relied on. That was seen on PostgreSQL only. `getIds()` and `getCount()`
replace or wrap the select and are not affected.

Tried on OMP `main` (2026-10-08). Step 5 and the reload keep Raymond Hyma
first. Steps 9 and 10 end with Smith stored at 1 and Reilly at 2, in
"Introduction" and in the chapter nobody dragged. A "Done" that only
moves a chapter stores every chapter's authors at places of their own.
Two authors left at one `seq` without the fix are stored at 1 and 2 by
the fix's first "Done" on the book, in the order the list shows. The
control drag in the other chapter is kept with the fix in and out, and
the book's contributor order is unchanged.

**Alternatives**:

- Select the link's `seq` under its own name (`sca.seq AS chapter_seq`)
  and read that in the grid, the version copy and the export: clearer
  than relying on column order, but three readers and the author DAO
  change instead of one line.
- Read the link's `seq` in the grid alone (a new DAO method called from
  `getDataElementInCategorySequence()`): fixes the reorder but leaves the
  version copy and the export writing contributor `seq`s.
- Drop the `!=` check in `_saveRowsInCategoriesSequence()`: rewrites every
  row of every category grid on each "Done", OJS's table of contents
  included, and leaves the getter wrong.

**What goes with it**:

- Every instance: of the `getDataElementInCategorySequence()`
  implementations in OJS, OMP and OPS `main`, only OMP's chapter grid
  reads a value other than the one its setter writes; OJS's
  `TocGridHandler` reads and writes the publication's `seq`. Every reader
  of `filterByChapterId()` is listed under Reach, and none saves the
  Author objects it reads.
- What it touches: the REST API's `chapters[].authors[].seq` becomes the
  chapter's `seq`, as on 3.3, while the publication's own `authors` list
  is unchanged. The native export then writes what import expects.
- Stored data: no migration. The fix's first "Done" on a book stores
  every chapter's authors apart, in the order the list shows them then
  (tried). That may not be the order the editor wanted, and no migration
  could know it. Until that "Done", a chapter with two authors at one
  `seq` still reads in the database's order; a second sort key after
  `sca.seq` (`a.seq`, `a.author_id`, as the parent collector orders)
  would make it read the same on every load (not tried).
- `pkp/pkp-lib#10570` asks for the chapter's order in the version copy
  and the native export, so this fix would close it (code, not tried on
  either).
- Backport: 3.5 and 3.4 have the same collector with the join, so the
  line applies as written there. On those lines it matters only for
  books whose contributors were renumbered (Cause); the fix was not
  tried on either.
- Guard: a scenario in pkp-e2e's U72 suite that drags a chapter author
  into a place the comparison skipped and checks the order after "Done"
  and after a reload; and an OMP unit test that a chapter-filtered
  author's `seq` is the chapter's.

Medium: one line, sized up for two things. The REST API's
`chapters[].authors[].seq` changes meaning: nothing in ui-library's `src`
or in OMP's templates and js reads it, and clients outside PKP's code
are not known. And the row with two `seq` columns was run on PostgreSQL
only, so one run on MySQL or MariaDB, or the first Alternative, goes with
the fix.

## Evidence

- Kept script, run on the default dataset after loading it (OMP alone has
  chapters):
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/chapter-author-order-change-lost/walk.js),
  with [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/chapter-author-order-change-lost/lib.js).
  With no argument it takes steps 1 to 6; `west` takes their 3.5 bracket;
  `twice` takes steps 7 to 10, with the bracket on 3.5; `edit done` takes
  steps 11 to 14; `neighbour` drags Khaled Fourati above John Valk.
  `chapter` moves only a chapter on submission 17 ("Introduction" above
  "Preface", "Done", reload, then back). Its further arguments: `pad`
  adds the 5,000 rows to `authors` after the first reload and reads the
  list again; `first` and `second` split the walk so that a fix can be
  applied between its two "Done"s; `analyze` runs `ANALYZE` at the end
  and reads once more. Each mode reads `submission_chapter_authors.seq`
  beside `authors.seq` before and after. Run:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/chapter-author-order-change-lost/walk.js [west|twice|chapter [first|second|pad] [analyze]|edit [done]|neighbour]`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walks on 2026-10-08, each on a freshly loaded dataset of its own
  (pkp/datasets a130b9a, 2026-10-07), PostgreSQL 18. OMP `main`: steps 1
  to 6, `twice`, `edit done`, `chapter analyze`, `chapter pad`; with the
  fix in, steps 1 to 6, `twice` and `chapter`; `chapter first` without
  the fix, then `chapter second` with it; `neighbour` with the fix in and
  out. 3.5: `west`, `twice`. No server or script error was logged. Steps
  11 to 14 were walked without steps 1 to 6 before them. The fix was not
  tried on 3.5. MySQL was not run.
- The padded table is a diagnostic, not a step: `padAuthors()` in lib.js
  inserts the rows as contributors of submission 1, which no walk opens.
  Before it the plan scanned `authors` and matched each row against the
  chapter's links; after it, a nested loop from
  `submission_chapter_authors` to `authors_pkey`. With 200 to 2,000 rows
  added, PostgreSQL chose a merge join by author id instead (`EXPLAIN`
  in a transaction rolled back).
- The wizard's list: walked by
  [i08.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/U72/I08/i08.js)
  (its sections `wizard` and `tie`) on 2026-10-08, three runs on OMP
  `main`, on books it seeds itself, not the default dataset.
- Contributor numbers on 3.5 and 3.4 were read in the code, not walked.
  The 3.5 dataset agrees: of its ten books with more than one
  contributor, nine hold every contributor at `seq` 0, and submission 2,
  numbered 0 to 7, lacks author id 10.
- Unverified: which plan a real press's database picks, and the order a
  published book's page shows for two authors at one `seq`; no published
  book of the dataset has a chapter with two authors.
- Branch tips: OMP `main` 084a19cc65, its pkp-lib 63cf1497b4; OMP
  `stable-3_5_0` b4a9bc4447, pkp-lib 08de256986; OMP `stable-3_4_0`
  0aec65441f, pkp-lib c40f5f8b93; OMP `stable-3_3_0` 8e72fc8836, pkp-lib
  154794f05d.
- Code reads on the older lines: 3.5, the same collector, getter and
  save. 3.4 (`git show`): `classes/author/Collector.php` with the join and
  no `sca.seq` column, the same getter, and pkp-lib's
  `OrderCategoryGridItemsFeature.php` with the same `!=` check. 3.3:
  `ChapterAuthorDAO.inc.php` selecting `sca.seq`, and the same getter and
  check.
- Introduced: `git blame` puts the getter in 01088072a8, a 2021 reformat;
  the line is older than 3.3. GitHub names no pull request for
  17d6bcdad5. `pkp/pkp-lib#13036` (closed) is about the version copy
  matching authors by `seq`, not the `seq` it writes.

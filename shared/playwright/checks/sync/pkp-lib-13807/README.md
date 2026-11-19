# PR review of pkp/pkp-lib#13807 (2026-11-18)

Crossref title and subtitle written as Crossref face markup: crossref-ojs#121/#122/#123,
crossref-ops#78/#79/#80 and the pointer bumps ojs#6100/#6098/#6099, ops#1518/#1519/#1520
(MarkusMachel; `main`, `stable-3_5_0`, `stable-3_4_0`). U45 A30 and OPS7.

- The walk on `main` and 3.5 is the issue's own, moved here from `checks/issues/` at the merge:
  `walk.js` with `read.php` and `validate.php` (steps, and `neighbour` on `main`),
  on dataset fleets (`--feature pr13807`, `pr13807-35`), the checkouts at the app PR heads.
- `drive.php` stands in on `stable-3_4_0`, which the walk does not drive: on a dataset fleet it turns
  DOIs on with Crossref, stores a work's title, subtitle and prefix as the rich-text boxes save them,
  assigns the DOI and prints the file's `<titles>` (the plugin's own export, validation off). Run at the
  plugin PR head, then with `plugins/generic/crossref` checked out at the PR base, on the same database:
  `PKP_CONFIG_FILE=$root/config.test.ds1.inc.php php8.2 drive.php $root publicknowledge '1|hkrb forest trees &amp; <i>shrubs</i>|rocks &amp; sand|-' '17|Hansen & Pinto: Reason Reclaimed|-|L'"'"''`
  (OJS 1 and 17; OPS 3, 8 and 2).
- `EdgeFaceMarkupTest.php` feeds the PR's `appendFaceMarkup()` inputs its own unit test leaves out
  (Unicode, `&nbsp;`, nesting, whitespace between tags, an unclosed tag, old plain-text titles with a bare
  `<`) and prints what each becomes; run from any OJS or OPS root on any line (the command is in its
  header). A stored bare `<` followed by a letter (`x<y and a < b`) loses the rest of the title, as the
  work's own page already does (HTMLPurifier reads it the same way); `n<50` and `p < 0.05` stay text.
- From round 2 (`stripUnsafeHtml()` in the helper) both tests read the config, and PKPTestCase points it at
  `<app root>/config.inc.php`: link it to `config.test.inc.php` for the run
  (`ln -s config.test.inc.php config.inc.php`) and remove the link after.

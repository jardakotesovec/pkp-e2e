# OJS, Default theme: every article page shows a "JATS XML" button that links nowhere

- **Severity** low (a dead button, nothing lost; on every article page)
- **Effort** small
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Affects**
  - main: none yet; OJS (the Default theme and themes that use its `article_details.tpl`) once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `ojs#5784` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Every article's page now shows a "JATS XML" download button beside "PDF",
also when the journal does not publish JATS for the article. The button's
link is empty, so it reloads the page.

## Impact

- **Lost**: nothing; a reader is offered a download that does not exist.
- **Who**: readers of every OJS journal on the Default theme, on every article.
- **Way round**: none needed.

Low: a dead control. It sits on the most-read public page of every journal, which is the reason to fix it before the merge.

## Steps to reproduce

Preconditions: PKP's default dataset. The "Eidos" theme is never enabled or selected in these steps; the journal stays on the Default theme.

1. As a visitor open article 1, "The Signalling Theory Dividends" (`/index.php/publicknowledge/en/article/view/1`).

**Expected**: one galley button, "PDF". **Observed**: "PDF" and "JATS XML"; the second is
`<a class="obj_galley_link xml" href="">`.

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/08-article-before.png)

**With the PRs:**

![With the PRs](img/2026-10-08-pkp-lib-13260/08-article-after.png)

## Cause

`pages/article/ArticleHandler.php` assigned `jatsDownloadUrl` only when the publication's JATS is
public. ojs#5784 always assigns it, empty when it is not (around line 336 at the PR head):

```php
$templateMgr->assign([
    'jatsDownloadUrl' => $publication->getData('jatsPublicVisibility')
        ? $request->getDispatcher()->url(…)
        : ''
]);
```

The Default theme's `templates/frontend/objects/article_details.tpl` (line 344) asks whether the
variable exists, not whether it holds an address:

```smarty
{if isset($jatsDownloadUrl)}
```

## Proposed fix

```diff
-			{if isset($jatsDownloadUrl)}
+			{if $jatsDownloadUrl}
```

Tried: article 1 shows "PDF" alone; U46 S3, U48 S4 and S5 pass (S4 checks that the link still
appears when JATS is public). Eidos's own `download.blade` is not touched by it. Third-party themes
that copied the `isset()` test show the same dead button; leaving the variable unassigned when
there is no address, as before, would spare them too.

## Evidence

- **Refs.** ojs `b8904676e1` (ojs#5784, on the ojs tip `49515c6e3e`), lib/pkp `571ea1fcac` (pkp-lib#13260, on `151e6e9d69`), lib/ui-library `96764aa9` (ui-library#972, on `7f5e51ca`); PostgreSQL, PHP 8.3.
- **Driven.** The step above at the tip and at the PR head (`shots.js`), and with the fix
  (`SIDE=fixed`); fix in `fix-ojs.diff`.

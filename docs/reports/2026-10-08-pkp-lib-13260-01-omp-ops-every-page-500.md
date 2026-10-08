# OMP and OPS answer 500 on every page once they receive the pkp-lib change

- **Severity** critical
- **Effort** medium (two more app PRs, or a small fallback in pkp-lib)
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Crash** server
- **Affects**
  - main: none yet; OMP, OPS once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `pkp-lib#13260` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

pkp-lib#13260 makes the template manager create two objects from classes
that only the OJS PR adds. The PR set has no OMP or OPS PR, so a press or
a preprint server fails on every page as soon as its `lib/pkp` moves to a
commit that contains the change. Neither app has the theme at all.

## Impact

- **Lost**: every page that renders a template: the reader pages, the login page, the dashboard.
- **Who**: every visitor and user of every OMP and OPS install on `main`.
- **Way round**: none; the app PRs or the fallback below must merge with pkp-lib#13260.

Critical: nothing works, in every setup.

## Steps to reproduce

1. Take OMP (or OPS) at its tip and check `lib/pkp` out at pkp-lib#13260's head (`571ea1fcac`).
2. Open any page, for example `/index.php/publicknowledge/en`.

**Expected**: the press's home page (here a freshly installed press, which has no content yet).

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/01-omp-before.png)

**Observed**: HTTP 500 with an empty body (a blank page, so no screenshot), on OMP and on OPS. Server log:

```
PHP Fatal error:  Uncaught Error: Class "APP\view\MetadataBlocksRegistry" not found in lib/pkp/classes/template/PKPTemplateManager.php:195
```

## Cause

`lib/pkp/classes/template/PKPTemplateManager.php`, constructor (lines 195–196 at the PR head):

```php
$this->metadataBlocks = new MetadataBlocksRegistry();   // use APP\view\MetadataBlocksRegistry;
$this->homepageBlocks = new HomepageBlocksRegistry();   // use APP\view\HomepageBlocksRegistry;
```

`APP\view\MetadataBlocksRegistry` and `APP\view\HomepageBlocksRegistry` exist only in
ojs#5784 (`classes/view/`). OMP and OPS have no `classes/view/*Registry.php`.

## Proposed fix

Either of two, both tried:

1. **The two classes in OMP and OPS** (PRs that merge together with pkp-lib#13260). The minimum is
   an empty subclass each:

   ```php
   namespace APP\view;
   class MetadataBlocksRegistry extends \PKP\view\MetadataBlocksRegistry {}
   class HomepageBlocksRegistry extends \PKP\view\HomepageBlocksRegistry {}
   ```

   Tried on both apps: the login page, the home page, the catalog and the search page answer 200.
2. **A fallback in pkp-lib**, so that an app without the classes gets pkp-lib's own
   (`fix-pkp-lib-fallback.diff`):

   ```php
   public \PKP\view\MetadataBlocksRegistry $metadataBlocks;
   public \PKP\view\HomepageBlocksRegistry $homepageBlocks;
   …
   $this->metadataBlocks = class_exists(MetadataBlocksRegistry::class) ? new MetadataBlocksRegistry() : new \PKP\view\MetadataBlocksRegistry();
   $this->homepageBlocks = class_exists(HomepageBlocksRegistry::class) ? new HomepageBlocksRegistry() : new \PKP\view\HomepageBlocksRegistry();
   ```

   Tried on both apps: the login page, the home page, the search page and "About" answer 200.

Whichever is chosen, OMP's and OPS's suites have not run on the change yet: every page failed
before a test could start. Findings 4, 5, 6 and 12 of the overview reach both apps too.

## Evidence

- **Refs.** OMP `084a19cc6` and OPS `3a40dc2773` (their tips) with lib/pkp at `571ea1fcac`; fresh installs. PostgreSQL, PHP 8.3.
- **Driven.** Both apps reset, installed and requested: 500 on the login page and the home page.
  Then with fix 1, then (separately) with fix 2: 200.
- **Note.** The command-line install and the API still work without the classes (they render no
  template), so an install script does not notice the fault.

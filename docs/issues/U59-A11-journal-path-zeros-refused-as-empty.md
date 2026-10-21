# Journal form: a path of zeros such as "00" is refused with "A path is required."

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#6678` for `pkp/pkp-lib#6633` · [118d293e75](https://github.com/pkp/pkp-lib/commit/118d293e751413ad0e072cacd3d61a3f90d2ae42) · 2021-01-28 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U59 [A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U59-hosted-journals.md#a11)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The Site Administrator types "00" in "Path" on "Create Journal"
(Administration › "Hosted Journals"), which the field's rule (letters,
digits, "_" and "-") allows, and presses "Save". The save is refused
with "A path is required." under "Path", as if the box were empty.
Changing a journal's path to "000" through its "Edit" in the same list
is refused the same way.

A single "0" is refused too, and rightly: the site cannot open a
journal at that address, and the fix proposed below keeps that refusal.
Nothing is stored, and an ordinary path saves.

A press is refused the same way. A preprint server is too, and there
the message shows as the raw code
"##admin.contexts.form.pathRequired##" for these paths and for "0",
while an empty "Path" is refused in words ("This field is required.").
That raw code is a missing message, reported apart in U59 OPS1's report
([pkp-e2e#503](https://github.com/jardakotesovec/pkp-e2e/issues/503)).

## Impact

- **Lost**: no data. The administrator cannot use the path they chose,
  and the message gives them the wrong reason; the form keeps what was
  typed.
- **Who**: the Site Administrator, on "Create Journal" and on a
  journal's "Edit" in "Hosted Journals", only for a path of two or more
  zeros ("00", "000", …). The Settings Wizard's "Journal" tab and a path
  that reads as zero in scientific notation ("0e5") run the same check;
  those were read in the code, not tried on screen.
- **Way round**: none for that path; another path saves.

Low: a rare input refused with a misleading message, and no data lost.
It would be medium only for a journal that truly needs such a path, for
example one named by a number made of zeros.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS (OMP and OPS the same, with
  "Press" and "Server" in the screen words).

Creating:

1. Sign in as `admin`.
2. Open Administration › "Hosted Journals"
   (`/index.php/index/en/admin/contexts`).
3. Press "Create Journal".
4. Type "h21w Journal" in "Journal title", "H21W" in "Journal
   initials", "h21w Contact" in "Principal Contact Name",
   "h21w@mailinator.com" in "Principal Contact Email address" and "00"
   in "Path". Choose "Iceland" for "Country", tick "English" under
   "Languages" and choose "English" for "Primary locale".
5. Press "Save".

Editing (a journal the steps create, so the dataset's own journal keeps
its path):

6. Reload "Hosted Journals", press "Create Journal", fill the form as in
   step 4 but with "h21w" in "Path", and press "Save". The journal is
   created and its Settings Wizard opens.
7. Open "Hosted Journals" again, press the arrow of the `h21w` row, then
   "Edit".
8. Replace "Path" with "000" and press "Save".

**Expected**: "00" and "000" fit the rule the form states, so step 5
creates the journal (its Settings Wizard opens) and step 8 saves. Each
journal opens at its new address (`/index.php/00`, `/index.php/000`).

**Observed**: steps 5 and 8 are refused. Under "Path", and in the error
line beside "Save", the form reads:

```
Please correct one error. Go to Path: A path is required. Jump to next error
```

Step 5 sends `POST /index.php/index/api/v1/contexts` and step 8 sends
`POST /index.php/h21w/api/v1/contexts/2` with
`X-Http-Method-Override: PUT`; both answer 400. OMP and OPS refuse
both saves the same way.

Control: the path "0" at step 4 is refused the same way.

## Cause

`PKPContextService::validate()`
(`lib/pkp/classes/services/PKPContextService.php`, the "Ensure that a
urlPath is not 0" check) refuses the path with
`admin.contexts.form.pathRequired` when `$props['urlPath'] == '0'`.
The comparison is loose. Both sides are numeric strings, so PHP compares
them as numbers: "00", "000" and "0e5" all equal "0". Each of them also
passes the schema's path pattern (`^[a-zA-Z0-9]+([\-_][a-zA-Z0-9]+)*$`),
so the check is the only thing that refuses them.

The check was added to stop the path "0", whose comment says it "will
cause router problems". `Core::getContextPath()` reads the first part of
the address with `$contextPaths[0] ?: Application::SITE_CONTEXT_PATH`,
and "0" is the only non-empty string PHP reads as false, so
`/index.php/0` routes to the site. "00" and "000" are read as true and
route to their journal: only "0" needed refusing.

Where else the same fault applies:

- The Settings Wizard's "Journal" tab sends the same request to the same
  check (code).
- The check is shared code; no app's `ContextService` overrides
  `validate()` (code).
- The same loose comparison against "0" appears nowhere else in lib/pkp
  or the apps' `classes/` (a search for `== '0'`).

## Proposed fix

Compare strictly in the check, so only "0" itself is refused:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/fix.diff).

```diff
--- a/lib/pkp/classes/services/PKPContextService.php
+++ b/lib/pkp/classes/services/PKPContextService.php
@@ -321,9 +321,10 @@
             }
         });
 
-        // Ensure that a urlPath is not 0, because this will cause router problems
+        // Ensure that a urlPath is not "0", because the router reads it as no path.
+        // A strict comparison: "00" and "0e5" == "0" as numbers, yet route as paths.
         $validator->after(function ($validator) use ($props) {
-            if (strlen($props['urlPath'] ?? '') && !$validator->errors()->get('urlPath') && $props['urlPath'] == '0') {
+            if (strlen($props['urlPath'] ?? '') && !$validator->errors()->get('urlPath') && $props['urlPath'] === '0') {
                 $validator->errors()->add('urlPath', __('admin.contexts.form.pathRequired'));
             }
         });
```

A strict comparison is enough. The schema's `string` rule refuses a
`urlPath` sent to the REST API as a JSON number before this check runs,
so the value reaching it is always a string (read in
`PKPSchemaService::addPropValidationRules()`).

Tried on `main`, OJS, OMP and OPS. Step 5 then creates the journal and
opens its Settings Wizard, step 8 saves, and `/index.php/00` and
`/index.php/000` open the two journals' home pages. The path "0" is
still refused with "A path is required.", with the fix in and out.

**Alternatives**:

- Keep refusing every path of zeros and say why, with a message of its
  own. It keeps a rule the router does not need, and costs a new locale
  key in three apps.
- Let the router take "0" as a path, replacing `?:` in
  `Core::getContextPath()` with a test on the string's length, and drop
  the check. It changes the routing of every request to allow one path.

**What goes with it**:

- The message for "0" stays "A path is required."
- No data repair. API clients see one refusal fewer.
- Backport: the line is the same on 3.5 and 3.4; 3.3's
  `PKPContextService.inc.php` holds it with `isset()` in place of
  `strlen()`, and the same change applies.
- Test: a unit test of `PKPContextService::validate()` with "0"
  (refused) and "00" (accepted).

Small: one comparison in one shared class, and a unit test. The effort
covers this check only; OPS's missing message is the other report's fix.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/lib.js))
  takes steps 1–8 on OJS, OMP and OPS, and opens any new path that was
  stored. Its argument `neighbour` takes "Create Journal" with the path
  "0" (the case the fix must still refuse), and `empty` the same form
  with "Path" left empty:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/walk.js [neighbour|empty]`
  (with `PKP_E2E_LINE=stable-3_5_0` in front for 3.5). The fix was
  applied with
  `node bin/try-fix.js apply shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/fix.diff ojs omp ops`
  and taken out with `revert` and the same arguments.
- The walks ran in Chromium on PostgreSQL; MySQL not checked (the check
  is PHP, before any query). Datasets: pkp/datasets 5f247d04
  (2026-10-20). On `main` and 3.5 every app refused steps 5 and 8 with
  400. The empty path was walked on OPS `main`.
- Branch tips. `main`: OJS 3109a59114, OMP 5777025bec, OPS f048e747b4;
  pkp-lib f37a174626 (OJS) and 042726ebf6 (OMP, OPS). 3.5: OJS
  1e78ca0c2b, OMP cce424e5ef, OPS 5eca7fd603; pkp-lib 68512b5fda. 3.4:
  OJS 0012bd1022, OMP e30fa7e38c, OPS 0f1e21a117; pkp-lib 85f47442cf.
  3.3: OJS d7d9dd14ec, OMP 8e72fc8836, OPS c5532e2161; pkp-lib
  867ce82d8e.
- Code reads. `PKPContextService::validate()` holds the loose `== '0'`
  check on every line: `main` and 3.5 (`classes/services/PKPContextService.php`),
  3.4 (the same file) and 3.3 (`PKPContextService.inc.php`, with
  `isset()` before it); the introducing commit and its merge
  (99c73c233c) are on `stable-3_4_0` and `stable-3_3_0`. The schema's
  `urlPath` pattern is the same on all four lines, so "00" passes it
  everywhere. The router reads "0" as the site and "00" as a path on
  every line: `Core::getContextPath()` (`?:`) on `main`, 3.5 and 3.4,
  `Core::getContextPaths()` (`empty()`) on 3.3.
- Introduced: blame on the check's line gives d0ab8f9eb4 (2023,
  `isset()` changed to `strlen()`) and e3f570bc37 (2021, reformatting);
  the comparison itself came with 118d293e75, merged by
  `pkp/pkp-lib#6678` for `pkp/pkp-lib#6633` (a space as a journal
  path breaking the site).
- Upstream search (2026-10-21): pkp/pkp-lib, pkp/ojs, pkp/omp and
  pkp/ui-library, by "A path is required", "pathRequired", path zero,
  "00", `PKPContextService urlPath`; nothing about this fault.
- Not walked: the Settings Wizard's "Journal" tab, the paths "0e5" and
  longer runs of zeros, and 3.4 and 3.3.

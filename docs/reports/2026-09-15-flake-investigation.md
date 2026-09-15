# Flaky tests: who flakes, why, and what to fix upstream (2026-09-15)

After the performance rounds (`2026-09-14-suite-performance*.md`) the next
cost is non-determinism. This report ranks the flake classes by how often
they actually fire, follows the two biggest into the app code with
reproductions, and leaves two ui-library patches ready for upstream pull
requests, each with a controlled A/B behind it. Everything ran on the Mac
(10 cores) against the 2026-09-15 upstream tips (`77b76d7664` in lib/pkp,
`db5b2813` in ui-library); the checkouts are pristine again.

## 1. Ranking: what actually flakes

Two sources. `2026-09-15-ci-flake-tally.md` counts every CI run of the
last three weeks (621 app-suite jobs across this repo and the three app
hooks; "flaky" = first attempt red, retry green, the direct signal).
`docs/tracking/ci-triage.md` "Flake watch" holds the local incidents.

| Rank | Class | Where | CI incidents (3 weeks) | Local incidents | Mechanism |
|---|---|---|---|---|---|
| 1 | **A wizard press lost right after a step change** | U21 (20+ scenarios), U04 S10, U31 S1, all three apps | ~97 (the "toContainText" class, 36 tests; the wizard is most of it) | 6 | **Found, patch A** (section 2) |
| 2 | **Reviewer one-click "Accept" not advancing** | OJS U28 S10 | 23 flaky + 1 red in nine days, nearly every run since the test shipped 09-05 | 5 (three after hardening) | Unknown; a legacy jQuery page. Traces now kept (section 4) |
| 3 | **Publication form save persists the old abstract** | OMP U40 S4 (the OPS/OJS twins share the code) | 22 flaky + 8 red | ~8 | **Found, patch B** (section 3) |
| 4 | Author Response table (re-render / not found) | OJS U30 S4 | 8 flaky | 8 on the VM in one day | Not reproduced on the Mac (0/10 plain, and CPU throttle hits an earlier gate first); still wants a VM trace |
| 5 | Reviewer rating radio "did not change its state" | OMP U27 S9 | 8 flaky + 1 | — | app-changes row 11 (rating control accepts clicks before its data settles) |
| 6 | Wizard "Save for later" resume | U21 S3, OJS/OMP/OPS | 22 flaky across the three | 1 | Same page as rank 1; re-check once patch A is in |
| — | Infrastructure (php -S refused / hung up) | login smoke, U01 | ~7 | 1 | Not app-side |

The flake rate on CI rose week over week (jobs carrying a flaky test:
OJS 31 → 37 → 43%, OMP 23 → 40 → 57%, OPS steady under 13%). OPS, with
the same harness and suite shape, barely flakes, which points at OJS/OMP
pages rather than the harness. The full tables, per-test, are in the
tally.

## 2. Patch A: the submission wizard's press lost to its scroll animation

**What the suite sees.** After Continue moves the rail to step N, the
next Continue press "does nothing": no request, the rail stays on step N
for the whole wait. Hardened test-side with `pressUntil()` (three presses,
8 s each) on 2026-09-12 and 09-14; still the largest class.

**Evidence.** CI run 34687878464 (2026-09-12) kept the retry's trace for
U21 S10. Its action log shows the second Continue press retried four
times as "element is not stable" over 0.5 s, then "click action done", and
the rail never moved. The screencast frame at that instant shows the page
scrolled back to the top with the caret inside the Abstract editor: the
Continue button was no longer under the pointer when the mouse went up.

**Mechanism.** `Steps.vue` (ui-library) reacts to every step change with
`this.$scrollTo(pageTitle, 500, {offset: -50})`, a 500 ms JavaScript
animation (vue-scrollto), plus `setFocusIn()` into the new step. Playwright
waits for the element to hold still for two animation frames before it
clicks; under a janky main thread (a loaded CI runner) two identical
frames occur mid-animation, the mouse-down lands on Continue, the
animation's last frame jumps the page to the title, and the mouse-up
lands wherever now sits at those coordinates, the abstract's editor
iframe. Playwright validates the hit target for the first pointer event
only (`injectedScript`: "check that we hit the right element at the first
event, and assume all subsequent events will be fine"), so the lost click
is silent. The harness's CSS motion kill cannot touch a JS scroll.

**Reproduction** (`2026-09-15-wizard-press-probe.spec.js`; copy it into
`apps/ojs/playwright/tests/` to run). A normal Continue press, then a
second press with a mouse-down/mouse-up gap of 0, 40 or 120 ms, eight
trials each, with `PLAYWRIGHT_CPU_THROTTLE=6` (the new opt-in knob,
harness.md "Env vars") to make the animation janky:

| Bundle | reduced motion in the page | lost presses |
|---|---|---|
| stock | no (the harness's `asUser` contexts never passed it) | 10 of 24 |
| stock | yes | 11 of 24 |
| patched | yes | **0 of 24** |

Every lost press ended with `document.activeElement` on
`.tox-edit-area__iframe`, the abstract editor. Without the throttle the
Mac never loses a press (0 of 24): the stability check waits the whole
animation out on a smooth thread, which is why it never reproduced
locally and fires on CI.

**The patch** (`2026-09-15-ui-library-steps-reduced-motion.patch`,
ui-library `Steps.vue`): honour `prefers-reduced-motion` (WCAG 2.3.3) and
jump instantly instead of animating when it is set. The test harness
already asks for reduced motion (`reducedMotion: 'reduce'`), and now does
so for every context it opens (base-test.js `asUser`, fixed today; before
this only the default `page` had it). Real users with animations on keep
the animation; a user clicking Continue twice within half a second could
still lose the second click, which is the same bug for humans and worth a
sentence in the PR. The whole U21 OJS spec is green on the patched bundle
(16 of 16, 27 s at eight workers).

**The native variant (preferred, same day).** The maintainer asked whether
the vue-scrollto plugin could go in favour of the browser's own scrolling
and whether that would pick the preference up by itself. Measured on a
plain page in Chromium under Playwright's reduced-motion emulation: a JS
`behavior: 'smooth'` argument ignores the preference (animated either
way), while CSS `scroll-behavior: smooth` with a `prefers-reduced-motion`
media rule and a plain `scrollTo`/`scrollIntoView` call is animated
normally and instant under the preference. So the native shape is the
stylesheet deciding and the scripts staying silent. The plugin had three
call sites, all in ui-library (the step rail, the form's page change and
its jump to the first error field, the last inside the side modal's
scroll container); nothing else used it. Patches, one per repository:
`2026-09-15-native-scroll-ui-library.patch` (a `useScrollTo`
composable with its Storybook doc, the three call sites, the rule in
`_global.less` scoped to `html` and `.pkp-modal-scroll-container`, the
dependency and the Storybook registration dropped),
`2026-09-15-native-scroll-pkp-lib.patch` (`js/load.js` no longer
registers it) and `2026-09-15-native-scroll-ojs.patch` (`package.json`
and the vite dependency list). Verified the same way as the first patch:
throttled probe 0 of 24 presses lost, U21 spec 16 of 16, bundle 5.5 KB
smaller. The scoped rule leaves the legacy grids' jQuery `scrollTop`
setters alone. Three other `scrollIntoView({behavior: 'smooth'})` calls
in ui-library (open review, usage chart, task info) ignore the preference
the same way and could drop their argument in a follow-up.

**Test-side.** Nothing new is needed; `pressUntil()` stays until the
patch ships, then it can go.

## 3. Patch B: the publication form keeps a stale form on screen

**What the suite sees.** OMP U40 S4 edits the abstract of a published
version, saves, and the book page still shows the seeded abstract. The
save responded 200. Known as app-changes row 9 (c) since 2026-08-28,
"a rich-text form remount reverts uncommitted editor content";
test-side `blur()` before Save did not close it.

**Evidence.** The test failed on the Mac at two workers with a trace
kept (traces are now retained for that file, section 4). The trace's
network and action logs, relative to the first form fetch:

| t | event |
|---|---|
| 0.000 s | GET `_components/titleAbstract` (first visit) lands |
| 0.376 s | click "Metadata": GET `_components/metadata` starts |
| 0.435 s | click "Title & Abstract": the metadata fetch is aborted, GET `_components/titleAbstract` starts again |
| 0.490–0.579 s | the test clicks, fills and blurs the Abstract editor **of the form still on screen from the first visit** |
| 0.597 s | the second titleAbstract fetch lands: `publicationForm` is replaced, fields reset to the seeded abstract |
| 0.614 s | Save: the PUT carries `abstract[en]=Seeded abstract for …` |

**Mechanism.** `WorkflowPublicationForm.vue` is one component instance
for every Publication page (the workflow page keys it by index and
component name), and its `relativeUrl` watcher calls `fetchForm()`
without clearing the previous form, so the last page's form stays on
screen and editable until the new response replaces it. Anything typed in
that window is discarded; for a person that is "I switched tabs and my
text vanished a second later". Under load the fetch is slower and the
window widens; alone on a fast machine the response usually lands before
the test can type.

**A/B on the Mac at eight workers**, OMP U40 S4 repeated:

| Bundle | runs | failed (seeded abstract persisted) |
|---|---|---|
| stock | 30 (10 + 20) | 4 |
| patched | 20 | **0** |

**The patch** (`2026-09-15-ui-library-publication-form-clear.patch`,
ui-library `WorkflowPublicationForm.vue`): `fetchForm({clearData: true})`
on a page change, so the form leaves the screen while its successor
loads (the `v-if="form"` already hides it), and a null guard on the
`canSubmit` watcher. The OJS and OPS U40 twins run the same component.

**The keyed variant (preferred, same day).** The maintainer's reading:
the instance should not survive a section switch at all. The workflow
page keys every configured item by its position, component name and
`namespace`, which is why one `WorkflowPublicationForm` serves every
Publication section in turn. `2026-09-15-ui-library-publication-form-key.patch`
appends a configured item's own `key` to the workflow page's key string
(`${index} - ${component} - ${namespace} - ${item.key}`, at its seven
sites; the positional identity stays and the key only adds to it) and gives the
eleven `WorkflowPublicationForm` sites across the OJS, OMP and OPS configs
`key: 'WorkflowPublicationForm-<formName>'`, so a section switch mounts a
fresh instance with no form to type into until its own fetch lands. A
version switch already remounted (the OJS config returns no items while
the new publication loads), so the key needs only the form name. The
first patch's `clearData` is then unnecessary and is not part of it.
Same A/B on the Mac at eight workers: OMP U40 S4 20 of 20 green against
the stock bundle's 4 failures in 30. The publication specs on keyed
builds: see section 5.

**Test-side.** `openPublicationPage()` could wait for the
`_components/<form>` response before returning, which would also cover
the window; with the patch in place the form simply is not there to type
into, so the tests need nothing.

## 4. What changed in this repo

- `shared/playwright/support/throttle.js` and base-test.js:
  `PLAYWRIGHT_CPU_THROTTLE=<rate>` (opt-in; harness.md). Use it on short
  probes at 6; on a whole scenario at 2–4 it just runs into the test's
  own timeouts (U30 S4: the decision wizard's `toPass` gate first, then
  the author's response window), which is a finding in itself: the
  decision-wizard class (ci-triage "Decision-wizard timing under load")
  is what a slow browser hits first.
- base-test.js: `asUser` contexts get `reducedMotion: 'reduce'` like the
  default context. Validated by a full OJS run (section 5).
- `apps/ojs/.../U28-reviewers-review.spec.js` and
  `apps/omp/.../U40-publication-metadata.spec.js`:
  `test.use({trace: 'retain-on-failure'})` at file level (the option is
  worker-scoped and refuses a describe block). CI keeps `on-first-retry`,
  which never records a flaky test's failing attempt; these two files are
  the hottest spots and now leave a trace when they red. Cost: the trace
  overhead on those two files only.
- ci-triage.md: the three entries carry the mechanisms and pointers.

## 5. Verification runs

| Run | Result |
|---|---|
| U30 S4 ×10, 8 workers, no throttle | 10 of 10 green (the class does not reproduce on the Mac) |
| U21 S10 + S12 ×5, throttle 2 | S12 green ×5 (4.5 min each); S10 timed out in fixture teardown, not the class |
| Wizard press probe (section 2) | as tabled |
| U21 OJS spec, patched bundle, 8 workers | 16 of 16 green |
| Native variant: throttled probe, U21 spec, full OJS suite | 0 of 24 lost (twice: helper and composable builds); 16 of 16; full suite 214 of 216 in 6.5 min, the same two reds as the pristine run (U05 S7's Tasks list and U24 S14's Declined count, both moved by parallel tests on the shared journal) |
| OMP U40 S4 A/B (section 3) | as tabled |
| Keyed variant: OMP U40 S4 ×20 (helper form) and ×10 (appended form); OJS U40+U49+U41 and OMP U40+U41 specs on keyed builds | 20 of 20 and 10 of 10; OJS specs 32 of 32; OMP 20 of 21, the one red being U40 S3's author save answered 401 on the day's used database, 9 of 9 red on stock and keyed bundles alike and 6 of 6 green on both after `reset:omp` (ci-triage) |
| Full OJS suite, pristine checkouts, harness change, 8 workers | 214 of 216 green in 6.2 min; U24 S14 red on the journal's Declined count (7, expected 5: the day's repeats on the same database) and U05 S7 red once on the Tasks dialog's table (30 s), both green alone right after (16 s) |

## 6. Next

1. Open the two ui-library pull requests from the patches (both apply
   on `db5b2813`); the probe and the trace timeline above are the
   reproduction stories. After they merge, drop `pressUntil()`'s retry
   loop and app-changes row 9 (c).
2. U28 S10: wait for the next CI red, it now carries a trace; read it
   before touching `accept()` again.
3. U30 S4: the maintenance session's VM finals already run with
   `--trace retain-on-failure`; the next red there is the evidence.
4. Consider `trace: 'retain-on-failure'` for the whole suite on CI for a
   week, if the two files above are not enough: the flaky class as a
   whole has never been recorded on CI.

# The role invitation pages' hidden "show all steps" button carries the text "{$current}/{$total} steps"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no role invitation pages)
  - 3.3: none (code; no role invitation pages)
- **Introduced** `pkp/ui-library#362` for `pkp/pkp-lib#9658` · [88070798](https://github.com/pkp/ui-library/commit/88070798fdf145ca1313acc1d5b4354e385a8942) · 2024-06-13 · Ipula Indeewara (ipula); the acceptance page copied it in `pkp/ui-library#358` · [6940ab2b](https://github.com/pkp/ui-library/commit/6940ab2b96774c406178b25c94961091d86d506d) · 2024-06-27
- **Upstream** `pkp/pkp-lib#12874` (its pull requests give the list of steps its name, the other half of this report; the button's text is untouched)
- **Tracked in** spec U06 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a7)
- **Checked** 2026-10-10, at the heads of the pull requests of pkp/pkp-lib#12874 (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On the page where a manager invites someone to a role, and on the page
where the invited person accepts, the small button that opens a
collapsed list of steps has the hidden text "{$current}/{$total} steps"
instead of "Show all steps". The submission wizard and the editorial
decision pages give the same button "Show all steps".

The text is never shown on screen, and the steps and every button work,
so nothing is lost. A screen reader may read it when the button takes
keyboard focus.

This report first also covered the list of steps itself, which a screen
reader heard as "##invitation.wizard.completeSteps##". The pull
requests of pkp/pkp-lib#12874 name it "Complete the steps for this
invitation" and add the text of the page's errors notice.

The fix is one line in each of the two pages, in ui-library, so each
application also needs its submodule updated and its JavaScript
rebuilt.

## Impact

- **Lost.** Nothing: a hidden text is the wrong one.
- **Who.** People who use a screen reader on either page. Sighted users
  see only "1/3 steps" and a chevron when a list collapses. On the
  one-step acceptance page the button can always take keyboard focus.
- **Way round.** None needed.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), context
  `publicknowledge`.
- Outgoing mail caught where it can be read (a mail catcher such as
  Mailpit, or the log mailer), for step 4: the dataset's users all have
  `@mailinator.com` addresses.

Steps:

1. Sign in as `rvaca` (the manager).
2. Open Settings › Users & Roles
   (`/index.php/publicknowledge/en/management/settings/access`) and
   press "Invite to a role".
3. Type `dbuskins@mailinator.com`, press "Search User", and in the empty
   role row choose "Author", today as "Start Date" and "Does not appear
   on the masthead". Press "Save And Continue", "Invite user to the
   role" and "View All Users".
4. Signed out (another browser), open the "Accept Invitation" link of
   the email "You are invited to new roles" sent to
   dbuskins@mailinator.com. The page shows one step, "Review & create
   account".
5. In the page's HTML (the browser's inspector), read the hidden text
   of the button beside the list, next to "1/1 steps".

**Expected.** "Show all steps", as on a decision page: sign in as
`dbarnes`, open submission 4 on OJS, 3 on OMP or 1 on OPS, and press
"Decline Submission".

**Observed.** The same on all three applications:

```
Step 5: button's hidden text: "{$current}/{$total} steps"   (beside "1/1 steps")
```

## Cause

ui-library's two invitation pages give the `<Steps>` component the same
block of texts
([`UserInvitationPage.vue`](https://github.com/pkp/ui-library/blob/64d67363/src/pages/userInvitation/UserInvitationPage.vue#L12-L14),
[`AcceptInvitationPage.vue`](https://github.com/pkp/ui-library/blob/64d67363/src/pages/acceptInvitation/AcceptInvitationPage.vue#L7-L9)):

```vue
:label="t('invitation.wizard.completeSteps')"
:progress-label="t('common.showingSteps')"
:show-steps-label="t('common.showingSteps')"
```

`show-steps-label` is the hidden text of the button that opens a
collapsed list. It is given `common.showingSteps` ("{$current}/{$total}
steps"), the progress text. `Steps.vue` fills in the two placeholders
only for the visible progress ("1/3 steps"), so the button gets them as
they are. The two other users of `<Steps>`, the submission wizard
(`templates/submission/wizard.tpl`) and the decision pages
(`templates/decision/record.tpl`), pass `common.showAllSteps` ("Show
all steps") there.

The button is drawn only when the list collapses. On the multi-step
manager's page that is when a width check finds the steps do not fit a
narrow window. On the one-step acceptance page it always happens, which
is a separate fault
([its report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U06-A7-accept-page-hidden-steps-button.md)).
Its text sits in a screen-reader-only span inside a block marked
`aria-hidden`, so it is not in the accessibility tree; whether a screen
reader reads it when the button takes focus was not checked with a
reader.

Reach: the two invitation pages, on every application.

## Proposed fix

Pass the existing "Show all steps" text to the button. The diff is
against the application's root
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-steps-raw-labels/fix.diff)):

```diff
 # lib/ui-library/src/pages/userInvitation/UserInvitationPage.vue
 # lib/ui-library/src/pages/acceptInvitation/AcceptInvitationPage.vue
-			:show-steps-label="t('common.showingSteps')"
+			:show-steps-label="t('common.showAllSteps')"
```

`common.showAllSteps` reaches the browser only once the application's
build has added it to `registry/uiLocaleKeysBackend.json`; ui-library's
`t()` returns an empty text for a key the page was not given. The
normal build after the ui-library update does this.

Tried on `main`, on all three applications, with the JavaScript
rebuilt, on 2026-10-02 together with the list's name: the acceptance
page's button reads "Show all steps".

**What goes with it**

- Backport: the two pages are the same on `stable-3_5_0`; the diff
  applies there as written.

Small: one line in each of two pages of one repository, then a
`lib/ui-library` update and a JavaScript build in each application.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/invitation-steps-raw-labels/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-steps-raw-labels/walk.js)
  takes steps 1 to 5 and also reads both lists' names:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/invitation-steps-raw-labels/walk.js`
- Walked on `main`, OJS, OMP and OPS, on PostgreSQL, on 2026-10-10, at
  the heads of the pull requests of pkp/pkp-lib#12874 (pkp/ojs#5923
  `674754d5d3`, pkp/omp#2505 `5d8a4f104c`, pkp/ops#1446 `debb068213`,
  `lib/pkp` at pkp/pkp-lib#13497 `9f9a224862`, `lib/ui-library`
  `38814ea159`): both lists are named "Complete the steps for this
  invitation" and the button's text is "{$current}/{$total} steps".
  `stable-3_5_0` was walked on 2026-10-02 (`lib/ui-library` d4e01883);
  the pull requests change no ui-library file.
- Code reads: the two pages and `Steps.vue` on `main` and
  `stable-3_5_0`; `wizard.tpl` and `record.tpl`; ui-library's
  `src/utils/i18n.js` (`t()`).

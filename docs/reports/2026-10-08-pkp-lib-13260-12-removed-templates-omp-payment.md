# OMP: "Send notification of payment" answers a blank error page (a shared template was removed)

- **Severity** medium
- **Effort** small
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Affects**
  - main: none yet; OMP (the Manual Fee and PayPal payment plugins); third-party plugins and themes once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `pkp-lib#13260` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

pkp-lib#13260 deletes `frontend/pages/error.tpl` and renames
`frontend/pages/message.tpl` to `system-message.tpl`. The PR set updates
OJS's callers. OMP's Manual Fee and PayPal plugins still display
`frontend/pages/message.tpl`, so their message pages answer HTTP 500. Any
plugin outside the PR set that displays either file breaks the same way,
and a theme that overrides one of them is no longer used for these pages.

## Impact

- **Lost**: in OMP, the page a reader sees after "Send notification of payment" (and PayPal's three message pages); the notification email to the press is sent before the page fails, so the reader sees an error for a notification that went out.
- **Who**: readers buying a file from a press that sells with "Manual Fee Payment" or PayPal; users of third-party plugins that show a message or error page through these templates.
- **Way round**: none on screen.

Medium: a secondary task ends in an error page although its effect happened.

## Steps to reproduce

Preconditions: OMP with `lib/pkp` at pkp-lib#13260's head and finding 1 worked around (otherwise
every page fails earlier). A press that takes payments with "Manual Fee Payment" (Settings ›
Distribution › Payments) and a published monograph with a file for sale at 25.00 USD. PKP's
default dataset has no file for sale, so the screenshot below is from a test press set up for
this. No theme change.

1. As a reader open the monograph's page and press the priced file's button; the "Manual Fee Payment" page opens.
2. Press "Send notification of payment".

**Expected**: the page "Payment Notification" with "Payment notification sent" and "Continue".

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/12-omp-payment-notification-before.png)

**Observed**: HTTP 500 with an empty body (a blank page). Server log:

```
GET /index.php/<press>/payment/plugin/ManualPayment/notify/3 - Uncaught InvalidArgumentException: View [frontend.pages.message] not found.
```

## Cause

`lib/pkp/templates/frontend/pages/message.tpl` no longer exists (renamed, and the new file reads
other variables), and `error.tpl` is deleted. Callers left in OMP:

```
plugins/paymethod/manual/ManualPaymentPlugin.php:199     $templateMgr->display('frontend/pages/message.tpl');
plugins/paymethod/paypal/PaypalPaymentPlugin.php:230     $templateMgr->display('frontend/pages/message.tpl');
plugins/paymethod/paypal/PaypalPaymentForm.php:58, 91    ->display('frontend/pages/message.tpl');
```

In `ManualPaymentPlugin::handle()` the email is sent (`Mail::send($mailable)`, line 190) before the
template is displayed (line 199).

## Proposed fix

Keep the two old files beside the new one, unchanged and marked deprecated: their callers assign
text keys (`pageTitle`, `message`, `errorMsg`), which the old files translate and the new one
would print as they are, so a plain include of the new file is not enough. Tried: with
`message.tpl` and `error.tpl` restored from `main`, the "Payment Notification" page renders again.

Or update OMP's two plugins to `displaySystemMessage()` in an OMP PR of the same set, as ojs#5784
does for OJS's copies, and announce the removal to plugin and theme authors.

## Evidence

- **Refs.** OMP `084a19cc6` with lib/pkp at `571ea1fcac` plus the fallback of finding 1
  (`fix-pkp-lib-fallback.diff`); PostgreSQL, PHP 8.3.
- **Driven.** The steps above through the suite's own scenario (OMP U69 S4, "A file for sale
  bought with 'Manual Fee Payment'") at the tip (the page renders) and with pkp-lib at the PR head
  (500), then with the two templates restored (renders, test green).
- **Not driven.** PayPal's three places (read in the code); whether the email arrived in the failing
  run (the code sends it first); third-party plugins and themes (not surveyed).

# A reader who pays the membership fee through PayPal gets a server error and the journal records no payment

- **Severity** medium
- **Effort** medium
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS
  - 3.5: OJS
  - 3.4: none (code; a 3.4 reader loses the payment too, but to U51 A33's fault, which fails first)
  - 3.3: none (code)
- **Introduced** PR `pkp/pkp-lib#10877` for `pkp/pkp-lib#10834` · [9ad8c699ea](https://github.com/pkp/pkp-lib/commit/9ad8c699ea2e9fec240a1321655914440474e0c1) · 2025-02-12 · Touhidur Rahman (touhidurabir); the redirect that fails once that is fixed: no PR · [bee9547b49](https://github.com/pkp/pkp-lib/commit/bee9547b491353e92e53e5ed2da2d197a24be972) · 2024-06-26 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-27)
- **Tracked in** spec U52 [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U52-payments-and-apcs.md#a13)
- **Checked** 2026-11-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a journal that takes payments through "Paypal Fee Payment" and sets
an "Association Membership" fee, a reader can pay the "Individual
Membership Fee" at the journal's address followed by
`user/payMembership`. No page links to that address. When PayPal sends
the reader back after the payment, the journal's server fails before it
records anything.

PayPal has taken the money, but the journal's "Payments" list stays
empty and nobody at the journal is told that the reader paid.

The other fees paid through PayPal come back without the error: an
article purchase and, on a press, a file sale were recorded, and the
code records subscription, issue and publication fees the same way. On
an install with PHP's assertions on, the default of a development
install, the membership page itself already fails, before PayPal.

## Impact

- **Lost:** the record of the payment. No screen lists the pending
  payment or lets a manager record it afterwards. A membership recorded
  would not open anything for the member today either: since OJS 3.4
  the membership grants no access (U51 A33).
- **Who:** readers sent the membership address by a journal that uses
  PayPal. Readers paying any other fee through PayPal do not meet this
  fault.
- **Way round:** none for the reader. A Journal Manager who finds the
  payment in the PayPal account can give the reader access by hand, for
  example with an individual subscription.

Medium: a payment is taken and silently not recorded, with no way round
for the reader, but only for the membership, which no page offers. It
would be high if a page offered the membership, or if other PayPal fees
failed the same way.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (journal `publicknowledge`).
  Payments are off in it.
- `zend.assertions = -1` in `php.ini`, the production value. With
  PHP's built-in default of `1`, which `php.ini-development` keeps,
  step 3 already fails (see Observed).
- A PayPal developer sandbox: a REST app's "Client ID" and "Secret",
  and a sandbox personal (buyer) account to pay with.

Steps:

1. Sign in as `dbarnes`. Open Settings › Distribution › "Payments",
   tick "Enable", choose "US Dollar" under "Currency" and "Paypal Fee
   Payment" under "Payment Plugins". Type any text in "Account Name"
   (the walk used `u52hk52a`), the sandbox app's "Client ID" and
   "Secret", tick "Test Mode" and press "Save".
2. Reload the page, so that the side menu shows "Payments". Press
   "Payments", then the "Payment Types" tab. Type `7` in "Association
   Membership" and press "Save".
3. Sign in as `ccorino`. Type the journal's address followed by
   `user/payMembership`
   (`/index.php/publicknowledge/en/user/payMembership`). The browser
   goes to PayPal for 7.00 USD.
4. On PayPal, sign in with the sandbox buyer account and approve the
   payment. PayPal sends the browser back to
   `/index.php/publicknowledge/payment/plugin/PaypalPayment/return?queuedPaymentId=…`.
5. Sign in as `dbarnes`. Press "Payments" in the side menu, then the
   "Payments" tab.

**Expected:** after step 4 the reader is back on a page of the
journal. At step 5 the list holds a row for "Carlo Corino",
"Individual Membership Fee", "7 USD".

**Observed:** the code step 4 runs, run from PHP 8.3 on the queued
payment step 3 stored, throws before anything is recorded:

```
TypeError: PKP\payment\Payment::getAssocId(): Return value must be of type int, null returned in lib/pkp/classes/payment/Payment.php:168
```

On a web request the error is uncaught, so it is in the PHP error log,
and the reader gets a server error. At step 5 the list reads "No
Items", and the queued payment from step 3 is still in
`queued_payments`.

With `zend.assertions = 1`, step 3 already fails: the call it makes
throws `AssertionError: assert(false)` in
`classes/payment/ojs/OJSPaymentManager.php:115`, before anything is
queued or sent to PayPal.

A control: a "Purchase Article Fee" paid through the same return is
recorded and the reader is sent back to the article.

## Cause

A membership payment is the only payment with no object of its own:
`UserHandler::payMembership()` queues it with
`createQueuedPayment(…, PAYMENT_TYPE_MEMBERSHIP, $user->getId(), null, …)`.
Every other caller of `createQueuedPayment()` in OJS and OMP passes the
id of an article, issue, subscription, submission or file (checked in
the code).

PayPal's return runs `PaypalPaymentPlugin::handle()`, which confirms the
payment with PayPal and calls `OJSPaymentManager::fulfillQueuedPayment()`.
There the membership branch of the switch runs first and edits the
account's membership end date. Then `createCompletedPayment()` copies
the queued payment with
`$payment->setAssocId($queuedPayment->getAssocId())`.
`PKP\payment\Payment` declares the property `?int $assocId`, and its
constructor takes `?int $assocId = null`. But
[9ad8c699ea](https://github.com/pkp/pkp-lib/commit/9ad8c699ea2e9fec240a1321655914440474e0c1)
(`pkp/pkp-lib#10877`) typed the getter `getAssocId(): int` and the
setter `setAssocId(int $assocId)`. So reading the null throws a
`TypeError` before the completed payment is inserted and before the
queued payment is deleted. `handle()` catches `\Exception`, not
`\Error`, so its own error page is not shown either. The change was for
`pkp/pkp-lib#10834`, a waived fee read back as paid, and was meant to
type the payment's amount. The assoc id was typed in the same pass.

Once that is fixed, the redirect that follows fails.
`OJSPaymentManager::createQueuedPayment()` has filed
`PAYMENT_TYPE_MEMBERSHIP` with the retired types since
[1f0a80197d](https://github.com/pkp/ojs/commit/1f0a80197d92b17b4553009bc3236b3448b49ea2)
(2017, "deprecated payments cleanup"). That branch logs
`Invalid payment type "1"`, runs `assert(false)` and sets no request
URL, although the fee box and `user/payMembership` stayed. After the
payment is recorded, `handle()` calls
`$request->redirectUrl($queuedPayment->getRequestUrl())`, and
`PKPRequest::redirectUrl(string $url)`, typed so by
[bee9547b49](https://github.com/pkp/pkp-lib/commit/bee9547b491353e92e53e5ed2da2d197a24be972),
rejects the null with another `TypeError` (code read). In 3.3 the null
went out as an empty `Location` header. The `assert(false)` is what
fails step 3 on an install with assertions on.

Reach:

- The other fee types go through the same return with an object and a
  request URL: "Purchase Article Fee" in OJS and a file sale in OMP
  (walked, recorded and redirected); subscription purchase and renewal,
  "Purchase Issue Fee" and the publication fee (code read: each passes
  its object's id and sets a request URL).
- The manual method never reaches `fulfillQueuedPayment()` for a
  membership ("Send notification of payment" only sends an email), so
  only PayPal journals meet the return's failure.
- The membership branch writes the account before the payment fails,
  but the end date it sets is dropped (U51 A33), and the payment itself
  is not written. Nothing is stored wrong.
- The end date is not stored and not read either: a separate fault,
  with its own report,
  [U51 A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U51-A33-paid-member-refused-restricted-galleys.md).
- The same typing mismatch on `Payment::getUserId(): int` breaks a
  payment record whose payer was deleted. That is covered by
  [U52 A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U52-A11-merged-payer-breaks-payments-list-and-publishing.md).

## Proposed fix

Make the assoc id's getter and setter nullable, as the property and the
constructor already are. Then give the membership a branch of its own,
with a request URL, in `OJSPaymentManager::createQueuedPayment()`
([fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paypal-membership-payment-never-recorded/fix-ojs.diff);
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paypal-membership-payment-never-recorded/fix-omp.diff)
is the pkp-lib half alone):

```diff
--- a/lib/pkp/classes/payment/Payment.php
+++ b/lib/pkp/classes/payment/Payment.php
-    public function setAssocId(int $assocId): int
+    public function setAssocId(?int $assocId): ?int
…
-    public function getAssocId(): int
+    public function getAssocId(): ?int
--- a/classes/payment/ojs/OJSPaymentManager.php
+++ b/classes/payment/ojs/OJSPaymentManager.php
-            case self::PAYMENT_TYPE_MEMBERSHIP: // Deprecated
+            case self::PAYMENT_TYPE_MEMBERSHIP:
+                $payment->setRequestUrl($dispatcher->url($request, Application::ROUTE_PAGE, null, 'index'));
+                break;
```

A payment with no object holds null, which the property already
allows. The DAOs keep casting `assoc_id` with `(int)`, so a recorded
membership is stored with 0, as 3.3 stored it, and readers of the
column see no change. Leaving the retired types' branch also removes
the `assert(false)` and the `Invalid payment type "1"` log line from
the membership page. The request URL is set where every other type sets
its own, so `handle()` and the manual method's page get an address for
a membership as they do for every other payment. The journal's home
page is a proposal; the team may prefer another landing page.

Tried on main. With the fix in, the return for `ccorino`'s membership
recorded the payment, deleted the queued payment and redirected to the
journal's home page. The "Payments" tab listed "Carlo Corino",
"Individual Membership Fee", "7 USD". With assertions on, the call
step 3 makes returned the request URL instead of throwing. With the fix
in and out, a "Purchase Article Fee" in OJS and a file sale in OMP
were recorded the same way and sent the reader back to the article and
to the book's file.

**Alternatives:**

- Pass `?? 0` in `createCompletedPayment()`. That fixes one caller and
  leaves the getter contradicting the property for every other reader.
- Fall back to the context's home page in `PaypalPaymentPlugin::handle()`
  when the queued payment has no URL. That patches one reader of the
  missing value instead of its writer, and leaves the `assert(false)`
  on the membership page.
- Store NULL for a membership by dropping the `(int)` casts. Nothing
  reads the column for a membership, and 0 matches the rows 3.3 left.
- If the 2017 "// Deprecated" mark means the membership is to be
  retired (`pkp/pkp-lib#4701` discussed it), the fix is to remove the
  fee box, `user/payMembership` and the galley checks instead: a
  product decision.

**What goes with it:**

- The manual method's notification page for a membership gains a link
  back to the journal, which it has lacked (read in the code, not
  walked).
- U52 A11's fix makes `getUserId()` nullable in the same file. The two
  fit together, and a pass over `Payment`'s other getters
  (`getAmount()`, `getCurrencyCode()`) against their `?` properties
  belongs with them.
- 3.5: both diffs apply as written. 3.4 does not reach this code
  (Affects).
- The guard: a unit test of `OJSPaymentManager::fulfillQueuedPayment()`
  for a membership queued payment (a completed payment of type 1 stored
  and the queued payment deleted), run with assertions on, and an e2e
  scenario for the membership return in this campaign's payments spec.

Medium: a few lines, but in pkp-lib and in OJS, with a unit test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paypal-membership-payment-never-recorded/walk.js)
  with
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paypal-membership-payment-never-recorded/lib.js)
  and
  [paypal-return.php](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paypal-membership-payment-never-recorded/paypal-return.php),
  after a reset to the default dataset:
  `npm run fleet-prep -- --feature issues-hk52a --dataset 6 --reset`, then
  `PROBE_FEATURE=issues-hk52a PROBE_AGENT=hk52a node bin/probe.js ojs shared/playwright/checks/issues/paypal-membership-payment-never-recorded/walk.js`
  (3.5: `PKP_E2E_LINE=stable-3_5_0` in front of both, the feature
  `issues-hk52a-3_5`, `PROBE_RUN=r35`). `MODE=nb` on `all` runs the
  control: the article purchase in OJS and the book file sale in OMP.
- Where the walk differs from the Steps: the test installs run
  `zend.assertions = -1` and reach no PayPal account, so step 1 typed
  only "Account Name", and step 3 showed "A transaction error occurred.
  Please contact the journal manager for details." and stored the
  queued payment all the same. Step 4 was not driven: `paypal-return.php`
  ran the two lines `PaypalPaymentPlugin::handle()` runs once PayPal
  confirms a payment (`fulfillQueuedPayment($request, $queuedPayment, 'PaypalPayment')`,
  then `$request->redirectUrl($queuedPayment->getRequestUrl())`), with a
  `Request::redirect` hook that records the address instead of sending
  it. The `TypeError` is what that run threw; the reader's page after
  it, a server error, is read from the code.
- The `AssertionError`: `createQueuedPayment()` for a membership, run
  from PHP 8.3 on the fleet's install with `-d zend.assertions=1`, threw
  it at line 115 and, with `-1`, returned no request URL; with the fix
  in, both returned the URL. Not walked in a browser with assertions on.
- Fix trial, one command under the slot's exclusive lock on ojs and
  omp: `node bin/try-fix.js apply …/fix-ojs.diff ojs` and
  `…/fix-omp.diff omp`, a reset, the walk (`PROBE_RUN=fix`), a reset,
  `MODE=nb PROBE_RUN=nb-in`, both reverts, a reset,
  `MODE=nb PROBE_RUN=nb-out`; the assertion check was a second short
  apply and revert on ojs. `node bin/try-fix.js status ojs omp` read
  clean afterwards. The redirect's `TypeError` with only the pkp-lib
  half in is a code read (`redirectUrl(string $url)`), not tried alone.
- Walks: OJS main and stable-3_5_0, the same Observed on both, PHP 8.3,
  PostgreSQL, the default dataset at pkp/datasets 98360bca
  (2026-11-26). MySQL not walked; nothing here depends on the database.
- Tips: OJS main d37c63cc7c, its pkp-lib 44b36bf802; OMP main
  39fc76c2b, its pkp-lib 44b36bf802; OJS stable-3_5_0 810ed373fe, its
  pkp-lib db49f73866; OJS stable-3_4_0 86536a32bc, its pkp-lib
  762235e120; OJS stable-3_3_0 b33c96cb9b, its pkp-lib 486ca25dac.
- Code reads: main and 3.5 (the same code apart from class aliases)
  `OJSPaymentManager` (`createQueuedPayment()`, `fulfillQueuedPayment()`,
  `createCompletedPayment()`), `OJSCompletedPaymentDAO`
  (`insertObject()`, `_fromRow()`), `PaypalPaymentPlugin::handle()`,
  `ManualPaymentPlugin`, `UserHandler::payMembership()`,
  `PaymentsGridCellProvider`, the users of `QueuedPaymentDAO` (no
  management screen lists queued payments); pkp-lib `Payment`,
  `QueuedPayment`, `PaymentManager::queuePayment()`,
  `PKPRequest::redirectUrl()`; OMP `OMPPaymentManager`. 3.4:
  `Payment::getAssocId()`/`setAssocId()` and `redirectUrl()` untyped;
  the membership branch calls `$user->getSetting()`/`updateSetting()`,
  which 3.4's `User`, `Identity` and `DataObject` no longer have, so the
  return throws there before recording. 3.3: untyped, the membership
  branch on `UserSettingsDAO`, the payment recorded.
- Introduced: `git blame` on `getAssocId(): int` and
  `setAssocId(int …)` gives 9ad8c699ea (the same commit on
  stable-3_5_0); the GitHub API names its PR `pkp/pkp-lib#10877`.
  `redirectUrl(string $url)` blames to bee9547b49, for which the API
  lists no PR. Dates are author dates. On main, the membership branch
  reached `createCompletedPayment()` only after
  [59896b5714](https://github.com/pkp/ojs/commit/59896b571426be7e2a6b19bd320f8af373d66886)
  (2025-03-19) replaced its removed `getSetting()` calls.
- Upstream, 2026-11-27: pkp/pkp-lib, pkp/ojs and pkp/ui-library
  searched for the symptom (membership, PayPal return, payment not
  recorded) and for `getAssocId`, `fulfillQueuedPayment`,
  `redirectUrl` and `Payment.php`. `pkp/pkp-lib#4701` (membership
  purchase, closed), `pkp/pkp-lib#10327` (fulfilment without a session,
  closed, fixed) and `pkp/pkp-lib#12234` (an abandoned subscription
  payment) are related, not this fault.

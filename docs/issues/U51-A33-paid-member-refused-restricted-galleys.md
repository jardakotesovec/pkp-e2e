# A reader who has paid the "Association Membership" is refused restricted galleys like any other reader

- **Severity** medium
- **Effort** medium
- **Kind** regression
- **Affects**
  - main: OJS
  - 3.5: OJS
  - 3.4: OJS (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#7127` · [0c03f30381](https://github.com/pkp/pkp-lib/commit/0c03f3038175075d6fb564447de1007e2c8a9ea7) · 2021-08-31 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-23)
- **Tracked in** spec U51 [A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U51-subscriptions.md#a33)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a journal that requires subscriptions and sets an "Association
Membership" fee, a reader who has paid the membership expects to open
its restricted galleys, as members did up to OJS 3.3. Instead they are
refused as before paying: a locked article galley sends them to the
"Subscriptions" page, and a locked "Full Issue" to a payment page for a
"Purchase Issue Fee".

The membership is not kept on the reader's account, and a membership
recorded before the journal upgraded from 3.3 is not read. With "Manual
Fee Payment" nothing records the membership at all; with PayPal the
reader pays and gets nothing.

Only a journal using PayPal can take the payment, through an address no
page links to, so few readers reach this; a Journal Manager can give a
member an individual subscription instead.

## Impact

- **Lost:** the access a member paid for. Members recorded before the
  journal upgraded from 3.3 lose it at the upgrade, and a reader who
  pays now is charged and gets nothing. Nobody is told: the screens look
  as they do for a reader who never paid.
- **Who:** readers of a subscription journal with an "Association
  Membership" fee that took the membership through PayPal, on 3.3 or
  since. The upgrade case needs PayPal too: on 3.3, as now, only a
  PayPal payment recorded a membership ("Manual Fee Payment" records
  none, and no screen lets a manager enter one).
- **Way round:** none for the reader. The Journal Manager can give each
  member an individual subscription on the "Subscriptions" page, once
  they learn who paid.

Medium: reading what a member paid for fails silently, with no way
round for the reader. The rule for high asks for an ordinary setup, and
this is not one: no page has offered the membership since OJS 3.0
(`pkp/pkp-lib#4701`), the code has marked its payment type deprecated
since 2017, and only PayPal journals that send readers to a typed
address take one. The manager also has a way round on screen. Journals
that sell memberships widely would raise it to high.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (journal `publicknowledge`).
- Signed in as `dbarnes`:
  1. Settings › Distribution › "Access": choose "The journal will
     require subscriptions to access some or all of its contents.",
     "Save".
  2. Settings › Distribution › "Payments": tick "Enable payments",
     "Currency" US Dollar, "Payment Plugins" "Manual Fee Payment", any
     text in "Fee payment instructions", "Save".
  3. "Payments" › "Payment Types": "Association Membership" `7`, the
     other fees left empty, "Save".
  4. Issues › "Back Issues" › "Vol. 1 No. 2 (2014)" › "Edit" ›
     "Access": "Subscription", "Save".
  5. The same issue › "Issue Galleys" › "Create Issue Galley": label
     "PDF", any PDF file, "Save".
- `ccorino` paid the membership today through PayPal, recorded as OJS
  3.3's PayPal return recorded it and as an install upgraded from 3.3
  still holds it: the completed payment, and the end date a year later
  on the account. No screen can record it on `main` (Cause), so it is
  written by SQL. PostgreSQL:

  ```sql
  INSERT INTO completed_payments (timestamp, payment_type, context_id, user_id, assoc_id, amount, currency_code_alpha, payment_method_plugin_name)
  SELECT date_trunc('second', now()), 1, j.journal_id, u.user_id, 0, 7, 'USD', 'PaypalPayment'
  FROM users u, journals j WHERE u.username = 'ccorino' AND j.path = 'publicknowledge';
  INSERT INTO user_settings (user_id, locale, setting_name, setting_value)
  SELECT user_id, '', 'dateEndMembership', to_char(now() + interval '1 year', 'YYYY-MM-DD') || ' 23:59:59'
  FROM users WHERE username = 'ccorino';
  ```

  MySQL and MariaDB: the same statements with `NOW()` for
  `date_trunc('second', now())`, and
  `DATE_FORMAT(NOW() + INTERVAL 1 YEAR, '%Y-%m-%d 23:59:59')` for the
  `to_char(…)` expression.

Steps:

1. Sign in as `ccorino` (password `ccorinoccorino`).
2. Open "Archives" › "Vol. 1 No. 2 (2014)".
3. Under "Antimicrobial, heavy metal resistance and plasmid profile of
   coliforms isolated from nosocomial infections in a hospital in
   Isfahan, Iran", press "PDF".
4. Back on the issue's page, press the "Full Issue" "PDF".

**Expected:** both PDFs open in the viewer, as they do for a reader with
an active individual subscription.

**Observed:** step 3 lands on the "Subscriptions" page
(`/index.php/publicknowledge/en/about/subscriptions`). Step 4 shows
"Manual Fee Payment" with "Title" "Purchase Issue Fee", no "Fee" line,
the payment instructions and "Send notification of payment".

The payment itself needs PayPal, so the Steps start after it. To see
what a payment stores today, sign in as another reader, open the
journal's address followed by `user/payMembership` ("Individual
Membership Fee", "7.00 (USD)"), and run
[paypal-return.php](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paid-member-refused-restricted-galleys/paypal-return.php)
in the OJS root with the new queued payment's ID
(`php paypal-return.php <queued_payment_id>`). It runs the code
PayPal's return runs once PayPal confirms the payment. On `main` it
stores no end date on the account, then stops with
`TypeError: PKP\payment\Payment::getAssocId(): Return value must be of type int, null returned`,
so no completed payment is recorded either; the reader who paid is refused at
steps 3 and 4 as well.

## Cause

OJS 3.3 kept a paid membership as the user setting `dateEndMembership`.
`OJSPaymentManager::fulfillQueuedPayment()` wrote it when a membership
payment completed, and `ArticleHandler::userCanViewGalley()` and
`IssueHandler::userCanViewGalley()` let the reader through while it lay
in the future. All three went through `User::getSetting()` and
`User::updateSetting()`, which read and wrote `user_settings` directly
and gave the date back as a Unix timestamp.

[0c03f30381](https://github.com/pkp/pkp-lib/commit/0c03f3038175075d6fb564447de1007e2c8a9ea7)
(`pkp/pkp-lib#7127`, "Remove UserSettingsDAO") removed those two methods
and moved user settings to the schema-driven entity DAO. It added
pkp-lib's own `profileImage` to `lib/pkp/schemas/user.json`; nothing
declared OJS's `dateEndMembership`. The OJS callers kept calling the
removed methods, and were later rewritten to
`$user->getData('dateEndMembership', 0)` and `setData()` plus
`Repo::user()->edit()`: `ArticleHandler` in
[72bbb7a442](https://github.com/pkp/ojs/commit/72bbb7a442fd02f09b7d59f88c24af1316a881c1)
(`pkp/pkp-lib#6091`), the other two in
[59896b5714](https://github.com/pkp/ojs/commit/59896b571426be7e2a6b19bd320f8af373d66886)
(`pkp/pkp-lib#11138`, the "Call to undefined method
PKP\user\User::getSetting()" crash of the "Full Issue" on 3.5.0rc1).
Without a schema property:

- the write is dropped: `EntityDAO::_update()` passes the user through
  `PKPSchemaService::sanitize()`, which keeps only the properties the
  schema names;
- the read is always null: `EntityDAO::fromRow()` loads only the
  `user_settings` rows the schema names, so an end date stored by 3.3 is
  never loaded, and both handlers fall through to the refusal.

The memberships were not dropped on purpose. The 2017 cleanup
([1f0a80197d](https://github.com/pkp/ojs/commit/1f0a80197d92b17b4553009bc3236b3448b49ea2),
in 3.3 too) commented `PAYMENT_TYPE_MEMBERSHIP` "// Deprecated" only in
`createQueuedPayment()`, where it leaves the payment without a return
address; the fee box, `user/payMembership` and both galley checks
stayed. `pkp/pkp-lib#7127` changed none of the membership code, and the
2025 fix kept the checks and rewrote them.

Reach:

- The two galley handlers are the only readers of the membership
  (checked in the code; both refusals walked on main and 3.5).
- A new payment stores nothing either, and it fails before it is
  recorded: `createCompletedPayment()` calls `getAssocId()`, typed `int`
  since `pkp/pkp-lib#10834`, and a membership payment has no associated
  object. In a web request this is a server error after PayPal has taken
  the money (the plugin catches only `Exception`). That is a separate
  fault, not fixed here. Behind it, the missing return address (the
  server log reads `Invalid payment type "1"` on every
  `user/payMembership` page) would make the return's redirect fail next
  (code read).
- Rows already stored: the 3.4 upgrade drops the `assoc_*` and
  `setting_type` columns of `user_settings`, not its rows, and keeps
  `completed_payments` whole, so a 3.3 member's payment and end date are
  still there.
- No other caller of the removed `User::getSetting()` /
  `updateSetting()` remains in OJS or its pkp-lib.

## Proposed fix

Read the membership from the journal's own completed membership
payments, as the two sibling checks already read a paid article
(`hasPaidPurchaseArticle()`) and a paid issue (`hasPaidPurchaseIssue()`)
from `completed_payments`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paid-member-refused-restricted-galleys/fix.diff)):

- `OJSCompletedPaymentDAO::getMembershipEnd(?int $userId, int $contextId): ?int`,
  new: each of the user's completed `PAYMENT_TYPE_MEMBERSHIP` payments
  in that journal adds a year, counted from the payment or from the end
  of the year before, whichever is later. This is the rule
  `fulfillQueuedPayment()` applied when it wrote the end date.
- `ArticleHandler::userCanViewGalley()` and
  `IssueHandler::userCanViewGalley()`:

  ```php
  || $completedPaymentDao->getMembershipEnd($userId, $context->getId()) > time()
  ```

  (`$journal` in `IssueHandler`), in place of the `getData()` read.
- `OJSPaymentManager::fulfillQueuedPayment()`: the membership case
  stops editing the user and only returns true, as the purchase cases
  do; the completed payment it records is the membership.

A membership is paid to one journal, and a user setting names none, so
the record that does name the journal, `completed_payments.context_id`,
is the one to read. It needs no schema change and no data repair: the
payments 3.3 recorded still count.

Tried on main. With the fix in, `ccorino` opens both PDFs in the viewer.
A reader with no membership, and one whose membership was paid two
years ago, are refused as before, with the fix in and out. A new
payment still stops on the `getAssocId()` crash above, so a member who
pays after the upgrade gets through only once that is fixed too.

**Alternatives:**

- Declare `dateEndMembership` in an OJS `schemas/user.json`. On its own
  that turns both refusals into server errors: `DataObject::getData()`
  returns by reference, and the leftover `, 0` (3.3's site context, now
  the locale) makes it reference an offset of the loaded string,
  `Cannot create references to/from string offsets` (PHP 8.3). The
  calls would also have to drop the `, 0` and compare `strtotime()` of
  the stored string, since 3.3 handed the date back as a timestamp. And
  the stored value would still name no journal.
- Retire the membership instead (the fee box, `user/payMembership`, the
  checks), as `pkp/pkp-lib#4701` discussed in 2020 and closed as not
  planned: a product decision, and upgraded members would need moving
  to subscriptions.

**What goes with it:**

- The `getAssocId()` crash and the missing return address on the
  payment's return (Cause, reach), before a new payment completes.
- The `dateEndMembership` rows become unused; dropping them is
  optional.
- 3.5: the diff applies as written. 3.4 still calls the removed methods
  in `IssueHandler` and `OJSPaymentManager`; the same change replaces
  those calls.
- The guard: a unit test of `getMembershipEnd()` (none, one, two
  overlapping and one expired payment), and a U51 e2e scenario where a
  member with a payment from today opens a restricted article galley
  and a "Full Issue".

Medium: a new DAO method and three call sites in OJS, small in lines
but in four files, with a unit test; no data repair.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paid-member-refused-restricted-galleys/walk.js)
  with
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/paid-member-refused-restricted-galleys/lib.js)
  and `paypal-return.php`, run after a reset to the default dataset:
  `npm run fleet-prep -- --feature issues-n23m --dataset 3 --reset`, then
  `PROBE_FEATURE=issues-n23m PROBE_AGENT=n23m node bin/probe.js ojs shared/playwright/checks/issues/paid-member-refused-restricted-galleys/walk.js`
  (3.5: `PKP_E2E_LINE=stable-3_5_0` in front of both, the feature
  `issues-n23m-3_5` and `PROBE_RUN=r35b`). It takes the preconditions
  and Steps through the screens, the payment by the Steps' SQL, then the
  payment side with `dsokoloff`. `MODE=nb` is the check that the fix
  reaches no further (`ckwantes` with no membership, then with one paid
  two years ago).
- Fix trial, one command under the slot's exclusive lock:
  `node bin/try-fix.js apply shared/playwright/checks/issues/paid-member-refused-restricted-galleys/fix.diff ojs`,
  a reset, the walk (`PROBE_RUN=fix2`), a reset, `MODE=nb PROBE_RUN=nb-in2`,
  `node bin/try-fix.js revert … ojs`, a reset, `MODE=nb PROBE_RUN=nb-out2`,
  after the unpatched walk (`PROBE_RUN=main2`). With the fix in,
  `ccorino` opened both PDFs; `dsokoloff`'s new payment still stopped on
  the `getAssocId()` TypeError with nothing recorded, and was refused.
  `ckwantes` got the "Subscriptions" page and the "Purchase Issue Fee"
  page both times, fix in and out. `node bin/try-fix.js status ojs` read
  clean afterwards.
- Walks: OJS main and stable-3_5_0, PHP 8.3, PostgreSQL, the default
  dataset at pkp/datasets abdb5d17 (2026-11-22), the same Observed on
  both, no request answering 400 or more and no page script failing.
  MySQL not walked; nothing here depends on the database.
- Tips: OJS main 1e1d3fc49b, its pkp-lib 3ea73a1a7e; OJS stable-3_5_0
  7f23f05a93, its pkp-lib 9295edd4f0; OJS stable-3_4_0 4b437fd4c3, its
  pkp-lib 1310f00fed; OJS stable-3_3_0 de6f4ead8e, its pkp-lib
  cb68f48e99.
- Code reads: main and 3.5 `OJSPaymentManager` (`createQueuedPayment()`,
  `fulfillQueuedPayment()`, `createCompletedPayment()`),
  `OJSCompletedPaymentDAO`, `ArticleHandler` and `IssueHandler`
  (`userCanViewGalley()`), `UserHandler::payMembership()`,
  `PaypalPaymentPlugin::handle()`; pkp-lib `schemas/user.json`,
  `EntityDAO` (`fromRow()`, `_update()`), `PKPSchemaService`
  (`get()`, `merge()`, `sanitize()`), `DataObject::getData()`,
  `Payment`, and the 3.4 upgrade migrations `I9039_DropDeprecatedFields`
  and `UpgradeMigration`. 3.4: `IssueHandler` and `OJSPaymentManager`
  call `getSetting()` / `updateSetting()`, which 3.4's `User` no longer
  has (the "Full Issue" refusal there is the `pkp/pkp-lib#11138` crash),
  and `ArticleHandler` reads `getData()`: no member gets through. 3.3:
  `User::getSetting()` / `updateSetting()` on `UserSettingsDAO`, used by
  all three callers, the value stored as `date` (`Y-m-d H:i:s`) and read
  back as a timestamp; `ManualPaymentPlugin`'s `notify` only sends mail.
  The reference error was confirmed with a copy of `getData()` on PHP
  8.3.
- Introduced: `git blame` on the three callers gives 72bbb7a442 and
  59896b5714 (ed7ec323a8 on stable-3_5_0); both replaced calls broken
  since pkp-lib 0c03f30381, found by `git log -S` on
  `function updateSetting`. The GitHub API lists no PR for any of the
  three.
- Upstream, 2026-11-23: pkp/pkp-lib, pkp/ojs and pkp/ui-library
  searched; `pkp/pkp-lib#4701` and `pkp/pkp-lib#11138` are related, not
  this fault.
- Not driven: a real PayPal payment. Unverified: the redirect failing
  on the missing return address (code read only).

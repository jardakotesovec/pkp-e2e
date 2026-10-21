# In Uzbek (Latin), subscription screens print "{$ x}", "{$ price}" and "{$ date}" instead of the values

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS (Uzbek (Latin), Arabic, Mongolian, Romanian, Aragonese)
  - 3.5: OJS (the same five languages)
  - 3.4: OJS (code; the translation files: Uzbek (Latin) and Romanian)
  - 3.3: OJS (code; the translation files: Romanian only)
- **Introduced** not traced to one change (one translation per language, listed in Evidence); Uzbek (Latin) from [fd68592b29](https://github.com/pkp/ojs/commit/fd68592b29330faf4664bd2fb546a669d5c95f63) (`locale.po`, 2021-09-08) and [43aeb9a051](https://github.com/pkp/ojs/commit/43aeb9a05154b16a4428f22f05d4eb2c09cbfc34) (`manager.po`, 2021-09-10) · Ruslan Shodmonov (ruslanshodmonov), Weblate commits with no pull request; the oldest broken text present since at least [6a25657810](https://github.com/pkp/ojs/commit/6a2565781017d3c4b99873348234c059a4797eb5) (2020-08-06, Romanian)
- **Upstream** none found (2026-10-21)
- **Tracked in** U51 [A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U51-subscriptions.md#a31)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A journal read in Uzbek (Latin) shows a marker, braces and all, where
four texts should show the month count, the week count, the fee or the
end date, in nine places on screen. The "Delayed Open Access" list on
Settings › Distribution › "Access" and the four reminder lists on the
"Subscription Policies" tab of the "Subscriptions" page read "{$ x} oy"
and "{$ x} hafta" for every entry, so a Journal Manager can tell three
months from twelve only by counting down the list. A locked "PDF" link,
on the issue's page and the article's, ends with "({$ currency}
{$ price})" instead of the fee, and "My Subscriptions" and the
"Subscription" block read "Muddati: {$ date}" instead of the end date.

The payment page a signed-in reader reaches from the locked link states
the fee as a number, so nobody pays without seeing it. The same pages in
English show "3 Months", "(USD 10)" and "Expires: 2026-12-31".

The same mistake hides the fee on the locked link in Arabic, Mongolian
and Romanian, and the end date of a running subscription in Aragonese.
In each, the translation writes the value's placeholder differently
from the one the page fills in (with a space, a hyphen, or the name
itself translated), so it prints raw. The fix is a corrected text in
OJS's translation files.

## Impact

- **Lost**: the count in every month and week entry, the article fee on
  a locked link, and a subscription's end date, on screen. Stored
  settings and access are unaffected.
- **Who**: journals that offer Uzbek (Latin) as an interface language
  and require subscriptions: their managers on the "Access" settings
  tab and the "Subscription Policies" tab, and their visitors and
  subscribers on the issue, article and "My Subscriptions" pages. In
  Arabic, Mongolian and Romanian, only journals with a "Purchase
  Article" fee.
- **Way round**: the same page in English shows every value, and the
  payment page shows the fee before anyone pays.

Low: wording on screen; every task still gets done.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main`.
- Uzbek (Latin) installed and offered. Sign in as `admin` (password
  `admin`): Administration › "Site Settings" › "Site Setup" ›
  "Languages" › "Install Locale", tick "Uzbek (Latin)/o‘zbek (lotin)
  (uz_Latn)", "Save". Then, on "Journal of Public Knowledge", Settings ›
  Website › "Setup" › "Languages": tick "UI" on the Uzbek row.
- The journal set up for subscriptions, as `rvaca` (password
  `rvacarvaca`):
  1. Settings › Distribution › "Payments": tick "Enable", currency "US
     Dollar", method "Manual Fee Payment", any instructions, "Save".
  2. Settings › Distribution › "Access": "The journal will require
     subscriptions to access some or all of its contents.", "Save".
  3. The side menu's "Payments", which opens the page headed
     "Subscriptions": its "Payment Types" tab, "Purchase Article" 10,
     "Save".
  4. The same page's "Subscription Types" tab › "Create New
     Subscription Type": "Online Year", US Dollar, 10, Online, 12
     months, "Individual", "Save".
  5. The same page's "Individual Subscriptions" tab › "Create New
     Subscription": `dsokoloff`, "Online Year", "Active", start
     2026-01-01, end 2026-12-31, "Save". The same for `ccorino`, start
     2025-01-01, end 2025-12-31.
  6. Issues › "Back Issues" › "Vol. 1 No. 2 (2014)" › "Edit" › "Access":
     "Subscription", "Save".
  7. Settings › Website › "Appearance" › "Setup" › "Sidebar": tick
     "Subscription Block", "Save".

Back office, as `rvaca`:

1. User menu › "o‘zbek".
2. Settings › Distribution › "Access" tab: open "Kechiktirilgan ochiq
   kirish" ("Delayed Open Access").
3. Choose the fourth entry, press the form's "Save", reload the page.
4. The side menu's "To'lovlar" ("Payments"), the page headed
   "Obunalar" ("Subscriptions"), its "Obuna siyosati" ("Subscription
   Policies") tab: open the four lists under "Obuna muddati tugashi
   haqida eslatmalar".
5. User menu › "English": the "Access" tab and the "Subscription
   Policies" tab again.

Reader side:

6. Signed out, open `/index.php/publicknowledge/uz_Latn/issue/archive`,
   then "Jild 1 Nomeri 2 (2014)": read the "PDF" link under "Signalling
   Theory Dividends". Open the article and read its "PDF" link.
7. Sign in as `dsokoloff` (`dsokoloffdsokoloff`) and open
   `/index.php/publicknowledge/uz_Latn/user/subscriptions` ("Mening
   obunalarim"): read the row's status and the sidebar's "Obuna" block.
8. The same as `ccorino` (`ccorinoccorino`).
9. Steps 6 to 8 with `en` in place of `uz_Latn`.

**Expected:** each entry carries its count ("1 oy" to "60 oy", "1
hafta" to "3 hafta"), the link ends with "(USD 10)", and the status
gives the end date, 2026-12-31 for `dsokoloff` and 2025-12-31 for
`ccorino`.

**Observed:** every entry after the first reads the same text, and so
does the saved choice:

```
Kechiktirilgan ochiq kirish (61 entries):    ##common.disabled##, {$ x} oy ×60
the four reminder lists (13, 4, 13, 4):      ##common.disabled##, {$ x} oy ×12 | {$ x} hafta ×3
after "Save" and a reload (step 3):          {$ x} oy        (English, step 5: 3 Months)
"PDF" link, issue and article page (6):      Obuna yoki to'lov talab qilinadi PDF (inglizcha) ({$ currency} {$ price})
"Mening obunalarim" and "Obuna" block (7, 8): Online Year  Muddati: {$ date}     (both subscribers)
```

In English the lists read "Disabled", "1 Months" to "60 Months" (61
different entries), the link reads "Requires Subscription or Fee PDF
(USD 10)", and the statuses read "Expires: 2026-12-31" and "Expired:
2025-12-31". Each list's first entry, "##common.disabled##", is a text
Uzbek (Latin) has not translated, which is not this fault.

Other languages, the same steps with "Arabic/العربية (ar)",
"Mongolian/монгол (mn)", "Romanian/română (ro)" and
"Aragonese/Aragonese (an)" installed and offered in place of Uzbek
(Latin), and their codes in the addresses:

```
ar, "PDF" link (6):    … PDF ({$العملة} {$السعر})
mn, "PDF" link (6):    … PDF ({$валют} {$үнэ})
ro, "PDF" link (6):    … PDF ({$valuta} {$preț})
an, dsokoloff (7):     Expira lo {$da-te}       (ccorino, 8: Ha veniu lo 2025-12-31)
```

## Cause

`LocaleBundle::_format()`
(`lib/pkp/classes/i18n/translation/LocaleBundle.php`, line 174)
replaces each parameter's exact token, `{$name}`, and prints everything
else as written. The code passes the right parameters:
`AccessForm::__construct()` calls
`__('manager.subscriptionPolicies.xMonths', ['x' => $i])`,
`SubscriptionPolicyForm::__construct()` the same and its `xWeeks` twin,
`templates/frontend/objects/galley_link.tpl` line 81 passes
`price` and `currency` to `reader.purchasePrice`, and
`templates/frontend/pages/userSubscriptions.tpl` (lines 93, 97, 190,
194) and `plugins/blocks/subscription/templates/block.tpl` (lines 39,
41) pass `date` to `user.subscriptions.expires` and `.expired`.

The faults are in OJS's translations, which write a token the code
does not pass:

| Language | File, line | Key | Token in the translation |
|---|---|---|---|
| `uz_Latn` | `locale/uz_Latn/manager.po` 1300, 1303 | `manager.subscriptionPolicies.xMonths`, `.xWeeks` | `{$ x}`: a space inside the braces |
| `uz_Latn` | `locale/uz_Latn/locale.po` 724 | `reader.purchasePrice` | `{$ currency}`, `{$ price}` |
| `uz_Latn` | `locale/uz_Latn/locale.po` 1468, 1471 | `user.subscriptions.expires`, `.expired` | `{$ date}` |
| `ar` | `locale/ar/locale.po` 719 | `reader.purchasePrice` | `{$العملة}`, `{$السعر}`: the names translated |
| `mn` | `locale/mn/locale.po` 2113 | `reader.purchasePrice` | `{$валют}`, `{$үнэ}`: the names translated |
| `ro` | `locale/ro/locale.po` 724 | `reader.purchasePrice` | `{$valuta}`, `{$preț}`: the names translated |
| `an` | `locale/an/locale.po` 1535 | `user.subscriptions.expires` | `{$da-te}`: a hyphen in the name |

Reach:

- Every other translation of these five keys in OJS `main` and
  `stable-3_5_0` carries the tokens English has, or drops them (next
  bullet).
- In twelve languages the status texts have no date at all. Eleven
  lack it in both `user.subscriptions.expires` and `.expired`: `hr`
  ("Ističe", "Istekla"), `ar`, `bs_Latn`, `ca`, `cnr`, `eu`, `id`,
  `sr_Cyrl`, `sr_Latn`, `sv` and `uk`. `zh_Hans` lacks it in
  `.expires` only. In Arabic this was seen on screen: "My
  Subscriptions" reads "تنتهي صلاحيته" and "منته الصلاحية".
  Those texts predate
  [bcd79df730](https://github.com/pkp/ojs/commit/bcd79df7308cfe23e211529b0928a1aa8f17633d)
  (2017, for `pkp/pkp-lib#1816`), which changed the English "Expires"
  to "Expires: {$date}" under the same key. Because the key stayed the
  same, these translations were never flagged for an update. That is
  another cause, which shows no marker, and is outside this fix.
- The Uzbek (Latin) translator wrote the token with a space in 101
  OJS strings across six files (`admin.po` 4, `author.po` 2, `editor.po`
  8, `locale.po` 59, `manager.po` 17, `submission.po` 11), the same on
  `stable-3_5_0`. Five are this report's;
  `about.aboutOJSJournal` and `about.aboutOJSSite` are
  [U07-A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U07-A14-software-page-version-placeholder-raw.md)'s;
  the other 94 sit on other screens and were not driven. pkp-lib's,
  OMP's and OPS's Uzbek (Latin) files have none.
- OMP and OPS have no subscriptions.

## Proposed fix

Correct the nine translated strings in OJS's locale files, writing each
placeholder as English writes it
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/uzbek-subscription-texts-placeholders-raw/fix.diff)):

- `uz_Latn`: `{$ x}` → `{$x}` (two strings), `({$ currency} {$ price})`
  → `({$currency} {$price})`, `Muddati: {$ date}` → `Muddati: {$date}`
  (two strings).
- `ar`, `mn`, `ro`: the translated names → `({$currency} {$price})`.
- `an`: `{$da-te}` → `{$date}`.

Tried on OJS `main`: with the diff in, the Uzbek (Latin) lists read "1
oy" to "60 oy" and "1 hafta" to "3 hafta", the saved choice "3 oy", the
link "(USD 10)", and the statuses "Muddati: 2026-12-31" and "Muddati:
2025-12-31"; the Arabic, Mongolian and Romanian links showed the fee,
and the Aragonese status the date. The English and French (Canada)
pages read the same with the diff in and out.

Where to make it: PKP's Weblate translates `stable-3_5_0`, and its work
reaches the apps as merges of `translations/stable-3_5_0` (the Arabic,
Aragonese and Mongolian strings came in that way). A commit to the
`.po` files on `stable-3_5_0`, merged up to `main`, is what
`pkp/pkp-lib#13472` did (PR `pkp/pkp-lib#13473`, merged 2026-10-08) for
other translated texts. The same nine corrections can instead be made
on Weblate, string by string.

The two Uzbek (Latin) status texts are the same words, "Muddati"
("term"), so with the date filled in a subscription that has ended
still reads like one that runs. Telling them apart needs a translator
and is left to Weblate.

**Alternatives**

- Let `_format()` accept spaces inside the braces: it would mend the
  101 Uzbek strings at once, but bends the shared formatter around one
  translator's typing and leaves the Arabic, Mongolian, Romanian and
  Aragonese texts broken.
- Fix the strings on Weblate only: the same result, where translators
  look, but nine edits by hand in five languages instead of one commit.

**What goes with it**

- The other 94 Uzbek (Latin) strings with a spaced placeholder need
  the same correction, and the team may want it in the same commit.
  Removing the space (`sed -i 's/{\$ \([a-zA-Z_]*\)}/{$\1}/g'
  locale/uz_Latn/*.po`) mends only about half of the 101. The other
  half still carry a placeholder English does not have: 14 differ only
  by a capital letter (`{$IssueName}`, `{$Round}`), and the rest are
  split across lines, translated or mangled (`{$ qaror}`, `$ $
  reviewerName}`). Those need a hand edit against the English text.
- Backport: `stable-3_5_0` has the same nine texts. `stable-3_4_0` has
  the five Uzbek ones (`locale/uz@latin/`) and the Romanian one;
  `stable-3_3_0` only the Romanian one (`locale/ro_RO/`), its Uzbek
  texts being empty.
- A check comparing each translation's `{$…}` tokens with English's,
  beside pkp-lib's `tests/classes/i18n/LocaleTest.php`, would have
  caught all nine. It would also fail on the date-less texts above and
  on other languages' broken tokens, so adding it is the team's call.

Small: nine lines in six `.po` files, no code change.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/uzbek-subscription-texts-placeholders-raw/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/uzbek-subscription-texts-placeholders-raw/lib.js):
  `node bin/probe.js ojs <walk.js> [others|neighbour]` from a pkp-e2e
  checkout. It takes the Steps on OJS through the screens on an install
  freshly loaded from the default dataset (pkp/datasets 5f247d04,
  2026-10-20, PostgreSQL); `others` takes steps 6 to 8 in Arabic,
  Mongolian, Romanian and Aragonese; `neighbour` reads the same screens
  in English and French (Canada), the fix's control. The walk named the
  subscription type "Online Year" plus a tag.
- Tips: `main` OJS 3109a59114 (lib/pkp f37a174626); `stable-3_5_0` OJS
  1e78ca0c2b (lib/pkp 68512b5fda); `stable-3_4_0` OJS 0012bd1022;
  `stable-3_3_0` OJS d7d9dd14ec.
- Code reads: the five keys in every OJS locale on `main` and 3.5 (a
  script comparing each translation's placeholders with English's), on
  `stable-3_4_0` (`uz@latin`: the five as on `main`; `ro`: the price;
  `ar`: right; no `mn` or `an`) and on `stable-3_3_0` (`uz_UZ@latin`:
  all five empty, so English shows; `ro_RO`: the price; `ar_IQ`: right;
  no `mn` or `an`). `_format()` on `main`, 3.5 and 3.4 (the same
  exact-token `str_replace`). The callers named in Cause on `main`.
- The fee on the payment page: read in
  `plugins/paymethod/manual/templates/paymentForm.tpl` (line 26 prints
  the amount and currency directly, through no translated text); seen
  in English on other U51 walks, not walked in Uzbek (Latin).
- The other 94 Uzbek (Latin) strings: counted by running the `sed` on
  copies of the files and comparing each string's placeholders with
  English's: about 45 of the 101 mended.
- Introduced, beyond the header: Romanian in the translations merge
  [6a25657810](https://github.com/pkp/ojs/commit/6a2565781017d3c4b99873348234c059a4797eb5)
  (`pkp/ojs#2847`, 2020-08-06); Arabic in
  [1152578da2](https://github.com/pkp/ojs/commit/1152578da2694b7cd43a55d19cfedc1bdc981d02)
  (2025-03-20), Aragonese in
  [b6721d00bf](https://github.com/pkp/ojs/commit/b6721d00bfbb76b5f89e7bdb0d0312bb8504a5f0)
  (2025-06-11) and Mongolian in
  [293a7a15d2](https://github.com/pkp/ojs/commit/293a7a15d2dcd9581c932af9361d5e2509a2d1f6)
  (2026-08-05), each a merge of `translations/stable-3_5_0`. The
  Uzbek (Latin) strings were then in `locale/uz_UZ@latin/`.
- Upstream searched in pkp/pkp-lib, pkp/ojs and pkp/ui-library by
  "Uzbek", `uz_Latn`, the keys, "Muddati", "placeholder not replaced"
  and `LocaleBundle _format`: `pkp/ojs#5272` (open) reworks `uz` and
  adds `uz_Cyrl`, and leaves `uz_Latn` alone.
- Unverified: that a later Weblate merge keeps a commit made to the
  `.po` files. No `translations/stable-3_5_0` merge has reached
  pkp-lib since `pkp/pkp-lib#13473` (merged 2026-10-08, commits
  feaedea71f and 6d004d2d01) to show it.
- Not driven: a "Full Issue" galley's fee and an institutional
  subscription's row (the same keys, read in the templates); the 94
  other Uzbek (Latin) strings.

# "Invite to a role" says "GDPR polices", and the invited person's ORCID step says "If you chose to skip it now"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no "Invite to a role")
  - 3.3: none (code; no "Invite to a role")
- **Introduced** `pkp/ojs#4497`, `pkp/omp#1748` and `pkp/ops#802` for `pkp/pkp-lib#10575` · [e25e32dc65](https://github.com/pkp/ojs/commit/e25e32dc6519f4be0b8e816b52edf77d54ebf5b0) · 2024-10-31 · Dulip Withanage (withanage), Erik Hanson (ewhanson)
- **Upstream** `pkp/pkp-lib#12874` (its pull requests correct the other slips this report first listed, not these two)
- **Tracked in** spec U06 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a7)
- **Checked** 2026-10-10, at the heads of the pull requests of pkp/pkp-lib#12874 (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Two English slips are left on the role invitation pages. A manager who
invites someone from Settings › Users & Roles reads, on the email page,
"…next steps, journal GDPR polices and ORCID verification". On a
journal, press or preprint server that has ORCID switched on, the
invited person's first page says "If you chose to skip it now, you can
verify your ORCID iD from your profile section in OJS later".

Both pages work and the meaning is clear, so nothing is lost. Only the
English texts are affected, and each fix is one word, in each of the
three applications' own files.

This report first listed three more slips: the search page's "Enter at
least one details…", the "Cancel" question "Are you sure want to cancel
this invitation?" and the given-name help "it is tha part of…". The
pull requests of pkp/pkp-lib#12874 correct those three.

## Impact

- **Lost.** Nothing: wording only.
- **Who.** Managers, each time they invite someone to a role; invited
  people, once, where ORCID is switched on.
- **Way round.** None needed; the texts are understood as they are.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), context
  `publicknowledge`.
- Outgoing mail caught where it can be read (a mail catcher such as
  Mailpit, or the log mailer), for step 7: the dataset's users all have
  `@mailinator.com` addresses.

Steps:

1. Sign in as `rvaca` (the manager).
2. Open Settings › Users & Roles
   (`/index.php/publicknowledge/en/management/settings/access`) and
   press "Invite to a role".
3. Type `dbuskins@mailinator.com` into "Search for a user by email
   address, username, or ORCID iD" and press "Search User".
4. In the empty role row choose "Author", today as "Start Date" and
   "Does not appear on the masthead", then press "Save And Continue".
5. Read the paragraph under the heading that starts "STEP 3 - Modify
   email". Press "Invite user to the role", then "View All Users".
6. On Users & Roles open the "ORCID" tab, tick "Enable ORCID
   functionality", choose "Member Sandbox" as "ORCID API", type any
   Client ID and Client Secret, and press "Save".
7. Signed out (another browser), open the "Accept Invitation" link of
   the email "You are invited to new roles" sent to
   dbuskins@mailinator.com. Read the paragraph under "STEP 1 - Verify
   ORCID iD".

**Expected.** "GDPR policies" at step 5 and "If you choose to skip it
now" at step 7.

**Observed.** On OJS; OMP and OPS read "press" and "server" for
"journal", and their own names:

```
Email page (step 5):  Send the user an email to let them know about the invitation, next steps,
                      journal GDPR polices and ORCID verification
ORCID page (step 7):  You can choose to verify your ORCID iD or skip it. If you chose to skip it
                      now, you can verify your ORCID iD from your profile section in OJS later
```

## Cause

Both texts are each application's own, in its
`locale/en/invitation.po`: `userInvitation.sendMail.stepDescription`
("GDPR polices") and `acceptInvitation.verifyOrcid.stepDescription`
("If you chose"). They have read so since the applications were given
their own copy of the invitation texts.

Reach: the email page of the manager's wizard, also when it is opened
by a user's "Edit"; the ORCID step of the acceptance page, for a
newcomer and for a member without a verified iD, only where ORCID is
switched on.

## Proposed fix

Correct the two words where they are. One diff per application, against
the application's root
([fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-typos/fix-ojs.diff),
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-typos/fix-omp.diff),
[fix-ops.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-typos/fix-ops.diff)).
OJS's:

```diff
 # locale/en/invitation.po
 msgid "acceptInvitation.verifyOrcid.stepDescription"
-msgstr "You can choose to verify your ORCID iD or skip it. If you chose to skip it now, you can verify your ORCID iD from your profile section in OJS later"
+msgstr "You can choose to verify your ORCID iD or skip it. If you choose to skip it now, you can verify your ORCID iD from your profile section in OJS later"

 msgid "userInvitation.sendMail.stepDescription"
-msgstr "Send the user an email to let them know about the invitation, next steps, journal GDPR polices and ORCID verification"
+msgstr "Send the user an email to let them know about the invitation, next steps, journal GDPR policies and ORCID verification"
```

Tried on `main`, on all three applications, on top of the pull
requests of pkp/pkp-lib#12874: step 5 reads "GDPR policies" and step 7
"If you choose to skip it now"; the other texts of the two pages were
unchanged.

**What goes with it**

- The diffs change English only and rename no key, so no translation
  needs marking.
- Backport: the same two texts are on `stable-3_5_0` and in the
  released 3.5.0-5.

Small: one word in two texts, in each application's own file.

## Evidence

- Kept scripts:
  [`shared/playwright/checks/issues/invitation-wizard-typos/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-typos/walk.js)
  (helpers in `lib.js` beside it) takes steps 1 to 5:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/invitation-wizard-typos/walk.js`;
  [`shared/playwright/checks/sync/pkp-lib-13497/invitation-texts.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/sync/pkp-lib-13497/invitation-texts.js)
  takes them all, steps 6 and 7 included.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, on PostgreSQL,
  on 2026-10-10, at the heads of the pull requests of
  pkp/pkp-lib#12874: `main` pkp/ojs#5923 `674754d5d3`, pkp/omp#2505
  `5d8a4f104c`, pkp/ops#1446 `debb068213` with `lib/pkp` at
  pkp/pkp-lib#13497 `9f9a224862`; `stable-3_5_0` pkp/ojs#5922
  `93dc24186f`, pkp/omp#2504 `23f4962cdd`, pkp/ops#1445 `559c728a29`
  with `lib/pkp` at pkp/pkp-lib#13496 `6b00301c8b`. The same two texts
  were read at those pull requests' bases.
- Code reads: the three applications' `locale/en/invitation.po` on
  `main` and `stable-3_5_0`.
- First walked 2026-10-02 on each branch's tip, when the report also
  held the three slips named in the Summary; its ORCID text was then
  read in the code only.

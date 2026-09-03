---
name: user-profile
scope: A signed-in user maintains their own account on the Profile page: identity, contact details and email address, self-service roles, public profile, password, notification choices and API key
apps: [ojs, omp, ops]
shared: pkp-lib
status: draft
atlas-claims: [AFFU-053, AFFU-054, AFFU-055, AFFU-056, AFFU-057, AFFU-058, AFFU-059, AFFU-060, AFFU-061, AFFU-062, AFFU-063, AFFU-064, AFFU-067, AFFU-068, AFFU-069, AFFU-070, AFFU-071, AFFU-072, AFFU-073, AFFU-074, AFFU-075, AFFU-076, AFFU-077, AFFU-078, AFFU-079, AFFU-080, AFFU-081, AFFU-082, AFFU-083, AFFU-084, AFFU-085, AFFU-086, AFFU-087, AFFU-088, AFFU-089, AFFU-090, AFFU-091, AFFU-092, AFFU-096, AFFU-097, AFFU-098, ROUTE-028, ROUTE-029, ROUTE-071, ROUTE-087, GRID-065, MAIL-003, SET-027]
---

# User profile

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

This spec is about a person looking after their own account. Every signed-in
user, from a Reader to the Site Administrator, has one Profile page with
seven tabs: **Identity** (names, display name, avatar initials), **Contact**
(email address, affiliation, phone, address, country, working languages),
**Roles** (the journal roles a user may give themselves or give up),
**Public** (profile image, bio statement, homepage), **Password**,
**Notifications** (which events reach them, and which by email) and **API
Key** (a token for external applications). The page is the same on a journal,
a press and a preprint server; what differs is which self-service roles a
context offers. The Notifications tab is described here only as a screen; what
each toggle does belongs to *Notifications center & email preferences*. The
ORCID controls on the Identity tab belong to
[ORCID integration](U04-orcid-integration.md).

## Actors & permissions

"The account holder" is the signed-in user whose profile the page shows: the
Profile page always shows the current session's own account, and no address
opens someone else's. Staff who need to change another person's account do so
from Users & Roles, which belongs to *Users management*. While impersonating
(see [Login & sessions](U01-login-and-sessions.md#who-may-impersonate)) the
Profile page is the impersonated user's, and every change made there is that
user's.

| Action | Who may, and when |
|--------|--------------------|
| **Open the Profile page** | • Any signed-in user, whatever their roles, including a user with no role anywhere and the Site Administrator (Rule 1)<br>• Signed out, the profile address shows the Login page and continues to the profile after sign-in (the *Login & sessions* interrupted-visit rule) <sup>a</sup> |
| **Edit Identity, Contact, Public, Password, Notifications** | • The account holder, for their own account only (Rules 4–11) <sup>a</sup> |
| **Request an email-address change** | • The account holder, while no other change of theirs is pending (Rule 6) <sup>d</sup> |
| **Confirm or reject an email-address change** | • Whoever opens the emailed link, signed in or not; the link alone decides (Rules 6c–6d) <sup>d</sup> |
| **Take or give up a role on the Roles tab** | • Any signed-in user, for the roles a journal marks as open to self-registration, in journals that accept registrations (Rule 8). A role without a box on this tab can be neither taken nor dropped here ⚠ [A6](#a6) <sup>e</sup> |
| **Create or delete an API key** | • The account holder, when the installation has an API secret configured (Rule 12). Without one the tab explains why and offers no button <sup>h</sup> |

## Fields & validation

Every tab except Password and API Key ends with the sentence "Your data is
stored in accordance with our privacy statement." (the link opens the
journal's Privacy Statement page in a new tab) and the legend "Required
fields are marked with an asterisk: *". Every tab has a "Save" button; only
the Password tab also has "Cancel". Fields marked *multilingual* show one box
per site language, with the site's primary language first. <sup>j</sup>

**Identity tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Username" | — | Shown as plain text, never editable <sup>c</sup> |
| "Given Name" (multilingual) | yes, in the site's primary language | Empty in the primary language: "A given name is required." Up to 255 characters <sup>c</sup> |
| "Family Name" (multilingual) | no | A family name in a language whose given name is empty is refused: "You have added a family name for a language that is missing the given name. Please add a given name for this language." <sup>c</sup> |
| "Preferred Public Name" (multilingual) | no | Free text under the hint "Please provide the full name as the author should be identified on the published work. Example: Dr. Alan P. Mwandenga". When set, it replaces the given-plus-family name wherever the user's name is shown (Rule 4) <sup>c</sup> |
| "Preferred Avatar Initials" | no | At most two characters, turned into capitals as they are typed, under the hint "Enter the two letters you'd like to use as your avatar. These initials will be displayed to represent you." (Rule 5) <sup>c</sup> |
| ORCID block | — | Present only on a journal-level profile with ORCID enabled; owned by [ORCID integration](U04-orcid-integration.md) |

**Contact tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Email" | yes | Must look like an email address ("A valid email address is required."). Another account's address is refused: "The selected email address is already in use by another user." Changing it does not take effect on Save; it starts a confirmation (Rule 6). While a change is pending the box is read-only and a notice with a "Cancel" button sits above it <sup>d</sup> |
| "Signature" (multilingual, rich text) | no | Free text; appended to emails the user sends from the workflow (see *Cross-feature interactions*) <sup>d</sup> |
| "Phone" | no | Up to 24 characters <sup>d</sup> |
| "Affiliation" (multilingual) | no | Plain text. This is the affiliation the editorial masthead shows and the value a new submission copies into its first contributor (Rule 7) <sup>d</sup> |
| "Mailing Address" (rich text) | no | Free text <sup>d</sup> |
| "Country" | yes | A dropdown of country names; left blank: "A country is required." <sup>d</sup> |
| "Working Languages" | no | One checkbox per site language. The block exists only when the site has more than one language (Rule 7) <sup>d</sup> |

**Roles tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Register in {journal} as..." checkboxes | no | One box per role open to self-registration in the journal the page was opened in (Rule 8a); ticked when the user holds the role <sup>e</sup> |
| "Register with other journals" | — | An expander listing every other journal that accepts registrations, each with its own boxes (Rule 8c) <sup>e</sup> |
| "Reviewing interests" {OJS OMP} | no | A tag box: type an interest and press Enter or comma to add it; suggestions from interests already on the site appear while typing. Absent on a preprint server [OPS1](#ops1) <sup>e</sup> |

**Public tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Profile Image" | no | An upload area accepting .jpg, .jpeg, .png and .gif. The browser shrinks and crops the picture to 150 × 150 pixels before sending it (Rule 9a). When an image exists it is shown with a "Delete" button under it (Rule 9b) <sup>f</sup> |
| "Bio Statement (e.g., department and rank)" (multilingual, rich text) | no | Free text <sup>f</sup> |
| "Homepage URL" | no | Must be a valid web address, or: "The specified URL is not valid. Please double-check the URL and try again. (Hint: Try adding http:// to the beginning of the URL.)" Up to 255 characters <sup>f</sup> |

**Password tab** (instructions: "Enter your current and new passwords below to
change the password for your account."):

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Current password" | yes | Must be the account's password: "The current password you entered was incorrect." The box stops accepting input at 32 characters ⚠ [A7](#a7) <sup>g</sup> |
| "New password" | yes | Under the hint "The password must be at least {N} characters." Shorter: that same sentence as an error. Equal to the current password: "Your new password is the same as your old password." When the site's compromised-password check is on, a known-breached password is refused with "This password has appeared in data leaks. Please choose a different, strong password." (see *Settings*). Same 32-character cap [A7](#a7) <sup>g</sup> |
| "Repeat new password" | yes | Must match: "The passwords do not match." Same cap [A7](#a7) <sup>g</sup> |

**Notifications tab:** a description sentence, then one group per category
with, for every event type, the two checkboxes "Enable these types of
notifications." and "Do not send me an email for these types of
notifications." (Rule 11). The types and what the boxes do belong to
*Notifications center & email preferences*. <sup>i</sup>

**API Key tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "API Key" | — | Read-only. Shows the key, or "None" when there is none (Rule 12) <sup>h</sup> |
| "Create API Key" / "Delete" button | — | One button whose label depends on the state (Rule 12). Absent when the installation has no API secret <sup>h</sup> |

## Rules & state

1. **One page, seven tabs.** The Profile page is headed "Profile" and uses the
   editorial layout (side navigation and top bar). Its tabs are, in order,
   "Identity", "Contact", "Roles", "Public", "Password", "Notifications" and
   "API Key". Each tab is its own form with its own "Save". The page is
   reached from the top-right user menu of every editorial screen, entry
   "Edit Profile", and from the reader-facing header's user menu. Other
   screens link to particular tabs: the registration completion page's "Edit
   My Profile", the emailed email-change links (Rule 6) and the notification
   unsubscribe page. <sup>a</sup>
2. **Saving is per tab.** "Save" on a tab saves that tab only. On success the
   tab stays open and shows "Your changes have been saved."; on a validation
   error the tab re-renders with the error sentences above the fields and
   nothing is saved. Each tab reloads its own content when opened, so a
   change saved on one tab is visible on another only after that tab is
   opened again. A tab named in the address (its name after a slash, for
   example "…/user/profile/contact") opens the page on that tab. <sup>b</sup>
3. **Journal-level and site-level profile.** The page normally belongs to the
   journal it was opened in: the Roles tab leads with that journal (Rule 8),
   the ORCID block appears there, and the Notifications tab applies to it
   (Rule 11). Opened from the site's own pages, outside any journal, the page
   first checks where the user can work: a user with exactly one journal is
   sent to that journal's profile, and a tab named in the site-level address
   is lost on the way ⚠ [A1](#a1). Any other user gets a site-level profile:
   the Roles tab lists every journal inline with no expander (Rule 8c), the
   Identity tab shows no ORCID block, and the Notifications tab's choices are
   kept apart from every journal's. <sup>b</sup>
4. **Names and the display name.** The name shown for the user everywhere
   (top bar, lists, emails) is "Given Name Family Name" in the current
   language, unless "Preferred Public Name" is set, in which case that text
   is shown instead. A language with no given name falls back to the site's
   primary language. Saving the Identity tab refreshes the tab with the
   saved values; the top bar shows the new name on the next page load.
   <sup>c</sup>
5. **Avatar initials.** The top-right avatar shows "Preferred Avatar
   Initials" in capitals. Left blank, it shows the first letter of the given
   name followed by the first letter of the family name; with no names at
   all, the first letter of the email address. <sup>c</sup>
6. **Changing the email address.** The Contact tab's "Email" is the only
   profile field that does not change on Save. <sup>d</sup>
   - 6a. **Request.** Saving the Contact tab with a different, valid, unused
     address saves the other Contact fields at once, but keeps the old
     address in force and records the new one as *pending*. From then on the
     tab shows "You have requested a change of your email to "{new address}".
     We have already sent you an email with directions on how to validate the
     changed email." with a "Cancel" button, and the "Email" box is read-only.
     Every other signed-in session of the account is ended at that moment.
   - 6b. **The email.** One message, subject "Confirm account contact email
     change request", is sent to the account's **current** address, not the
     new one ⚠ [A8](#a8). It names the new address and carries two links,
     "confirm" and "reject".
   - 6c. **Confirm.** Opening "confirm" while the request is pending switches
     the account to the new address at once and lands on the profile's
     Contact tab (through the Login page first when the browser is signed
     out). From then on the user signs in with the new address; the old one
     no longer identifies the account.
   - 6d. **Reject.** Opening "reject" shows a "Decline Invitation" page
     asking "Are you sure you want to decline this invitation? Confirm the
     decline by clicking the button below." with a "Confirm Decline
     Invitation" button. Pressing it discards the request and lands on the
     Contact tab with the old address still in force. On a site-level
     request the reject link answers a server error instead ⚠ [A3](#a3).
   - 6e. **Cancel.** The tab's "Cancel" discards the pending request without
     email: the notice disappears, "Email" becomes editable again showing
     the old address, and the emailed links stop working.
   - 6f. **One at a time, three days.** While a request is pending no second
     address can be entered. A request not answered within the invitation
     lifetime (3 days by default; see *Settings*) lapses by itself and the
     tab returns to its ordinary state. A link that was already used,
     cancelled or lapsed shows the "Invitation Unavailable" page described
     in [User invitations](U06-user-invitations.md#invitation-landing).
7. **The other contact details** save immediately. "Working Languages"
   appears only when the site itself has more than one language; the boxes
   record which of those languages the user works in and do not change the
   language the site is shown in. The "Affiliation" is what the editorial
   masthead shows beside a team member's name, and, together with the names,
   email, country, ORCID, bio statement and homepage, it is copied into the
   first contributor of every new submission the user starts (see
   *Cross-feature interactions*). <sup>d</sup>
8. **Self-service roles.** <sup>e</sup>
   - 8a. **Which boxes appear.** The Roles tab shows a box only for a role
     that the journal marks as open to self-registration, and only for
     journals that accept user registrations at all. On a default install
     these are "Reader", "Author" and "Reviewer" on a journal; a press adds
     "Chapter Author" and labels the reviewer role "External Reviewer"
     [OMP1](#omp1); a preprint server offers "Reader" and "Author" only
     [OPS1](#ops1). Every other role (Journal Manager, Section Editor,
     Copyeditor and so on) never appears here and cannot be taken or dropped
     on this tab. A journal closed to registrations still gets its "Register
     in {journal} as..." heading, with nothing under it ⚠ [A4](#a4).
   - 8b. **Ticking and unticking.** A box is ticked when the user currently
     holds that role. Ticking a box and pressing "Save" grants the role at
     once, exactly as registering for it would; unticking and saving ends
     the role at once, whoever had granted it ⚠ [A6](#a6). Roles the tab
     does not show are untouched by Save.
   - 8c. **Other journals.** On a journal-level profile the journal opened
     comes first under "Register in {journal} as...", and every other
     registration-accepting journal sits under the expander "Register with
     other journals" ("Hide other journals" once open). The expander exists
     only when more than one journal accepts registrations. On the
     site-level profile (Rule 3) all journals are listed inline, each under
     its own name.
   - 8d. **Reviewing interests** {OJS OMP}. The tag box under the roles is
     offered to every user, whether or not they hold a reviewer role, and
     saves with the tab. The interests are the same list registration
     collects and the Add Reviewer search shows (see *Cross-feature
     interactions*). A preprint server has no reviewer role and shows no
     interests box [OPS1](#ops1).
9. **The Public tab.** <sup>f</sup>
   - 9a. **Uploading an image.** Choosing a .jpg, .png or .gif starts the
     upload straight away; the browser first shrinks and crops the picture
     to 150 × 150 pixels. On success the whole page reloads on the Public
     tab, now showing the image with a "Delete" button. A picture the
     browser could not shrink (an animated .gif, say) that is still larger
     than 150 × 150 is refused with "The file could not be uploaded or
     revised.", and any image the account already had is wiped in the
     process ⚠ [A2](#a2).
   - 9b. **Deleting the image.** "Delete" removes the image at once, with no
     confirmation, and reloads the page on the Public tab.
   - 9c. **Bio statement and homepage** save with the tab's "Save" (the image
     needs no Save).
   - 9d. **Where "public" shows.** On a default install no reader-facing
     page shows the profile image, and the bio statement and homepage reach
     readers only as the starting values of a new submission's first
     contributor (Rule 7) ⚠ [A9](#a9).
10. **Changing the password.** <sup>g</sup>
    - 10a. All three boxes are checked together: the current password must
      be right, the new one at least the site minimum, different from the
      current one, typed twice the same, and (when the site checks it) not a
      known-breached password. The first failing check's sentence is shown
      (Fields above) and nothing changes.
    - 10b. Saving a valid form changes the password at once and shows "Your
      changes have been saved." The session that made the change stays
      signed in; every other session of the account is ended. No email is
      sent. The old password stops working immediately, and any outstanding
      password-reset link dies with it (the *Login & sessions* reset rule).
    - 10c. "Cancel" on this tab has no destination of its own: the tab has no
      other state to return to. What it does on screen is recorded on the
      probe list, not here.
11. **The Notifications tab (screen only).** The tab opens with "Select the
    system events that you wish to be notified about. Unchecking an item will
    prevent notifications of the event from showing up in the system and also
    from being emailed to you. Checked events will appear in the system and
    you have an extra option to receive or not the same notification by
    email." It then lists groups ("Public Announcements", "Submission Events",
    "Reviewing Events", "Editors") with one event type per row and the two
    checkboxes named in Fields, then "Save". The choices are kept per journal:
    the tab saves for the journal it was opened in, and the site-level
    profile keeps a separate set (Rule 3). Which types are listed, what each
    box does, and the one-click unsubscribe that links back here belong to
    *Notifications center & email preferences*. <sup>i</sup>
12. **The API key.** <sup>h</sup>
    - 12a. **States.** With no key, the tab shows "None" and a "Create API
      Key" button with the note "Generating a new API key will invalidate any
      existing key for this user." With a key, the tab shows the key itself
      and a "Delete" button with the note "Deleting a key will revoke access
      to any application that uses it."
    - 12b. **Creating.** "Create API Key" generates a key at once and shows
      it. The same key is shown on every later visit; there is no
      "regenerate": to get a new key, delete the old one and create again.
    - 12c. **Deleting.** "Delete" first asks "Are you sure you want to delete
      this API key?" (OK / Cancel). OK removes the key, and the tab returns
      to "None"; any application using the key loses access.
    - 12d. **No secret configured.** When the installation's configuration
      sets no API secret, the tab shows "None", no button, and the warning
      "Before generating an API key, your site administrator must set a
      secret in the config file ("api_key_secret")." (see *Settings*).
13. **A role not yet started.** When the page is opened in a journal where
    the user holds no active role, but a dated role assignment is waiting to
    start (the *User invitations* feature schedules these), a banner above
    the heading reads "Your role is scheduled to begin on {date}" and "Until
    then, you can review and update your profile. If you believe this is an
    error, please contact the administrator." The waiting role may sit in
    any journal, not only the one being viewed ⚠ [A5](#a5). <sup>j</sup>
14. **The privacy link** on each tab opens the Privacy Statement of the
    journal the profile was opened in, in a new browser tab. The page itself
    belongs to *Journal identity & about pages*. <sup>j</sup>

## Side effects

- **On an email-change request** (Rule 6a): one email, "Confirm account
  contact email change request", to the account's current address, sent in
  the name of the requesting user. Its body reads "You are receiving this
  email because someone has requested a change of your email to {new
  address}. If you have made this request please confirm the email change.
  You can always reject this email change." with the two links, and closes
  with an unrelated sentence, "Please feel free to contact me with any
  questions about the submission or the review process." The template is
  editable as "Change Email Address Invitation" under *Emails management*.
  The account's other sessions end. <sup>d</sup>
- **On confirming an email change** (Rule 6c): the account's sign-in address
  changes; no further email is sent.
- **On a password change** (Rule 10b): the account's other sessions end; no
  email is sent. <sup>g</sup>
- **On saving the Roles tab** (Rule 8b): a role is granted or ended at once.
  Ending a role that the editorial masthead listed removes the person from
  the masthead on its next rendering. <sup>e</sup>
- **On creating or deleting an API key** (Rule 12): applications using the
  old key lose access at once. <sup>h</sup>
- **Audit lines.** When the installation's audit log is switched on (see
  *Settings*), an email-change request, a password change and an API key
  creation or deletion each write one line to the server log, recording who
  acted (and, while impersonating, whose account). Nothing of this is visible
  on screen. <sup>g</sup>
- **No submission or activity-log entry** is written by anything on this
  page.

## Settings that modify behavior

- **"Users can register" (per journal).** A journal that has closed
  registrations drops out of the Roles tab's other-journal list and offers no
  boxes under its own heading ⚠ [A4](#a4) (Rule 8a). The setting belongs to
  *Roles configuration*. <sup>e</sup>
- **"Allow user self-registration" (per role).** Only roles carrying this
  flag get a box on the Roles tab (Rule 8a). Managers set it on the Roles
  screen, which belongs to *Roles configuration*. <sup>e</sup>
- **Site password policy.** The minimum length quoted under "New password"
  and the compromised-password check (Rule 10a) come from the Administration
  site settings, owned by *Site settings*; the *Login & sessions* spec
  describes both. <sup>g</sup>
- **Site languages.** The number of site languages decides whether
  multilingual fields show several boxes and whether "Working Languages"
  exists (Rule 7). Installing and enabling languages belongs to *Languages &
  locales*. <sup>d</sup>
- **ORCID enabled on the journal** decides whether the Identity tab carries
  the ORCID block ([ORCID integration](U04-orcid-integration.md)).
- **Configuration file, for the system administrator, no screen:** the API
  secret (`api_key_secret`, security section) that makes the API Key tab
  usable (Rule 12d); the invitation lifetime (`expiration_days`, invitations
  section, default 3) that bounds an email-change request (Rule 6f); and the
  audit switch (`log_audit`, logs section, off by default) behind the audit
  lines in *Side effects*. <sup>h</sup>
- **Editorial-report emails (per journal).** With the journal's editorial
  statistics email enabled, the Notifications tab's "Editors" group gains a
  further row; the setting and the row belong to *Notifications center &
  email preferences*. <sup>i</sup>

## Cross-feature interactions

- **Login & sessions.** A signed-out visitor at the profile address gets the
  Login page and continues here after sign-in. Password changes that block
  sign-in (the emailed reset and the forced change) are that spec's; this
  spec covers the Password tab. The 32-character cap on password boxes is
  that spec's finding, mirrored here as [A7](#a7). The access-denied page
  every screen falls back on is rendered by this feature's page handler but
  specified in [Login & sessions](U01-login-and-sessions.md) (its Rule 17).
- **Registration & account validation.** Registration creates the account
  this page maintains; its role and reviewing-interest choices and its
  announcement opt-in land on the Roles and Notifications tabs, and its
  completion page's "Edit My Profile" leads here. Its
  [Login-link finding](U02-registration-and-account-validation.md#a5) is a
  cousin of [A1](#a1): both aim at the Roles tab and miss.
- **ORCID integration** owns everything ORCID on the Identity tab.
- **Notifications center & email preferences** (pending) owns the meaning of
  the Notifications tab's boxes, the list of event types, and the one-click
  unsubscribe page that links back to this tab.
- **User invitations.** The email-change confirmation reuses the invitation
  mechanism: the emailed links, the "Decline Invitation" page and the
  "Invitation Unavailable" page are
  [that spec's](U06-user-invitations.md#invitation-landing). Dated role
  invitations are what put the Rule 13 banner on this page.
- **Users management** (pending) owns staff changing other people's
  accounts, disabling and merging; none of that is offered on this page.
- **Roles configuration** (pending) owns the two settings that decide which
  boxes the Roles tab shows (*Settings*).
- **Reviewer assignment & management.** "Reviewing interests" typed here are
  what the Add Reviewer window's
  [reviewer search](U27-reviewer-assignment-and-management.md#search) shows
  and filters on.
- **Submission wizard / Contributors & affiliations.** A new submission's
  first contributor starts from this profile's names, email, country, ORCID,
  affiliation, bio statement and homepage (Rule 7); afterwards the two are
  independent, and the affiliation copied is the plain-text one, not
  [that feature's](U41-contributors-and-affiliations.md) institution records.
- **Journal identity & about pages** (pending) owns the editorial masthead
  (which shows the Contact tab's affiliation and a verified ORCID) and the
  Privacy Statement page the privacy link opens.
- **Emails management** (pending) owns the "Change Email Address Invitation"
  template. The Contact tab's "Signature" is what workflow emails composed by
  this user append as the sender's signature.
- **Subscriptions & open access control** {OJS}. The same "user" page family
  hosts a journal's subscription screens for the reader; they are that
  spec's, not this page's.

## Canonical scenarios

Common to all three apps; substitute roles and vocabulary per the
[application glossary](GLOSSARY.md). Actors are named by role; seeded
accounts and recipes live in the footnotes. <sup>s</sup>

1. **Reach the profile and its tabs** — Author, signed in on the journal:
   open the top-right user menu and press "Edit Profile". A page headed
   "Profile" opens on the "Identity" tab, showing the username as plain text
   and the "Given Name" and "Family Name" boxes filled with the account's
   names. Press each tab in turn: "Contact", "Roles", "Public", "Password",
   "Notifications", "API Key" each open with a "Save" button (the API Key tab
   with its own button instead), and every tab but Password and API Key ends
   with the privacy sentence. Sign out, paste the profile address into the
   browser: the Login page appears, and signing in continues to the profile.
2. **Rename yourself and change your initials** — Author: on "Identity",
   clear "Given Name" and press "Save". "A given name is required." appears
   and nothing is saved. Fill the name back in, set "Preferred Public Name"
   to a new display name, type two lowercase letters into "Preferred Avatar
   Initials" (they turn into capitals as you type) and save. "Your changes
   have been saved." appears. Reload the page: the top-right avatar shows the
   two capitals, and the user menu shows the preferred public name. Clear
   both fields and save again: the avatar returns to the name's initials.
3. **Update contact details** — Author: on "Contact", set "Country" to the
   blank entry and save: "A country is required." Choose a country, change
   "Phone" and "Affiliation", and save: "Your changes have been saved.", and
   reopening the tab shows the new values. Type another seeded account's
   email address into "Email" and save: "The selected email address is
   already in use by another user." and the address is unchanged.
4. **Change the email address by confirming the emailed link** — Author: on
   "Contact", enter a fresh throwaway address and save. The tab now reads
   "You have requested a change of your email to "{new}"…" with a "Cancel"
   button, the "Email" box is read-only, and a second browser still signed
   in as the same account finds itself signed out. The mail catcher shows
   "Confirm account contact email change request", addressed to the
   account's old address ⚠ [A8](#a8), naming the new one. Open its "confirm"
   link. The browser lands on the profile's "Contact" tab with "Email"
   editable and showing the new address. Sign out and sign in with the new
   address: it works; the old address is refused.
5. **Cancel, and reject, an email change** — Author: request a change to a
   throwaway address as in scenario 4, then press the tab's "Cancel". The
   notice disappears and "Email" shows the old address, editable. Open the
   email's "confirm" link now: the "Invitation Unavailable" page. Request
   another change, and this time open the email's "reject" link: the
   "Decline Invitation" page; press "Confirm Decline Invitation". The
   browser lands on the "Contact" tab with the old address in force, and the
   "confirm" link of that email now also shows "Invitation Unavailable".
6. **Take a role and give it up** — Reader (an account holding no other
   role): on "Roles", under "Register in {journal} as...", the boxes offered
   are "Reader" (ticked), "Author" and "Reviewer" {OJS; on a press the list
   adds "Chapter Author" and reads "External Reviewer" [OMP1](#omp1); on a
   preprint server only "Reader" and "Author" appear [OPS1](#ops1)}. No box
   for any editorial role exists. Tick "Author" and save: "Your changes have
   been saved.". Reload: "Author" stays ticked, and the Journal Manager's
   Users & Roles list now shows the Reader with the Author role. Untick
   "Author" and save: the role is gone from the list. On a journal or press,
   add two "Reviewing interests" and save: both are listed on reopening; on
   a preprint server the box does not exist and the tab ends after the
   roles.
7. **Set a profile image, then remove it** — Author: on "Public", upload a
   .png larger than 150 × 150. The page reloads on the "Public" tab showing
   the image, now at most 150 pixels a side, with a "Delete" button under
   it. Enter a bio statement and a homepage without "http://" and save: the
   URL error sentence appears; correct it and save: "Your changes have been
   saved." Press "Delete": the page reloads with no image and no "Delete"
   button, and the bio statement is still there.
8. **Change the password** — Author, signed in in two browsers: on
   "Password", enter a wrong current password and a valid new pair: "The
   current password you entered was incorrect.". Enter the right current
   password with the new pair not matching: "The passwords do not match.".
   Enter the current password as the new one twice: "Your new password is
   the same as your old password.". Enter a valid new password twice and
   save: "Your changes have been saved.". The other browser's next click
   lands on the Login page. Sign out and sign in with the new password: it
   works; the old one is refused.
9. **Create and delete an API key** — Author: on "API Key", the box reads
   "None" beside "Create API Key". Press it: a long key replaces "None", the
   button now reads "Delete", and the note warns that deleting revokes
   access. Reload the tab: the same key is shown. Press "Delete", press
   Cancel in the dialog: the key stays. Press "Delete" again and OK: the box
   reads "None" and "Create API Key" is back.
10. **The Notifications tab is a form of paired boxes** — Editor: open
    "Notifications". The description sentence heads the tab, followed by
    the groups "Public Announcements", "Submission Events", "Reviewing
    Events" and "Editors", each row with "Enable these types of
    notifications." and "Do not send me an email for these types of
    notifications.", and a "Save" button. Untick one "Enable…" box: its
    email box greys out. Press "Save": "Your changes have been saved.".
    Reopen the tab: the box is still unticked. Tick it again and save to
    restore. (What each box changes is tested in *Notifications center &
    email preferences*.)

## Findings register

Verdicts are the author's judgment (claude, 2026-09-03), unreviewed unless an
entry notes otherwise; the team settles them on spec review. Sorted 🐞 → ❓ →
✅ in the summary; the entries below are the source. Each entry opens with the
user-observable symptom; mechanism and evidence live in the entry's footnote.
Impact values: user-visible = real effect in ordinary use · minor = cosmetic
only, however often seen · latent = only in an unusual situation or
configuration. Every entry in this draft is read from the code and awaits the
probe; none has been seen on a running install yet.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A1](#a1) | On a one-journal site, a site-level profile address naming a tab lands on the Identity tab with a stray "?0=…" in the address | 🐞 | minor | — |
| [A2](#a2) | A too-large image the browser could not shrink is refused, but the account's existing profile image is wiped anyway | 🐞 | latent | — |
| [A3](#a3) | The emailed "reject" link of an email change requested from the site-level profile answers a server error | 🐞 | latent | — |
| [A4](#a4) | The Roles tab shows "Register in {journal} as..." with nothing under it when the journal has closed registrations | 🐞 | minor | — |
| [A7](#a7) | The Password tab's three boxes stop accepting input at 32 characters (the *Login & sessions* cap) | 🐞 | user-visible | — |
| [A5](#a5) | The "role scheduled to begin" banner shows in any journal where the user has no role, even when the waiting role is elsewhere | ❓ | minor | — |
| [A6](#a6) | A user can drop a Reader, Author or Reviewer role a manager gave them, simply by unticking it | ❓ | user-visible | — |
| [A8](#a8) | The email-change confirmation goes to the old address; the new address is never checked to exist | ❓ | user-visible | — |
| [A9](#a9) | Nothing reader-facing shows the "Public" tab's image; bio and homepage reach readers only through a new submission | ❓ | latent | — |
| [OMP1](#omp1) | A press offers "Chapter Author" and "External Reviewer" as self-service roles; "Internal Reviewer" is never offered | ✅ | invisible | — |
| [OPS1](#ops1) | A preprint server offers "Reader" and "Author" only and has no "Reviewing interests" box | ✅ | invisible | — |

### All apps

<a id="a1"></a>
**A1 — Site-level address loses its tab on a one-journal site** · 🐞 · minor.
A profile address that names a tab and carries no journal (the kind the
site-level registration page and the site-level completion page hand out) is
meant to open that tab. On a site where the user can work in exactly one
journal, the page forwards to that journal's profile but turns the tab name
into a stray query parameter ("…/user/profile?0=roles"), so the journal-level
page opens on "Identity". The user has to press the tab themselves. On a
multi-journal site the same address opens the right tab.
Basis: code reading, unprobed (the forwarded address's shape was seen on all
three apps on 2026-09-02 while probing registration). <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — A refused oversize image wipes the existing one** · 🐞 · latent.
The browser shrinks pictures to 150 × 150 before upload, so an oversize file
normally never reaches the site. When it does (an animated .gif, or a browser
that could not resize), the upload is refused with "The file could not be
uploaded or revised.", which is right, but the account's current profile
image is removed from the profile at the same time, and the refused file is
left behind on the server. Expected: a refused upload changes nothing.
Basis: code reading, unprobed. <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — The "reject" link of a site-level email change crashes** · 🐞 · latent.
An email change requested from the site-level profile (Rule 3, a multi-journal
site) produces links without a journal in them. Its "confirm" link works. Its
"reject" link, which should show the "Decline Invitation" page, answers a
blank server error instead, because that page insists on a journal. The
request stays pending; the user can still cancel it from the Contact tab.
Basis: code reading, unprobed. <sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — An empty "Register in {journal} as..." heading** · 🐞 · minor.
When the journal the profile was opened in has switched off "Users can
register", the Roles tab still prints "Register in {journal} as..." as a
heading, with no box under it. Other closed journals are simply left out of
the list, which is what the heading should do too.
Basis: code reading, unprobed. <sup>[f-a4](#fn-a4)</sup>

<a id="a5"></a>
**A5 — The scheduled-role banner ignores which journal is open** · ❓ · minor.
The banner "Your role is scheduled to begin on {date}" (Rule 13) is shown on
the profile of any journal where the user holds no active role, as long as a
dated role is waiting to start somewhere on the site. A user invited to start
in journal B next month, who opens their profile in journal A where they were
never given anything, reads that "your role" in A is scheduled.
Question: should the banner be limited to the journal the waiting role
belongs to? Lean: yes; the wording reads as being about the journal on
screen, and a one-journal site never shows the difference.
Basis: code reading, unprobed. <sup>[f-a5](#fn-a5)</sup>

<a id="a6"></a>
**A6 — A self-service box also revokes a manager's assignment** · ❓ · user-visible.
The Roles tab's boxes are ticked for roles the user holds, however they got
them. Unticking "Author", "Reviewer" or "Reader" and saving ends the role even
when a Journal Manager assigned it deliberately (an editor who added a
trusted reviewer, say). An Author who drops the Author role in this way may
also lose sight of their submissions in progress.
Question: is self-removal of a self-registrable role intended, and what
should happen to an Author with live submissions? Lean: intended for the role
itself (the box that grants can revoke), but the Author case needs a live
answer before the rule is trusted.
Basis: code reading, unprobed. <sup>[f-a6](#fn-a6)</sup>

<a id="a7"></a>
**A7 — Password boxes cut off at 32 characters** · 🐞 · user-visible.
The same defect as [Login & sessions A1](U01-login-and-sessions.md#a1), which
holds the full entry and the maintainer's ruling (raise the cap to at least
64). The profile's "Current password", "New password" and "Repeat new
password" boxes all carry the cap, so a longer password cannot be typed or
set here.
Basis: code reading, unprobed on this tab. <sup>[f-a7](#fn-a7)</sup>

<a id="a8"></a>
**A8 — The confirmation goes to the old address** · ❓ · user-visible.
Saving a new email address sends "Confirm account contact email change
request" to the account's **current** address, and the on-screen notice says
an email "with directions on how to validate the changed email" has been
sent. Confirming from the old mailbox switches the account to the new address
without anyone having shown that the new address exists; a typo becomes the
account's sign-in address and its password-reset destination. A user who has
lost access to the old mailbox (the usual reason to change) cannot confirm at
all.
Question: which mailbox should confirm, the old one (proves the account
holder asked), the new one (proves the address works), or both? Lean: the new
one, or both; today's choice leaves the new address unverified and the
common case unserved.
Basis: code reading, unprobed. <sup>[f-a8](#fn-a8)</sup>

<a id="a9"></a>
**A9 — "Public" is not shown anywhere public** · ❓ · latent.
The Public tab's image, bio statement and homepage are not rendered by any
reader-facing page of a default install: the editorial masthead shows the
Contact tab's affiliation and a verified ORCID, not these. The bio statement
and homepage reach readers only because a new submission copies them into its
first contributor record (Rule 7); the image reaches nobody.
Question: is the tab's name a promise the default theme should keep (masthead
portraits, say), or a store for plugins and themes? Lean: leave as is and
accept; the copy-into-contributor path is the useful one.
Basis: code reading, unprobed. <sup>[f-a9](#fn-a9)</sup>

### OMP

<a id="omp1"></a>
**OMP1 — A press's self-service roles** · ✅ · invisible.
On a press the Roles tab offers "Reader", "Author", "Chapter Author" and
"External Reviewer"; "Internal Reviewer" is never offered, because the
press's default roles mark it closed to self-registration. The same
machinery as a journal's, with the press's own role roster.
Basis: seed-file reading, unprobed. <sup>[f-omp1](#fn-omp1)</sup>

### OPS

<a id="ops1"></a>
**OPS1 — A preprint server has no reviewer role and no interests box** · ✅ · invisible.
A preprint server's default roles include no reviewer role, so the Roles tab
offers "Reader" and "Author" only, and the "Reviewing interests" box is left
out on purpose (there is no review to have interests for). The registration
page's stray interests question on a preprint server is
[that spec's finding](U02-registration-and-account-validation.md#ops1).
Basis: code reading, unprobed. <sup>[f-ops1](#fn-ops1)</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a** — Page: `PKP\pages\user\ProfileHandler::profile()` (op `user/profile`,
`_isBackendPage`, template `lib/pkp/templates/user/profile.tpl`, heading
`user.profile` "Profile"), guarded by `PKPSiteAccessPolicy` with
`SITE_ACCESS_ALL_ROLES` plus `UserRequiredPolicy`; signed out, the denial
lands in `PKPUserHandler::authorizationDenied()` → `Validation::redirectLogin()`
(the interrupted-visit path of *Login & sessions*). `user/index` redirects to
`profile`. Tabs: `PKP\controllers\tab\user\ProfileTabHandler` (ops `identity`,
`contact`, `roles`, `publicProfile`, `changePassword`, `notificationSettings`,
`apiProfile` and their `save…` twins), itself guarded only by
`UserRequiredPolicy` and always acting on `$request->getUser()`, so no
address reaches another account. **Chain check**: each app subclasses
`PKPUserHandler` as `APP\pages\user\UserHandler` — OJS adds subscription and
payment ops only (*Subscriptions & open access control*), OMP adds nothing,
OPS overrides only an incomplete-setup check; `ProfileHandler`,
`ProfileTabHandler`, every form class in `lib/pkp/classes/user/form/` and
every template under `lib/pkp/templates/user/` is shared with no app
override (OPS's `templates/user/notificationSettingsForm.tpl` is a one-line
pass-through include). Entry points: `TopNavActions.vue` menu entry
`user.profile.editProfile` "Edit Profile" → `user/profile`; the front-end
user navigation menu's profile item (*Navigation menus & site chrome*);
`userRegisterComplete.tpl` "Edit My Profile"; `unsubscribeNotificationsForm.tpl`
and `…Result.tpl` link to `user/profile`. The `User::Identity::BeforeFields`,
`User::Contact::BeforeFields`, `User::ChangePassword::BeforeFields`,
`User::APIProfile::BeforeFields` hooks and the `apiKeyActions` template block
(upstream 2026-08-27, "Support openid hooks") are plugin hook points that
render nothing by themselves.

<a id="fn-b"></a>
**b** — Tabs are jQuery UI tabs (`$.pkp.controllers.TabHandler`) loaded per
tab from the component ops above; each form is an `AjaxFormHandler`, so a
save re-renders only the tab: a `JSONMessage(true)` with no content leaves
the form as is and triggers `notifyUser`, which fetches the trivial
notification created by every `save…` op (`common.changesSaved` "Your changes
have been saved."), shown by the tab's `inPlaceNotification`; a validation
failure returns the re-rendered form with errors. `saveIdentity` additionally
sends a `refreshForm` event with the re-fetched form. Tab from the address:
`ProfileHandler::profile()` takes the first path element as an anchor and
redirects to `user/profile#{tab}`; `TabHandler` selects the tab whose
`a[name]` matches the hash. Site level: with no context, `profile()` counts
`ContextDAO::getAvailable($userId)` (journals where the user holds an active
role, or all enabled journals for a Site Administrator); exactly one →
`$request->redirect($path, 'user', 'profile', null, $args)`, which passes the
tab name as `params` (finding A1); otherwise the site-level page renders with
`$currentContext` unset (roles inline, `IdentityForm::fetch()` skips ORCID
without a context, notification settings keyed on `contextId = null`).

<a id="fn-c"></a>
**c** — `PKP\user\form\IdentityForm` (`user/identityForm.tpl`): username as
plain text (`$username|escape`); `givenName` `FormValidatorLocale` required
in the **site** primary locale (`user.profile.form.givenNameRequired`);
`familyName` custom check that every locale with a family name has a given
name (`user.profile.form.givenNameRequired.locale`); `preferredPublicName`
multilingual; `preferredAvatarInitials` `maxlength="2"`, upper-cased on
`keyup` in the template and again server-side (`Str::upper`, trimmed).
Display name: `PKP\identity\Identity::getFullName()` returns the
`preferredPublicName` in the current locale when non-empty, else given +
family (falling back to the site primary locale). Initials:
`Identity::getDisplayInitials()` — the preferred initials, else the first
character of the localized given and family names, else the first character
of the email, upper-cased; delivered to the top bar as `pkp.currentUser.initials`
(`PKPTemplateManager`) and rendered by `InitialsAvatar`. ORCID block:
`IdentityForm::fetch()` assigns `orcidEnabled` only with a context and
`OrcidManager::isEnabled()` (*ORCID integration*).

<a id="fn-d"></a>
**d** — `PKP\user\form\ContactForm` (`user/contactForm.tpl`): checks
`FormValidatorEmail` required (`user.profile.form.emailRequired`), `country`
required (`user.profile.form.countryRequired`), and a custom uniqueness check
against `Repo::user()->getByEmail($email, true)`
(`user.register.form.emailExists`); `phone` `maxlength="24"`; `signature`
and `mailingAddress` rich textareas; `locales[]` from
`Site::getSupportedLocaleNames()`, block guarded by `count > 1`; `locales`
are stored on the user (`User::setLocales`) and never consulted for the UI
locale, which comes from the session. Email change: `execute()` compares the
posted email with the stored one and passes `emailUpdated` to
`BaseProfileForm::execute()`, which saves the user, writes
`AuditEvent::PROFILE_EMAIL_CHANGE_REQUEST`, refreshes the current session
and calls `PKPSessionGuard::invalidateOtherSessions()`, then creates a
`ChangeProfileEmailInvite` (payload `newEmail`) and `invite()`s it: expiry =
now + `[invitations] expiration_days` (default 3,
`Invitation::DEFAULT_EXPIRY_DAYS`), mail `ChangeProfileEmailInvitationNotify`
(template key `CHANGE_EMAIL`, subject `emails.changeProfileEmailInvitationNotify.subject`,
body with `{$acceptInvitationUrl}` / `{$declineInvitationUrl}` /
`{$newEmail}`), recipient `Invitation::getMailableReceiver()` = the user's
**current** email (finding A8), sender `->sender($request->getUser())`, i.e.
the user's own name and address in From. `fetch()` looks up a `stillActive()`
(not expired, not handled) invitation of type `changeProfileEmail` for the
user and assigns `changeEmailPending` = its `newEmail`, which renders the
`user.pendingEmailChange` notice, the hidden `pendingEmail`, the
`name=action value=cancelPendingEmail` "Cancel" submit button and
`readonly` on `email`. Cancel: `ProfileTabHandler::saveContact()` sees
`action == cancelPendingEmail` → `ContactForm::cancelPendingEmail()` marks
the invitation DECLINED (no mail). Links: `invitation/accept?id&key` →
`ChangeProfileEmailInviteRedirectController::acceptHandle()` (pending only,
else 404 → the unavailable page when the key matches) → `finalize()` sets
the user's email and marks ACCEPTED, then redirects to `user/profile/contact`
(no login policy on `InvitationHandler`, so the key alone confirms; the
profile redirect then demands sign-in). `invitation/decline` →
`InvitationActionRedirectController::declineHandle()` renders
`invitation/declineInvitation.tpl` (`invitation.decline.confirm.title`,
`.description`, button `invitation.decline.confirm`) whose POST
`confirmDecline` marks DECLINED and redirects to `user/profile/contact`;
`declineHandle()` dereferences `$request->getContext()` unguarded (finding
A3). `CHANGE_EMAIL` is seeded in all three apps' `registry/emailTemplates.xml`
and listed in the shared `mail/Repository::map()`. Affiliation on the
masthead: `frontend/pages/editorialMasthead.tpl` prints
`$mastheadUser['user']->getLocalizedData('affiliation')` and a verified ORCID.
Copy into a submission: `Repo::author()->newAuthorFromUser()` copies given
and family names, biography, affiliation, email, country, ORCID and URL.
Signature in emails: `SenderEmailVariable` exposes the sender's
`getSignature($locale)` as the sender-signature variable.

<a id="fn-e"></a>
**e** — `PKP\user\form\RolesForm` (`user/rolesForm.tpl` → `user/userGroups.tpl`
→ `user/userGroupSelfRegistration.tpl`, the partial the registration page
also uses). `UserFormHelper::assignRoleContent()`: `contexts` =
`ContextDAO::getAll(true)` (enabled), `showOtherContexts` = no current
context or more than one context with `disableUserReg` unset; per
registration-enabled context the Reader, Author and Reviewer user groups;
`userGroupIds` = the user's active (`withActive()`) group memberships. The
partial renders a checkbox per group only `{if $userGroup->permitSelfRegistration}`,
in the order reader, author, reviewer; the current context's section heading
`user.register.registerAs` "Register in {$contextName} as..." renders
regardless, and for a registration-disabled current context the group arrays
carry no entry for it, so the section is empty (finding A4). Expander:
`controllers/extrasOnDemand.tpl` with `user.profile.form.showOtherContexts`
"Register with other journals" / `hideOtherContexts` "Hide other journals"
(app-localized), only `{if $currentContext}`; without one the other-context
sections print inline. Save: `UserFormHelper::saveRoleContent()` iterates
enabled, registration-enabled contexts and, for each self-registrable group,
`assignUserToGroup()` when ticked and not held, `endAssignments()` when held
and unticked (date_end = now; clears the masthead cache when the person was
listed) — no check on who granted the role (finding A6). Interests:
`RolesForm::initData()` from `Repo::userInterest()`, saved by
`setInterestsForUser()`; widget `form/interestsInput.tpl` (tag-it,
autocomplete from the `vocabs/interests` API); hidden when
`disableInterestsSection` = `Application::get()->getName() === 'ops'`
(finding OPS1). Default rosters: `registry/userGroups.xml` in each app —
OJS `permitSelfRegistration="true"` on author, externalReviewer ("Reviewer"),
reader; OMP on author, chapterAuthor ("Chapter Author"), externalReviewer
("External Reviewer"), reader (internalReviewer unflagged); OPS on author and
reader (no reviewer group). Labels from each app's `locale/en/default.po`.

<a id="fn-f"></a>
**f** — `PKP\user\form\PublicProfileForm` (`user/publicProfileForm.tpl`):
`userUrl` `FormValidatorUrl` optional (`user.profile.form.urlInvalid`),
`maxlength="255"`; `biography` multilingual rich textarea. Upload:
`FileUploadFormHandler` with plupload filter `jpg,jpeg,png,gif` and
`resize {width:150, height:150, crop:true}` (client-side, JPEG/PNG only), POST
`uploadProfileImage` (CSRF-checked) → `uploadProfileImage()`: type via
`getImageExtension()`, saved to the public site files directory as
`profileImage-{userId}.{ext}`, then `getimagesize()`; larger than
`PROFILE_IMAGE_MAX_WIDTH/HEIGHT` (150) → the user's `profileImage` setting is
set to null and saved, `removeSiteFile($filePath)` is called with the
directory path rather than the file name, and `false` returns
`common.uploadFailed` (finding A2). Success → JSON redirect to
`user/profile?uniq=…#publicProfile` (full page reload). Delete: the "Delete"
button submits the separate `#deleteProfileImageForm` (POST
`deleteProfileImage`, CSRF, no confirmation) → `deleteProfileImage()` removes
the file and nulls the setting → redirect to the same anchor. Public display:
no template under `lib/pkp/templates/frontend`, the apps' `templates/frontend`
or the default theme reads the user's `profileImage`, `biography` or `url`
(the `getLocalizedBiography()` calls there are on contributor objects), and
the masthead reads `affiliation` only (finding A9).

<a id="fn-g"></a>
**g** — `PKP\user\form\ChangePasswordForm` (`user/changePassword.tpl`,
instructions `user.profile.changePasswordInstructions`, labels
`user.profile.oldPassword` / `user.profile.newPassword` /
`user.profile.repeatNewPassword`, sublabel
`user.register.form.passwordLengthRestriction` with
`Site::getMinPasswordLength()`; all three inputs `maxLength="32"`, finding
A7; `{fbvFormButtons submitText="common.save"}` without `hideCancel`, so a
"Cancel" button renders and the base `FormHandler::cancelForm` only fires a
`formCanceled` event with no `cancelRedirectUrl` — on-screen effect unprobed,
Rule 10c). Checks in order: `oldPassword` custom via
`Validation::checkCredentials()` (`user.profile.form.oldPasswordInvalid`);
`password` ≠ `oldPassword` (`user.profile.form.passwordSameAsOld`);
`FormValidatorPassword` with `password2` comparison → Laravel rules
`required`, `confirmed` (`user.register.form.passwordsDoNotMatch`),
`Password::min(N)->uncompromised()` (`user.register.form.passwordLengthRestriction`,
`validator.password.uncompromised`; the breach check calls haveibeenpwned.com
and cannot pass in the e2e environment's dead-port proxy). `execute()`:
`setPassword(encryptCredentials(...))`, `PKPSessionGuard::updateUser()`,
`Auth::logoutOtherDevices($password)`, `Repo::user()->edit()`,
`AuditLog::log(AuditEvent::PROFILE_PASSWORD_CHANGE)`. No mailable is
dispatched (no password-changed mailable exists under
`lib/pkp/classes/mail/mailables/`). Reset links die because
`Validation::generatePasswordResetHash()` folds the password hash in
(*Login & sessions* Rule 8). Audit: `PKP\security\AuditLog::log()` is a no-op
unless `[logs] log_audit` is on; it records `userId` (the impersonator while
impersonating, with `impersonatedAsUserId` alongside), IP, user agent,
context and URL; events `PROFILE_EMAIL_CHANGE_REQUEST`,
`PROFILE_PASSWORD_CHANGE`, `PROFILE_APIKEY_CREATE` / `_REGENERATE` /
`_DELETE` (the regenerate event is unreachable from the screen, which only
ever offers create-when-absent and delete-when-present).

<a id="fn-h"></a>
**h** — `PKP\user\form\APIProfileForm` (`user/apiProfileForm.tpl`):
`fetch()` reads `[security] api_key_secret`; empty → `handleOnMissingAPISecret()`
creates a warning notification `user.apiKey.secretRequired` and sets
`apiSecretMissing`, which hides the button (`{if !$apiSecretMissing}`) while
the read-only `apiKey` box shows `common.none` "None". With a secret and a
stored key, the box shows `JWT::encode([$apiKey], $secret, 'HS256')` (the
same string every visit) and the button is `user.apiKey.remove` "Delete"
(`pkp_button_offset`, `onClick` JavaScript `confirm()` of
`user.apiKey.remove.confirmation.message`), note `user.apiKey.removeWarning`;
without a key the button is `user.apiKey.generate` "Create API Key"
(primary) with note `user.apiKey.generateWarning`. `execute()`: action NEW →
`apiKeyEnabled = 1`, `apiKey = bin2hex(random_bytes(32))` (entropy raised
upstream 2026-06-25, pkp/pkp-lib#12951); DELETE → both null; audit event per
note g; the tab re-renders with the opposite action. The test fleets'
`config.test.inc.php` sets `api_key_secret`, so the no-secret state needs a
deliberately blanked key to observe. Config keys: `config.TEMPLATE.inc.php`
`[security] api_key_secret = ""`, `[invitations] expiration_days = 3`,
`[logs] log_audit` (commented out, Off).

<a id="fn-i"></a>
**i** — `APP\notification\form\NotificationSettingsForm` extends
`PKP\notification\form\PKPNotificationSettingsForm`
(`user/notificationSettingsForm.tpl`): description
`notification.settingsDescription`; categories from
`getNotificationSettingCategories($context)` — `notification.type.public`
"Public Announcements", `notification.type.submissions` "Submission Events",
`notification.type.reviewing` "Reviewing Events", `user.role.editors`
"Editors" (the editorial-report row only when `$context->getData('editorialStatsEmail')`);
per type the checkboxes `notification.allow` "Enable these types of
notifications." and `notification.email` "Do not send me an email for these
types of notifications.", paired by the form handler's `enableDisablePairs`
so the email box is disabled while its allow box is unticked. **Chain
check**: OJS's subclass appends two public-category types (published issue,
open access); OMP's and OPS's subclasses are empty. Storage:
`NotificationSubscriptionSettingsDAO` keyed by user **and** `contextId`
(null at site level), read and written in `fetch()` / `execute()`. Types,
semantics and the unsubscribe page: *Notifications center & email
preferences*.

<a id="fn-j"></a>
**j** — Banner: `ProfileHandler::profile()` — when a context is open and
`$user->getRoles($contextId)` is empty, `UserUserGroup::withUserId()->withActiveInFuture()`
(no context filter, finding A5) supplies the earliest `date_start`, rendered
in `profile.tpl` as a `<Notification>` with `user.futureRole.notification.message`
"Your role is scheduled to begin on {$roleStartDate}" (Y-m-d) and
`user.futureRole.notification.description`. Privacy link: every tab template
but the API key's renders `user.privacyLink` ("Your data is stored in
accordance with our <a href="{$privacyUrl}" target="_blank">privacy
statement</a>.") with `{url page="about" op="privacy"}`; the API key tab
renders it too, after its form section. The `common.requiredField` legend is
on Identity, Contact, Roles, Public and Notifications. The site-level
`about/privacy` destination is unprobed (probe list).

<a id="fn-s"></a>
**s** — Scenario seeding: the seeded test journal/press/server
(`publicknowledge`) and roster accounts (passwords = username doubled; the
roster is read-only, so every mutating scenario runs on a **scratch user**
created through the scenario API with a throwaway `@mail.test` recipient).
Scenario 1 `author.alex` (read-only). Scenarios 2, 3, 7, 9: a scratch author
in `publicknowledge`; scenario 3's "another account's address" is any roster
address. Scenarios 4–5: a scratch author with a unique throwaway address,
mail observed in the test mail catcher scoped by that recipient (PRINCIPLES
A8); "a second browser" = a second Playwright context signed in as the same
scratch user. Scenario 6: a scratch user seeded with `roles: ['reader']`;
the Users & Roles check as `manager.maya`. Scenario 8: a scratch author in
two browser contexts; never change a roster password. Scenario 10:
`editor.diana`, restoring the box afterwards. The 32-character cap (A7) is
avoided by keeping scratch passwords short.

<a id="fn-a1"></a>
**f-a1** — `ProfileHandler::profile()`: with no context and exactly one
available context, `$request->redirect($firstContext->getPath(), 'user',
'profile', null, $args)` — `$args` (the tab name) lands in the `$params`
slot of `PKPRequest::redirect(?context, ?page, ?op, ?path, ?params, ?anchor)`,
so the forwarded address reads `…/user/profile?0=roles` and the anchor
branch (`array_shift($args)` → redirect with `#roles`) never runs on the
journal-level request. Seen 2026-09-02 (registration probing, all three
apps): `index/en/user/profile/roles` and the site-level completion page's
"Edit My Profile" forwarded to `{context}/en/user/profile?0=roles`; which
tab then opened was not recorded. The fix is to pass `$args` as `$path`.

<a id="fn-a2"></a>
**f-a2** — `PublicProfileForm::uploadProfileImage()`: after
`uploadSiteFile()` and `getimagesize()`, the oversize branch runs
`$user->setData('profileImage', null); Repo::user()->edit($user, ['profileImage'])`
before returning `false`, and calls `$publicFileManager->removeSiteFile($filePath)`
where `$filePath` is `getSiteFilesPath()` (the directory), not
`$uploadName`; the uploaded file therefore stays and the previous image
record is gone (its file remains on disk, orphaned). Client-side, plupload's
`resize` applies to JPEG and PNG, so a GIF larger than 150 × 150 reaches the
server unshrunk.

<a id="fn-a3"></a>
**f-a3** — `InvitationActionRedirectController::declineHandle()` builds the
confirm URL with `$context->getData('urlPath')` where `$context =
$request->getContext()`; the decline link of a site-level request is
`index/invitation/decline?…` (built by `InvitationHandler::getActionUrl()`
from the request's context, null at site level), so `$context` is null and
the call fatals. The accept path (`acceptHandle()`) never touches the
context. Reachable only on a multi-journal site (Rule 3), which the seeded
fleets become once a scratch context exists.

<a id="fn-a4"></a>
**f-a4** — `user/userGroups.tpl`: `{if $currentContext}` renders the
`user.register.registerAs` section unconditionally and includes
`userGroupSelfRegistration.tpl`, which loops `$readerUserGroups[$contextId]`
etc.; `UserFormHelper::assignRoleContent()` `continue`s past contexts with
`disableUserReg`, leaving those arrays without the key, so the loops render
nothing. The other-context list is filtered the same way, correctly.

<a id="fn-a5"></a>
**f-a5** — `ProfileHandler::profile()`: the query is
`UserUserGroup::withUserId($user->getId())->withActiveInFuture()->pluck('date_start')->first()`
with no `withContextId()`, evaluated whenever `$context` is set and
`$user->getRoles($context->getId())` is empty. Future-dated assignments are
created by role invitations with a start date (*User invitations*).

<a id="fn-a6"></a>
**f-a6** — `UserFormHelper::saveRoleContent()`: for every self-registrable
group in every registration-enabled context, `userInGroup()` true and the
box absent from the POST → `Repo::userGroup()->endAssignments($contextId,
$userId, $groupId)`. Nothing distinguishes a self-registered membership from
an assigned one. The Author-with-submissions consequence (My Submissions
listing, workflow access) is not derivable from this code and is on the
probe list.

<a id="fn-a7"></a>
**f-a7** — `user/changePassword.tpl`: `maxLength="32"` on `oldPassword`,
`password` and `password2`. *Login & sessions* A1 (reviewed 2026-08-25)
records the cap on the Login, Confirm Access, forced-change and reset forms
and the ruling to raise it; this template carries the same attribute.

<a id="fn-a8"></a>
**f-a8** — `ChangeProfileEmailInvite::getMailable()` addresses
`$this->getMailableReceiver()`, and `Invitation::getMailableReceiver()`
builds the identity from `Repo::user()->get($userId)` with
`setEmail($user->getEmail())` — the stored (old) address; the payload's
`newEmail` appears only in the body. `finalize()` sets the new address with
no check beyond the form's syntactic and uniqueness validation. The
on-screen notice is `user.pendingEmailChange`.

<a id="fn-a9"></a>
**f-a9** — Grep of `lib/pkp/templates/frontend`, each app's
`templates/frontend` and `plugins/themes/default/templates` (2026-09-03):
no reference to a user's `profileImage`; `getLocalizedBiography()` and
`getUrl()` occur only on contributor (`$author`) objects
(`omp/templates/frontend/objects/chapter.tpl`, `monograph_full.tpl`);
`editorialMasthead.tpl` and `editorialHistory.tpl` read `affiliation` and
`orcid`. Copy path: `Repo::author()->newAuthorFromUser()` (note d). The user
API schema (`lib/pkp/schemas/user.json`) exposes `biography` and `url`, so
themes and plugins can read them.

<a id="fn-omp1"></a>
**f-omp1** — `omp/registry/userGroups.xml`: `permitSelfRegistration="true"`
on `default.groups.name.author` ("Author"), `chapterAuthor` ("Chapter
Author"), `externalReviewer` ("External Reviewer") and `reader` ("Reader");
`internalReviewer` ("Internal Reviewer") carries no flag. Labels from
`omp/locale/en/default.po` and the shared `lib/pkp/locale/en/default.po`.
Reviewer groups render after author groups (note e), so the tab's order is
Reader, Author, Chapter Author, External Reviewer.

<a id="fn-ops1"></a>
**f-ops1** — `ops/registry/userGroups.xml`: self-registration flag on
`author` and `reader` only; no group carries the reviewer role, so
`UserFormHelper` finds no reviewer group and `RolesForm::fetch()` sets
`disableInterestsSection` true for OPS, which drops the interests block from
`user/userGroups.tpl`.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| User page base (index → profile; access-denied page rendered here, specified in *Login & sessions*) | `user/index` · `user/authorizationDenied` | ROUTE-028 |
| Profile page + tab shell | `{journal}/user/profile[/{tab}]` (site level: `index/user/profile`) | ROUTE-029 · AFFU-053..060 |
| App user-page subclasses (no profile overrides) | OMP / OPS `pages/user/UserHandler.php` | ROUTE-071 · ROUTE-087 |
| Tab forms (component ops) | `tab.user.ProfileTabHandler` — `identity`/`saveIdentity`, `contact`/`saveContact`, `roles`/`saveRoles`, `publicProfile`/`savePublicProfile`/`uploadProfileImage`/`deleteProfileImage`, `changePassword`/`savePassword`, `notificationSettings`/`saveNotificationSettings`, `apiProfile`/`saveAPIProfile` | GRID-065 |
| Identity tab | Profile → "Identity" | AFFU-061..064, 067..068 (ORCID block AFFU-065..066: *ORCID integration*) |
| Contact tab | Profile → "Contact" | AFFU-069..077 |
| Roles tab | Profile → "Roles" | AFFU-078..083 |
| Public tab | Profile → "Public" | AFFU-084..088 |
| Password tab | Profile → "Password" | AFFU-089..092 |
| Notifications tab (shell only) | Profile → "Notifications" | AFFU-058 (boxes AFFU-093..095: *Notifications center & email preferences*) |
| API Key tab | Profile → "API Key" | AFFU-096..098 |
| Email-change confirmation mail + links | `CHANGE_EMAIL` → `{journal}/invitation/accept?id=…&key=…` · `invitation/decline?…` → POST `confirmDecline` | MAIL-003 |
| User record | `lib/pkp/schemas/user.json` (the fields these tabs edit) | SET-027 |
| Config, no screen | `config.inc.php` `[security] api_key_secret` · `[invitations] expiration_days` · `[logs] log_audit` | — |

## Reference — code anchors

- `lib/pkp/pages/user/ProfileHandler.php` · `PKPUserHandler.php` · `index.php`; app `pages/user/UserHandler.php` (OJS: subscription ops only; OMP: empty; OPS: incomplete-setup check)
- `lib/pkp/controllers/tab/user/ProfileTabHandler.php` — every tab op
- `lib/pkp/classes/user/form/BaseProfileForm.php` · `IdentityForm.php` · `ContactForm.php` · `RolesForm.php` · `UserFormHelper.php` · `PublicProfileForm.php` · `ChangePasswordForm.php` · `APIProfileForm.php`
- `lib/pkp/classes/notification/form/PKPNotificationSettingsForm.php` + app `classes/notification/form/NotificationSettingsForm.php`
- `lib/pkp/classes/invitation/invitations/changeProfileEmail/` (`ChangeProfileEmailInvite.php`, `handlers/ChangeProfileEmailInviteRedirectController.php`) · `lib/pkp/classes/invitation/core/Invitation.php` · `InvitationActionRedirectController.php` · `lib/pkp/pages/invitation/InvitationHandler.php`
- `lib/pkp/classes/mail/mailables/ChangeProfileEmailInvitationNotify.php` · `registry/emailTemplates.xml` (`CHANGE_EMAIL`, all three apps)
- `lib/pkp/classes/identity/Identity.php` (`getFullName`, `getDisplayInitials`) · `lib/pkp/classes/security/AuditLog.php` · `AuditEvent.php`
- `lib/pkp/classes/userGroup/Repository.php` (`assignUserToGroup`, `endAssignments`, `userInGroup`) · `registry/userGroups.xml` per app
- Templates: `lib/pkp/templates/user/{profile,identityForm,contactForm,rolesForm,userGroups,userGroupSelfRegistration,publicProfileForm,changePassword,apiProfileForm,notificationSettingsForm}.tpl` · `form/interestsInput.tpl` · `invitation/declineInvitation.tpl`
- JS: `lib/pkp/js/controllers/TabHandler.js` · `form/AjaxFormHandler.js` · `form/FileUploadFormHandler.js`
- UI library: `src/components/TopNavActions/TopNavActions.vue` (Edit Profile entry, avatar) · `src/components/InitialsAvatar/InitialsAvatar.vue`

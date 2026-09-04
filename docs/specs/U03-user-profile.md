---
name: user-profile
scope: A signed-in user maintains their own account on the Profile page: identity, contact details and email address, self-service roles, public profile, password, notification choices and API key
apps: [ojs, omp, ops]
shared: pkp-lib
status: verified
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
each toggle does belongs to
[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md). The
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
| **Confirm or reject an email-address change** | • Whoever opens the emailed link, signed in or not; the link alone decides, and a signed-out visitor is asked to sign in only afterwards (Rules 6c–6d) <sup>d</sup> |
| **Take or give up a role on the Roles tab** | • Any signed-in user, from a Reader to the Site Administrator, sees the same boxes: the roles a journal marks as open to self-registration, in journals that accept registrations (Rule 8). A role without a box on this tab can be neither taken nor dropped here, and a box that is there ends the role whoever granted it ⚠ [A6](#a6) <sup>e</sup> |
| **Create or delete an API key** | • The account holder, when the installation has an API secret configured (Rule 12d) <sup>h</sup> |

## Fields & validation

Every tab ends with the sentence "Your data is stored in accordance with our
privacy statement." (the link opens the journal's Privacy Statement page in a
new tab; on the site-level profile it opens an error page instead
[A14](#a14)). Every tab except Password and API Key also carries the legend
"Required fields are marked with an asterisk: *". Every tab has a "Save"
button (the API Key tab has its own button instead); only the Password tab
also has a "Cancel" link (Rule 10c). Fields marked *multilingual* show one
box per language the journal accepts on its forms (on the site-level
profile of Rule 3, one per language the site itself has), the primary
language first; a second language's box sits in a small pop-up panel, named
for that language, that opens when the first box is focused (clicked into,
or reached with the Tab key). On a journal with one form language there is
one box. A
field the browser can check itself (a required box left empty, a malformed
email address or web address) is refused before anything is sent, with the
sentence directly under the box; the server's own sentences for those checks
never reach the screen. <sup>j</sup>

**Identity tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Username" | — | Shown as plain text, never editable <sup>c</sup> |
| "Given Name" (multilingual) | yes, in the site's primary language | Empty in the primary language: "This field is required." under the box, and nothing is sent. Up to 255 characters <sup>c</sup> |
| "Family Name" (multilingual) | no | A family name in a language whose given name is empty is refused: "You have added a family name for a language that is missing the given name. Please add a given name for this language." <sup>c</sup> |
| "Preferred Public Name" (multilingual) | no | Free text under the hint "Please provide the full name as the author should be identified on the published work. Example: Dr. Alan P. Mwandenga". When set, it replaces the given-plus-family name where the user's name is listed, in the language it was typed in (Rule 4); a new submission's first contributor does not inherit it ⚠ [A13](#a13) <sup>c</sup> |
| "Preferred Avatar Initials" | no | At most two characters (a third is not accepted), turned into capitals as they are typed, under the hint "Enter the two letters you’d like to use as your avatar. These initials will be displayed to represent you." (Rule 5) <sup>c</sup> |
| ORCID block | — | Present only on a journal-level profile with ORCID enabled; owned by [ORCID integration](U04-orcid-integration.md) |

**Contact tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Email" | yes | Must look like an email address, else "Please enter a valid email address." under the box and nothing is sent. Another account's address is refused by the server: "The selected email address is already in use by another user." appears as a message at the top right and as the text of the box's label, in place of the word "Email" (the asterisk stays), and none of the tab's other changes is saved. Changing it does not take effect on Save; it starts a confirmation (Rule 6). While a change is pending the box is read-only and a notice with a "Cancel" button sits above it <sup>d</sup> |
| "Signature" (multilingual, rich text) | no | Free text; it ends the prefilled message of the editorial decision emails this user composes (see *Cross-feature interactions*) <sup>d</sup> |
| "Phone" | no | Up to 24 characters; longer input is cut there <sup>d</sup> |
| "Affiliation" (multilingual) | no | Plain text. The value a new submission copies into its first contributor (Rule 7) and the affiliation the editorial masthead is built to show beside a team member's name <sup>d</sup> |
| "Mailing Address" (rich text) | no | Free text, one box whatever the languages <sup>d</sup> |
| "Country" | yes | A dropdown of country names with a blank first entry; left blank: "This field is required." under the box, and nothing is sent. A newly created account may have no country yet, so the tab cannot be saved until one is chosen <sup>d</sup> |
| "Working Languages" | no | One checkbox per site language, shown when the site has more than one language (Rule 7 says what a one-language site is expected to do); ticking a box changes nothing on screen <sup>d</sup> |

**Roles tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| Role boxes under the heading "Roles" | no | One box per role open to self-registration in the journal the page was opened in, directly under the heading; the journal is not named (Rule 8a). Ticked when the user holds the role <sup>e</sup> |
| "Register with other journals" (OJS) · "Register with other presses" (OMP) · "Register with other servers" (OPS) | — | A link that opens and closes a list under it (a *fold*; the list is closed on arrival), naming every other journal, each with its own boxes (a journal closed to registrations by name only [A4](#a4)) (Rule 8c). Open, the link reads "Hide other journals" / "Hide other presses" / "Hide other servers" <sup>e</sup> |
| "Reviewing interests" {OJS OMP} | no | A tag box: type an interest and press Enter or comma to add it; while typing, interests already saved on the site are suggested. Absent on a preprint server [OPS1](#ops1) <sup>e</sup> |

**Public tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Profile Image" | no | An upload area ("Drag and drop a file here to begin upload", button "Upload File"); the file picker offers .jpg, .jpeg, .png and .gif, and nothing on screen names the accepted types. A .jpg or .png is shrunk and cropped to 150 × 150 pixels by the browser before sending; a refused file is announced in the upload area and in a browser alert (Rule 9a). Once an image exists, a "Delete" button sits under it (Rule 9b) <sup>f</sup> |
| "Bio Statement (e.g., department and rank)" (multilingual, rich text) | no | Free text; shown to readers on a published item's page (Rule 9d) <sup>f</sup> |
| "Homepage URL" | no | Must be a full web address including "http://" or "https://", else "Please enter a valid URL." under the box and nothing is sent; that sentence stays after the corrected address is saved [A15](#a15). Up to 255 characters <sup>f</sup> |

**Password tab** (instructions: "Enter your current and new passwords below to
change the password for your account."):

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Current password" | yes | Must be the account's password: "The current password you entered was incorrect." The box stops accepting input at 32 characters ⚠ [A7](#a7) <sup>g</sup> |
| "New password" | yes | Under the hint "The password must be at least {N} characters." (6 on a default install). Shorter: that same sentence as an error, which also replaces the hint. Equal to the current password: "Your new password is the same as your old password." A known-breached password is refused with "This password has appeared in data leaks. Please choose a different, strong password." when the site's compromised-password check is on (see *Settings*). Same 32-character cap [A7](#a7) <sup>g</sup> |
| "Repeat new password" | yes | Must match: "The passwords do not match." (shown in the notice and repeated under "New password"). Same cap [A7](#a7). At most one sentence about the new password is reported per attempt (Rule 10a) <sup>g</sup> |

**Notifications tab:** a description sentence, then one group per category
with, for every event type, the two checkboxes "Enable these types of
notifications." and "Do not send me an email for these types of
notifications." Unticking the first greys out the second, unticked, and
both survive a Save (Rule 11). The types and what the boxes do belong to
[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md). <sup>i</sup>

**API Key tab:**

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "API Key" | — | Read-only. Shows the key, or "None" when there is none (Rule 12) <sup>h</sup> |
| "Create API Key" / "Delete" button | — | One button whose label depends on the state (Rule 12). Absent when the installation has no API secret (Rule 12d) <sup>h</sup> |

## Rules & state

1. **One page, seven tabs.** The Profile page is headed "Profile" and uses the
   editorial layout: the working screens' left-hand navigation and top bar,
   not the journal's public pages. Its tabs are, in order, "Identity",
   "Contact", "Roles", "Public", "Password", "Notifications" and "API Key".
   Each tab is its own form with its own "Save". The page is reached in two
   ways: on every editorial screen, the top-right user menu (the button
   showing the avatar initials and the username) has the entry "Edit
   Profile"; on the journal's public pages, the header shows the signed-in
   username, and the menu under it has the entry "View Profile". Other
   screens lead here too: the registration completion page's "Edit My
   Profile" (opening Identity) and the emailed email-change links (opening
   Contact, Rule 6). <sup>a</sup>
2. **Saving is per tab.** "Save" on a tab saves that tab only. On success
   the tab stays open and "Your changes have been saved." appears. Where it
   appears depends on the tab: on Contact, Roles, Public, Password and
   Notifications as a dismissable message at the top right of the page,
   outside the tab; on Identity inside the tab only, until the tab is next
   opened; on API Key inside the tab, after "Create API Key" and after
   "Delete" (Rule 12). The Contact tab's "Cancel" of a pending email change
   answers inside the tab as well (Rule 6e). A check the browser makes
   stops the save before anything is sent and puts its sentence directly
   under the box (Fields above). A check the server makes comes back with
   the tab re-rendered: the Password tab in an in-tab notice headed "Errors
   occurred processing this form" (Rule 10a), the Contact tab as the
   top-right message plus the box's label (Fields above). Whichever check
   fails, nothing on the tab is saved. Pressing another tab while the open
   tab holds changes that were never sent (typed and not yet saved, or
   stopped by a browser check) first asks, in the browser's own dialog,
   "The data on this form has changed. Do you wish to continue without
   saving?": OK opens the other tab and those changes are lost; Cancel
   keeps the tab as it is. After a save the server refused, the re-rendered
   tab asks nothing: pressing another tab opens it at once, and the values
   typed before that save are gone ⚠ [A17](#a17); only a change typed into
   the tab after the refusal is asked about again. Each tab reloads
   its own content when opened, so a change saved on one tab is visible on
   another only after that tab is opened again. A tab named in the address
   (its name after a slash, for example "…/user/profile/contact") opens the
   page on that tab; an unknown name opens Identity without comment.
   <sup>b</sup>
3. **Journal-level and site-level profile.** The page normally belongs to the
   journal it was opened in: the Roles tab leads with that journal (Rule 8),
   the ORCID block appears there, and the Notifications tab applies to it
   (Rule 11). The page also has a site-level address, outside any journal:
   the journal's profile address with the word "index" in place of the
   journal's own path, for example "…/index/user/profile" (the address the
   site-level registration page and its completion page hand out). Opened
   there, the page first counts the journals the user holds a role in (the
   Site Administrator counts as holding every journal). A user with exactly
   one is sent to that journal's profile, and a tab named in the site-level
   address is lost on the way ⚠ [A1](#a1); whether a Site Administrator on
   a site with a single journal is forwarded the same way is not settled:
   it is read from the code, not seen (every site checked had several
   journals). Any other user (a role in two or more journals, or in none,
   or the Site Administrator of a site with several journals) gets a
   site-level profile: the Roles tab lists every journal inline with no
   fold (Rule 8c), the Identity tab shows no ORCID block, the Notifications
   tab's choices are kept apart from every journal's, and each tab's
   privacy link opens an error page [A14](#a14). <sup>b</sup>
4. **Names and the display name.** Where the user's name is listed (Users &
   Roles, emails) it is "Given Name Family Name" in the current language,
   unless "Preferred Public Name" is set in that language, in which case
   that text is shown instead. A preferred name typed in one language does
   not carry to a screen shown in another, which lists "Given Name Family
   Name" again. A language with no given name falls back to the site's
   primary language's names. The editorial top bar and the reader-facing header never show
   the name: both show the username, beside the avatar's initials (Rule 5).
   Saving the Identity tab refreshes the tab with the saved values. A new
   submission's first contributor is given the given-plus-family name, not
   the preferred one ⚠ [A13](#a13). <sup>c</sup>
5. **Avatar initials.** The top-right avatar shows "Preferred Avatar
   Initials" in capitals, after the next page load. Left blank, it shows the
   first letter of the given name followed by the first letter of the family
   name; with a given name only, that one letter. <sup>c</sup>
6. **Changing the email address.** The Contact tab's "Email" is the only
   profile field that does not change on Save. <sup>d</sup>
   - 6a. **Request.** Saving the Contact tab with a different, valid, unused
     address saves the other Contact fields at once, but keeps the old
     address in force and records the new one as *pending*. From then on the
     tab shows "You have requested a change of your email to "{new address}".
     We have already sent you an email with directions on how to validate the
     changed email." with a "Cancel" button, and the "Email" box is read-only.
     The account's other signed-in sessions carry on unaffected.
   - 6b. **The email.** One message, subject "Confirm account contact email
     change request", is sent to the account's **current** address, not the
     new one ⚠ [A8](#a8); a later request goes to whichever address is
     current by then. It names the new address and carries two links,
     "confirm" and "reject". Its sender and sign-off are described under
     *Side effects*.
   - 6c. **Confirm.** Opening "confirm" while the request is pending switches
     the account to the new address at once and lands on the profile's
     Contact tab, showing the new address, editable, with "Your changes have
     been saved." at the top right. A signed-out browser
     meets the Login page first, and the address has already switched by the
     time the tab appears. From then on the user signs in with the new
     address; the old one no longer identifies the account.
   - 6d. **Reject.** Opening "reject", signed in or not, shows a "Decline
     Invitation" page asking "Are you sure you want to decline this
     invitation? Confirm the decline by clicking the button below." with a
     "Confirm Decline Invitation" button. Pressing it discards the request
     and lands on the Contact tab with the old address still in force and
     "Your changes have been saved." at the top right (a signed-out visitor
     is sent to the Login page, the request already discarded). On a site-level request the reject link answers a blank
     server error and the request stays pending ⚠ [A3](#a3).
   - 6e. **Cancel.** The tab's "Cancel" discards the pending request without
     email: the notice disappears, "Email" becomes editable again showing
     the old address, and the emailed links stop working. The only feedback
     is "Your changes have been saved.", shown inside the tab rather than at
     the top right.
   - 6f. **One at a time, three days.** While a request is pending no second
     address can be entered. A request not answered within the invitation
     lifetime (3 days by default; see *Settings*) is expected to lapse by
     itself, the tab returning to its ordinary state; that lapse is
     read from the code and has not been watched on a screen. A link that
     was already used,
     cancelled or lapsed shows the "Invitation Unavailable" page described
     in [User invitations](U06-user-invitations.md#invitation-landing).
7. **The other contact details** save immediately. "Working Languages"
   lists the site's languages when it has more than one; a site with a
   single language is expected to hide the block (read from the code; no
   one-language site was seen). The boxes record which of those languages
   the user works in and do not change the language the site is shown in.
   The names, email, country, affiliation, bio statement and homepage are
   copied into the first contributor of every new submission the user
   starts, empty values included; a verified ORCID is not, and the
   contributor is offered its own "Request verification" instead
   ⚠ [A16](#a16) (see *Cross-feature interactions*). The journal's public
   "Editorial Masthead" page shows the "Affiliation" beside a team member's
   name; a team without affiliations is listed by role, start year and name
   only. <sup>d</sup>
8. **Self-service roles.** <sup>e</sup>
   - 8a. **Which boxes appear.** The tab is headed "Roles". Under it sit
     the boxes of the journal the page was opened in, which is not named:
     one box per role the journal marks as open to self-registration, and
     only if the journal accepts user registrations at all. Every user sees
     the same boxes; only the ticks differ. On a default install they are
     "Reader", "Author" and "Reviewer" on a journal; a press adds "Chapter
     Author" and labels the reviewer role "External Reviewer" [OMP1](#omp1);
     a preprint server offers "Reader" and "Author" only [OPS1](#ops1).
     Every other role (Journal Manager, Section Editor, Copyeditor and so
     on) never appears here and cannot be taken or dropped on this tab. A
     journal closed to registrations shows an empty first section on its own
     tab and stays listed by name, with no boxes, in the other-journal lists
     ⚠ [A4](#a4).
   - 8b. **Ticking and unticking.** A box is ticked when the user currently
     holds that role. Ticking a box and pressing "Save" grants the role at
     once, exactly as registering for it would, with no confirmation;
     unticking and saving ends the role at once, whoever had granted it and
     whatever work the user has in progress, without a warning ⚠ [A6](#a6).
     Roles the tab does not show are untouched by Save, and a Save with
     nothing changed changes nothing.
   - 8c. **Other journals.** On a journal-level profile the journal opened
     comes first, and every other journal sits by name in a list that a link
     opens and closes (the fold of Fields above), closed on arrival: with its
     own boxes when it accepts registrations, with nothing under it when it
     does not [A4](#a4). The link reads "Register
     with other journals" on a journal, "Register with other presses" on a
     press, "Register with other servers" on a preprint server, and once the
     list is open "Hide other journals" / "Hide other presses" / "Hide other
     servers". On the site-level profile (Rule 3) all journals are listed
     inline, each under its own name, with no such link.
   - 8d. **Reviewing interests** {OJS OMP}. The tag box under the roles is
     offered to every user, whether or not they hold a reviewer role, and
     saves with the tab; an interest is suggested while typing only once
     someone has saved it, and then to every user on the site. The Add
     Reviewer search matches on these interests (see *Cross-feature
     interactions*); the registration page's own interests box belongs to
     *Registration & account validation*. A preprint server has no reviewer
     role and shows no interests box [OPS1](#ops1).
9. **The Public tab.** <sup>f</sup>
   - 9a. **Uploading an image.** Choosing a file starts the upload straight
     away, with no Save. A .jpg or .png is first shrunk and cropped by the
     browser to 150 × 150 pixels (a smaller picture is kept at its own
     size); the whole page then reloads on the Public tab, where "Profile
     Image" now carries a "Delete" button. The browser does not shrink a
     .gif, so a .gif larger than 150 × 150 is refused with "The file could
     not be uploaded or revised.", shown inside the upload area (where it
     stays until the next upload or reload) and as a browser alert box that
     has to be dismissed, with no page reload; the image the account already
     had is gone on the next reload ⚠ [A2](#a2). A file that is not an image
     is refused the same way, and the existing image survives.
   - 9b. **Deleting the image.** "Delete" removes the image at once, with no
     confirmation, and reloads the page on the Public tab without the
     button; the bio statement and homepage stay.
   - 9c. **Bio statement and homepage** save with the tab's "Save" (the image
     needs no Save); the feedback is the top-right saved message. A homepage
     refused with "Please enter a valid URL." keeps that sentence under the
     box after it is corrected and saved: the saved message shows at the top
     right while the refusal still stands under the accepted address, until
     the page is reloaded ⚠ [A15](#a15).
   - 9d. **Where "public" shows.** A published item's page shows the
     contributor's bio statement under "Author Biography". No reader-facing
     page of a default install shows the profile image or the homepage: the
     homepage reaches only the contributor record of a new submission (Rule
     7), and the editorial masthead shows neither ⚠ [A9](#a9).
10. **Changing the password.** <sup>g</sup>
    - 10a. All three boxes are checked together: the current password must
      be right, the new one at least the site minimum, different from the
      current one, typed twice the same, and, when the site's
      compromised-password check is on (see *Settings*), not a known-breached
      password. A refusal is one in-tab notice headed "Errors occurred
      processing this form". It holds the current-password sentence when
      that check fails, and at most one sentence about the new password
      (Fields above): "Your new password is the same as your old password."
      is reported before "The passwords do not match.", and that before the
      too-short sentence; the same-as-current check runs only once the
      current password is right. The new-password sentence is also shown
      under "New password", in place of the hint. The three boxes are
      emptied and nothing changes.
    - 10b. Saving a valid form changes the password at once and shows "Your
      changes have been saved." at the top right; the tab's content is left
      as it was, typed passwords included, the hint gone, and an earlier
      error notice still on screen ⚠ [A11](#a11). The session that made the
      change stays signed in; every other session of the account is ended:
      in that other browser, the next press on any tab leaves the tab's
      content area empty, with no message, and the next full page load
      reaches the Login page. No email is sent. The old
      password stops working immediately, and any outstanding password-reset
      link dies with it: opened, it says "Sorry, the link you clicked on has
      expired or is not valid. Please try resetting your password again."
      (the *Login & sessions* reset rule).
    - 10c. "Cancel" on this tab is a link that does nothing: no request, no
      change of tab, the typed values kept ⚠ [A12](#a12).
11. **The Notifications tab (screen only).** The tab opens with "Select the
    system events that you wish to be notified about. Unchecking an item will
    prevent notifications of the event from showing up in the system and also
    from being emailed to you. Checked events will appear in the system and
    you have an extra option to receive or not the same notification by
    email." It then lists groups ("Public Announcements", "Submission Events",
    "Reviewing Events", "Editors") with one event type per row and the two
    checkboxes named in Fields, then "Save". Unticking "Enable these types
    of notifications." greys out its email box, unticked; a Save keeps both
    as set and the pairing is applied again when the tab is reopened. The
    choices are kept per journal: the tab saves for the journal it was
    opened in, and the site-level profile keeps a separate set (Rule 3).
    Which types are listed, what each box does, and the one-click
    unsubscribe page belong to
    [Notifications center & email preferences](U05-notifications-center-and-email-preferences.md).
    <sup>i</sup>
12. **The API key.** <sup>h</sup>
    - 12a. **States.** With no key, the tab shows "None" and a "Create API
      Key" button with the note "Generating a new API key will invalidate any
      existing key for this user." With a key, the tab shows the key itself
      and a "Delete" button with the note "Deleting a key will revoke access
      to any application that uses it."
    - 12b. **Creating.** "Create API Key" generates a long key at once, with
      no confirmation, and shows it in the box (wider than the box, so its
      end is cut off on screen), with "Your changes have been saved." inside
      the tab. The same key is shown on every later visit;
      there is no "regenerate": to get a new key, delete the old one and
      create again, and the new key differs.
    - 12c. **Deleting.** "Delete" first asks "Are you sure you want to delete
      this API key?" (the browser's own OK / Cancel). Cancel leaves the key
      as it was; OK removes it, and the tab returns to "None" with "Your
      changes have been saved." inside it (what becomes of an application
      using the key: *Side effects*).
    - 12d. **No secret configured.** The tab works only when the
      installation's configuration sets an API secret (see *Settings*);
      without one it offers no button and says so. This state has no screen
      that switches it and is described from the code alone. <sup>k</sup>
13. **A role not yet started.** When the page is opened in a journal where
    the user holds no active role, but a dated role assignment is waiting to
    start (a role invitation with a start date in the future that the
    invited person has accepted; the *User invitations* feature describes
    it), a banner above the heading reads "Your role is scheduled to begin on {date}" and "Until
    then, you can review and update your profile. If you believe this is an
    error, please contact the administrator." The waiting role may sit in
    any journal, not only the one being viewed ⚠ [A5](#a5). <sup>j</sup>
14. **The privacy link** on each tab opens the Privacy Statement of the
    journal the profile was opened in, in a new browser tab. On the
    site-level profile (Rule 3) the same link opens a "404 Not Found" page
    ⚠ [A14](#a14). The page itself belongs to *Journal identity & about
    pages*. <sup>j</sup>

## Side effects

- **On an email-change request** (Rule 6a): one email, "Confirm account
  contact email change request", to the account's current address, sent
  from the user's own name and current address (so From and To are the same
  person). Its body opens "Dear {name}," and continues "You are receiving
  this email because someone has requested a change of your email to {new
  address}. If you have made this
  request please confirm the email change. You can always reject this email
  change." with the two links, then an unrelated sentence, "Please feel free
  to contact me with any questions about the submission or the review
  process.", and closes "Kind regards," with the site contact's name, not the
  sender's; a request made from the site-level profile closes with the word
  "Array" instead ⚠ [A10](#a10). The template is editable as "Change Email
  Address Invitation" under *Emails management* on a journal and a press; a
  preprint server sends the same email but does not list the template
  ⚠ [OPS2](#ops2). No other session of the account is affected. <sup>d</sup>
- **On confirming an email change** (Rule 6c): the account's sign-in address
  changes; no further email is sent.
- **On a password change** (Rule 10b): the account's other sessions end; no
  email is sent. <sup>g</sup>
- **On saving the Roles tab** (Rule 8b): a role is granted or ended at once.
  The roles this tab offers do not put a person on the public "Editorial
  Masthead" (its reviewer list is built from completed reviews), so taking
  or ending one changes nothing there. <sup>e</sup>
- **On creating or deleting an API key** (Rule 12): applications using the
  old key lose access at once; no screen shows an application's access, so
  this is read from the code. <sup>h</sup>
- **Audit lines.** When the installation's audit log is switched on (see
  *Settings*), an email-change request, a password change and an API key
  creation or deletion each write one line to the server log, recording who
  acted (and, while impersonating, whose account). No screen shows any of
  this; the lines are read from the code. <sup>g</sup>
- **No submission or activity-log entry** is written by anything on this
  page (read from the code; the log itself is the workflow's). <sup>g</sup>

## Settings that modify behavior

- **"User Registration" (per journal).** The choice sits under Settings ›
  Users & Roles › Site Access Options. A journal whose manager has chosen
  "The Journal Manager will register all user accounts. Editors or Section
  Editors may register user accounts for reviewers." (on a press "The Press
  Manager will register all user accounts. Editors or Section Editors may
  register user accounts for reviewers."; on a preprint server "The Server
  Manager will register all user accounts.") instead of letting visitors
  register offers no boxes anywhere on the Roles tab: an empty section on
  its own tab, and its name with nothing under it in every other-journal
  list [A4](#a4) (Rule 8a). The setting belongs to *Roles configuration*.
  <sup>e</sup>
- **"Allow user self-registration" (per role).** Only roles carrying this
  flag get a box on the Roles tab (Rule 8a). Managers set it on the Roles
  screen, which belongs to *Roles configuration*. <sup>e</sup>
- **Site password policy.** Both password checks come from Administration ›
  Site Settings › Site Setup › Security. Under "Password Policy", "Minimum
  password length (characters)" is the number the hint under "New password"
  quotes (Rule 10a; 6 on a fresh install). Under "Compromised Password
  Check", the box "Check passwords against compromised password databases"
  is unticked on a fresh install: unticked, a widely leaked password goes
  through; ticked, the Password tab refuses it with "This password has
  appeared in data leaks. Please choose a different, strong password." (the
  screen says a local list of known passwords is used when present, the
  Have I Been Pwned service otherwise). The settings belong to *Site
  settings*; the *Login & sessions* spec describes both checks. <sup>g</sup>
- **Languages.** The languages a journal accepts on its forms decide how
  many boxes a multilingual field shows on that journal's profile; the
  site's languages decide the site-level profile's boxes and whether
  "Working Languages" is shown (Rule 7). Installing and enabling
  languages belongs to *Languages & locales*. <sup>j</sup>
- **ORCID enabled on the journal** decides whether the Identity tab carries
  the ORCID block ([ORCID integration](U04-orcid-integration.md)).
- **Configuration file, for the system administrator, no screen:** the API
  secret (`api_key_secret`, security section) that makes the API Key tab
  usable (Rule 12d); the invitation lifetime (`expiration_days`, invitations
  section, default 3) that bounds an email-change request (Rule 6f); and the
  audit switch (`log_audit`, logs section, off by default) behind the audit
  lines in *Side effects*. <sup>k</sup>
- **Editorial-report emails (per journal).** The journal's editorial
  statistics email is on by default, and while it is on the Notifications
  tab's "Editors" group carries a "Statistics report summary." row; switched
  off ("Do not send the email to editors." under Settings › Workflow ›
  Emails), the row disappears. The site-level profile never shows it. The
  setting and the row belong to
  [Notifications center & email preferences](U05-notifications-center-and-email-preferences.md).
  <sup>i</sup>

## Cross-feature interactions

- **Login & sessions.** A signed-out visitor at the profile address gets the
  Login page and continues here after sign-in. Password changes that block
  sign-in (the emailed reset and the forced change) are that spec's; this
  spec covers the Password tab. The 32-character cap on password boxes is
  that spec's finding, mirrored here as [A7](#a7). The access-denied page
  every screen falls back on is rendered by this feature's page handler but
  specified in [Login & sessions](U01-login-and-sessions.md) (its Rule 17).
- **Registration & account validation.** Registration creates the account
  this page maintains (the roles it grants show ticked on the Roles tab,
  Rule 8b), and its completion page's "Edit My Profile" leads here. Its
  [Login-link finding](U02-registration-and-account-validation.md#a5) is a
  cousin of [A1](#a1): both aim at the Roles tab and miss.
- **ORCID integration** owns everything ORCID on the Identity tab.
- **[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md)** owns the meaning of
  the Notifications tab's boxes, the list of event types, and the one-click
  unsubscribe page.
- **User invitations.** The email-change confirmation reuses the invitation
  mechanism: the emailed links, the "Decline Invitation" page and the
  "Invitation Unavailable" page are
  [that spec's](U06-user-invitations.md#invitation-landing). Dated role
  invitations are what put the Rule 13 banner on this page.
- **Users management** (spec not yet written) owns staff changing other people's
  accounts, disabling and merging; none of that is offered on this page.
- **Roles configuration** (spec not yet written) owns the two settings that decide which
  boxes the Roles tab shows (*Settings*).
- **Reviewer assignment & management.** "Reviewing interests" typed here are
  what the Add Reviewer window's
  [reviewer search](U27-reviewer-assignment-and-management.md#search) shows
  and filters on.
- **Submission wizard / Contributors & affiliations.** A new submission's
  first contributor starts from this profile's names, email, country,
  affiliation, bio statement and homepage (Rule 7), the given-plus-family
  name rather than the preferred public name ⚠ [A13](#a13) and without the
  profile's verified ORCID [A16](#a16); afterwards the
  two are independent, and the affiliation copied is the plain-text one, not
  [that feature's](U41-contributors-and-affiliations.md) institution records.
- **Journal identity & about pages** (spec not yet written) owns the "Editorial Masthead"
  page (which shows the Contact tab's affiliation and a verified ORCID
  beside each name) and the Privacy Statement page the privacy link opens.
- **Article landing page & reading** (spec not yet written; on a press,
  *Monograph landing page*) owns the "Author Biography" block that shows a
  contributor's bio statement to readers (Rule 9d).
- **Emails management** (spec not yet written) owns the "Change Email Address Invitation"
  template, listed on a journal and a press and missing from a preprint
  server's list ⚠ [OPS2](#ops2). The Contact tab's "Signature" is what the
  editorial decision emails this user composes end with (the Participants
  panel's "Notify" message does not carry it).
- **Subscriptions & open access control** {OJS}. The same "user" page family
  hosts a journal's subscription screens for the reader; they are that
  spec's, not this page's.

## Canonical scenarios

Scenarios 2–9 change an account, so each runs as a throwaway account on a
scratch journal, never as a ready account; scenarios 1 and 10, which only
look, use a ready account on the seeded journal. Read an email in the
mailbox of the address it was sent to. The ready accounts and their
passwords, the mail catcher's address and the tooling recipe are in the
footnote. <sup>s</sup>

1. **Reach the profile and its tabs** — Author, signed in on the journal:
   open the top-right user menu and press "Edit Profile". A page headed
   "Profile" opens on the "Identity" tab, showing the username as plain text
   and the "Given Name" and "Family Name" boxes filled with the account's
   names. Press each tab in turn: "Contact", "Roles", "Public", "Password",
   "Notifications", "API Key" each open with a "Save" button (the API Key tab
   with its own button instead), and every tab ends with the privacy
   sentence. Copy the page's address from the browser's address bar, sign
   out, and paste that address back into the address bar: the Login page
   appears, and signing in continues to the Profile page.
2. **Rename yourself and change your initials** — Author: on "Identity",
   clear "Given Name" and press "Save". "This field is required." appears
   under the box and nothing is saved. Fill the name back in, set "Preferred
   Public Name" to a new display name, type two lowercase letters into
   "Preferred Avatar Initials" (they turn into capitals as you type; a third
   letter is not accepted) and save. "Your changes have been saved."
   appears inside the tab, and nothing at the top right. Reload the page:
   the top-right avatar shows the two capitals,
   and the top bar still shows the username. Signed in as the Journal
   Manager (a second browser is easiest), open the Users & Roles screen,
   "Users" tab: the account is listed under the preferred public name. Back
   as the Author, clear "Preferred Public Name" and "Preferred Avatar
   Initials" and save again: after a reload the avatar returns to the
   name's initials.
3. **Update contact details** — Author: on "Contact", set "Country" to the
   blank entry, change "Phone", and save: "This field is required." appears
   under "Country" and nothing is saved. Choose a country, change "Phone"
   and "Affiliation", and save: "Your changes have been saved.", and
   reopening the tab shows the new values. Type the email address of another
   existing account (any ready account from the footnote) into "Email",
   change "Phone" again, and save: "The selected email address is already in
   use by another user." appears at the top right and as the text of the
   box's label. Press another tab: it opens at once, with no question about
   unsaved changes. Press "Contact" again: the address is unchanged and the
   phone change is lost.
4. **Change the email address by confirming the emailed link** — Author: on
   "Contact", enter a fresh throwaway address and save. The tab now reads
   "You have requested a change of your email to "{new}"…" with a "Cancel"
   button and the "Email" box is read-only, still showing the old address;
   a second browser signed in as the same account keeps working. The
   mailbox of the account's old address now holds a message "Confirm account
   contact email change request", from the account holder's own name, and
   the new address receives nothing ⚠ [A8](#a8); the message names the new
   address. In the browser that is still signed in, open the message's
   "confirm" link. The browser lands on the profile's "Contact" tab with
   "Email" editable and showing the new address. Sign out; on the Login page
   enter the new address in "Username or Email" with the unchanged password:
   it works. Sign out and try the old address the same way: it is refused.
5. **Cancel, and reject, an email change** — Author: request a change to a
   throwaway address as in scenario 4, then press the tab's "Cancel". "Your
   changes have been saved." appears inside the tab, the notice disappears
   and "Email" shows the old address, editable. Still signed in, open the "confirm" link
   of the message that arrived: the "Invitation Unavailable" page. Request
   another change (a second message arrives), and this time open the new
   message's "reject" link, still signed in: the "Decline Invitation" page;
   press "Confirm Decline Invitation". The browser lands on the "Contact"
   tab with the old address in force and "Your changes have been saved." at
   the top right, and the "confirm" link of that second message now also
   shows "Invitation Unavailable".
6. **Take a role and give it up** — a Reader who holds no other role: on
   "Roles", under the heading "Roles",
   the boxes offered on a journal are "Reader" (ticked), "Author" and
   "Reviewer"; on a press they are "Reader", "Author", "Chapter Author" and
   "External Reviewer" [OMP1](#omp1); on a preprint server "Reader" and
   "Author" only [OPS1](#ops1). (That is the set of a journal whose role
   settings nobody has changed; see *Settings*.) No box for any editorial
   role exists, and the journal is not named. Below the boxes a closed fold
   reads "Register with other journals" on a journal, "Register with other
   presses" on a press and "Register with other servers" on a preprint
   server. Tick "Author" and save: "Your changes have been saved.". Reload:
   "Author" stays ticked, and on the Journal Manager's Users & Roles screen
   ("Users" tab) the account is now listed with the Reader and Author roles.
   Untick "Author" and save: the Author role is gone from that list. On a
   journal or press, add two "Reviewing interests" (Enter after the first, a
   comma after the second) and save: both are listed on reopening; on a
   preprint server the box does not exist and the tab ends after the fold.
7. **Set a profile image, then remove it** — Author: on "Public", choose a
   .png larger than 150 × 150 in the upload area. The page reloads at once
   on the "Public" tab with a "Delete" button under "Profile Image". Enter a
   bio statement and a homepage without "http://" and save: "Please enter a
   valid URL." appears under "Homepage URL" and the bio stays in its box;
   correct it and save: "Your changes have been saved." at the top right,
   while "Please enter a valid URL." is still under the box [A15](#a15) (a
   reload clears it). Press "Delete": the page reloads with no "Delete"
   button, and the bio statement and homepage are still there.
8. **Change the password** — Author, signed in in two browsers. A *valid new
   password* here is one at least as long as the hint under "New password"
   says (6 characters on a default install) and no longer than 32, different
   from the current password, typed the same in both new-password boxes. On
   "Password", enter a wrong current password and a valid new password
   twice, and save: the notice "Errors occurred processing this form" with
   "The current password you entered was incorrect." and the three boxes
   emptied. Enter the right current password with two different new
   passwords: "The passwords do not match." in the notice and again under
   "New password". Enter the current password as the new one twice: "Your
   new password is the same as your old password.". Enter a valid new
   password twice and save: "Your changes have been saved." at the top
   right, while the previous attempt's error notice is still above the form
   [A11](#a11); the password has changed all the same. In the other browser,
   load the page afresh (a full reload, not a tab press): it lands on the
   Login page. Sign out and sign in with the new password: it works; the old
   one is refused.
9. **Create and delete an API key** — Author: on "API Key", the box reads
   "None" beside a "Create API Key" button (a tab with no button at all
   means the installation has no API secret, Rule 12d, and the scenario
   cannot run there). Press it: a long key replaces "None", the
   button now reads "Delete", the note warns that deleting revokes access,
   and "Your changes have been saved." shows inside the tab. Reload the
   tab: the same key is shown. Press "Delete", press Cancel in the dialog:
   the key stays. Press "Delete" again and OK: the box reads "None",
   "Create API Key" is back, and the saved message shows inside the tab
   again.
10. **The Notifications tab is a form of paired boxes** — Journal Manager: open
    "Notifications". The tab opens with the sentence quoted in Rule 11
    ("Select the system events that you wish to be notified about. …"),
    followed by the groups "Public Announcements", "Submission Events",
    "Reviewing Events" and "Editors" (the same four groups on a journal, a
    press and a preprint server; only the rows inside them differ), each row
    with "Enable these types of notifications." and "Do not send me an email
    for these types of notifications.", and a "Save" button. Untick one "Enable…" box: its
    email box greys out. Press "Save": "Your changes have been saved.".
    Reopen the tab: the box is still unticked. Tick it again and save to
    restore. (What each box changes is tested in
    [Notifications center & email preferences](U05-notifications-center-and-email-preferences.md).)

## Findings register

Verdicts are the author's judgment (claude, 2026-09-03), unreviewed unless an
entry notes otherwise; the team settles them on spec review. The summary is
sorted 🐞 → ❓ → ✅ and the entries below are the source; badges, Impact and
Basis: [Reading a spec](GLOSSARY.md#reading-a-spec). Every entry was seen on
a running install of all three apps on 2026-09-03 and again on 2026-09-04
unless its Basis line says otherwise.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A1](#a1) | For a user with a role in exactly one journal, a site-level profile address naming a tab lands on the Identity tab with a stray "?0=…" in the address | 🐞 | minor | — |
| [A2](#a2) | A .gif larger than 150 × 150 is refused, and the account's existing profile image is wiped anyway | 🐞 | latent | — |
| [A3](#a3) | The emailed "reject" link of an email change requested from the site-level profile answers a blank server error | 🐞 | latent | — |
| [A4](#a4) | A journal closed to registrations leaves an empty section on its own Roles tab and is listed name-only, with no boxes, elsewhere | 🐞 | minor | — |
| [A7](#a7) | The Password tab's three boxes stop accepting input at 32 characters (the *Login & sessions* cap) | 🐞 | user-visible | — |
| [A10](#a10) | The email-change message of a site-level request signs off "Kind regards, Array" | 🐞 | latent | — |
| [A11](#a11) | After a successful password change the previous attempt's error notice stays on screen beside the saved message | 🐞 | minor | — |
| [A12](#a12) | The Password tab's "Cancel" does nothing | 🐞 | minor | — |
| [A14](#a14) | On the site-level profile every tab's "privacy statement" link opens a "404 Not Found" page | 🐞 | minor | — |
| [A15](#a15) | "Please enter a valid URL." stays under "Homepage URL" after the corrected address is saved, beside the saved message | 🐞 | minor | — |
| [A17](#a17) | After a Contact save the server refused, the typed values are still on screen, but pressing another tab drops them at once, with no question asked | 🐞 | user-visible | — |
| [OPS2](#ops2) | A preprint server sends the email-change message but its emails list has no "Change Email Address Invitation" row to edit | 🐞 | user-visible | — |
| [A5](#a5) | The "role scheduled to begin" banner shows in any journal where the user has no role, even when the waiting role is elsewhere | ❓ | minor | — |
| [A6](#a6) | A user can drop a Reader, Author or Reviewer role a manager gave them by unticking it; an Author is then locked out of My Submissions without warning | ❓ | user-visible | — |
| [A8](#a8) | The email-change confirmation goes to the old address; the new address is never checked to exist | ❓ | user-visible | — |
| [A9](#a9) | The "Public" tab's image is shown nowhere; only the bio statement reaches readers, on a published item's page | ❓ | latent | — |
| [A13](#a13) | A new submission's first contributor gets the given-plus-family name, not the "Preferred Public Name" the hint promises for published work | ❓ | minor | — |
| [A16](#a16) | A verified ORCID on the profile does not reach a new submission's first contributor, which is offered "Request verification" instead | ❓ | minor | — |
| [OMP1](#omp1) | A press offers "Chapter Author" and "External Reviewer" as self-service roles; "Internal Reviewer" is never offered | ✅ | invisible | — |
| [OPS1](#ops1) | A preprint server offers "Reader" and "Author" only and has no "Reviewing interests" box | ✅ | invisible | — |

### All apps

<a id="a1"></a>
**A1 — Site-level address loses its tab for a one-journal user** · 🐞 · minor.
A profile address that names a tab and carries no journal (the kind the
site-level registration page and the site-level completion page hand out) is
meant to open that tab. For a user who holds a role in exactly one journal
(Rule 3), the page forwards to that journal's profile but turns the tab name
into a stray query parameter ("…/user/profile?0=roles"), so the journal-level
page opens on "Identity". The user has to press the tab themselves. For a
user who stays on the site-level profile the same address opens the right
tab.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — A refused oversize image wipes the existing one** · 🐞 · latent.
The browser shrinks a .jpg or .png to 150 × 150 before upload, so an
oversize file normally never reaches the site. A .gif is not shrunk: a .gif
larger than 150 × 150 is refused with "The file could not be uploaded or
revised.", which is right, but on the next reload the account's previous
picture is gone from the tab, and the refused file is left behind on the
server. A refused non-image file leaves the picture alone, as every refusal
should.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — The "reject" link of a site-level email change crashes** · 🐞 · latent.
An email change requested from the site-level profile (Rule 3, a multi-journal
site) produces links without a journal in them. Its "confirm" link works. Its
"reject" link, which should show the "Decline Invitation" page, answers a
blank page instead (no heading, no text), because that page insists on a
journal. The request stays pending; the user can still cancel it from the
Contact tab.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — A closed journal still takes its place on the Roles tab** · 🐞 · minor.
When a journal's Site Access Options say its manager will register all user
accounts (*Settings*), its boxes go, but its place stays: on its own profile the Roles tab opens with an empty section
between the "Roles" heading and the other-journal fold, and in every other
journal's fold and on the site-level list the journal is still named, with
nothing under it. A journal that offers nothing should not be listed, and an
empty section says nothing to the user.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a4](#fn-a4)</sup>

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
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a5](#fn-a5)</sup>

<a id="a6"></a>
**A6 — A self-service box also revokes a manager's assignment** · ❓ · user-visible.
The Roles tab's boxes are ticked for roles the user holds, however they got
them. Unticking "Author", "Reviewer" or "Reader" and saving ends the role at
once, with no warning, even when a Journal Manager assigned it deliberately
(an editor who added a trusted reviewer, say). An Author with a submission in
progress who unticks "Author" is saved without a word; My Submissions then
answers "The current role does not have access to this operation." and the
submission cannot be opened until the box is ticked again, which restores
everything. A reviewer who drops the role stays in Users & Roles with an empty
roles column.
Question: is self-removal of a self-registrable role intended, and should an
Author with live submissions be warned or refused? Lean: intended for the
role itself (the box that grants can revoke), but the silent lock-out of an
author from their own submissions needs at least a warning.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a6](#fn-a6)</sup>

<a id="a7"></a>
**A7 — Password boxes cut off at 32 characters** · 🐞 · user-visible.
The same defect as [Login & sessions A1](U01-login-and-sessions.md#a1), which
holds the full entry and the maintainer's ruling (raise the cap to at least
64). The profile's "Current password", "New password" and "Repeat new
password" boxes all carry the cap, so a longer password cannot be typed or
set here.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a7](#fn-a7)</sup>

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
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a8](#fn-a8)</sup>

<a id="a9"></a>
**A9 — Most of "Public" is not shown anywhere public** · ❓ · latent.
Of the Public tab's three fields, only the bio statement reaches readers: a
published item's page prints it under "Author Biography". The image is shown
by no reader-facing page of a default install, the editorial masthead
included (which lists role, start year and name), and the homepage reaches
only the contributor record of a new submission (Rule 7).
Question: is the tab's name a promise the default theme should keep (masthead
portraits, a homepage link beside the biography), or a store for plugins and
themes? Lean: leave as is and accept; the biography and the
copy-into-contributor paths are the useful ones.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a9](#fn-a9)</sup>

<a id="a10"></a>
**A10 — A site-level email change signs off "Array"** · 🐞 · latent.
The email-change message closes "Kind regards," and then the site contact's
name when the request was made on a journal's profile. Made on the site-level
profile (Rule 3, a multi-journal site), the same message closes "Kind
regards, Array". A placeholder printed as a word is never a choice; the
site-level message simply has no journal to take the name from and nothing
falls back to the site.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a10](#fn-a10)</sup>

<a id="a11"></a>
**A11 — A stale error notice survives a successful password change** · 🐞 · minor.
After a refused attempt on the Password tab, a successful save shows "Your
changes have been saved." at the top right while the earlier "Errors
occurred processing this form" notice, with its sentences, stays above the
form; the typed passwords stay in the boxes and the hint under "New
password" is gone. The password did change. Every other tab re-renders on
success; this one does not, so the user reads a refusal and a success at
once.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a11](#fn-a11)</sup>

<a id="a12"></a>
**A12 — The Password tab's "Cancel" does nothing** · 🐞 · minor.
The tab offers "Cancel" beside "Save". Pressing it sends nothing, opens no
other tab and leaves the three boxes as typed. A control that does nothing
should not be offered, or should clear the boxes.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a12](#fn-a12)</sup>

<a id="a13"></a>
**A13 — The preferred public name does not reach a new submission** · ❓ · minor.
"Preferred Public Name" is offered under the hint "Please provide the full
name as the author should be identified on the published work." Users &
Roles lists the user by it, in the language it was typed in. A new
submission's first contributor, though, is created as "Given Name Family
Name" with its own preferred-name box empty, so the name promised for
published work has to be typed again on every submission.
Question: should the first contributor inherit the profile's preferred
public name? Lean: yes; the hint promises exactly that, and nothing else on
the site uses the field for published work.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-a13](#fn-a13)</sup>

<a id="a14"></a>
**A14 — The site-level profile's privacy link is dead** · 🐞 · minor.
Every tab ends with "Your data is stored in accordance with our privacy
statement.", and on a journal's profile the link opens that journal's
Privacy Statement in a new tab. On the site-level profile (Rule 3) the same
link opens a "404 Not Found" page: the site has no privacy page of its own,
and nothing falls back to a journal's. A sentence that promises a statement
should lead to one.
Basis: probe, 2026-09-04. <sup>[f-a14](#fn-a14)</sup>

<a id="a15"></a>
**A15 — A refused homepage's sentence outlives the corrected save** · 🐞 · minor.
On the Public tab a homepage without "http://" or "https://" is refused
before anything is sent, with "Please enter a valid URL." under the box.
Correcting the address and saving shows "Your changes have been saved." at
the top right, but the refusal stays under the accepted address (typing does
not clear it either) until the page is reloaded, so the user reads a refusal
and a success at once, as on the Password tab ([A11](#a11)).
Basis: probe, 2026-09-04. <sup>[f-a15](#fn-a15)</sup>

<a id="a16"></a>
**A16 — A verified ORCID does not reach a new submission's first contributor** · ❓ · minor.
An account whose Identity tab holds a verified ORCID (the public "Editorial
Masthead" prints it beside the name) starts a new submission: the first
contributor is created from the profile's names, email, country,
affiliation, bio statement and homepage (Rule 7), but with no ORCID, and its
"Edit" dialog offers "Request verification" as if none were known. Nothing
in the copy carries the ORCID, so this reads as a gap left in the design
rather than a regression.
Question: should the first contributor inherit the profile's verified ORCID?
Lean: yes; the profile's verification is the stronger one, and asking the
author to verify again on every submission serves no one. The verification
flow itself belongs to [ORCID integration](U04-orcid-integration.md).
Basis: probe, 2026-09-04. <sup>[f-a16](#fn-a16)</sup>

<a id="a17"></a>
**A17 — A refused Contact save loses the typed values on the next tab, unasked** · 🐞 · user-visible.
When the server refuses a Contact save (for example with "The selected
email address is already in use by another user."), the tab comes back with
the typed values still in every box. Pressing another tab then opens it at
once and those values are gone. The question every other unsaved change
gets, "The data on this form has changed. Do you wish to continue without
saving?", is not asked here (Rule 2), although it exists for exactly this
case: the tab shows values that were never saved, and the re-rendered tab
has simply stopped watching them. A defect, not a choice.
Basis: probe, 2026-09-04 (claim check). <sup>[f-a17](#fn-a17)</sup>

### OMP

<a id="omp1"></a>
**OMP1 — A press's self-service roles** · ✅ · invisible.
On a press the Roles tab offers "Reader", "Author", "Chapter Author" and
"External Reviewer"; "Internal Reviewer" is never offered, because the
press's default roles mark it closed to self-registration. The same
machinery as a journal's, with the press's own role roster.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-omp1](#fn-omp1)</sup>

### OPS

<a id="ops1"></a>
**OPS1 — A preprint server has no reviewer role and no interests box** · ✅ · invisible.
A preprint server's default roles include no reviewer role, so the Roles tab
offers "Reader" and "Author" only, and the "Reviewing interests" box is left
out on purpose (there is no review to have interests for). The registration
page's stray interests question on a preprint server is
[that spec's finding](U02-registration-and-account-validation.md#ops1).
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-ops1](#fn-ops1)</sup>

<a id="ops2"></a>
**OPS2 — The email-change template is hidden on a preprint server** · 🐞 · user-visible.
A preprint server sends "Confirm account contact email change request"
exactly as a journal does, but its Manage Emails list (Settings › Workflow ›
Emails › "Add and edit templates") has no "Change Email Address Invitation"
row, so a Preprint Server Manager cannot review or reword the message; a journal and a
press list it with an "Edit" button. The same cause hides the role-invitation
template there ([User invitations OPS1](U06-user-invitations.md#ops1)): a
template in active use is missing from the list, which reads as an omission,
not a trim.
Basis: probe, 2026-09-03; re-checked 2026-09-04. <sup>[f-ops2](#fn-ops2)</sup>

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
user navigation menu's item `common.viewProfile` "View Profile"
(`NavigationMenuItem::NMI_TYPE_USER_PROFILE`, seeded under the signed-in
user's name in each app's `registry/navigationMenus.xml`; *Navigation menus
& site chrome*);
`userRegisterComplete.tpl` "Edit My Profile"; `unsubscribeNotificationsForm.tpl`
and `…Result.tpl` link to `user/profile`. The `User::Identity::BeforeFields`,
`User::Contact::BeforeFields`, `User::ChangePassword::BeforeFields`,
`User::APIProfile::BeforeFields` hooks and the `apiKeyActions` template block
(upstream 2026-08-27, "Support openid hooks") are plugin hook points that
render nothing by themselves. Live-probed 2026-09-03, OJS, OMP and OPS
(Rule 1; Actors rows 1–2, 5): "Edit Profile" and "View Profile" both land on
"Profile" in the editorial layout with the seven tabs and Identity open; the
anchors `identity` … `apiSettings` open their tabs and a nonsense name opens
Identity silently; signed out, the address shows the Login page with a
`source` parameter and continues to the named tab; every level from
`reader.rosa` to `admin` sees the same seven tabs and no banner. The
unsubscribe page's link to `user/profile` is a template fact only: no
notification mail with an unsubscribe link was opened in the 2026-09-04
check, so the body no longer names that page (settle it by opening the
unsubscribe link of any notification email and reading where it leads).
Live-probed 2026-09-04 (claim check), all three apps (Rule 1; Actors rows 1–2, 5; Rule
13): holds; `user/profile/2`, `user/profile/identity/2` and
`user/profile?userId=2` all opened the session's own account; the
registration completion page's "Edit My Profile" landed on Identity; while
impersonating ("Login As" from Users & Roles), "Edit Profile" opened the
impersonated user's profile and a name saved there was that user's.

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
Live-probed 2026-09-03, all three apps (Rules 2–3): the saved message is
the top-right `.app__notifications` toast "Your changes have been saved."
(with "×" / "Close") on Contact, Roles, Public, Notifications and API Key;
Identity renders it in its `#identityFormNotification` block, gone once the
tab is reopened, and shows no toast at all (live-probed 2026-09-04: none
within 6 s, three timed runs per app); the API Key tab renders it in
`#apiProfileNotification` after Create and Delete (note h); the Contact
tab's "Cancel" of a pending change renders it in-tab only, and on OMP one
2026-09-04 run also rendered the in-tab block beside the toast after an
email-change request (OJS and OPS the toast only; one run, so the body
does not claim it); the Password tab's refusals render in an in-tab
`.pkp_notification` headed "Errors occurred processing this form"; a
browser-side refusal ("This field is required.", "Please enter a valid email
address.", "Please enter a valid URL.") sends no request and puts a
`label.error` directly under the box; the server's "The selected email
address is already in use by another user." comes back as a toast and as the
Email box's label (asterisk kept) with the phone change of the same save
lost. A one-journal user at `index/user/profile/roles` is forwarded to
`{journal}/user/profile?0=roles` with Identity open (A1); a two-journal user
stays site-level with the journals inline and no ORCID block. Live-probed 2026-09-04 (claim check), all three apps (Rules 2–3): holds; `admin` on fleets holding
16 / 11 / 20 journals stays site-level, so the one-journal administrator
case (forwarded by the count, `getAvailable()` returning one context) was
not drivable — settle it on a fresh install with `publicknowledge` alone:
`admin` at `index/user/profile/roles` either forwarded to
`publicknowledge/user/profile?0=roles` or kept at the site level; the
site-level Identity tab showed one box per site language (two on the
fleets) and no ORCID block; the one-journal forward also drops
`notificationSettings`. Live-probed 2026-09-04, all three apps (Rule 2,
scenario 3): pressing another tab while the open tab held an unsaved change
(on OJS the phone change of a refused Contact save; on OMP and OPS an
unsaved Phone change, then the Identity tab) raised the browser's own
`confirm()` "The data on this form has changed. Do you wish to continue
without saving?" (`form.dataHasChanged`, raised by
`TabHandler.tabsBeforeActivate` when the tab's form has
`formChangesTracked` set); Cancel kept the tab, OK moved on and the change
was gone. Mechanism (not driven as such): a submit clears the flag before
the request goes out (`FormHandler.submitFormWithValidation`), which is why
a tab whose last save succeeded asks nothing. Live-probed 2026-09-04 (claim
check, twice on each of the three apps; Rule 2, scenario 3): whether the
question is asked after a refused save depends on whether the save ever
left the browser. Country set to the blank entry, phone changed, Save: no
`save-contact` request, "This field is required." under the dropdown, and
"Roles" or "Public" then raised the same `confirm()` "The data on this form
has changed. Do you wish to continue without saving?" (Cancel kept the tab
with the blank country and the typed phone; OK opened the other tab, and
Contact reopened showed the saved country and phone). Another account's
address typed into "Email", phone changed, Save: one POST to
`profile-tab/save-contact` (HTTP 200, the refusal inside the form JSON),
the tab re-rendered with "The selected email address is already in use by
another user." as the toast and the box's label and the typed values still
in the boxes, and "Roles" or "Public" then raised no dialog of any kind:
the other tab opened at once, and Contact reopened showed the account's own
address and the saved phone. A phone typed into that re-rendered tab after
the refusal raised the `confirm()` again (Cancel kept it, OK lost it), so
the tab that comes back from a server refusal tracks changes from scratch,
and a successful save's positive control still asked nothing.

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
`OrcidManager::isEnabled()` (*ORCID integration*). Live-probed 2026-09-03,
all three apps (Rules 4–5; Fields Identity): the username is plain text; a
cleared given name is refused in the browser with "This field is required."
(the server's "A given name is required." never shows); a family name saved
with its given name cleared in that language is refused with "You have added
a family name for a language that is missing the given name. Please add a
given name for this language."; the initials box takes `z`, `q` as "ZQ" and
refuses a third letter; blank initials give "UB" for "Ulla Bergmann-Kept"
and "U" once the family name is cleared; the email-initial case cannot be
reached through the screen (a given name is required). After a reload the
top bar's user button reads the avatar initials and the username twice
(`TopNavActions.vue` renders `currentUser.username`, never `fullName`), and
the reader-facing header's user menu is the username with a count; Users &
Roles lists "Dr. Ulla P. Bergmann-Pub" (the preferred public name) while the
new submission's Contributors step lists "Ulla Bergmann-Kept" (A13). The
hint's apostrophe is typographic ("you’d"). Live-probed 2026-09-04 (claim check), all
three apps (Rules 4–5; Fields Identity): holds, with one precision — with
"Dr. Ulla P. Bergmann-Pub" in the English box only, Users & Roles in the
English UI listed that name and in the French UI (`fr_CA`) "Ulla Bergmann"
(given + family taken from English, the French names being empty), because
`getFullName()` reads `preferredPublicName` per locale; the "Decline
Submission" email opened "Dear Dr. Ulla P. Bergmann-Pub,".

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
and family names, biography, affiliation (through
`Repo::affiliation()->migrateUserAffiliation()`), country, email and URL,
and never reads `orcid` or `orcidIsVerified` (re-read 2026-09-04; finding
A16).
Signature in emails: `SenderEmailVariable` exposes the sender's
`getSignature($locale)` as the sender-signature variable. Live-probed
2026-09-03, all three apps (Rules 6–7; Fields Contact; Side effects): a
scenario-seeded user has no Country, so the Contact tab refuses every save
with "This field is required." under the dropdown until one is chosen; Phone
keeps 24 of 30 typed characters; Mailing Address has one box; "Working
Languages" lists "English" and "French" (the site's two languages) and
ticking changes nothing on screen. Email change: one mail, subject "Confirm
account contact email change request", From `Probe Dee <old address>`, To
the same, none to the new address; a second request from the new address
goes to that address; the second browser's tab press and full page load
both still worked after the request (`invalidateOtherSessions()` did not
end it, contrast the password change, note g); "confirm" lands on
`user/profile#contact` with the new address editable and a "Your changes
have been saved." toast, signed out via `login?source=…/user/profile/contact`
with the address already switched; "reject" shows "Decline Invitation" /
"Are you sure you want to decline this invitation? Confirm the decline by
clicking the button below." / "Confirm Decline Invitation" signed in or out,
and the button sends a signed-out visitor to the Login page after
discarding; a used, cancelled or declined link shows "Invitation
Unavailable" ("This invitation is no longer available. It may have already
been accepted, declined, or expired. Please contact the journal manager for
further assistance.", "journal manager" on all three apps); the tab's
"Cancel" posts the same `save-contact` op and answers the generic saved
toast; the pending notice reads exactly `You have requested a change of your
email to "<new>". We have already sent you an email with directions on how
to validate the changed email.`; the text body ends "Kind regards, Site Admin"
(`{$SITECONTACTNAME}`) at journal level and "Kind regards, Array" at site
level (A10). Signature: a section editor's saved signature ended the
prefilled "Notify Authors" body of "Decline Submission" (OJS, OPS) and "Send
to External Review" (OMP); the Participants "Notify" dialog composed no
signature. Contributor copy seen in the wizard's "Edit" dialog: names,
email, bio and homepage filled, "Country *" and the affiliation box empty as
they were on the profile, no ORCID box (ORCID off on the scratch context).
Masthead: the roster users carry no affiliation, so the masthead showed
role, year and name only. Live-probed 2026-09-04 (claim check), all three apps (Rules 6–7;
Fields Contact; Side effects): holds; the contributor dialog showed
"Country *" filled and "Probe University K2" in its Affiliations table, and
for an account with a verified ORCID (the masthead printing its icon) only
the "ORCID iD" paragraph with "Request verification" (A16); the masthead
showed "Masthead University K2" under the section editor's name; the text
body opens "Dear Dee Probe," before "You are receiving this email…"; the
signed-in "confirm" and "reject" landings both carry the saved toast, while
"Cancel" answers the in-tab block only. Not driven: "Working Languages" on
a one-language site (the `count > 1` guard; a site-wide change — settle by
unticking `fr_CA` under Administration › Site Settings › Languages and
reopening any Contact tab), and the three-day lapse (settle with a request
older than `expiration_days`: no notice on Contact, both links answering
"Invitation Unavailable").

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
Live-probed 2026-09-03, all three apps (Rule 8; Fields Roles; Actors row
5; Settings): the tab's only heading is the fieldset legend "Roles"; the
string "Register in" occurs nowhere in the tab's DOM at journal or site
level, open or closed journal (the `user.register.registerAs` section renders
without its label); every level from `reader.rosa` to `admin` sees the same
boxes (OJS "Reader", "Author", "Reviewer"; OMP "Reader", "Author", "Chapter
Author", "External Reviewer"; OPS "Reader", "Author"), the held
self-registrable role ticked and nothing ticked for `sectioneditor.ana`,
`manager.maya` and `admin`; the fold reads "Register with other journals" →
"Hide other journals" (OJS), "Register with other presses" → "Hide other
presses" (OMP), "Register with other servers" → "Hide other servers" (OPS)
and, open, lists every other registration-open context by name with its
boxes (a collapsed fold still reports its contents visible to Playwright's
`isVisible`, so judge by the link text); whether the fold is absent when
only one journal accepts registrations was not seen (the fleets already held
many scratch contexts). Closing a journal (Users & Roles › Site Access
Options › "The Journal Manager will register all user accounts…"): its own
tab opens with an empty section, other journals' folds and the site-level
list keep its name with no boxes (A4). Tick "Author" / Save: Users & Roles
lists "Reader" and "Author" with today's start date; untick: "Reader" only;
a Section editor / Series editor / Moderator plus Author saving nothing
changed keeps both, unticking Author keeps the editorial role. Author with a
submission, unticked: My Submissions redirects to
`user/authorizationDenied?message=user.authorization.roleBasedAccessDenied`
("The current role does not have access to this operation."); re-ticked, the
list and the workflow open again (A6). Interests: Enter and comma both add a
chip; `GET /api/v1/vocabs/interests` suggests a phrase only after it was
saved; the Add Reviewer search found the user by the phrase only once they
held a reviewer role; OPS shows no interests box. Live-probed 2026-09-04 (claim check),
all three apps (Rule 8; Fields Roles; Actors row 5; Settings; Side
effects): holds, with two precisions. The fold lists every enabled context
by name, so a closed one sits name-only there and on the site-level list;
closing is Settings › Users & Roles › Site Access Options › "User
Registration", option "The Journal Manager will register all user accounts.
Editors or Section Editors may register user accounts for reviewers." (OMP
"The Press Manager will register all user accounts. Editors or Section
Editors may register user accounts for reviewers."; OPS "The Server Manager
will register all user accounts.") in place of "Visitors can register a
user account with the journal." (OJS wording; the press and server variants
were not recorded), after which the journal's public Register page reads
"This journal is currently not accepting user registrations." (OJS). A
scratch user holding the self-service reviewer role was not on
`about/editorialMasthead` before or after unticking it (the masthead's
"Peer Reviewers" block is built from completed reviews of the previous
year, `editorialMasthead.tpl`), so the `endAssignments()` cache clearing
has no visible effect for any self-service role. The "Allow user
self-registration" flag switched off on "Reader" removed its box on all
three apps and a Save left the held role in place; an interest saved by one
user was suggested to another who had typed none. Not driven: whether an
interest typed on the Register page arrives on the Roles tab (settle by
registering with the reviewer box ticked and one interest, then reading the
new account's Roles tab); the OPS site-level Register page (the linked
*Registration & account validation* finding's screen).

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
or the default theme reads the user's `profileImage` or `url`; the
`getLocalizedBiography()` calls there are on contributor objects, which is
how the bio reaches a published item's page (`author_bios` block), and the
masthead reads `affiliation` only (finding A9). Live-probed 2026-09-03, all
three apps (Rule 9; Fields Public): the tab reads "Profile Image" / "Drag
and drop a file here to begin upload" / "Upload File" / "Bio Statement
(e.g., department and rank)" / "Homepage URL"; the hidden file input carries
`accept=".jpg,.jpeg,.png,.gif"`; a 400 × 400 .png reloads the page at
`?uniq=…#publicProfile` with the image and "Delete", the stored file being
150 × 150; a 100 × 100 .jpg is stored at 100 × 100; a 300 × 300 static .gif
answers "The file could not be uploaded or revised." in `#plupload
.pkpUploaderError` with no reload, and after a reload the previous picture
and "Delete" are gone (A2); a text file named `.png` gets the same sentence
and the picture survives. On the test installs the uploaded picture did not
display in the tab (the stored file was measured on disk instead), so the
rendered size is unobserved there. `example.org` as homepage: no request,
"Please enter a valid URL." under the box; `https://example.org` saves with
the toast only. "Delete": no dialog, reload, bio and homepage kept. Reader
side: the masthead lives at `about/editorialMasthead` ("Editorial
Masthead"; `about/editorialTeam` is a 404) and shows role, start year and
name; a scenario-published scratch item showed "Author Biography / Probe
Public / Probe bio statement for cluster F." and neither the homepage nor an
image (OJS `article/view/{id}`, OMP `catalog/book/{id}`, OPS
`preprint/view/{id}`). Live-probed 2026-09-04 (claim check), all three apps (Rule 9;
Fields Public; A2, A9): holds, with three additions — each refusal also
raised a browser `alert()` carrying "The file could not be uploaded or
revised." (a Playwright test needs a dialog handler), and the sentence
stayed in the upload area until the next upload or reload; the picture
element (`#publicProfileForm img`) and "Delete" were present after each
upload, but the picture again did not render on the test installs, so
whether it displays is settled only on an install where the image address
answers; after `example.org` was refused and `https://example.org` saved,
`label.error` "Please enter a valid URL." stayed visible under the box
beside the toast, through further typing, until a reload (A15).

<a id="fn-g"></a>
**g** — `PKP\user\form\ChangePasswordForm` (`user/changePassword.tpl`,
instructions `user.profile.changePasswordInstructions`, labels
`user.profile.oldPassword` / `user.profile.newPassword` /
`user.profile.repeatNewPassword`, sublabel
`user.register.form.passwordLengthRestriction` with
`Site::getMinPasswordLength()`; all three inputs `maxLength="32"`, finding
A7; `{fbvFormButtons submitText="common.save"}` without `hideCancel`, so a
"Cancel" button renders and the base `FormHandler::cancelForm` only fires a
`formCanceled` event with no `cancelRedirectUrl`, finding A12, Rule 10c).
Checks in order: `oldPassword` custom via
`Validation::checkCredentials()` (`user.profile.form.oldPasswordInvalid`);
`password` ≠ `oldPassword` (`user.profile.form.passwordSameAsOld`);
`FormValidatorPassword` with `password2` comparison → Laravel rules
`required`, `confirmed` (`user.register.form.passwordsDoNotMatch`),
`Password::min(N)->uncompromised()` (`user.register.form.passwordLengthRestriction`,
`validator.password.uncompromised`). `FormValidatorPassword::getValidationRules()`
appends `->uncompromised()` unconditionally, but `ValidationServiceProvider`
binds the `UncompromisedVerifier` to a verifier that refuses nothing unless
the site setting `passwordUncompromisedEnabled` is on (Administration › Site
Settings › Site Setup › Security › "Compromised Password Check", the box
"Check passwords against compromised password databases", unticked on a
fresh install; `PKPSiteSecurityForm`); on, `LocalPasswordBlacklistVerifier`
reads `lib/pkp/registry/blacklistedPasswords.txt` when present and falls
back to the Have I Been Pwned k-anonymity service, so the refusal
reproduces on the test fleets with no outbound HTTP (re-read 2026-09-04).
`execute()`:
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
ever offers create-when-absent and delete-when-present). Live-probed
2026-09-03, all three apps (Rule 10; Fields Password; Side effects): the
hint reads "The password must be at least 6 characters."; 40 characters
typed leave 32 in each box (A7); the refusals render in `#profileTabs
.pkp_notification` headed "Errors occurred processing this form" — "The
current password you entered was incorrect.", "The passwords do not match.",
"Your new password is the same as your old password.", "The password must be
at least 6 characters." — and a wrong current password with a mismatching
pair gives "The current password you entered was incorrect. The passwords do
not match." in one notice with only the second sentence repeated under "New
password"; every failed save re-renders the panel with the boxes empty;
`password1234` was accepted (the outside service is unreachable on the test
fleets). Success: the toast only, the panel untouched, the earlier notice
still showing (A11); "Cancel" is `a.cancelButton` with `href="#"` and sent
nothing (A12). The other browser's tab press fetched the tab and was
answered with a redirect to `login?source=…` (twice nested) that the panel
never rendered, leaving it empty; its full load reached
`login?source=%2F…%2Fuser%2Fprofile`. No mail after the change; a reset link
requested before it answered "Sorry, the link you clicked on has expired or
is not valid. Please try resetting your password again." while a fresh link
opened the "Reset Password" form. Live-probed 2026-09-04 (claim check), all three apps
(Rule 10; Fields Password; Settings; Side effects): holds bar 10a's
"every failing check" — `abc`/`abcd` gave "The passwords do not match."
alone, current/current+x gave "Your new password is the same as your old
password." alone, a wrong current password with the real current password
typed twice as the new one gave the current-password sentence alone, and a
wrong current password with `abc`/`abc` gave both sentences; with the
site's compromised-password box unticked `password1234` saved, and with it
ticked `qwerty123456` was refused with "This password has appeared in data
leaks. Please choose a different, strong password." on all three fleets;
"Minimum password length (characters)" read 6 and the hint 6 (a changed
minimum was not tried; settle by setting another value and reading the
hint). The audit switch stayed off and the server log is not a screen; the
account's submission's "Activity Log & Notes" modal rendered blank for 30 s
on all three apps, so the no-entry claim rests on the code: the profile
forms call `AuditLog::log()` only and no event-log repository (grep of
`lib/pkp/classes/user/form/`, `controllers/tab/user/` and `pages/user/`,
2026-09-04).

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
note g; the tab re-renders with the opposite action (the no-secret state
and the configuration keys: note k). Live-probed 2026-09-03, all three
apps (Rule 12): "None" / "Create API Key" / "Generating a new API key will
invalidate any existing key for this user."; Create renders a 172-character
key (`eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.…`) with "Delete" and "Deleting a
key will revoke access to any application that uses it.", the same key after
a reload; "Delete" opens the browser `confirm` "Are you sure you want to
delete this API key?", Cancel sends nothing, OK returns to "None"; a second
Create differs. Live-probed 2026-09-04 (claim check), all three apps (Rule 12; Fields API
Key): holds; the in-tab block "Your changes have been saved."
(`#apiProfileNotification`) was present as soon as the tab re-rendered,
after every Create and Delete (9 of 9), so the earlier absence was a
timing miss. An application's loss of access after "Delete" is shown by no
page (a REST request with the old key answered 401/403 after "Delete",
and 200 before, would settle it).

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
semantics and the unsubscribe page:
[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md). Live-probed 2026-09-03, all three apps (Rule 11; Settings):
unticking `notificationNewAnnouncement` leaves `emailNotificationNewAnnouncement`
unticked and `disabled`; Save answers the toast, and a full reload shows
both as saved with the pairing reapplied; the "Editors" group holds "Weekly
email of outstanding tasks" and "Statistics report summary." on a fresh
context (`editorialStatsEmail` on by default) and only the first once
Settings › Workflow › Emails › "Editorial statistics" is set to "Do not send
the email to editors."; the site-level tab shows the first only; a journal's
choices and the site's stay apart. Live-probed 2026-09-04 (claim check), all three apps
(Rule 11; Fields Notifications; Settings): holds.

<a id="fn-j"></a>
**j** — Banner: `ProfileHandler::profile()` — when a context is open and
`$user->getRoles($contextId)` is empty, `UserUserGroup::withUserId()->withActiveInFuture()`
(no context filter, finding A5) supplies the earliest `date_start`, rendered
in `profile.tpl` as a `<Notification>` with `user.futureRole.notification.message`
"Your role is scheduled to begin on {$roleStartDate}" (Y-m-d) and
`user.futureRole.notification.description`. Privacy link: all seven tab
templates render `user.privacyLink` ("Your data is stored in accordance
with our <a href="{$privacyUrl}" target="_blank">privacy statement</a>.")
with `{url page="about" op="privacy"}`; `changePassword.tpl` and
`apiProfileForm.tpl` render it after their form section (re-read
2026-09-03, all seven templates). The `common.requiredField` legend is on
Identity, Contact, Roles, Public and Notifications only. Multilingual boxes:
`Form::fetch()` assigns `formLocales` from `Locale::getSupportedFormLocales()`,
the context's form locales (`getSupportedFormLocaleNames()`) when the page
is journal-level and the site's supported locales otherwise. Live-probed
2026-09-03, all three apps (Rules 13–14; Fields intro): the privacy sentence
is on all seven tabs and its link opens `about/privacy` ("Privacy
Statement") in a new tab; the legend is on Identity, Contact, Roles, Public
and Notifications; `publicknowledge` and scratch contexts have one form
language (`fr_CA` is a UI language only), so the multilingual boxes show
one input; with French ticked under Settings › Website › Setup › Languages
"Forms", focusing the first box opens a "(French)" popover with the second;
the site-level profile shows both site languages. Banner: a role invited
with start date 2026-10-15 put "Your role is scheduled to begin on
2026-10-15" and "Until then, you can review and update your profile. If you
believe this is an error, please contact the administrator." above the
heading on that journal's profile and on `publicknowledge` (no role there),
and nothing on a journal where the user holds an active role (A5).
Live-probed 2026-09-04 (claim check), all three apps (Rules 13–14; Fields intro; Settings
› Languages): holds at journal level; on the site-level profile every tab's
link is `index/about/privacy` (`target="_blank"`), which answers "404 Not
Found" (A14); the site-level Identity tab showed one box per site language
(two on the fleets, with the "(French)" popover) and no ORCID block; ticking
French under "Forms" doubled the Identity, Contact and Public boxes on that
journal only.

<a id="fn-k"></a>
**k** — No screen; read from the code (the 2026-09-04 claim check declared
these lines rather than driving them). `config.TEMPLATE.inc.php`:
`[security] api_key_secret = ""` — `APIProfileForm::fetch()` with an empty
secret calls `handleOnMissingAPISecret()`, which creates the warning
notification `user.apiKey.secretRequired` and sets `apiSecretMissing`,
hiding the button while the box shows "None" (Rule 12d); the test fleets'
`config.test.inc.php` sets a secret, so the state needs a deliberately
blanked key to observe. `[invitations] expiration_days = 3`
(`Invitation::DEFAULT_EXPIRY_DAYS`) bounds an email-change request (Rule
6f). `[logs] log_audit` (commented out, Off) gates `AuditLog::log()` (note
g).

<a id="fn-s"></a>
**s** — Scenario seeding: the seeded test journal/press/server
(`publicknowledge`) and roster accounts (passwords = username doubled) are
read-only, so every mutating scenario runs as a **scratch user** in a
**scratch context** (`POST scenarios/context` with `users[]`, scenarios.md;
throwaway users exist only there, and the scratch context arrives open for
registration with every default role). Scenario 1 `author.alex` on
`publicknowledge` (read-only). Scenarios 2, 3, 7, 9: a scratch author in the
scratch context; scenario 3's "another account's address" is any roster
address. Scenarios 4–5: a scratch author with a unique throwaway
`@mail.test` address, mail observed in the test mail catcher scoped by that
recipient (PRINCIPLES A8): the catcher is Mailpit, one shared instance at
`MAILPIT_URL` (default `http://127.0.0.1:8025`, scenarios.md), so a message
is found by its recipient address, never by position; "a second browser" =
a second Playwright context signed in as the same scratch user. Scenario 6: a scratch user seeded with
`roles: ['reader']`; the Users & Roles check as the scratch context's
manager (`admin` is enrolled as one, seed-facts). Scenario 8: a scratch
author in two browser contexts; never change a roster password. Scenario 10:
`manager.maya` on `publicknowledge` (enrolled on all three apps; OPS seeds
no editor), restoring the box afterwards. The 32-character cap (A7) is
avoided by keeping scratch passwords short. Seed facts that bind these
scenarios (2026-09-03): a scenario-seeded user has no Country, so every
Contact save (scenarios 3–5) chooses one first; the fleets' scratch
contexts all accept registrations, so the other-journal fold (scenario 6)
is always present and long; `publicknowledge` has no published item, so a
reader-facing check of the bio needs a scenario-published scratch
submission; the site's "Check passwords against compromised password
databases" box is unticked on the fleets, so the Password tab accepts
`password1234`, and ticked it refuses `qwerty123456` there too (no outside
service needed; 2026-09-04). A refused upload raises a browser alert, so a
test of Rule 9a registers a dialog handler; the profile picture does not
render on the test installs, so suites assert the "Delete" button, never
the picture.

<a id="fn-a1"></a>
**f-a1** — `ProfileHandler::profile()`: with no context and exactly one
available context, `$request->redirect($firstContext->getPath(), 'user',
'profile', null, $args)` — `$args` (the tab name) lands in the `$params`
slot of `PKPRequest::redirect(?context, ?page, ?op, ?path, ?params, ?anchor)`,
so the forwarded address reads `…/user/profile?0=roles` and the anchor
branch (`array_shift($args)` → redirect with `#roles`) never runs on the
journal-level request. Seen 2026-09-02 (registration probing, all three
apps): `index/en/user/profile/roles` and the site-level completion page's
"Edit My Profile" forwarded to `{context}/en/user/profile?0=roles`. Live-probed
2026-09-03, all three apps: a user with one journal opening
`index/user/profile/roles` was forwarded to `{journal}/user/profile?0=roles`
with Identity open; a two-journal user stayed at the site level on Roles.
Live-probed 2026-09-04 (claim check), all three apps: holds; the forward also drops
`notificationSettings` (`{journal}/user/profile?0=notificationSettings`,
Identity open). The fix is to pass `$args` as `$path`.

<a id="fn-a2"></a>
**f-a2** — `PublicProfileForm::uploadProfileImage()`: after
`uploadSiteFile()` and `getimagesize()`, the oversize branch runs
`$user->setData('profileImage', null); Repo::user()->edit($user, ['profileImage'])`
before returning `false`, and calls `$publicFileManager->removeSiteFile($filePath)`
where `$filePath` is `getSiteFilesPath()` (the directory), not
`$uploadName`; the uploaded file therefore stays and the previous image
record is gone (its file remains on disk, orphaned). Client-side, plupload's
`resize` applies to JPEG and PNG, so a GIF larger than 150 × 150 reaches the
server unshrunk. Live-probed 2026-09-03, all three apps: a 300 × 300 static
.gif over a 100 × 100 .jpg was refused with "The file could not be uploaded
or revised." and the .jpg was gone from the tab after a reload, while
`profileImage-{userId}.gif` (300 × 300) and the .jpg both stayed on disk; a
text file named `.png` was refused with the same sentence and the picture
stayed. Live-probed 2026-09-04 (claim check), all three apps: holds (each refusal also
raised a browser alert with the sentence).

<a id="fn-a3"></a>
**f-a3** — `InvitationActionRedirectController::declineHandle()` builds the
confirm URL with `$context->getData('urlPath')` where `$context =
$request->getContext()`; the decline link of a site-level request is
`index/invitation/decline?…` (built by `InvitationHandler::getActionUrl()`
from the request's context, null at site level), so `$context` is null and
the call fatals. The accept path (`acceptHandle()`) never touches the
context. Reachable only on a multi-journal site (Rule 3), which the seeded
fleets become once a scratch context exists. Live-probed 2026-09-03, all
three apps, as a two-journal user: the site-level request's links read
`index/en/invitation/accept?id=…&key=…` and `…/decline?…`; "reject"
answered HTTP 500 with an empty body, the Contact tab still pending
afterwards; "confirm" landed on `index/en/user/profile#contact` with the new
address. Live-probed 2026-09-04 (claim check), all three apps: holds (500, 407 bytes, empty
title; the tab's "Cancel" then cleared the request).

<a id="fn-a4"></a>
**f-a4** — `user/userGroups.tpl`: `{if $currentContext}` renders the
`user.register.registerAs` section unconditionally and includes
`userGroupSelfRegistration.tpl`, which loops `$readerUserGroups[$contextId]`
etc.; `UserFormHelper::assignRoleContent()` `continue`s past contexts with
`disableUserReg`, leaving those arrays without the key, so the loops render
nothing. Live-probed 2026-09-03, all three apps: the section's
`user.register.registerAs` label does not render at all (the current journal
is never named), so a closed journal's own tab shows an empty `.section`
between the "Roles" legend and the fold; and the other-context list is not
filtered either: after closing a scratch journal it stayed listed by name
with no boxes in another journal's fold and on the site-level list (the
context loop prints every enabled context and only the box loops skip the
closed one). Live-probed 2026-09-04 (claim check), all three apps: holds; the closing
control is Site Access Options › "User Registration" (its strings in note
e), not a box named "Users can register".

<a id="fn-a5"></a>
**f-a5** — `ProfileHandler::profile()`: the query is
`UserUserGroup::withUserId($user->getId())->withActiveInFuture()->pluck('date_start')->first()`
with no `withContextId()`, evaluated whenever `$context` is set and
`$user->getRoles($context->getId())` is empty. Future-dated assignments are
created by role invitations with a start date (*User invitations*).
Live-probed 2026-09-03, all three apps: an Author role invited on a scratch
journal with start date 2026-10-15 and accepted showed the banner on that
journal's profile and, identically, on `publicknowledge` where the user
holds nothing; the journal where they are a manager showed none.
Live-probed 2026-09-04 (claim check), all three apps: holds (no banner on the site-level
profile either).

<a id="fn-a6"></a>
**f-a6** — `UserFormHelper::saveRoleContent()`: for every self-registrable
group in every registration-enabled context, `userInGroup()` true and the
box absent from the POST → `Repo::userGroup()->endAssignments($contextId,
$userId, $groupId)`. Nothing distinguishes a self-registered membership from
an assigned one. Live-probed 2026-09-03, all three apps: an Author with one
active submission unticked "Author" and saved with the plain toast; My
Submissions then redirected to
`user/authorizationDenied?message=user.authorization.roleBasedAccessDenied`
("The current role does not have access to this operation.") with the
editorial navigation gone; re-ticking restored "Active submissions (1)" and
the workflow opened. A scratch reviewer (OJS "Reviewer", OMP "External
Reviewer") who unticked the box stayed in Users & Roles with an empty ROLES
cell; a reviewer with a live review assignment was not tried. Live-probed 2026-09-04 (claim check), all three apps: holds, the OPS author lock-out included; a
manager-granted reviewer who unticked the box was left with empty ROLES and
START DATE cells.

<a id="fn-a7"></a>
**f-a7** — `user/changePassword.tpl`: `maxLength="32"` on `oldPassword`,
`password` and `password2`. *Login & sessions* A1 (reviewed 2026-08-25)
records the cap on the Login, Confirm Access, forced-change and reset forms
and the ruling to raise it; this template carries the same attribute.
Live-probed 2026-09-03, all three apps: 40 characters typed into each of the
three boxes leave 32. Live-probed 2026-09-04 (claim check), all three apps: holds.

<a id="fn-a8"></a>
**f-a8** — `ChangeProfileEmailInvite::getMailable()` addresses
`$this->getMailableReceiver()`, and `Invitation::getMailableReceiver()`
builds the identity from `Repo::user()->get($userId)` with
`setEmail($user->getEmail())` — the stored (old) address; the payload's
`newEmail` appears only in the body. `finalize()` sets the new address with
no check beyond the form's syntactic and uniqueness validation. The
on-screen notice is `user.pendingEmailChange`. Live-probed 2026-09-03, all
three apps: the mail catcher held one message for the old address (From and
To the user's own name and old address) and none for the new one; a second
request made after confirming went to the then-current address. Live-probed 2026-09-04 (claim check), all three apps: holds (five requests per app, every message to
the then-current address).

<a id="fn-a9"></a>
**f-a9** — Grep of `lib/pkp/templates/frontend`, each app's
`templates/frontend` and `plugins/themes/default/templates` (2026-09-03):
no reference to a user's `profileImage`; `getLocalizedBiography()` and
`getUrl()` occur only on contributor (`$author`) objects
(`omp/templates/frontend/objects/chapter.tpl`, `monograph_full.tpl`);
`editorialMasthead.tpl` and `editorialHistory.tpl` read `affiliation` and
`orcid`; the contributor's `getLocalizedBiography()` is what the item page's
`author_bios` block prints, fed from the profile through `newAuthorFromUser()`
(note d). The user API schema (`lib/pkp/schemas/user.json`) exposes
`biography` and `url`, so themes and plugins can read them. Live-probed
2026-09-03, all three apps: the masthead at `about/editorialMasthead` showed
role, start year and name and no image; a scenario-published scratch item
showed "Author Biography" with the profile's bio, no homepage link and no
picture; the new-submission contributor dialog carried the bio and the
homepage. Live-probed 2026-09-04 (claim check), all three apps: holds; the masthead printed
a verified ORCID icon and the affiliation beside a name, still no picture
and no homepage.

<a id="fn-a10"></a>
**f-a10** — The `CHANGE_EMAIL` template body ends `{$SITECONTACTNAME}`,
resolved by the site-contact variable from the request's context; with no
context (a site-level request, `index/…`) the value printed is the literal
"Array". Live-probed 2026-09-03, all three apps: the journal-level message
ended "Kind regards, Site Admin"; the site-level message of the same user
kind, sent by a two-journal user from `index/user/profile`, ended "Kind
regards, Array". Live-probed 2026-09-04 (claim check), all three apps: holds.

<a id="fn-a11"></a>
**f-a11** — `ChangePasswordForm` success returns a content-less
`JSONMessage(true)`; the `AjaxFormHandler` leaves the rendered form as it
is, and the in-place `.pkp_notification` from the previous failed render
(which came back as a full re-render) is never cleared; the sublabel's
error state is removed without restoring the hint. Live-probed 2026-09-03,
all three apps: after a wrong-current-plus-mismatch attempt, a valid save
showed the toast with "Errors occurred processing this form / The current
password you entered was incorrect. The passwords do not match." still above
the form, the three boxes filled and the hint line empty. Live-probed 2026-09-04 (claim check), all three apps: holds.

<a id="fn-a12"></a>
**f-a12** — `changePassword.tpl` renders `{fbvFormButtons}` without
`hideCancel`, so `a.cancelButton` (`href="#"`) appears; `FormHandler::cancelForm`
fires a `formCanceled` event with no `cancelRedirectUrl` and no listener.
Live-probed 2026-09-03, all three apps: with the three boxes filled, "Cancel"
sent no request, changed no tab and kept the values. Live-probed 2026-09-04 (claim check),
all three apps: holds.

<a id="fn-a13"></a>
**f-a13** — `Repo::author()->newAuthorFromUser()` copies `givenName` and
`familyName` and never `preferredPublicName`; the contributor schema has its
own `preferredPublicName`, left empty. Live-probed 2026-09-03, all three
apps: with "Preferred Public Name" saved as "Dr. Ulla P. Bergmann-Pub", Users
& Roles listed that name while the new submission's Contributors step listed
"Ulla Bergmann-Kept" and its "Edit" dialog had "Preferred Public Name"
empty. Live-probed 2026-09-04 (claim check), all three apps: holds; the Users & Roles
listing by the preferred name is per language (note c).

<a id="fn-a14"></a>
**f-a14** — All seven tab templates build the privacy link with
`{url page="about" op="privacy"}`; on the site-level profile
(`index/user/profile`) the request has no context, so the address is
`index/about/privacy`, and no site-level `about` page exists to answer it.
Live-probed 2026-09-04, all three apps: every tab's link at the site level
was `index/en/about/privacy` with `target="_blank"` and opened "404 Not
Found"; at journal level the same link opened that journal's "Privacy
Statement". A fix is to fall back to a journal's or the site's statement,
or to leave the sentence out where there is none.

<a id="fn-a15"></a>
**f-a15** — `PublicProfileForm` adds `FormValidatorUrl` on `userUrl`, which
registers the client-side `url` check that writes `label.error` "Please
enter a valid URL." under the box; the `AjaxFormHandler` success path (a
content-less `JSONMessage(true)`) leaves the rendered form as it is, so the
label is never removed — the same mechanism as A11. Live-probed 2026-09-04,
all three apps: `example.org` sent no request and put the sentence under the
box; `https://example.org` then saved (`save-public-profile` 200) with the
toast while the label stayed visible, through further typing, and a full
reload cleared it.

<a id="fn-a16"></a>
**f-a16** — `Repo::author()->newAuthorFromUser()` copies given and family
names, biography, affiliation, country, email and URL and never `orcid` or
`orcidIsVerified` (re-read 2026-09-04). Live-probed 2026-09-04, all three
apps: an author whose Identity tab held the verified
`https://orcid.org/0000-0002-1825-0097` (set through the scenario API; the
masthead printed its icon) started a submission; the Contributors step
listed the contributor without an ORCID and its "Edit" dialog showed the
"ORCID iD" paragraph with a "Request verification" button and no value.

<a id="fn-a17"></a>
**f-a17** — The question is the `confirm()` raised by
`TabHandler.tabsBeforeActivate` when the tab's form has `formChangesTracked`
set (`form.dataHasChanged`); a submit clears the flag before the request
goes out (`FormHandler.submitFormWithValidation`), and the form the server
sends back refused is rendered by `AjaxFormHandler` without it, so only
typing into it sets the flag again (mechanism as in note b, not driven as
such). Live-probed 2026-09-04 (claim check), twice on each of the three
apps, the same runs note b cites. Another account's address typed into
"Email", phone changed, Save: one POST to `profile-tab/save-contact` (HTTP
200, the refusal inside the form JSON), the tab re-rendered with "The
selected email address is already in use by another user." as the toast and
the box's label and the typed values still in the boxes; "Roles" or
"Public" then raised no dialog of any kind, the other tab opened at once,
and Contact reopened showed the account's own address and the saved phone.
The other end, for contrast: Country set to the blank entry, phone changed,
Save sent no request ("This field is required." under the dropdown), and
"Roles" or "Public" then raised the `confirm()` "The data on this form has
changed. Do you wish to continue without saving?" (Cancel kept the tab, OK
opened the other one); a phone typed into the re-rendered tab after the
server refusal raised it as well, and a tab whose last save succeeded asked
nothing.

<a id="fn-omp1"></a>
**f-omp1** — `omp/registry/userGroups.xml`: `permitSelfRegistration="true"`
on `default.groups.name.author` ("Author"), `chapterAuthor` ("Chapter
Author"), `externalReviewer` ("External Reviewer") and `reader` ("Reader");
`internalReviewer` ("Internal Reviewer") carries no flag. Labels from
`omp/locale/en/default.po` and the shared `lib/pkp/locale/en/default.po`.
Reviewer groups render after author groups (note e), so the tab's order is
Reader, Author, Chapter Author, External Reviewer. Live-probed 2026-09-04 (claim check):
holds for every permission level driven (reader, author, section editor,
reviewer, manager, administrator).

<a id="fn-ops1"></a>
**f-ops1** — `ops/registry/userGroups.xml`: self-registration flag on
`author` and `reader` only; no group carries the reviewer role, so
`UserFormHelper` finds no reviewer group and `RolesForm::fetch()` sets
`disableInterestsSection` true for OPS, which drops the interests block from
`user/userGroups.tpl`. Live-probed 2026-09-03: the OPS Roles tab offered
"Reader" and "Author" for every level and ended after the fold with the
privacy sentence, the legend and "Save"; OMP offered "Reader", "Author",
"Chapter Author", "External Reviewer" (the OMP1 order). Live-probed 2026-09-04 (claim check): holds; the OPS journal-level Register page showed no reviewer
box and no interests box, and the site-level Register page (the linked
finding's screen) was not opened.

<a id="fn-ops2"></a>
**f-ops2** — `ChangeProfileEmailInvitationNotify` is seeded in all three
`registry/emailTemplates.xml` files and sent through the shared invitation
code, but the Manage Emails list is built from each app's
`mail/Repository::map()`, and OPS's map omits the mailable (the same
omission as *User invitations* OPS1 for the role invitation). Live-probed
2026-09-03: Settings › Workflow › Emails › "Add and edit templates" lists 66
entries on OJS and 56 on OMP, each with "Change Email Address Invitation"
("Users who request a change to their email address in their user profile
will receive this request to confirm.", "Edit" opening "Edit Template" with
subject "Confirm account contact email change request"); OPS lists 17 and
the string "Change Email" occurs nowhere on the page, while the OPS scratch
user's request delivered the same mail. Live-probed 2026-09-04 (claim check): holds (66 /
56 / 17 templates again).

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
| Notifications tab (shell only) | Profile → "Notifications" | AFFU-058 (boxes AFFU-093..095: [Notifications center & email preferences](U05-notifications-center-and-email-preferences.md)) |
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

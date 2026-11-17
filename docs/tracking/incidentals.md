# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U53 | Rule 24 ("The user's row, as the grid shows it after "OK", still lists the role just ended until the page is reloaded") and scenario 8's "Roles changed" bullet ("while Lena's row still lists "Author" beside "Reader""), the Settings wizard's "Users" tab, signed in as `admin` (OJS, OMP, OPS) | Narrower than both sentences: the refreshed row lists the removed role only when the grid's refresh comes in the same second as the save (five of seven tries on 2026-11-17); otherwise it reads the new roles at once. The S8 tests already read the row after a reload | 2026-11-17 | issue reporter n17a (U53 A17 refresh), `docs/issues/U53-A13-A17-users-grid-roles-admin-empty-ended-listed.md`; kept script `shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/walk.js` (`.reports/issues/n17a/` in slot s2 only) |

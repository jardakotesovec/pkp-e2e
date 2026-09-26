// @ts-check
/**
 * @file playwright/tests/U55-notify-users.spec.js
 *
 * Notify users (bulk email) — OMP suite, the parallel part: scenario 3 (the
 * Site Administrator takes a role off the "Notify" tab), which sends
 * nothing, in OMP vocabulary (press, Press Manager, "Hosted Presses", the
 * wizard's first tab "Setup", the five stage columns of the "Roles" tab). Scenarios 1, 2, 4 and 5 wait for the site's background jobs and
 * live in ./serial/U55-notify-users.spec.js.
 * Spec: docs/specs/U55-notify-users.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract): A1 🐞, A2 🐞, A3 🐞, A4 🐞. Where
 * a test passes through one (every send presses the form's button, A1's
 * "Save") it finds the button by its place in the form's footer, never by
 * its label. The spec's Coverage section records everything else left out.
 *
 * Seeding (footnote s): a scratch press from `POST scenarios/context` with
 * `bulkEmails: true` (the press ticked under "Bulk Emails") and throwaway
 * accounts; the Site Administrator is `admin`, whom the context factory
 * enrols as a manager of every scratch press. "Author" is ticked under
 * "Disable Roles" on the screen, as the scenario does; the change is the
 * press's own, so it runs beside other workers. No test saves
 * Administration › Site Settings › "Bulk Emails" here (its "Save" posts
 * the list as its page loaded it). Every actor is opened through `asUser`
 * (no default user: a multi-actor test sets none, patterns.md "Fixture
 * selection").
 */
const {test, expect} = require('../support/fixtures.js');
const {HostedContextsPage} = require('../../../../shared/playwright/pages/UsersManagementPages.js');
const {RolesTab} = require('../../../../shared/playwright/pages/RolesConfigurationPages.js');
const {SettingsPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {
    NotifyTab,
    RestrictBulkEmailsTab,
    SiteBulkEmailsTab,
} = require('../../../../shared/playwright/pages/NotifyUsersPages.js');

const LABELS = {hostedLabel: 'Hosted Presses'};
const WIZARD = {firstTab: 'Setup'};
const STAGES = ['Submission', 'Internal Review', 'External Review', 'Copyediting', 'Production'];
const DISABLE_DESCRIPTION =
    'A press manager will be unable to send bulk emails to any of the roles selected below. Use this setting to ' +
    'limit abuse of the email notification feature. For example, it may be safer to disable bulk emails to readers, ' +
    'authors, or other large user groups that have not consented to receive such emails. The bulk email feature ' +
    'can be disabled completely for this press in Admin > Site Settings.';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u55s${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A signed-in page for an actor (a fresh `asUser` context). */
async function signedIn(asUser, username) {
    const context = await asUser(username);
    return context.newPage();
}

/** Sorted copy (the "Notify" boxes' order is not the spec's claim). */
const sorted = (list) => [...list].sort();

/** The "Notify" panel's lines other than the role boxes' labels. */
async function formLinesBesides(notify, roleLabels) {
    const lines = (await notify.panel.innerText()).split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    return lines.filter((l) => l && !roleLabels.includes(l));
}

test.describe('notify users', () => {
    test('S3: the Site Administrator takes a role off the "Notify" tab', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag(3, testInfo);
        const manager = `m${tag}`;
        await ompApi.createContext({
            tag,
            bulkEmails: true,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: `q${tag}`, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
            ],
        });
        const ap = await signedIn(asUser, 'admin');
        const mp = await signedIn(asUser, manager);

        // The press's roles as its "Roles" tab lists them (the order the
        // side tab follows).
        const roles = new RolesTab(mp, tag, {stages: STAGES});
        await roles.goto();
        const allRoles = await roles.rowNames();
        expect(allRoles).toEqual(expect.arrayContaining(['Author', 'Reader']));

        // The side tab (Rule 11; Fields, "Restrict Bulk Emails").
        const hosted = new HostedContextsPage(ap, LABELS);
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        const restrict = new RestrictBulkEmailsTab(ap, WIZARD);
        await restrict.open();
        await expect(restrict.legend()).toHaveText(/^\s*Disable Roles\s*$/);
        expect(await restrict.description()).toBe(DISABLE_DESCRIPTION);
        // A box per role the "Roles" tab lists, in no fixed order (Fields).
        expect(sorted(await restrict.boxLabels())).toEqual(sorted(allRoles));
        expect(await restrict.checkedLabels()).toEqual([]);
        await expect(restrict.saveButton).toBeVisible();
        const wizardSource = await ap.content();
        expect(wizardSource, 'positive control: the wizard carries the side tab').toContain('Restrict Bulk Emails');
        expect(wizardSource, 'positive control: the wizard carries the boxes').toContain('Disable Roles');

        // "Author" ticked, saved and kept over a reload (Rule 12).
        await restrict.box('Author').check();
        await restrict.save();
        await restrict.reload();
        expect(await restrict.checkedLabels()).toEqual(['Author']);

        // The Press Manager: "Author" not offered, every other role is,
        // and nothing says a role is withheld; the "Roles" tab keeps "Author"
        // (Rules 3, 12).
        const notify = new NotifyTab(mp, tag);
        await notify.goto();
        await expect(notify.roleBox('Author')).toHaveCount(0);
        await expect(notify.roleBox('Reader')).toHaveCount(1);
        expect(sorted(await notify.roleLabels())).toEqual(sorted(allRoles.filter((r) => r !== 'Author')));
        const restrictedLines = await formLinesBesides(notify, allRoles);
        await roles.goto();
        await expect(roles.row('Author')).toHaveCount(1);

        // The manager's Settings pages carry neither (Actors row 3).
        const settings = new SettingsPages(mp, tag);
        const entries = await settings.settingsGroupItems();
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            await settings.openSettingsEntry(entry);
            await expect(settings.topTabs.first()).toBeVisible();
            const source = await mp.content();
            expect(source, `${entry}: no "Restrict Bulk Emails"`).not.toContain('Restrict Bulk Emails');
            expect(source, `${entry}: no "Disable Roles"`).not.toContain('Disable Roles');
        }

        // The description's link (Rule 11).
        await restrict.field.getByRole('link', {name: 'Admin > Site Settings', exact: true}).click();
        await ap.waitForURL(/\/admin\/settings/, {waitUntil: 'commit'});
        await new SiteBulkEmailsTab(ap).expectOpen();

        // Control: "Author" unticked and saved is offered again (Rule 12);
        // the tab's text besides the boxes is what it was while restricted.
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        await restrict.open();
        await restrict.box('Author').uncheck();
        await restrict.save();
        await notify.goto();
        await expect(notify.roleBox('Author')).toHaveCount(1);
        expect(sorted(await notify.roleLabels())).toEqual(sorted(allRoles));
        expect(await formLinesBesides(notify, allRoles)).toEqual(restrictedLines);
    });
});

// @ts-check
/**
 * @file playwright/tests/serial/U05-notifications-center-and-email-preferences.spec.js
 *
 * Notifications center & email preferences — the OJS-only scenario 9 (the
 * issue email and its Unsubscribe link). "Publish Issue" only queues the
 * email for the site's background jobs, and the fleets run with `[queues]
 * job_runner = Off`, so nothing reaches Mailpit until `runJobs()` drains the
 * queue; that drain pops the SHARED queue and must never run while parallel
 * workers seed, hence the serial project (patterns.md parallel lesson 7).
 * Spec: docs/specs/U05-notifications-center-and-email-preferences.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U05-notifications-center-and-email-preferences.spec.js);
 * this file adds only:
 * - the issue email's footer link is read, never opened: a job-sent email's
 *   link carries the config `base_url` host (worker 0's port), not this
 *   worker's (seed-facts), and Rule 8 is covered by S5 and S6.
 * - the "Create Issue" and "Publish Issue" forms belong to *Issues* (spec not
 *   yet written); only the labels scenario 9 presses are used.
 *
 * Mailpit is shared across fleets and workers: every read is scoped by a
 * throwaway recipient, and the Reader's silence rides on the Author's email
 * delivered by the same queue drain.
 */
const {test, expect} = require('../../support/fixtures.js');
const {ProfilePage, SAVED_MESSAGE} = require('../../../../../shared/playwright/pages/ProfilePage.js');
const {successToasts} = require('../../../../../shared/playwright/pages/NotificationsPages.js');
const {waitForJQueryIdle} = require('../../support/legacy.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

const ISSUE_SETTING = 'notificationPublishedIssue';
const ISSUE_EMAIL_BOX = 'Send an email about this to all registered users.';

/** Unique per-run tag: single alphanumeric token, at most 12 characters. */
function makeTag(scenario, testInfo) {
    return `u5${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

const emailOf = (username) => `${username}@mail.test`;

/** Issues › Future Issues of a journal (`{journal}/manageIssues`). */
async function gotoFutureIssues(page, journalPath) {
    await page.goto(`/index.php/${journalPath}/manageIssues`);
    await expect(page.getByRole('link', {name: 'Create Issue', exact: true}).first()).toBeVisible({timeout: 30_000});
    await waitForJQueryIdle(page);
}

/**
 * "Create Issue": volume, number, year and a title on the issue form, then
 * "Save". The form's "Title" show-box arrives ticked, so an empty title is
 * refused (silently: the form re-renders without an error line, probed
 * 2026-09-04). The issue's identification, on the grid row and in the email
 * subject, then reads "Vol. {volume} No. {number} ({year}): {title}".
 */
async function createIssue(page, {volume, number, year, title}) {
    await page.getByRole('link', {name: 'Create Issue', exact: true}).first().click();
    const form = page.locator('form#issueForm');
    await expect(form).toBeVisible({timeout: 30_000});
    await form.locator('input[name="volume"]').fill(String(volume));
    await form.locator('input[name="number"]').fill(String(number));
    await form.locator('input[name="year"]').fill(String(year));
    await form.locator('input[name="title[en]"]').fill(title);
    const saved = page.waitForResponse(
        (response) => response.request().method() === 'POST' && /\/update-issue/.test(response.url()),
        {timeout: 30_000}
    );
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
    await waitForJQueryIdle(page);
    await expect(form).toHaveCount(0, {timeout: 30_000});
    return `Vol. ${volume} No. ${number} (${year}): ${title}`;
}

/**
 * The issue row's expander arrow, then "Publish Issue"; in the dialog the
 * email box arrives ticked; "OK" publishes (`POST …/publish-issue`).
 */
async function publishIssue(page, identification) {
    const row = page.locator('tr.gridRow').filter({hasText: identification});
    await expect(row).toHaveCount(1, {timeout: 30_000});
    await expect(row).toBeVisible({timeout: 30_000});
    await row.locator('a.show_extras').click();
    await page.getByRole('link', {name: 'Publish Issue', exact: true}).click();
    const dialog = page.locator('[role="dialog"]:visible').last();
    const emailBox = dialog.locator('#sendIssueNotification');
    await expect(emailBox).toBeVisible({timeout: 30_000});
    await expect(dialog.getByText(ISSUE_EMAIL_BOX)).toBeVisible();
    await expect(emailBox).toBeChecked();
    await expect(dialog.getByText('Are you sure you want to publish the new issue?')).toBeVisible();
    const published = page.waitForResponse(
        (response) => response.request().method() === 'POST' && /\/publish-issue/.test(response.url()),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    const response = await published;
    expect(response.ok(), `publish answered ${response.status()}`).toBe(true);
    await waitForJQueryIdle(page);
}

test.describe('notifications center & email preferences (queued email)', () => {
    test("S9: an issue's email and its Unsubscribe link", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        const manager = `${tag}mg`;
        const reader = `${tag}rd`;
        const author = `${tag}au`;
        const journalName = `Scratch context ${tag}`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: reader, roles: ['reader']},
                {username: author, roles: ['author']},
            ],
        });

        // The Manager creates the journal's one issue (a new journal has none).
        const managerPage = await (await asUser(manager)).newPage();
        await gotoFutureIssues(managerPage, tag);
        const identification = await createIssue(managerPage, {volume: 1, number: 1, year: 2026, title: `Issue ${tag}`});

        // The Reader unticks "Enable…" under "An issue has been published."
        // and saves; the Author changes nothing.
        const readerPage = await (await asUser(reader)).newPage();
        const readerProfile = new ProfilePage(readerPage, tag);
        await readerProfile.goto('notifications');
        const pair = readerProfile.notificationPair(ISSUE_SETTING);
        await pair.allow.uncheck();
        await readerProfile.save();
        await expect(successToasts(readerPage).filter({hasText: SAVED_MESSAGE})).toBeVisible();

        // "Publish Issue" with the email box left ticked; then the jobs.
        await gotoFutureIssues(managerPage, tag);
        await publishIssue(managerPage, identification);
        const output = runJobs();
        expect(output).toContain('IssuePublishedNotifyUsers');

        // The Author's mailbox holds the issue email, its subject the issue's
        // title, ending with the issue footer; the Reader's holds none.
        const control = {to: emailOf(author), subject: 'Just published', contains: identification};
        const summary = await pkpMail.find(control);
        expect(summary.Subject).toBe(`Just published: ${identification} of ${journalName}`);
        const full = await pkpMail.fullMessage(summary.ID);
        expect(full.Text).toMatch(new RegExp(`Unsubscribe.*from emails sent by ${journalName}`, 's'));
        expect(pkpMail.extractLink(full.HTML, /^unsubscribe$/i), 'the footer "Unsubscribe" link').toMatch(
            /\/notification\/unsubscribe\?validate=[^&]+&id=\d+$/
        );
        await pkpMail.expectNone({to: emailOf(reader), subject: 'Just published', contains: identification, afterControl: control});
    });
});

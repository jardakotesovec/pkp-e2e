// @ts-check
/**
 * @file playwright/tests/serial/U04-orcid-integration.spec.js
 *
 * ORCID integration — the one OPS canonical scenario that asserts on ORCID
 * request EMAIL (spec scenario 4). Every ORCID mailable is queued-job mail
 * and the fleets run with `[queues] job_runner = Off`, so nothing reaches
 * Mailpit until `php lib/pkp/tools/jobs.php run` drains the queue — and that
 * drain pops the SHARED queue, so it must never run while parallel agents
 * seed. Hence the serial project (patterns.md parallel lesson 7).
 * Spec: docs/specs/U04-orcid-integration.md
 *
 * Not covered, by register ID (the parallel suite's header and the spec's
 * Coverage section are the record of everything else left out): OPS2 🐞
 * (the Emails settings screen's missing rows; the delivered request mail
 * asserted here is the spec's Rule 8 and Rule 14 contract, never the
 * roster gap itself). S4's emailed authorization link is recorded, never
 * followed: ORCID's sign-in cannot complete on the fleets.
 *
 * Mailpit is shared across fleets and workers: every assertion is scoped by
 * a unique throwaway recipient (the seeded contributor's address carries
 * app + scenario + run), and every silence claim rides on a positive
 * control delivered by the same queue drain.
 */
const {test, expect} = require('../../support/fixtures.js');
const {
    AboutOrcidPage,
    openEditorialWorkflow,
    openContributors,
    openContributorEditor,
    orcidField,
    orcidEmailLinks,
    requestVerification,
    REQUEST_QUESTION,
    REQUEST_WAITS_FOR_SAVE,
    REQUESTED_TEXT,
    RESEND_LINK_TEXT,
} = require('../../pages/OrcidPages.js');
const {ContributorsScreen} = require('../../pages/ContributorPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** The Rule 14 subject lines: public API, member API. */
const SUBJECT_PUBLIC = 'Submission ORCID';
const SUBJECT_MEMBER = 'Requesting ORCID record access';

/** Unique per-run tag: single alphanumeric token, carries app + scenario. */
function makeTag(scenario, testInfo) {
    return `u4${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The principal contact fn-s seeds on scenario 4's servers. */
function principalContact(tag) {
    return {contactName: `ORCID Contact ${tag}`, contactEmail: `contact-${tag}@mail.test`};
}

// Re-enabled 2026-08-26 (maintainer): the dead-port proxy + sandbox-only dummy
// credentials stand — no real ORCID traffic is possible from these tests
// (see header); S2's popup asserts the sandbox URL only, without driving it.
test.describe('ORCID integration (queued email)', () => {
    test('S4: "Request verification" emails the contributor an authorization link', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const tagMember = makeTag('s4m', testInfo);
        // Two servers: the public-API one and the Member Sandbox one, each
        // with a principal contact of its own (the request email's From).
        const seedFor = async (contextTag, orcid) => {
            await opsApi.createContext({
                tag: contextTag,
                context: principalContact(contextTag),
                users: [
                    {username: `mgr${contextTag}`, roles: ['manager']},
                    {username: `aut${contextTag}`, roles: ['author']},
                ],
                orcid,
            });
            const {submissionId} = await opsApi.createSubmission({
                tag: contextTag,
                context: contextTag,
                submitter: `aut${contextTag}`,
            });
            return submissionId;
        };
        const submissionId = await seedFor(tag, {}); // Public Sandbox → "Submission ORCID" (Rule 14)
        const memberSubmissionId = await seedFor(tagMember, {apiType: 'memberSandbox'});
        const author = `aut${tag}`;
        const recipient = `${author}@mail.test`; // seeded contributor address
        const memberAuthor = `aut${tagMember}`;
        const memberRecipient = `${memberAuthor}@mail.test`;
        const novaRecipient = `nova-${tag}@mail.test`;

        const managerPage = await (await asUser(`mgr${tag}`)).newPage();
        await openEditorialWorkflow(managerPage, tag, submissionId);
        await openContributors(managerPage);
        let modal = await openContributorEditor(managerPage, author);

        // No iD → "Request verification"; the confirm dialog carries the
        // Rule 8 question and nothing about a pending save; confirming
        // flips the field to the requested state, with the resend link
        // beside it.
        const field = orcidField(modal);
        const dialogText = await requestVerification(managerPage, field);
        expect(dialogText).toContain(REQUEST_QUESTION);
        expect(dialogText).not.toContain(REQUEST_WAITS_FOR_SAVE);
        await expect(field).toContainText(REQUESTED_TEXT);
        await expect(field.getByRole('button', {name: 'Request verification'})).toHaveCount(0);
        await expect(field.getByText(RESEND_LINK_TEXT)).toBeVisible();

        // Save; the requested state persists on reopen. (The seeded
        // auto-author carries no country and the form requires one — filling
        // it is form furniture, not the behavior under test.)
        await modal.locator('#contributor-country-control').selectOption({label: 'Canada'});
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(modal).toHaveCount(0);
        modal = await openContributorEditor(managerPage, author);
        await expect(orcidField(modal)).toContainText(REQUESTED_TEXT);
        await expect(orcidField(modal).getByText(RESEND_LINK_TEXT)).toBeVisible();
        await modal.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(modal).toHaveCount(0);

        // The member-API server: the same request on its contributor.
        const memberManagerPage = await (await asUser(`mgr${tagMember}`)).newPage();
        await openEditorialWorkflow(memberManagerPage, tagMember, memberSubmissionId);
        await openContributors(memberManagerPage);
        const memberModal = await openContributorEditor(memberManagerPage, memberAuthor);
        await requestVerification(memberManagerPage, orcidField(memberModal));
        await expect(orcidField(memberModal)).toContainText(REQUESTED_TEXT);
        await memberModal.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(memberModal).toHaveCount(0);

        // A contributor being added, back on the first server: Given Name
        // Nova, a throwaway address of its own, Country Canada; the dialog
        // adds that the email waits for the save (Rule 8).
        const contributors = new ContributorsScreen(managerPage);
        const addDialog = await contributors.openAddPanel();
        await contributors.input('givenName', 'en').fill('Nova');
        await contributors.input('email').fill(novaRecipient);
        await contributors.input('country').selectOption({label: 'Canada'});
        const addField = orcidField(addDialog);
        const addDialogText = await requestVerification(managerPage, addField, {saved: false});
        expect(addDialogText).toContain(REQUEST_QUESTION);
        expect(addDialogText).toContain(REQUEST_WAITS_FOR_SAVE);
        await expect(addField).toContainText(REQUESTED_TEXT);

        // The mail is queued-job mail: drain the queue, then read the
        // contributors' mailboxes (recipient-scoped). The drain delivers the
        // two saved contributors' requests; Nova's is still only remembered.
        runJobs();
        const summary = await pkpMail.find({to: recipient, subject: SUBJECT_PUBLIC});
        expect(summary.From.Address).toBe(`contact-${tag}@mail.test`);
        expect(summary.From.Name).toBe(`ORCID Contact ${tag}`);
        const full = await pkpMail.fullMessage(summary.ID);
        const links = orcidEmailLinks(full.HTML);
        expect(links.authorization).toContain('sandbox.orcid.org'); // leads to ORCID's (sandbox) site
        expect(links.about).toContain(`/${tag}/orcid/about`);
        // Recorded, never followed: OAuth cannot complete from this install.

        // The member-API server's contributor: "Requesting ORCID record
        // access", the same two links, From that server's contact (Rule 14).
        const memberSummary = await pkpMail.find({to: memberRecipient, subject: SUBJECT_MEMBER});
        expect(memberSummary.From.Address).toBe(`contact-${tagMember}@mail.test`);
        expect(memberSummary.From.Name).toBe(`ORCID Contact ${tagMember}`);
        const memberFull = await pkpMail.fullMessage(memberSummary.ID);
        const memberLinks = orcidEmailLinks(memberFull.HTML);
        expect(memberLinks.authorization).toContain('sandbox.orcid.org');
        expect(memberLinks.about).toContain(`/${tagMember}/orcid/about`);
        expect(await pkpMail.count({to: recipient, subject: SUBJECT_MEMBER})).toBe(0);
        expect(await pkpMail.count({to: memberRecipient, subject: SUBJECT_PUBLIC})).toBe(0);

        // Nova's mailbox holds nothing yet: the request waits for the save
        // (the silence is bounded by the two requests the same drain
        // delivered).
        await pkpMail.expectNone({
            to: novaRecipient,
            afterControl: {to: recipient, subject: SUBJECT_PUBLIC},
        });
        await pkpMail.expectNone({
            to: novaRecipient,
            afterControl: {to: memberRecipient, subject: SUBJECT_MEMBER},
        });

        // The What-is-ORCID link in each email: each server's page renders,
        // and the member-API server's "How and why" section differs
        // (Rule 10). Read in a page of its own: the add form stays open
        // behind.
        const about = new AboutOrcidPage(await managerPage.context().newPage());
        await about.goto(links.about);
        const publicHowAndWhy = await about.howAndWhyText();
        await about.goto(memberLinks.about);
        const memberHowAndWhy = await about.howAndWhyText();
        expect(publicHowAndWhy.length).toBeGreaterThan(0);
        expect(memberHowAndWhy.length).toBeGreaterThan(0);
        expect(memberHowAndWhy).not.toBe(publicHowAndWhy);

        // Control: save the new contributor (the server offers more than one
        // contributor role, so the required role choice is ticked); the next
        // drain delivers Nova's request email (Rule 8).
        await contributors.roleCheckbox(addDialog, 'Author').check();
        await contributors.saveForm(addDialog);
        await expect(contributors.row('Nova')).toBeVisible();
        runJobs();
        const novaSummary = await pkpMail.find({to: novaRecipient, subject: SUBJECT_PUBLIC});
        expect(novaSummary.From.Address).toBe(`contact-${tag}@mail.test`);
        const novaFull = await pkpMail.fullMessage(novaSummary.ID);
        expect(orcidEmailLinks(novaFull.HTML).authorization).toContain('sandbox.orcid.org');
    });
});

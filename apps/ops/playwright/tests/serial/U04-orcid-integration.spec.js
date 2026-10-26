// @ts-check
/**
 * @file playwright/tests/serial/U04-orcid-integration.spec.js
 *
 * ORCID integration — the OPS canonical scenarios that assert on ORCID
 * EMAIL (spec scenarios 4 and 11). Every ORCID mailable is queued-job mail
 * and the fleets run with `[queues] job_runner = Off`, so nothing reaches
 * Mailpit until `php lib/pkp/tools/jobs.php run` drains the queue — and that
 * drain pops the SHARED queue, so it must never run while parallel agents
 * seed. Hence the serial project (patterns.md parallel lesson 7). S4 reads
 * a "nothing yet, until the save" silence and runs `@solo`; S11's silence
 * (an unpublished preprint sends nothing) holds whatever another drain runs.
 * Spec: docs/specs/U04-orcid-integration.md
 *
 * Not covered, by register ID: OPS2 🐞, A14 🐞, A21 🐞, A7 ❓.
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
    resendVerification,
    OrcidSettingsTab,
    DEPOSIT_SENTENCE,
    REQUEST_QUESTION,
    REQUEST_WAITS_FOR_SAVE,
    REQUESTED_TEXT,
    RESEND_LINK_TEXT,
} = require('../../pages/OrcidPages.js');
const {ContributorsScreen} = require('../../pages/ContributorPages.js');
const {postPreprint} = require('../../pages/PublicationPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** The Rule 14 subject lines: public API, member API, re-authorization. */
const SUBJECT_PUBLIC = 'Submission ORCID';
const SUBJECT_MEMBER = 'Requesting ORCID record access';
const SUBJECT_REAUTH = 'Requesting updated ORCID record access';

/** A seedable verified iD (ORCID's own example iD, sandbox-hosted). */
const TEST_ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

/**
 * A message's plain text as a reader sees it (Rule 14a reads): white space
 * folded, and the " ( address )" Mailpit's text part writes after each
 * link's words dropped.
 */
function flatText(message) {
    return String(message.Text || '')
        .replace(/\s+/g, ' ')
        .replace(/ \( https?:\/\/[^ )]* \)/g, '');
}

/** Unique per-run tag: single alphanumeric token, carries app + scenario. */
function makeTag(scenario, testInfo) {
    return `u4${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The principal contact fn-s seeds on scenario 4's servers. */
function principalContact(tag) {
    return {contactName: `ORCID Contact ${tag}`, contactEmail: `contact-${tag}@mail.test`};
}

// Re-enabled 2026-08-26 (maintainer): the dead-port proxy + sandbox-only dummy
// credentials stand — no real ORCID traffic is possible from these tests;
// every emailed link is read, never followed.
test.describe('ORCID integration (queued email)', () => {
    test('S4: "Request verification" emails the contributor an authorization link @solo', async ({asUser, opsApi, pkpMail}, testInfo) => {
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
                title: `Preprint ${contextTag}`,
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
        // Rule 14a: the greeting by the contributor's name (the seed's, the
        // username), the title in quotes, the default signature.
        const text = flatText(full);
        expect(text).toContain(`Dear ${author},`);
        expect(text).toContain(
            `You have been listed as an author on a manuscript submission "Preprint ${tag}" to Scratch context ${tag}.`
        );
        expect(text).toContain(`This is an automated message from Scratch context ${tag}.`);

        // The member-API server's contributor: "Requesting ORCID record
        // access", the same two links, From that server's contact (Rule 14).
        const memberSummary = await pkpMail.find({to: memberRecipient, subject: SUBJECT_MEMBER});
        expect(memberSummary.From.Address).toBe(`contact-${tagMember}@mail.test`);
        expect(memberSummary.From.Name).toBe(`ORCID Contact ${tagMember}`);
        const memberFull = await pkpMail.fullMessage(memberSummary.ID);
        const memberLinks = orcidEmailLinks(memberFull.HTML);
        expect(memberLinks.authorization).toContain('sandbox.orcid.org');
        expect(memberLinks.about).toContain(`/${tagMember}/orcid/about`);
        const memberText = flatText(memberFull);
        expect(memberText).toContain(`Dear ${memberAuthor},`);
        expect(memberText).toContain(
            `on the manuscript submission "Preprint ${tagMember}" to Scratch context ${tagMember}.`
        );
        expect(memberText).toContain(`This is an automated message from Scratch context ${tagMember}.`);
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
        expect(memberHowAndWhy).toContain(DEPOSIT_SENTENCE);
        expect(publicHowAndWhy).not.toContain(DEPOSIT_SENTENCE);

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

        // "Resend Verification Email" on the reopened contributor: the same
        // question; confirmed, a second "Submission ORCID" arrives (Rule 8).
        // Pressed after the first request's drain: the request job is
        // unique per contributor while it waits in the queue.
        expect(await pkpMail.count({to: recipient, subject: SUBJECT_PUBLIC})).toBe(1);
        modal = await openContributorEditor(managerPage, author);
        const resendText = await resendVerification(managerPage, orcidField(modal));
        expect(resendText).toContain(REQUEST_QUESTION);
        expect(resendText).not.toContain(REQUEST_WAITS_FOR_SAVE);
        runJobs();
        await expect
            .poll(() => pkpMail.count({to: recipient, subject: SUBJECT_PUBLIC}), {timeout: 20_000})
            .toBe(2);
    });

    test('S11: a contributor verified under the public API is asked to re-authorize', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s11', testInfo);
        const manager = `mgr${tag}`;
        const first = `aut${tag}`;
        const second = `bau${tag}`;
        // A Public Sandbox server with a principal contact of its own; two
        // unposted preprints, each by its own submitter whose iD was
        // verified under that API (the seed stores the public scope).
        await opsApi.createContext({
            tag,
            context: principalContact(tag),
            users: [
                {username: manager, roles: ['manager']},
                {username: first, roles: ['author']},
                {username: second, roles: ['author']},
            ],
            orcid: {},
        });
        const {submissionId: firstSubmission} = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: first,
            title: `Preprint ${tag}`,
            author: {orcid: TEST_ORCID, orcidIsVerified: true},
        });
        await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: second,
            title: `Second ${tag}`,
            author: {orcid: TEST_ORCID, orcidIsVerified: true},
        });
        const firstRecipient = `${first}@mail.test`;
        const secondRecipient = `${second}@mail.test`;

        // The "ORCID" tab: "Member Sandbox" under "ORCID API", saved.
        const managerPage = await (await asUser(manager)).newPage();
        const settings = new OrcidSettingsTab(managerPage, tag);
        await settings.goto();
        await expect(settings.enableCheckbox).toBeChecked();
        await expect(settings.apiSelect.locator('option:checked')).toHaveText('Public Sandbox');
        await settings.apiSelect.selectOption({label: 'Member Sandbox'});
        await settings.save();
        await settings.goto();
        await expect(settings.apiSelect.locator('option:checked')).toHaveText('Member Sandbox');

        // Publishing: the first preprint is posted on its workflow screen.
        await openEditorialWorkflow(managerPage, tag, firstSubmission);
        await postPreprint(managerPage);

        // The drain runs the deposit, which pauses on the public scope and
        // queues the re-authorization email, then the email itself.
        runJobs();
        const summary = await pkpMail.find({to: firstRecipient, subject: SUBJECT_REAUTH, timeoutMs: 30_000});
        expect(summary.From.Address).toBe(`contact-${tag}@mail.test`);
        expect(summary.From.Name).toBe(`ORCID Contact ${tag}`);
        const full = await pkpMail.fullMessage(summary.ID);
        const links = orcidEmailLinks(full.HTML);
        // The personal authorization link leads to ORCID's (sandbox) site;
        // read, never followed (A14).
        expect(links.authorization).toContain('sandbox.orcid.org');
        expect(links.about).toContain(`/${tag}/orcid/about`);

        // Control: the unposted preprint's contributor received nothing —
        // bounded by the first contributor's email from the same drain.
        await pkpMail.expectNone({
            to: secondRecipient,
            afterControl: {to: firstRecipient, subject: SUBJECT_REAUTH},
        });
    });
});

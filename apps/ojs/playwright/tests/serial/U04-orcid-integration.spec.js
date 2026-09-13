// @ts-check
/**
 * @file playwright/tests/serial/U04-orcid-integration.spec.js
 *
 * ORCID integration — the two OJS canonical scenarios that assert on ORCID
 * request EMAIL (spec scenarios 4 and 8). Every ORCID mailable is queued-job
 * mail and the fleets run with `[queues] job_runner = Off`, so nothing
 * reaches Mailpit until `php lib/pkp/tools/jobs.php run` drains the queue —
 * and that drain pops the SHARED queue, so it must never run while parallel
 * agents seed. Hence the serial project (patterns.md parallel lesson 7).
 * Spec: docs/specs/U04-orcid-integration.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): the
 * parallel suite's header (playwright/tests/U04-orcid-integration.spec.js)
 * lists them; this file passes through A6 ❓ (S8 asserts the toggle's
 * accept-time behavior, never its label wording) and stops at S4's emailed
 * authorization link (recorded, never followed: OAuth cannot complete on
 * the egress-firewalled fleets). The spec's Coverage section records
 * everything else left out.
 *
 * Mailpit is shared across fleets and workers: every assertion is scoped by
 * a unique throwaway recipient (the seeded contributor's address carries
 * app + scenario + run), and every silence claim (S4's contributor still
 * being added, S8's verified submitter and toggle-off journal) rides on a
 * positive control delivered by the same queue drain.
 */
const {test, expect} = require('../../support/fixtures.js');
const {
    AboutOrcidPage,
    openContributors,
    openContributorEditor,
    orcidField,
    requestVerification,
    REQUESTED_TEXT,
} = require('../../pages/OrcidPages.js');
const {ContributorsPanel} = require('../../pages/ContributorPages.js');
const {WorkflowPage, DecisionPage} = require('../../pages/ReviewStagePages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** Rule 14's subject lines: the public-API request and the member-API one. */
const PUBLIC_SUBJECT = 'Submission ORCID';
const MEMBER_SUBJECT = 'Requesting ORCID record access';

/**
 * The two links both templates carry. The labels differ in wording between
 * the templates ("Register or connect your ORCID iD" / "Register or Connect
 * your ORCID iD"; "More information about ORCID" / "More about ORCID at
 * {journal}"), so the matchers accept either.
 */
const AUTH_LINK = /Register or connect your ORCID iD/i;
const ABOUT_LINK = /More (information )?about ORCID/;

/** A seedable test iD (ORCID's own example iD, sandbox-hosted). */
const TEST_ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

/** Unique per-run tag: single alphanumeric token, carries app + scenario. */
function makeTag(scenario, testInfo) {
    return `u4${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The journal's principal contact as fn-s seeds it. */
function contactFor(tag) {
    return {contactName: `ORCID Contact ${tag}`, contactEmail: `contact-${tag}@mail.test`};
}

// Re-enabled 2026-08-26 (maintainer): the dead-port proxy + sandbox-only dummy
// credentials stand — no real ORCID traffic is possible from these tests
// (see header); S2's popup asserts the sandbox URL only, without driving it.
test.describe('ORCID integration (queued email)', () => {
    test('S4: "Request verification" emails the contributor an authorization link @solo', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        // Two journals: the public-API one (the "Submission ORCID" template)
        // and a Member Sandbox one (the "Requesting ORCID record access"
        // template), each with a principal contact of its own (Rule 14).
        const tag = makeTag('s4', testInfo);
        const tagMember = makeTag('s4m', testInfo);
        const seedFor = async (journal, orcid) => {
            await ojsApi.createContext({
                tag: journal,
                context: contactFor(journal),
                users: [
                    {username: `mgr${journal}`, roles: ['manager']},
                    {username: `aut${journal}`, roles: ['author']},
                ],
                orcid,
            });
            const {submissionId} = await ojsApi.createSubmission({
                tag: journal,
                context: journal,
                submitter: `aut${journal}`,
            });
            return submissionId;
        };
        const submissionId = await seedFor(tag, {});
        const memberSubmissionId = await seedFor(tagMember, {apiType: 'memberSandbox'});
        const manager = `mgr${tag}`;
        const author = `aut${tag}`;
        const recipient = `${author}@mail.test`; // seeded contributor address
        const memberRecipient = `aut${tagMember}@mail.test`;
        const novaRecipient = `nova-${tag}@mail.test`; // the contributor being added

        const managerContext = await asUser(manager);
        const managerPage = await managerContext.newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        await openContributors(managerPage);
        let modal = await openContributorEditor(managerPage, author);

        // No iD → "Request verification"; the confirm dialog carries the
        // Rule 8 question; confirming flips the field to the requested state
        // on the open form, with the "Resend Verification Email" link beside
        // it.
        let field = orcidField(modal);
        await requestVerification(managerPage, field);
        await expect(field).toContainText(REQUESTED_TEXT);
        await expect(field.getByText('Resend Verification Email')).toBeVisible();
        await expect(field.getByRole('button', {name: 'Request verification'})).toHaveCount(0);

        // Save; the requested state persists on reopen. (The seeded
        // auto-author carries no country and the form requires one — filling
        // it is form furniture, not the behavior under test.)
        await modal.locator('#contributor-country-control').selectOption({label: 'Canada'});
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(modal).toHaveCount(0);
        modal = await openContributorEditor(managerPage, author);
        field = orcidField(modal);
        await expect(field).toContainText(REQUESTED_TEXT);
        await expect(field.getByText('Resend Verification Email')).toBeVisible();
        await modal.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(modal).toHaveCount(0);

        // A contributor being added: Given Name Nova, a throwaway address,
        // Country Canada (the "Author" role box is the form's own required
        // furniture). "Request verification" on the new form adds "The email
        // will be sent once the author has been created." to the dialog;
        // confirming is remembered and nothing is posted until the save.
        const panel = new ContributorsPanel(managerPage);
        const addDialog = await panel.openAdd();
        await panel.fillPerson(addDialog, {given: 'Nova', email: novaRecipient, country: 'Canada'});
        await panel.tickRole(addDialog, 'Author');
        const novaField = orcidField(addDialog);
        await requestVerification(managerPage, novaField, {saved: false});
        await expect(novaField).toContainText(REQUESTED_TEXT);

        // The member-API journal: the same request on the second journal's
        // contributor, as its own Journal Manager.
        const memberPage = await (await asUser(`mgr${tagMember}`)).newPage();
        const memberWorkflow = new WorkflowPage(memberPage, tagMember);
        await memberWorkflow.gotoEditorial(memberSubmissionId);
        await openContributors(memberPage);
        const memberModal = await openContributorEditor(memberPage, `aut${tagMember}`);
        await requestVerification(memberPage, orcidField(memberModal));

        // The mail is queued-job mail: one drain delivers both saved
        // contributors' requests. Nova's form is still open and unsaved, so
        // the same drain carries nothing for the new address.
        runJobs();

        // The contributor's mailbox: "Submission ORCID" on the public-API
        // journal, from the journal's principal contact, with the personal
        // authorization link (leading to ORCID's site) and the What-is-ORCID
        // link (Rule 14).
        const summary = await pkpMail.find({to: recipient, subject: PUBLIC_SUBJECT});
        expect(summary.From.Address).toBe(`contact-${tag}@mail.test`);
        expect(summary.From.Name).toBe(`ORCID Contact ${tag}`);
        const full = await pkpMail.fullMessage(summary.ID);
        const authLink = pkpMail.extractLink(full.HTML, AUTH_LINK);
        expect(authLink).toContain('sandbox.orcid.org'); // leads to ORCID's (sandbox) site
        const aboutLink = pkpMail.extractLink(full.HTML, ABOUT_LINK);
        expect(aboutLink).toContain(`/${tag}/orcid/about`);
        // Recorded, never followed: OAuth cannot complete from this install.

        // The member-API journal's contributor: "Requesting ORCID record
        // access" instead, the same two links, from that journal's contact.
        const memberSummary = await pkpMail.find({to: memberRecipient, subject: MEMBER_SUBJECT});
        expect(memberSummary.From.Address).toBe(`contact-${tagMember}@mail.test`);
        expect(memberSummary.From.Name).toBe(`ORCID Contact ${tagMember}`);
        const memberFull = await pkpMail.fullMessage(memberSummary.ID);
        expect(pkpMail.extractLink(memberFull.HTML, AUTH_LINK)).toContain(
            'sandbox.orcid.org'
        );
        const memberAboutLink = pkpMail.extractLink(memberFull.HTML, ABOUT_LINK);
        expect(memberAboutLink).toContain(`/${tagMember}/orcid/about`);
        expect(await pkpMail.count({to: memberRecipient, subject: PUBLIC_SUBJECT})).toBe(0);
        expect(await pkpMail.count({to: recipient, subject: MEMBER_SUBJECT})).toBe(0);

        // The new address's mailbox holds nothing: the silence is bounded by
        // the two request emails the same drain delivered.
        await pkpMail.expectNone({
            to: novaRecipient,
            afterControl: {to: memberRecipient, subject: MEMBER_SUBJECT},
        });
        expect(await pkpMail.count({to: novaRecipient})).toBe(0);

        // The What-is-ORCID link in each email: each journal's page renders,
        // and the member-API journal's "How and why" section differs from
        // the public-API journal's (Rule 10).
        const aboutPage = new AboutOrcidPage(await managerContext.newPage(), tag);
        await aboutPage.gotoLink(aboutLink);
        await expect(aboutPage.page.getByText(`Scratch context ${tag}`).first()).toBeVisible();
        const publicText = await aboutPage.howAndWhyText();
        const memberAboutPage = new AboutOrcidPage(aboutPage.page, tagMember);
        await memberAboutPage.gotoLink(memberAboutLink);
        await expect(aboutPage.page.getByText(`Scratch context ${tagMember}`).first()).toBeVisible();
        const memberText = await memberAboutPage.howAndWhyText();
        expect(memberText).not.toBe(publicText);
        expect(memberText).toContain('publication metadata will automatically be pushed to your ORCID record');
        expect(publicText).not.toContain('publication metadata will automatically be pushed');

        // Control: save the new contributor; the request that waited for the
        // save leaves now, and after a drain the address's mailbox holds it.
        await panel.savePanel(addDialog);
        await expect(panel.row('Nova')).toBeVisible({timeout: 30_000});
        runJobs();
        const novaSummary = await pkpMail.find({to: novaRecipient, subject: PUBLIC_SUBJECT});
        expect(novaSummary.From.Address).toBe(`contact-${tag}@mail.test`);
        const novaFull = await pkpMail.fullMessage(novaSummary.ID);
        expect(pkpMail.extractLink(novaFull.HTML, AUTH_LINK)).toContain(
            'sandbox.orcid.org'
        );
    });

    test('S8: accepting a submission emails contributors only while the toggle is on', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tagOn = makeTag('s8n', testInfo);
        const tagOff = makeTag('s8f', testInfo);
        const verified = `ver${tagOn}`; // the second submission's submitter, iD verified (seeded)
        const seedFor = async (tag, sendMail) => {
            await ojsApi.createContext({
                tag,
                users: [
                    {username: `mgr${tag}`, roles: ['manager']},
                    {username: `aut${tag}`, roles: ['author']},
                    ...(tag === tagOn ? [{username: verified, roles: ['author']}] : []),
                ],
                orcid: {sendMailToAuthorsOnPublication: sendMail},
            });
            const {submissionId} = await ojsApi.createSubmission({
                tag,
                context: tag,
                submitter: `aut${tag}`,
                decisions: ['sendExternalReview'],
            });
            return submissionId;
        };
        const subOn = await seedFor(tagOn, true);
        const subOff = await seedFor(tagOff, false);
        // The toggle-on journal's second submission: its submitter's
        // contributor record holds a verified iD with the live access token
        // the OAuth flow stores (the seed's `author` key, 2026-09-13).
        const {submissionId: subVerified} = await ojsApi.createSubmission({
            tag: `${tagOn}v`,
            context: tagOn,
            submitter: verified,
            decisions: ['sendExternalReview'],
            author: {orcid: TEST_ORCID, orcidIsVerified: true},
        });

        // Record Accept on the three submissions in review (Rule 13's trigger).
        const accept = async (tag, submissionId) => {
            const managerPage = await (await asUser(`mgr${tag}`)).newPage();
            const workflow = new WorkflowPage(managerPage, tag);
            await workflow.gotoEditorial(submissionId);
            await workflow.decisionButton('Accept Submission').click();
            const decision = new DecisionPage(managerPage);
            await decision.expectOpen('Accept Submission');
            await decision.completeAll();
        };
        await accept(tagOn, subOn);
        await accept(tagOn, subVerified);
        await accept(tagOff, subOff);

        // One queue drain delivers everything the three accepts enqueued.
        runJobs();

        // Toggle on: the contributor without a verified iD receives the
        // Rule 14 request email ("Submission ORCID" under the public API),
        // carrying the personal authorization link.
        const onRecipient = `aut${tagOn}@mail.test`;
        const summary = await pkpMail.find({to: onRecipient, subject: PUBLIC_SUBJECT});
        const full = await pkpMail.fullMessage(summary.ID);
        expect(pkpMail.extractLink(full.HTML, AUTH_LINK)).toContain(
            'sandbox.orcid.org'
        );

        // A contributor already verified: nothing arrives for the verified
        // submitter's address (Rule 13) — the first submission's email from
        // the SAME drain is the positive control, and the decision's own
        // notify-authors mail the same-recipient one.
        const verifiedRecipient = `${verified}@mail.test`;
        await pkpMail.find({to: verifiedRecipient, contains: 'accepted'});
        await pkpMail.expectNone({
            to: verifiedRecipient,
            subject: PUBLIC_SUBJECT,
            afterControl: {to: onRecipient, subject: PUBLIC_SUBJECT},
        });

        // Toggle off (control): the same accept sends no request email — the
        // silence is bounded by the toggle-on request mail from the SAME
        // drain, and the off-journal contributor still got the decision's own
        // notify-authors mail (same-recipient positive control).
        const offRecipient = `aut${tagOff}@mail.test`;
        await pkpMail.find({to: offRecipient, contains: 'accepted'});
        await pkpMail.expectNone({
            to: offRecipient,
            subject: PUBLIC_SUBJECT,
            afterControl: {to: onRecipient, subject: PUBLIC_SUBJECT},
        });
    });
});

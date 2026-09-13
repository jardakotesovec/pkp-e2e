// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * My Submissions (author dashboard) — OPS suite, one test per canonical
 * scenario the spec runs on OPS (the common scenarios 1–3 and 5 in OPS
 * vocabulary — preprint server, preprint, Moderator, "Production" as every
 * live preprint's stage — plus ONE absence test for scenario 4, which is
 * {OJS OMP}: a preprint server has no review, so its author sidebar carries
 * four views and no row ever offers "Submit revisions").
 * Spec: docs/specs/U22-my-submissions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): OPS2 🐞
 * (S2 stops at the confirm dialog's OFFER and takes the Cancel path; neither
 * a successful deletion nor the refusal is asserted, so the two {OJS OMP}
 * bullets after the confirm step do not run here), OPS1 ❓ (S2 and the
 * absence test assert the spec's current OPS text — drafts under "Active
 * submissions" with a "Production" bubble, no "Incomplete submissions" view
 * — and move with the spec if the ruling flips), A3 ❓ (S3's "Scheduled for
 * publication (0)" is arithmetic over its own seeding, not a claim that no
 * feeder exists), A1 ❓, A2 ❓, A4 ❓, A5 ❓ (S1's old link points at a
 * submitted preprint only), OMP1 ❓. The spec's Coverage section records
 * everything else left out.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S1 and the absence test ride author.alex's own rows in
 * publicknowledge, scoped by tag search (S1 signs author.bea and
 * manager.maya in through the fixture for its two denial legs); S2, S3 and
 * S5 isolate on scratch preprint servers with throwaway accounts (sidebar
 * badge counts and landings need a list only the test controls). S2 seeds
 * its resume step through the wizard's own "Save for Later" (spec fn-s2:
 * the wizard resumes only at a SAVED step, and the scenario API has no
 * saved-step key). The sign-in fixture caches cookies at the site login and
 * asserts nothing about where sign-in lands, so S1's and S5's landings are
 * read through the retired `{server}/submissions` address, which forwards
 * the same way (fn-s1, fn-s5). Mailpit reads (S2, S3) are scoped by the
 * throwaway author's address (PRINCIPLES A8) and taken as a before/after
 * count settled by the scenario's own list reads. Waits are event-based
 * (auto-wait on rows, headings, badges, dialogs and the landing URL); no
 * hard-coded sleeps. Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
// The OPS extension of the shared POM: same list mechanics, OPS-shaped
// workflow-panel anchors (the author panel has no "Workflow:" heading) and
// OPS's own label for the editors' assignment filter.
const {MySubmissionsPage} = require('../pages/MySubmissionsPage.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {
    expectWizardOpen,
    expectStep,
    STEPS,
    wizardUrl,
    saveForLaterAt,
} = require('../pages/SubmissionWizardPages.js');

const SERVER = 'publicknowledge';
const DAYS_FILTER = 'Days since last activity';

/** The OPS author's whole view roster (spec Rule 2), in sidebar order. */
const OPS_VIEWS = [
    'Active submissions',
    'Scheduled for publication',
    'Published',
    'Declined',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

test.describe('my submissions', () => {
    test('S1: track and open a preprint', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Production" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view, with the "My Submissions as Author" group in
        // the sidebar (Rules 1, 3) — read through the retired
        // submission-list address, which forwards to the same list (fn-s1).
        const page = await (await asUser('author.alex')).newPage();
        const mySub = new MySubmissionsPage(page, SERVER);
        await mySub.gotoRetiredListAddress();
        await mySub.expectLanded();

        // The row shows the preprint's ID, the authors-and-title line, and
        // its current stage in a bubble — on a preprint server every live
        // preprint sits at Production (Rule 4, fn-d); its Editorial
        // Activity cell is empty while the preprint awaits the editorial
        // team's first move (Rule 7e; the Stage cell's text is the positive
        // control that the row's cells are being read).
        const row = await mySub.findRowByTag(tag);
        await expect(row).toContainText(String(submissionId));
        await expect(row).toContainText(`arta${tag}`);
        await expect(row).toContainText('Author');
        await expect(mySub.stageCell(row)).toHaveText(/^\s*Production\s*$/);
        await expect(mySub.activityCell(row)).toHaveText(/^\s*$/);

        // "View" opens the workflow as a panel over the list; the address
        // records which submission is open (Rule 8).
        const urlBefore = page.url();
        await mySub.viewButton(row).click();
        await mySub.expectWorkflowOpen();
        expect(page.url()).toContain(`workflowSubmissionId=${submissionId}`);

        // Close it — the list is back at the exact address it left.
        await mySub.closeWorkflow();
        await expect(row).toBeVisible();
        expect(page.url()).toBe(urlBefore);

        // The old author-dashboard link: My Submissions opens with that
        // preprint's workflow panel already open (Rule 3); no refusal.
        await mySub.gotoOldAuthorDashboardLink(submissionId);
        await page.waitForURL(
            (url) =>
                url.pathname.includes('/dashboard/mySubmissions') &&
                url.searchParams.get('workflowSubmissionId') === String(submissionId),
            {waitUntil: 'commit', timeout: 30_000}
        );
        await mySub.expectWorkflowOpen();
        await expect(mySub.workflowDialog()).toContainText(`arta${tag}`);
        await expect(mySub.workflowDialog()).toContainText(String(submissionId));
        await expect(mySub.workflowAccessDenied()).toHaveCount(0);
        await mySub.closeWorkflow();

        // The same link in a second author's browser: an access-denied page
        // and no workflow panel (Rule 3; the owner's open panel above is
        // the positive control).
        const beaPage = await (await asUser('author.bea')).newPage();
        const beaSub = new MySubmissionsPage(beaPage, SERVER);
        await beaSub.gotoOldAuthorDashboardLink(submissionId);
        await expect(beaSub.workflowAccessDenied()).toBeVisible({timeout: 30_000});
        await expect(beaSub.workflowNavEntry()).toHaveCount(0);
        await expect(beaPage.getByRole('dialog')).toHaveCount(0);

        // Control: a Preprint Server Manager who does not author types the
        // list's address: the access-denied page, no list, no sidebar
        // (Actors row 1; the author's list above is the positive control).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerSub = new MySubmissionsPage(managerPage, SERVER);
        await managerPage.goto(managerSub.url());
        await expect(managerSub.accessDenied()).toBeVisible({timeout: 30_000});
        await expect(managerPage.getByRole('heading', {name: /^Active submissions/})).toHaveCount(0);
        await expect(managerSub.sideNav()).toHaveCount(0);
        await expect(managerPage.getByRole('table')).toHaveCount(0);
    });

    test('S2: resume drafts and the deletion flow up to its confirm dialog', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch preprint server so the list and its badges hold only this
        // test's rows: two drafts and one submitted control.
        const author = `${tag}au`;
        const mailTo = `${author}@mail.test`;
        await opsApi.createContext({
            tag,
            users: [user(author, 'Ada', 'Author', ['author'])],
        });
        const draftA = await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        const draftB = await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `subm${tag}`,
        });

        // fn-s2 seeding: give draftA a deterministic resume step — the wizard
        // resumes at the last step saved with "Save for Later"; a step merely
        // continued past is not remembered (Rule 6), and the scenario API has
        // no saved-step knob. Walk draftA's wizard to Details and save there.
        const page = await (await asUser(author)).newPage();
        await page.goto(wizardUrl(tag, draftA.submissionId));
        await expectWizardOpen(page);
        await expectStep(page, STEPS.files);
        await saveForLaterAt(page, STEPS.details);

        // The author's mailbox before anything is done from the list (the
        // list sends nothing, Side effects: a before/after count).
        const mailBefore = await pkpMail.count({to: mailTo});

        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // OPS1, asserted as the spec's current text: there is no "Incomplete
        // submissions" view, so the drafts sit under "Active submissions"
        // alongside the submitted row (the roster itself is the absence
        // test's territory); each draft row wears the "Production" stage
        // bubble, offers "Complete submission" and has no "View" — its
        // Actions cell is empty (Rules 2, 4, 6). The submitted row's "View"
        // is the positive control for the no-"View" claim.
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.expectViewCount('Active submissions', 3);
        for (const title of [`drafta${tag}`, `draftb${tag}`]) {
            const row = mySub.row(title);
            await expect(row).toBeVisible();
            await expect(mySub.stageCell(row)).toHaveText(/^\s*Production\s*$/);
            await expect(mySub.completeSubmissionButton(row)).toBeVisible();
            await expect(mySub.viewButton(row)).toHaveCount(0);
            await expect(mySub.actionsCell(row)).toHaveText(/^\s*$/);
            await expect(mySub.actionsCell(row).getByRole('button')).toHaveCount(0);
        }
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();
        await expect(mySub.completeSubmissionButton(mySub.row(`subm${tag}`))).toHaveCount(0);

        // "Complete submission" on the saved draft reopens the submission
        // wizard at the step last saved with "Save for Later" — Details,
        // saved above (Rule 6).
        await mySub.completeSubmissionButton(mySub.row(`drafta${tag}`)).click();
        await expectWizardOpen(page);
        await expectStep(page, STEPS.details);
        expect(page.url()).toContain(`id=${draftA.submissionId}`);

        // Return to the list; "Complete submission" on the other draft, only
        // to note the address its wizard opens at; return again. (Opening
        // that address after a delete is a {OJS OMP} bullet: no draft is
        // deleted on a preprint server, OPS2.)
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.completeSubmissionButton(mySub.row(`draftb${tag}`)).click();
        await expectWizardOpen(page);
        const draftBWizardAddress = page.url();
        expect(draftBWizardAddress).toContain(`submission?id=${draftB.submissionId}`);

        // "Active submissions": draft and submitted rows sit together (Rule
        // 2; on a preprint server the drafts have no second view to appear
        // in, OPS1).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 3);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toBeVisible();
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();

        // "More Actions" → "Delete Incomplete Submissions": selection mode
        // (Rule 9 — the flow is offered end to end on a preprint server; the
        // confirm press itself is register 🐞 OPS2 and is never taken).
        // Checkboxes appear on draft rows only — the submitted row gets none
        // (positive control: both draft rows carry one) — and the delete
        // button stays disabled until something is selected.
        await mySub.enterBulkDeleteSelection();
        await expect(mySub.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.bulkDeleteButton()).toBeDisabled();

        // Tick the other draft — the delete button enables — and press it:
        // the "Confirm Delete of Incomplete Submissions" dialog offers
        // "Confirm" and "Cancel", the offer the spec states plainly.
        await mySub.checkRowCheckbox(mySub.row(`draftb${tag}`));
        await expect(mySub.bulkDeleteButton()).toBeEnabled();
        await mySub.bulkDeleteButton().click();
        const dialog = mySub.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone.'
        );
        await expect(dialog.getByRole('button', {name: 'Confirm', exact: true})).toBeVisible();

        // Cancel in the dialog leaves selection mode entirely — ticks
        // dropped, nothing deleted (Rule 9): the selection-mode buttons and
        // checkboxes are gone, both drafts still listed, counts unchanged.
        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        await expect(mySub.bulkDeleteButton()).toHaveCount(0);
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toBeVisible();
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.expectViewCount('Active submissions', 3);

        // Control: the submitted row had no checkbox and is still listed
        // after the flow, its "View" intact (Actors row 6, Rule 9); the
        // author's mailbox holds what it held before (Side effects; the
        // count is settled by the list reads above).
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();
        expect(await pkpMail.count({to: mailTo})).toBe(mailBefore);
    });

    test('S3: browse the views and search', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        // A scratch preprint server (badge counts need a list only this test
        // feeds) with a throwaway author: two posted preprints and one
        // declined (the decline is the whole OPS decision roster's negative
        // outcome; continuous posting needs no issue), beside a second
        // throwaway author's submitted preprint as the control (fn-s3). The
        // Copyediting and issue-scheduled rows are {OJS OMP} / {OJS}.
        const author = `${tag}au`;
        const mailTo = `${author}@mail.test`;
        const other = `${tag}bu`;
        await opsApi.createContext({
            tag,
            users: [
                user(author, 'Vera', 'Views', ['author']),
                user(other, 'Otto', 'Other', ['author']),
            ],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `puba${tag}`, published: true,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `pubb${tag}`, published: true,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl${tag}`,
            decisions: ['decline'],
        });
        const otherTitle = `other${tag}`;
        await opsApi.createSubmission({
            tag, context: tag, submitter: other, title: otherTitle,
        });

        const mailBefore = await pkpMail.count({to: mailTo});
        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // Walk the sidebar's view entries — OPS's four (Rules 1, 2): each
        // opens the list under that view's heading with its count (pinned
        // after the switch: the heading renames before the rows refetch),
        // and the entry's badge carries the same number. In every view the
        // other author's preprint is absent, read once the view's own rows
        // (or its "No Items") are on screen (Actors row 2).
        const views = [
            ['Active submissions', 0, null],
            ['Scheduled for publication', 0, null],
            ['Published', 2, `puba${tag}`],
            ['Declined', 1, `decl${tag}`],
        ];
        for (const [name, count, expectedRow] of views) {
            await mySub.openView(name);
            await mySub.expectViewHeading(name, count);
            await mySub.expectViewCount(name, count);
            if (expectedRow) {
                await expect(mySub.row(expectedRow)).toBeVisible({timeout: 30_000});
            } else {
                await expect(mySub.emptyState()).toBeVisible({timeout: 30_000});
            }
            await expect(mySub.row(otherTitle)).toHaveCount(0);
        }

        // The posted preprints under "Published" (Rule 2).
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await expect(mySub.row(`puba${tag}`)).toBeVisible();
        await expect(mySub.row(`pubb${tag}`)).toBeVisible();

        // The declined one under "Declined", with its "Declined" stage
        // bubble and an empty Editorial Activity cell (Rules 2, 4, 7e; the
        // Stage cell's text is the positive control that the row's cells
        // are being read).
        await mySub.openView('Declined');
        await mySub.expectViewHeading('Declined', 1);
        const declRow = mySub.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(mySub.stageCell(declRow)).toHaveText(/^\s*Declined\s*$/);
        await expect(mySub.activityCell(declRow)).toHaveText(/^\s*$/);

        // A view holding nothing shows "No Items" (Rule 4; fn-s3 names
        // "Active submissions" on a preprint server after this seeding).
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(mySub.emptyState()).toBeVisible();

        // Search narrows the current view to the typed title; the heading
        // keeps the view's name and count (Rule 5).
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await mySub.searchFor(`puba${tag}`);
        await expect(mySub.row(`puba${tag}`)).toBeVisible({timeout: 30_000});
        await expect(mySub.row(`pubb${tag}`)).toHaveCount(0);
        await mySub.expectViewHeading('Published', 1);

        // "Filters": on a scratch server (one section, no categories, no
        // issues) the panel offers the days-since-last-activity filter
        // alone; the section filter needs more than one section, and the
        // editors' assignment filter, under either of its labels, is not
        // among the fields (Rule 5; the present field is the positive
        // control).
        const filters = await mySub.openFilters();
        await expect(mySub.filterField(DAYS_FILTER)).toBeVisible();
        await expect(filters.getByRole('slider', {name: DAYS_FILTER})).toBeVisible();
        for (const label of mySub.editorAssignmentFilterLabels()) {
            await expect(mySub.filterField(label)).toHaveCount(0);
            await expect(filters.getByRole('combobox', {name: label})).toHaveCount(0);
        }
        await expect(mySub.assignedToModeratorField()).toHaveCount(0);
        await expect(mySub.filterField('Section')).toHaveCount(0);
        await expect(mySub.filterField('Categories')).toHaveCount(0);
        await expect(mySub.filterField('Issues')).toHaveCount(0);
        await mySub.closeFilters();

        // The author's mailbox: nothing arrived through any of the above
        // (Side effects): the count is the one taken before the walk.
        expect(await pkpMail.count({to: mailTo})).toBe(mailBefore);

        // Control: the other author's preprint is listed under none of the
        // views (the walk above), and searching its title on "Active
        // submissions" finds no row (Actors row 2, Rule 5; the search of the
        // author's own posted title above is the positive control).
        await mySub.openView('Active submissions');
        await mySub.searchFor(otherTitle);
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(mySub.emptyState()).toBeVisible({timeout: 30_000});
        await expect(mySub.row(otherTitle)).toHaveCount(0);
    });

    test('S4 absence {OPS}: reduced view roster, no revisions surface', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // Scenario 4 ("Act on a revision request") is {OJS OMP} — a preprint
        // server has no review, so it has no analogue here (spec Rule 2 /
        // OPS1). One submitted preprint gives every silence its positive
        // control row.
        await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: 'author.alex',
            title: `abs${tag}`,
        });

        const page = await (await asUser('author.alex')).newPage();
        const mySub = new MySubmissionsPage(page, SERVER);
        await mySub.goto();

        // The sidebar's author group carries exactly OPS's four views
        // (positive controls, asserted first so the absences are bounded by
        // a rendered menu)…
        await mySub.openView('Active submissions');
        for (const name of OPS_VIEWS) {
            await expect(mySub.viewLink(name)).toBeVisible();
        }
        // …and none of the three views a journal's author would have: no
        // revisions views (no review stage) and no "Incomplete submissions"
        // (OPS1 — drafts sit inside "Active submissions", S2).
        await expect(mySub.viewLink('Revisions requested')).toHaveCount(0);
        await expect(mySub.viewLink('Revisions submitted')).toHaveCount(0);
        await expect(mySub.viewLink('Incomplete submissions')).toHaveCount(0);

        // A submitted preprint's row offers "View" (positive control) and no
        // revisions affordance of any kind — no "Submit revisions" button,
        // no "Revision requested" alert (Rule 7a is {OJS OMP}).
        const row = await mySub.findRowByTag(tag);
        await expect(mySub.viewButton(row)).toBeVisible();
        await expect(mySub.submitRevisionsButton(row)).toHaveCount(0);
        await expect(row.getByText('Revision requested')).toHaveCount(0);
    });

    test('S5: landing for an account holding other roles too', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // A scratch preprint server with the one two-role account a
        // preprint server can hold — Author and Section Editor, OPS's
        // `sectionEditor` key being the Moderator group — and the
        // author-only control (fn-s5; the two Reviewer combinations are
        // {OJS OMP}: OPS has no reviewer key). Each session is cached at the
        // site login by the fixture, so every landing is read through the
        // retired list address, which forwards the same way (Rule 3).
        const authorModerator = `${tag}am`;
        const authorOnly = `${tag}ao`;
        await opsApi.createContext({
            tag,
            users: [
                user(authorModerator, 'Abe', 'Authormod', ['author', 'sectionEditor']),
                user(authorOnly, 'Ada', 'Authonly', ['author']),
            ],
        });

        // Author and Section Editor (Moderator): the browser lands on the
        // Dashboard, its "Assigned to me" view under the "Editor Dashboard"
        // group, with the "My Submissions as Author" group still in the
        // sidebar (Rule 3).
        const amPage = await (await asUser(authorModerator)).newPage();
        const amSub = new MySubmissionsPage(amPage, tag);
        const amDash = new EditorialDashboardPage(amPage, tag);
        await amSub.gotoRetiredListAddress();
        await amDash.expectLanded(0);
        await expect(amSub.menuGroupLink()).toBeVisible();

        // Control: the author-only account lands on My Submissions, as in
        // scenario 1 (Rule 3) — its sidebar carries the author group and no
        // "Editor Dashboard" group (the two-role sidebar above is the
        // positive control for that absence).
        const aoPage = await (await asUser(authorOnly)).newPage();
        const aoSub = new MySubmissionsPage(aoPage, tag);
        const aoDash = new EditorialDashboardPage(aoPage, tag);
        await aoSub.gotoRetiredListAddress();
        await aoSub.expectLanded(0);
        await expect(aoDash.menuGroupLink()).toHaveCount(0);
        await expect(aoSub.sideNav()).not.toContainText('Editor Dashboard');
    });
});

// @ts-check
/**
 * @file playwright/tests/U17-sections.spec.js
 *
 * Sections — OJS suite, one test per canonical scenario the spec runs on a
 * journal: S1–S5 (common to OJS and OPS; S1 carries the {OJS} "Review
 * Form" bullet). S6 is the preprint server's (OPS suite), S7 the press's
 * (OMP suite).
 * Spec: docs/specs/U17-sections.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A6 🐞: S1 types an abbreviation of spaces, never a title of spaces.
 * - A1, A7 🐞: S5 reads the words of the "Make a new submission to the
 *   {section} section." lines and that the section's name is a link, never
 *   where the link leads; no inactive section's line is read.
 * - A8 🐞: no test ticks "Disable Submissions".
 * - A2, A3 ❓: no test saves a "Word Count" or ticks the indexing box.
 * - A4, A5 ❓: no screen sends those requests.
 * - OMP1–OMP9, OPS1–OPS6: the press's and the preprint server's, in those
 *   trees.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are only read. Every scenario runs on its own scratch journal with
 * throwaway accounts (the username twice as password), as footnote s says:
 * the sections from `sections[]` (the first entry renaming "Articles"),
 * S1 without it; S1 a Section Editor "Sam Section", an Editor "Eve Editor",
 * a Production Editor "Pia Production", a Reviewer "Rex Reviewer", the
 * active review form "Structured Review" (`reviewForms[]`) and "Tidal
 * Patterns" at Review (`decisions`); S3 and S4 "Tidal Patterns" submitted
 * in "Reviews" and in no issue; S4 "Sam Section" ticked under "Essays"
 * (`users[].sections`) and one published issue (`issues[]`: without it
 * "Publication Settings" holds no issue choice, footnote s). "Inactive",
 * the editor-only box and "Review Form" have no key and are set on
 * screen, as the scenarios do. The visitor is a browser context with an
 * empty storage state (patterns.md, parallel lesson 8); every signed-in
 * actor gets its own `asUser` context. Every absence is read settled and
 * paired with a positive control taken the same way (M4, M6): the
 * header's links read as a whole list, the table's and the page's rows
 * and blocks as whole lists, a missing notice after a response that would
 * have carried it, beside a notice the same scenario reads the same way.
 * Everything here runs in the parallel `ojs` project.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {
    SectionsTab,
    SubmissionsPage,
    notices,
    markNotices,
    expectNoticeTopRight,
    startFormSections,
} = require('../../../../shared/playwright/pages/SectionsPages.js');
const {PublicationScreen} = require('../pages/PublicationMetadataPages.js');
const {StartSubmissionPage} = require('../pages/SubmissionWizardPage.js');
const {
    WorkflowPage,
    openAddReviewerModal,
    selectReviewer,
    reviewFormSelect,
} = require('../pages/ReviewStagePages.js');

const REQUIRED = 'This field is required.';
const SAVED = 'Your changes have been saved.';
const ABBREV_SPACES = 'An abbreviated title is required for the section (English)';
const LAST_ACTIVE =
    'At least one section must be active. Visit the workflow settings to disable all submissions to this journal.';
const IN_USE = 'Before this section can be deleted, you must move articles submitted to it into other sections.';
const DEACTIVATE_QUESTION = 'Are you sure you wish to deactivate this section?';
const ACTIVATE_QUESTION = 'Are you sure you wish to activate this section?';
const DELETE_QUESTION = 'Are you sure you want to permanently delete this section?';
const INACTIVE_BOX = 'Mark this section as inactive and do not allow new submissions to be made to it.';
const EDITORS_ONLY_BOX = 'Items can only be submitted by Editors and Section Editors.';
const ASSIGNMENTS_SENTENCE =
    'Select the editorial users who should be assigned automatically to all new submissions to this section.';
const NOT_ACCEPTING = 'This journal is not accepting submissions at this time.';
const SIGNED_IN_INVITATION = 'Make a new submission or view your pending submissions.';
const NO_FORM = 'None / Free Form Review';
const FORM = 'Structured Review';
const EVE_BOX = 'Assign Eve Editor as Journal editor';
const SAM_BOX = 'Assign Sam Section as Section editor';

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u17${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles, extra = {}) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles, ...extra};
}

/** A `sections[]` entry. */
function section(abbrev, title, policy) {
    return policy ? {abbrev, title, policy} : {abbrev, title};
}

/**
 * A scratch journal with a throwaway Journal Manager (`${tag}mg`) and
 * Author (`${tag}au`), plus `extra` accounts and context keys.
 */
async function seedJournal(ojsApi, tag, {extra = [], ...keys} = {}) {
    await ojsApi.createContext({
        tag,
        users: [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra],
        ...keys,
    });
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/** "Tidal Patterns", submitted by the Author into the section `abbrev`. */
async function seedArticle(ojsApi, tag, author, abbrev, extra = {}) {
    const {submissionId} = await ojsApi.createSubmission({
        tag,
        context: tag,
        submitter: author,
        title: 'Tidal Patterns',
        section: abbrev,
        ...extra,
    });
    return submissionId;
}

/**
 * A page of an actor's own signed-in browser context. A browser question
 * on leaving a page is accepted (a later `goto` is the scenario's own step).
 */
async function actorPage(asUser, username) {
    const page = await (await asUser(username)).newPage();
    page.on('dialog', (dialog) => (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()));
    return page;
}

/** The "Section" list of the article's "Publication Settings" page. */
function sectionList(page) {
    return page.getByRole('group', {name: 'Placement'}).getByRole('combobox', {name: 'Section'});
}

test.describe('Sections', () => {
    test('S1: Create and edit a section', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            extra: [
                user(`${tag}se`, 'Sam', 'Section', ['sectionEditor']),
                user(`${tag}ed`, 'Eve', 'Editor', ['editor']),
                user(`${tag}pe`, 'Pia', 'Production', ['productionEditor']),
                user(`${tag}rv`, 'Rex', 'Reviewer', ['externalReviewer']),
            ],
            reviewForms: [{title: FORM, elements: [{question: 'Comments', type: 'textarea'}]}],
        });
        const submissionId = await seedArticle(ojsApi, tag, author, 'ART', {decisions: ['sendExternalReview']});
        const page = await actorPage(asUser, manager);
        const tab = new SectionsTab(page, tag);
        const policies = new SubmissionsPage(visitor, tag);

        // The tab with one section: the heading, "Create Section" at the
        // top right and no "Order" (the header's links as a whole list), the
        // three columns, one row "Articles", "None", unticked (Fields, the
        // "Sections" tab; Rule 1).
        await tab.goto();
        await expect(tab.heading()).toBeVisible();
        await expect(tab.headerLinks()).toHaveText(['Create Section']);
        const gridBox = await tab.grid().boundingBox();
        const addBox = await tab.addLink().boundingBox();
        expect(addBox && gridBox && addBox.x > gridBox.x + gridBox.width / 2, '"Create Section" at the right').toBe(true);
        await expect(tab.columnHeaders()).toHaveText(['Title', 'Editors', 'Inactive']);
        await expect(tab.titleCells()).toHaveText(['Articles']);
        await expect(tab.editorsCell('Articles')).toHaveText('None');
        await expect(tab.inactiveBox('Articles')).not.toBeChecked();

        // A save with nothing typed: the window headed "Create Section",
        // "Save" and "Cancel", "Word Count" empty, every "Section Options"
        // box unticked; "Save" posts nothing, the two messages, the window
        // stays (Fields, the section window).
        let win = await tab.openAdd();
        await expect(win.heading()).toHaveText('Create Section');
        await expect(win.saveButton()).toBeVisible();
        await expect(win.cancelLink()).toBeVisible();
        await expect(win.box('wordCount')).toHaveValue('');
        await expect(win.optionBoxes()).toHaveCount(7);
        for (const box of await win.optionBoxes().all()) {
            await expect(box).not.toBeChecked();
        }
        const sent = await win.saveRefusedInPlace(win.fieldError('title[en]'));
        expect(sent, 'nothing posted').toBe(0);
        await expect(win.fieldError('title[en]')).toHaveText(REQUIRED);
        await expect(win.fieldError('abbrev[en]')).toHaveText(REQUIRED);
        await expect(win.heading()).toHaveText('Create Section');

        // An abbreviation of spaces: the notice at the top right, nothing
        // marked under the boxes (the messages above, read the same way,
        // are the control), the window stays open (Fields, "Abbreviation").
        await win.type('title[en]', 'Reviews');
        await win.type('abbrev[en]', ' ');
        const refused = await expectNoticeTopRight(page, ABBREV_SPACES, () => win.save());
        expect(refused.status()).toBe(200);
        await expect(win.visibleErrors()).toHaveCount(0);
        await expect(win.heading()).toHaveText('Create Section');

        // "Editorial Assignments": the sentence, Eve's and Sam's boxes and
        // no other, so none for the Journal Manager or Pia Production
        // (Fields, "Editorial Assignments").
        await expect(win.form()).toContainText(ASSIGNMENTS_SENTENCE);
        await expect(win.checkbox(EVE_BOX)).toBeVisible();
        await expect(win.checkbox(SAM_BOX)).toBeVisible();
        await expect(win.assignmentBoxes()).toHaveCount(2);
        await expect(win.form().getByRole('checkbox', {name: /Mona Manager|Pia Production/})).toHaveCount(0);

        // The new section, last and with no editor: the window closes, the
        // notice, "Reviews" below "Articles", "None", unticked; "Order" now
        // beside "Create Section" (Rule 2; Side effects).
        await win.type('abbrev[en]', 'REV');
        await win.typeRichText('policy[en]', 'Reviews of recent books.');
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveText(['Articles', 'Reviews']);
        await expect(tab.editorsCell('Reviews')).toHaveText('None');
        await expect(tab.inactiveBox('Reviews')).not.toBeChecked();
        await expect(tab.headerLinks()).toHaveText(['Order', 'Create Section']);

        // The visitor's "Submissions" page: "Reviews" last, after
        // "Articles" with "Section default policy" (Rules 1, 12; Settings
        // bullet 3).
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles', 'Reviews']);
        expect(await policies.policyText('Articles')).toBe('Section default policy');
        expect(await policies.policyText('Reviews')).toBe('Reviews of recent books.');

        // Edit: the window headed "Edit" holds the saved values; renamed,
        // Sam ticked, saved: the row reads "Book Reviews", "Sam Section"
        // (Rules 3, 8).
        win = await tab.openEdit('Reviews');
        await expect(win.heading()).toHaveText('Edit');
        await expect(win.box('title[en]')).toHaveValue('Reviews');
        await expect(win.box('abbrev[en]')).toHaveValue('REV');
        await expect(await win.richTextBody('policy[en]')).toHaveText('Reviews of recent books.');
        await win.type('title[en]', 'Book Reviews');
        await win.checkbox(SAM_BOX).check();
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveText(['Articles', 'Book Reviews']);
        await expect(tab.editorsCell('Book Reviews')).toHaveText('Sam Section');

        // The new name on the reader's page (Rule 3).
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles', 'Book Reviews']);

        // "Review Form" {OJS}: the list, "None / Free Form Review" chosen;
        // "Structured Review" chosen and saved (Fields, "Review Form").
        win = await tab.openEdit('Articles');
        await expect(win.reviewFormSelect().locator('option')).toHaveText([NO_FORM, FORM]);
        await expect(win.reviewFormSelect().locator('option:checked')).toHaveText(NO_FORM);
        await win.reviewFormSelect().selectOption({label: FORM});
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());

        // Control: "Articles", whose boxes were never ticked, still reads
        // "None" (Rule 8).
        await expect(tab.editorsCell('Articles')).toHaveText('None');
        await expect(tab.editorsCell('Book Reviews')).toHaveText('Sam Section');

        // Add Reviewer on "Tidal Patterns" at Review, Rex selected: "Review
        // Form" reads "Structured Review" (Settings bullet 6).
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, 'Rex Reviewer');
        await expect(reviewFormSelect(modal).locator('option:checked')).toHaveText(FORM);
    });

    test('S2: Order the sections', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            sections: [
                section('ART', 'Articles', 'Policy for articles.'),
                section('REV', 'Reviews', 'Policy for reviews.'),
                section('ESS', 'Essays', 'Policy for essays.'),
            ],
        });
        const page = await actorPage(asUser, manager);
        const authorPage = await actorPage(asUser, author);
        const tab = new SectionsTab(page, tag);
        const start = new StartSubmissionPage(authorPage, tag);
        const policies = new SubmissionsPage(visitor, tag);

        // "Order": the rows turn into drag handles, "Done" and "Cancel
        // ordering" show (Rule 4a).
        await tab.goto();
        await expect(tab.titleCells()).toHaveText(['Articles', 'Reviews', 'Essays']);
        await expect(tab.doneLink()).toBeHidden();
        await expect(tab.dragHandles()).toHaveCount(0);
        await tab.startOrdering();
        await expect(tab.cancelOrderingLink()).toBeVisible();
        await expect(tab.dragHandles()).toHaveCount(3);

        // "Cancel ordering": "Essays" dragged above "Articles" (read while
        // ordering), then the rows stand as before (Rule 4a).
        await tab.drag('Essays', 'Articles');
        await expect(tab.titleCells()).toHaveText(['Essays', 'Articles', 'Reviews']);
        await tab.cancelOrdering();
        await expect(tab.titleCells()).toHaveText(['Articles', 'Reviews', 'Essays']);

        // Control: right after "Cancel ordering", the Author's "Section"
        // choice lists the old order (Rules 4a, 4c).
        await start.goto();
        await expect(startFormSections(authorPage)).toHaveText(['Articles', 'Reviews', 'Essays']);

        // "Done": the new order, no notice (bounded by the order's save; the
        // notice after "Letters" below, read the same way, is the control);
        // a reload keeps it (Rule 4a; Side effects).
        await tab.startOrdering();
        await tab.drag('Essays', 'Articles');
        await expect(tab.titleCells()).toHaveText(['Essays', 'Articles', 'Reviews']);
        await markNotices(page);
        const saved = await tab.done();
        expect(saved.status()).toBe(200);
        await expect(tab.titleCells()).toHaveText(['Essays', 'Articles', 'Reviews']);
        await expect(notices(page, undefined, {fresh: true})).toHaveCount(0);
        await tab.reload();
        await expect(tab.titleCells()).toHaveText(['Essays', 'Articles', 'Reviews']);

        // The start form (Rule 4c).
        await start.goto();
        await expect(startFormSections(authorPage)).toHaveText(['Essays', 'Articles', 'Reviews']);

        // The "Submissions" page (Rules 4c, 12).
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Essays', 'Articles', 'Reviews']);

        // A new section after an order: "Letters" is the last row (Rule 2).
        const win = await tab.openAdd();
        await win.type('title[en]', 'Letters');
        await win.type('abbrev[en]', 'LET');
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveText(['Essays', 'Articles', 'Reviews', 'Letters']);
    });

    test('S3: Deactivate and reactivate a section', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            sections: [section('ART', 'Articles', 'Policy for articles.'), section('REV', 'Reviews', 'Policy for reviews.')],
        });
        const submissionId = await seedArticle(ojsApi, tag, author, 'REV');
        const page = await actorPage(asUser, manager);
        const tab = new SectionsTab(page, tag);
        const policies = new SubmissionsPage(visitor, tag);

        // The visitor's page before: both blocks (the control for the
        // absence below).
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles', 'Reviews']);

        // Deactivate from the table: "Confirm" asks, "OK" ticks the box and
        // shows the notice (Rule 5; Side effects).
        await tab.goto();
        let confirm = await tab.pressInactive('Reviews');
        await expect(confirm.question()).toHaveText(DEACTIVATE_QUESTION);
        await expect(confirm.button('OK')).toBeVisible();
        await expect(confirm.button('Cancel')).toBeVisible();
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Reviews')).toBeChecked();

        // The visitor's page: "Articles" and no "Reviews" (Rules 5d, 12a).
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles']);

        // "Publication Settings": the "Section" list offers "Reviews
        // (Inactive)" (Rule 5b).
        const pub = new PublicationScreen(page, tag);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Publication Settings');
        await expect(sectionList(page).locator('option', {hasText: 'Reviews (Inactive)'})).toHaveCount(1);
        await expect(sectionList(page).locator('option:checked')).toHaveText('Reviews (Inactive)');

        // The last active section, from the table: "OK", the box stays
        // unticked, the notice (Rule 6a).
        await tab.goto();
        confirm = await tab.pressInactive('Articles');
        await expect(confirm.question()).toHaveText(DEACTIVATE_QUESTION);
        await expectNoticeTopRight(page, LAST_ACTIVE, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Articles')).not.toBeChecked();

        // The last active section, from its window: the notice, the window
        // open with the box ticked; "Cancel": still unticked (Rule 6b).
        let win = await tab.openEdit('Articles');
        await win.checkbox(INACTIVE_BOX).check();
        await expectNoticeTopRight(page, LAST_ACTIVE, () => win.save());
        await expect(win.heading()).toHaveText('Edit');
        await expect(win.checkbox(INACTIVE_BOX)).toBeChecked();
        await win.cancel();
        await expect(tab.inactiveBox('Articles')).not.toBeChecked();
        await tab.reload();
        await expect(tab.inactiveBox('Articles')).not.toBeChecked();

        // Reactivate: "…activate this section?", "OK": unticked, the
        // notice; the visitor's page has "Reviews" back (Rules 5, 12a).
        confirm = await tab.pressInactive('Reviews');
        await expect(confirm.question()).toHaveText(ACTIVATE_QUESTION);
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Reviews')).not.toBeChecked();
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles', 'Reviews']);

        // Deactivate from the window: it closes, the notice, the box ticked
        // (Rule 5; Settings bullet 1).
        win = await tab.openEdit('Reviews');
        await win.checkbox(INACTIVE_BOX).check();
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.inactiveBox('Reviews')).toBeChecked();

        // Control: "Articles" stayed active, and its block never left the
        // visitor's page (Rule 6).
        await expect(tab.inactiveBox('Articles')).not.toBeChecked();
        await policies.goto();
        await expect(policies.blockHeadings()).toHaveText(['Articles']);
    });

    test('S4: Delete a section', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            sections: [
                section('ART', 'Articles', 'Policy for articles.'),
                section('REV', 'Reviews', 'Policy for reviews.'),
                section('ESS', 'Essays', 'Policy for essays.'),
            ],
            extra: [user(`${tag}se`, 'Sam', 'Section', ['sectionEditor'], {sections: ['ESS']})],
            issues: [{volume: 1, number: 1, year: 2026, published: true}],
        });
        const submissionId = await seedArticle(ojsApi, tag, author, 'REV');
        const page = await actorPage(asUser, manager);
        const tab = new SectionsTab(page, tag);

        // The delete window (Rule 7).
        await tab.goto();
        let del = await tab.openDelete('Reviews');
        await expect(del.question()).toHaveText(DELETE_QUESTION);
        await expect(del.button('OK')).toBeVisible();
        await expect(del.button('Cancel')).toBeVisible();

        // A section holding an article: the row stays, the notice (Rule 7a).
        await expectNoticeTopRight(page, IN_USE, () => tab.confirm(del));
        await expect(tab.titleCells()).toHaveText(['Articles', 'Reviews', 'Essays']);

        // Moving the article out: "Articles" chosen, "Save" refused for the
        // issue; "Don't Assign To An Issue", saved (Rule 7c).
        const pub = new PublicationScreen(page, tag);
        await pub.gotoWorkflow(submissionId);
        // The page's issue part loads after its heading (the assignment
        // options, then the published issues); a "Save" pressed before the
        // issue list is in does nothing at all, so wait for the state the
        // article arrives in: "Assign To Current/Back Issue" chosen, the
        // "Issue" list holding the published issue and none chosen.
        const issuesLoaded = page.waitForResponse(
            (r) => /\/api\/v1\/issues\?/.test(r.url()) && r.request().method() === 'GET',
            {timeout: 30_000}
        );
        await pub.openEntry('Publication Settings');
        await issuesLoaded;
        const issueList = page.getByRole('combobox', {name: /^Issue\b/});
        await expect(issueList.locator('option')).toHaveText(['Vol. 1 No. 1 (2026)']);
        await expect(issueList.locator('option:checked')).toHaveCount(0);
        await expect(page.getByRole('radio', {name: 'Assign To Current/Back Issue'})).toBeChecked();
        await sectionList(page).selectOption({label: 'Articles'});
        const sent = await pub.saveRefusedInPlace(page.getByText('Please correct one error.'));
        expect(sent, 'nothing sent').toBe(0);
        await expect(pub.goToFieldButton('Issue')).toHaveText(/Issue: This field is required\./);
        await page.getByRole('radio', {name: "Don't Assign To An Issue"}).check();
        await pub.save();

        // The emptied section: the row goes, no notice (bounded by the
        // delete's answer; the refusal above, read the same way, is the
        // control) (Rule 7; Side effects).
        await tab.goto();
        del = await tab.openDelete('Reviews');
        await markNotices(page);
        const deleted = await tab.confirm(del);
        expect(deleted.status()).toBe(200);
        await expect(tab.titleCells()).toHaveText(['Articles', 'Essays']);
        await expect(notices(page, undefined, {fresh: true})).toHaveCount(0);

        // Its editors go with it: "Essays" reads "Sam Section"; deleted and
        // created again, it reads "None" (Rule 2; Side effects).
        await expect(tab.editorsCell('Essays')).toHaveText('Sam Section');
        del = await tab.openDelete('Essays');
        await tab.confirm(del);
        await expect(tab.titleCells()).toHaveText(['Articles']);
        const win = await tab.openAdd();
        await win.type('title[en]', 'Essays');
        await win.type('abbrev[en]', 'ESS');
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveText(['Articles', 'Essays']);
        await expect(tab.editorsCell('Essays')).toHaveText('None');

        // The last active section: "Articles" deactivated, then "Essays"
        // deleted: the row stays, the notice (Rules 6c, 7b).
        const confirm = await tab.pressInactive('Articles');
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Articles')).toBeChecked();
        del = await tab.openDelete('Essays');
        await expectNoticeTopRight(page, LAST_ACTIVE, () => tab.confirm(del));
        await expect(tab.titleCells()).toHaveText(['Articles', 'Essays']);

        // Control: after a reload, "Articles" ticked, "Essays", no
        // "Reviews" (Rules 1, 7).
        await tab.reload();
        await expect(tab.titleCells()).toHaveText(['Articles', 'Essays']);
        await expect(tab.inactiveBox('Articles')).toBeChecked();
        await expect(tab.inactiveBox('Essays')).not.toBeChecked();
    });

    test('S5: The "Submissions" page\'s section policies', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            sections: [
                section('ART', 'Articles', 'Policy for articles.'),
                section('REV', 'Reviews', 'Policy for reviews.'),
                section('NOTE', 'Notes'),
            ],
        });
        const page = await actorPage(asUser, manager);
        const authorPage = await actorPage(asUser, author);
        const tab = new SectionsTab(page, tag);
        const visitorView = new SubmissionsPage(visitor, tag);
        const authorView = new SubmissionsPage(authorPage, tag);
        const managerView = new SubmissionsPage(page, tag);

        // The visitor: after the checklist, "Articles" and "Reviews" with
        // their policies, no "Notes", no submission line (the Author's
        // lines below, read the same way, are the control) (Rules 12, 12b;
        // Settings bullet 3). Control: no "not accepting" notice (Rule 13).
        await visitorView.goto();
        await expect(visitorView.checklist()).toBeVisible();
        await expect(visitorView.blockHeadings()).toHaveText(['Articles', 'Reviews']);
        await expect(visitorView.blocksAfterChecklist()).toHaveCount(2);
        expect(await visitorView.policyText('Articles')).toBe('Policy for articles.');
        expect(await visitorView.policyText('Reviews')).toBe('Policy for reviews.');
        await expect(visitorView.submitLines()).toHaveCount(0);
        await expect(visitorView.notice()).toBeVisible();
        await expect(visitorView.notice()).not.toContainText(NOT_ACCEPTING);

        // The signed-in Author: the same blocks, each with its line and
        // link (Rule 12b). Control: no "not accepting" notice (Rule 13).
        await authorView.goto();
        await expect(authorView.blockHeadings()).toHaveText(['Articles', 'Reviews']);
        await expect(authorView.submitLine('Articles')).toHaveText('Make a new submission to the Articles section.');
        await expect(authorView.submitLine('Reviews')).toHaveText('Make a new submission to the Reviews section.');
        await expect(authorView.submitLink('Articles')).toBeVisible();
        await expect(authorView.submitLink('Reviews')).toBeVisible();
        await expect(authorView.notice()).toHaveText(SIGNED_IN_INVITATION);

        // Restricted and inactive: "Reviews" editor-only, "Articles"
        // inactive (Rule 5; Settings bullets 1, 2).
        await tab.goto();
        let win = await tab.openEdit('Reviews');
        await win.checkbox(EDITORS_ONLY_BOX).check();
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        const confirm = await tab.pressInactive('Articles');
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Articles')).toBeChecked();

        // The Author's and the visitor's page: no block (the checklist is
        // the control), and still no "not accepting" notice (Rules 5d, 12a,
        // 13; Settings bullet 2).
        await authorView.goto();
        await expect(authorView.checklist()).toBeVisible();
        await expect(authorView.blocks()).toHaveCount(0);
        await expect(authorView.notice()).toHaveText(SIGNED_IN_INVITATION);
        await visitorView.goto();
        await expect(visitorView.checklist()).toBeVisible();
        await expect(visitorView.blocks()).toHaveCount(0);
        await expect(visitorView.notice()).toBeVisible();
        await expect(visitorView.notice()).not.toContainText(NOT_ACCEPTING);

        // The Journal Manager's page: both blocks (Rule 12a).
        await managerView.goto();
        await expect(managerView.blockHeadings()).toHaveText(['Articles', 'Reviews']);

        // No section open: "Notes" editor-only too; the Author and the
        // visitor read "not accepting", the Journal Manager the invitation
        // and both blocks (Rules 13, 13a).
        await tab.goto();
        win = await tab.openEdit('Notes');
        await win.checkbox(EDITORS_ONLY_BOX).check();
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await authorView.goto();
        await expect(authorView.notice()).toHaveText(NOT_ACCEPTING);
        await visitorView.goto();
        await expect(visitorView.notice()).toHaveText(NOT_ACCEPTING);
        await managerView.goto();
        await expect(managerView.notice()).toHaveText(SIGNED_IN_INVITATION);
        await expect(managerView.blockHeadings()).toHaveText(['Articles', 'Reviews']);
    });
});

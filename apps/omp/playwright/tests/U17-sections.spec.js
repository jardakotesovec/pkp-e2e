// @ts-check
/**
 * @file playwright/tests/U17-sections.spec.js
 *
 * Sections — OMP suite: one test for the one canonical scenario a press
 * runs, S7 {OMP} (a press's series), in the press's own words: the Press
 * Manager, Settings › Press › "Series", "Add Series", the series window.
 * S1–S5 are {OJS OPS} and S6 {OPS}: a press has no section, and its series
 * are S7's (Rule 1; OMP1), so they cost the press no test.
 * Spec: docs/specs/U17-sections.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OMP2 🐞: S7 reads that "new series" is refused with a notice about the
 *   series path, never the "only letters and numbers" words.
 * - OMP5 🐞: S7 reads the "Confirm" question up to "deactivate this",
 *   never the noun that follows.
 * - OMP6 ❓: S7 reads "Textbooks" as one row of two, never its place; the
 *   order is read only after "Order" and "Done".
 * - OMP3 🐞, OMP9 🐞: no test uploads a cover or opens a series' page.
 * - OMP7 🐞, OMP8 🐞: S7 never reads the ISSN paragraph or the path help.
 * - OMP4 ❓: the press has no category, so the window has no "Categories".
 * - A6 🐞: S7 never types a title of spaces only.
 * - A1, A2, A3, A4, A5, A7, A8, OPS1–OPS6: the journal's and the preprint
 *   server's, in those trees.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are only read. S7 runs on its own scratch press (`u17s7omw…`) with a
 * throwaway Press Manager "Mona Manager" (`…mg`) and Author "Ada Author"
 * (`…au`), the username twice as password, and no series and no category,
 * as footnote s says (the context scenario takes no `series[]`; the series
 * are made on screen through "Add Series", as the scenario does). The
 * signed-out visitor is a second browser context with an empty storage
 * state (patterns.md, parallel lesson 8); the Manager and the Author get
 * their own `asUser` contexts. Every absence is read settled and paired
 * with a positive control taken the same way (M4, M6): the header's links
 * as a whole list, the window's tick-box groups by label beside the one
 * that is there, a missing notice after the answer that would have carried
 * it beside a notice read the same way. Everything runs in the parallel
 * `omp` project.
 *
 * Page objects: shared/playwright/pages/SectionsPages.js (the "Series" tab
 * and its "Order" mode, the series window, the "Confirm" and "Delete"
 * windows, the notices, About › "Submissions").
 */
const {test: base, expect} = require('../support/fixtures.js');
const {
    SectionsTab,
    SubmissionsPage,
    notices,
    markNotices,
    expectNoticeTopRight,
    noticesGone,
} = require('../../../../shared/playwright/pages/SectionsPages.js');

const REQUIRED = 'This field is required.';
const SAVED = 'Your changes have been saved.';
const REQUIRED_NOTE = 'Required fields are marked with an asterisk: *';
const PATH_REFUSED = /The series path\b/; // OMP2: the words after it are the defect
const PATH_IN_USE = 'The series path already exists. Please enter a unique path.';
const BAD_ISSN = 'Please enter a valid ISSN.';
const SAME_ISSN = 'Online and print ISSN must not be the same.';
const DEACTIVATE_QUESTION = /^\s*Are you sure you wish to deactivate this\b/; // OMP5: the noun is the defect
const DELETE_QUESTION = 'Are you sure you wish to delete this item? This action cannot be undone.';
const LAST_ACTIVE = /At least one section must be active/;
const INACTIVE_BOX = 'Mark this series as inactive and do not allow new submissions to be made to it.';
const RESTRICTED_BOX = "Don't allow authors to submit directly to this series.";
const SIGNED_OUT_INVITATION = 'Login or Register to make a submission.';
const SIGNED_IN_INVITATION = 'Make a new submission or view your pending submissions.';
const SORT_OPTIONS = [
    'Title (A-Z)',
    'Title (Z-A)',
    'Publication date (oldest first)',
    'Publication date (newest first)',
    'Series position (lowest first)',
    'Series position (highest first)',
];

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
    return `u17${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
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

test.describe('Sections', () => {
    test('S7: A press\'s series', async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(author, 'Ada', 'Author', ['author'])],
        });
        const page = await actorPage(asUser, manager);
        const tab = new SectionsTab(page, tag, {tab: 'Series', addLabel: 'Add Series'});

        // A press with no series: the heading "Series", "Add Series" at the
        // top right and no "Order" (the header's links as a whole list), the
        // four columns, "No Items" and no row (Fields, the "Series" tab;
        // Rule 1).
        await tab.goto();
        await expect(tab.heading()).toBeVisible();
        await expect(tab.headerLinks()).toHaveText(['Add Series']);
        const gridBox = await tab.grid().boundingBox();
        const addBox = await tab.addLink().boundingBox();
        expect(addBox && gridBox && addBox.x > gridBox.x + gridBox.width / 2, '"Add Series" at the right').toBe(true);
        await expect(tab.columnHeaders()).toHaveText(['Title', 'Categories', 'Editors', 'Inactive']);
        await expect(tab.noItems()).toBeVisible();
        await expect(tab.noItems()).toHaveText('No Items');
        await expect(tab.rows()).toHaveCount(0);

        // The series window: headed "Add Series", ending in the note, "Save"
        // and "Cancel"; "Order of monographs" on "Title (A-Z)", both boxes
        // unticked, no "Categories" group ("Editorial Assignments", read
        // the same way, is the control) (Fields, the series window).
        let win = await tab.openAdd();
        await expect(win.heading()).toHaveText('Add Series');
        await expect(win.requiredNote()).toHaveText(REQUIRED_NOTE);
        await expect(win.saveButton()).toBeVisible();
        await expect(win.cancelLink()).toBeVisible();
        const noteBox = await win.requiredNote().boundingBox();
        const saveBox = await win.saveButton().boundingBox();
        expect(noteBox && saveBox && noteBox.y < saveBox.y, 'the note above "Save"').toBe(true);
        await expect(win.select('sortOption').locator('option')).toHaveText(SORT_OPTIONS);
        await expect(win.selectedOption('sortOption')).toHaveText('Title (A-Z)');
        await expect(win.checkbox(INACTIVE_BOX)).not.toBeChecked();
        await expect(win.checkbox(RESTRICTED_BOX)).not.toBeChecked();
        await expect(win.boxGroup('Editorial Assignments')).toHaveCount(1);
        await expect(win.boxGroup('Categories')).toHaveCount(0);
        await expect(win.form()).not.toContainText('Categories');

        // An empty "Path": "The" and "Monographs" typed, "Save" posts
        // nothing, "This field is required." under "Path" and under no other
        // box, the window stays (Fields, "Path").
        await win.type('prefix[en]', 'The');
        await win.type('title[en]', 'Monographs');
        const sent = await win.saveRefusedInPlace(win.fieldError('path'));
        expect(sent, 'nothing posted').toBe(0);
        await expect(win.fieldError('path')).toHaveText(REQUIRED);
        await expect(win.visibleErrors()).toHaveCount(1);
        await expect(win.heading()).toHaveText('Add Series');

        // A refused path: "new series", the notice about the series path at
        // the top right [OMP2], nothing marked under the box, the window
        // stays (Fields, "Path").
        await win.type('path', 'new series');
        let refused = await expectNoticeTopRight(page, PATH_REFUSED, () => win.save());
        expect(refused.status()).toBe(200);
        await expect(win.visibleErrors()).toHaveCount(0);
        await expect(win.heading()).toHaveText('Add Series');

        // Refused ISSNs: "1234", then the same number in both boxes; the
        // window stays both times (Fields, "ISSN").
        await win.type('path', 'monographs');
        await win.type('onlineIssn', '1234');
        refused = await expectNoticeTopRight(page, BAD_ISSN, () => win.save());
        expect(refused.status()).toBe(200);
        await expect(win.heading()).toHaveText('Add Series');
        await win.type('onlineIssn', '0378-5955');
        await win.type('printIssn', '0378-5955');
        await expectNoticeTopRight(page, SAME_ISSN, () => win.save());
        await expect(win.heading()).toHaveText('Add Series');
        await win.type('printIssn', '');

        // Saved, closed to authors: the window closes, the notice, one row
        // "The Monographs", "None" under "Categories" and "Editors",
        // "Inactive" unticked (Fields, the "Series" tab; Rule 10). The three
        // refusals' notices are let go first: stacked, a fourth stands below
        // the top of the page.
        await win.checkbox(RESTRICTED_BOX).check();
        await noticesGone(page);
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveText(['The Monographs']);
        await expect(tab.categoriesCell('The Monographs')).toHaveText('None');
        await expect(tab.editorsCell('The Monographs')).toHaveText('None');
        await expect(tab.inactiveBox('The Monographs')).not.toBeChecked();
        await expect(tab.noItems()).toBeHidden();

        // The press's "Submissions" page, "The Monographs" its only series:
        // the visitor reads the signed-out invitation and no block names the
        // series (the page's own blocks, read the same way, are there); the
        // Author reads the signed-in invitation (Rules 12c, 13c).
        const policies = new SubmissionsPage(visitor, tag);
        await policies.goto();
        await expect(policies.notice()).toHaveText(SIGNED_OUT_INVITATION);
        await expect(policies.root().locator('h2').first()).toHaveText('Author Guidelines');
        await expect(policies.blocks()).toHaveCount(0);
        await expect(policies.root()).not.toContainText('Monographs');
        const authorPage = await actorPage(asUser, author);
        const authorPolicies = new SubmissionsPage(authorPage, tag);
        await authorPolicies.goto();
        await expect(authorPolicies.notice()).toHaveText(SIGNED_IN_INVITATION);
        await expect(authorPolicies.blocks()).toHaveCount(0);
        await expect(authorPolicies.root()).not.toContainText('Monographs');

        // A path in use: "monographs" refused with the notice, the window
        // stays; "textbooks" saved: two rows, "Textbooks" among them (its
        // place is OMP6's), and "Order" beside "Add Series" (Fields, "Path").
        win = await tab.openAdd();
        await win.type('title[en]', 'Textbooks');
        await win.type('path', 'monographs');
        await expectNoticeTopRight(page, PATH_IN_USE, () => win.save());
        await expect(win.heading()).toHaveText('Add Series');
        await win.type('path', 'textbooks');
        await noticesGone(page);
        await expectNoticeTopRight(page, SAVED, () => win.saveAndClose());
        await expect(tab.titleCells()).toHaveCount(2);
        await expect(tab.row('Textbooks')).toHaveCount(1);
        await expect(tab.row('The Monographs')).toHaveCount(1);
        await expect(tab.headerLinks()).toHaveText(['Order', 'Add Series']);

        // "Order": the lower row dragged above the other, "Done": the two
        // rows have changed places; a reload keeps it (Rule 4a).
        const [upper, lower] = await tab.titleCells().allInnerTexts().then((t) => t.map((s) => s.trim()));
        await tab.startOrdering();
        await tab.drag(lower, upper);
        await expect(tab.titleCells()).toHaveText([lower, upper]);
        const ordered = await tab.done();
        expect(ordered.status()).toBe(200);
        await expect(tab.titleCells()).toHaveText([lower, upper]);
        await tab.reload();
        await expect(tab.titleCells()).toHaveText([lower, upper]);

        // Every series inactive: "Confirm" asks [OMP5], "OK" ticks the box
        // with the notice; "Textbooks", the last active one, too (Rules 5,
        // 6).
        let confirm = await tab.pressInactive('The Monographs');
        await expect(confirm.question()).toHaveText(DEACTIVATE_QUESTION);
        await expect(confirm.button('OK')).toBeVisible();
        await expect(confirm.button('Cancel')).toBeVisible();
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('The Monographs')).toBeChecked();
        confirm = await tab.pressInactive('Textbooks');
        await expect(confirm.question()).toHaveText(DEACTIVATE_QUESTION);
        await expectNoticeTopRight(page, SAVED, () => tab.confirm(confirm));
        await expect(tab.inactiveBox('Textbooks')).toBeChecked();
        await expect(tab.inactiveBox('The Monographs')).toBeChecked();

        // Control: the second box was taken with no refusal (every notice
        // it showed is the saved one) (Rule 6; OMP1).
        await expect(notices(page, LAST_ACTIVE, {fresh: true})).toHaveCount(0);
        await tab.reload();
        await expect(tab.inactiveBox('Textbooks')).toBeChecked();
        await expect(tab.inactiveBox('The Monographs')).toBeChecked();

        // Every series deleted: the "Delete" window asks, "OK": the row
        // goes; "Textbooks" too: "No Items" (Rules 6, 7).
        let del = await tab.openDelete('The Monographs');
        await expect(del.question()).toHaveText(DELETE_QUESTION);
        await expect(del.button('OK')).toBeVisible();
        await expect(del.button('Cancel')).toBeVisible();
        let deleted = await tab.confirm(del);
        expect(deleted.status()).toBe(200);
        await expect(tab.titleCells()).toHaveText(['Textbooks']);
        del = await tab.openDelete('Textbooks');
        await expect(del.question()).toHaveText(DELETE_QUESTION);
        await markNotices(page);
        deleted = await tab.confirm(del);
        expect(deleted.status()).toBe(200);
        await expect(tab.rows()).toHaveCount(0);
        await expect(tab.noItems()).toBeVisible();
        await expect(tab.noItems()).toHaveText('No Items');

        // Control: the last "Delete" was taken with no refusal: no notice
        // (bounded by the delete's answer; the saved notices above, read the
        // same way, are the control), and a reload still reads "No Items"
        // (Rule 6; OMP1).
        await expect(notices(page, undefined, {fresh: true})).toHaveCount(0);
        await tab.reload();
        await expect(tab.rows()).toHaveCount(0);
        await expect(tab.noItems()).toHaveText('No Items');
    });
});

/**
 * The submission wizard through the API (docs/specs/U21-submission-wizard.md
 * "Through the API"). Who may work on a draft is the draft grid's
 * (U21#draft), checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const AUTHOR = 65536;
const MANAGER = 16;

/**
 * A scratch context with a Journal Manager and an Author whose one section
 * (a press: one series) takes submissions, and the start form's section
 * field with that section's id, read from a draft seeded in it.
 */
async function journal(scratch, appContext) {
    const sections = appContext.capabilities.hasSections;
    const j = await scratch({users: {mg: 'manager', au: 'author'}, ...(sections ? {} : {series: [{path: 'mx', title: 'Matrix series'}]})});
    const mg = await j.as('mg');
    const field = sections ? 'sectionId' : 'seriesId';
    const {submissionId, publicationId} = await j.submission('sr', {submitter: 'au', submitted: false, ...(sections ? {} : {series: 'mx'})});
    const sectionId = (await mg.get(`submissions/${submissionId}/publications/${publicationId}`)).body[field];
    return {j, mg, field, sectionId};
}

/** The start form's body, as "Begin Submission" sends it. */
const start = (field, sectionId, extra = {}) => ({locale: 'en', title: {en: 'Started through the API'}, [field]: sectionId, ...extra});

test.describe('the submission wizard through the API', () => {
    test('API1: A start in another journal\'s section is refused', async ({scratch, appContext}) => {
        const home = await journal(scratch, appContext);
        const other = await journal(scratch, appContext);
        const au = await home.j.as('au');

        const refused = await au.post('submissions', start(home.field, other.sectionId));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(home.field);

        // Control: the journal's own section.
        const started = await au.post('submissions', start(home.field, home.sectionId));
        expect(started.status).toBe(200);
        expect(started.body.submissionProgress).toBeTruthy();
    });

    test('API2: Submitting as a role the user does not hold is refused', async ({scratch, appContext}) => {
        const {j, mg, field, sectionId} = await journal(scratch, appContext);
        const au = await j.as('au');
        const groups = (await mg.get('userGroups')).body.items;
        const groupOf = (roleId) => groups.find((g) => g.roleId === roleId).id;

        const refused = await au.post('submissions', start(field, sectionId, {userGroupId: groupOf(MANAGER)}));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('userGroupId');

        // Control: the Author role the user holds.
        const started = await au.post('submissions', start(field, sectionId, {userGroupId: groupOf(AUTHOR)}));
        expect(started.status).toBe(200);
    });

    test('API3: Comments for the editors are refused once submitted', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const draft = await j.submission('d', {submitter: 'au', submitted: false});
        const submitted = await j.submission('s', {submitter: 'au'});
        const au = await j.as('au');
        const mg = await j.as('mg');

        const refused = await au.put(`submissions/${submitted.submissionId}`, {commentsForTheEditors: 'Late note'});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('commentsForTheEditors');
        expect((await mg.get(`submissions/${submitted.submissionId}`)).body.commentsForTheEditors).toBeFalsy();

        // Control: on the draft the same edit is stored.
        const saved = await au.put(`submissions/${draft.submissionId}`, {commentsForTheEditors: 'Early note'});
        expect(saved.status).toBe(200);
        expect((await mg.get(`submissions/${draft.submissionId}`)).body.commentsForTheEditors).toBe('Early note');
    });

    test('API4: A submission submitted twice is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId} = await j.submission('s', {submitter: 'au'});
        const mg = await j.as('mg');
        const before = (await mg.get(`submissions/${submissionId}`)).body.dateSubmitted;

        const refused = await (await j.as('au')).put(`submissions/${submissionId}/submit`, {});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('submissionProgress');
        expect((await mg.get(`submissions/${submissionId}`)).body.dateSubmitted).toBe(before);
    });
});

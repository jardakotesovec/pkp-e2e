/**
 * Emails management through the API (docs/specs/U56-emails-management.md
 * "Through the API"). Who may call the templates and emails routes is the
 * spec's grids, checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

// "Submission Declined (Pre-Review)" ("Submission Declined" on a preprint
// server): an email that takes several templates on every app.
const EMAIL = 'EDITOR_DECISION_INITIAL_DECLINE';

const template = (name, extra = {}) => ({
    name: {en: name},
    subject: {en: `${name} subject`},
    body: {en: `<p>${name} body</p>`},
    ...extra,
});

/** The names of an email's templates, its default first. */
async function namesOf(api, email = EMAIL) {
    const res = await api.get(`mailables/${email}`);
    expect(res.status).toBe(200);
    return res.body.emailTemplates.map((t) => t.name.en);
}

test.describe('emails management through the API', () => {
    test('API1: A template added to something that is not an email is refused', async ({scratch}) => {
        const api = await (await scratch()).as('mg');
        const total = async () => (await api.get('emailTemplates')).body.itemsMax;
        const before = await total();

        const refused = await api.post('emailTemplates', template('Stray decline', {alternateTo: 'NOT_AN_EMAIL'}));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('alternateTo');
        expect(await total()).toBe(before);

        // Control: the same template for an email that takes several.
        const added = await api.post('emailTemplates', template('Short decline', {alternateTo: EMAIL}));
        expect(added.status).toBe(200);
        expect((await namesOf(api)).slice(1)).toEqual(['Short decline']);
        expect(await total()).toBe(before + 1);
    });

    test('API2: Templates stay in their own journal', async ({scratch}) => {
        const own = await scratch();
        const other = await scratch();
        const ours = await own.as('mg');
        const theirs = await other.as('mg');
        const theirId = other.seeded.contextId;
        expect((await theirs.post('emailTemplates', template('Their decline', {alternateTo: EMAIL}))).status).toBe(200);

        // An add naming the other journal is stored in this one.
        const added = await ours.post('emailTemplates', template('Our decline', {alternateTo: EMAIL, contextId: theirId}));
        expect(added.status).toBe(200);
        expect(added.body.contextId).toBe(own.seeded.contextId);
        expect((await namesOf(ours)).slice(1)).toEqual(['Our decline']);
        expect((await namesOf(theirs)).slice(1)).toEqual(['Their decline']);

        // An edit naming the other journal is refused.
        const moved = await ours.put(`emailTemplates/${added.body.key}`, {contextId: theirId, subject: {en: 'Moved subject'}});
        expect(moved.status).toBe(403);
        expect((await ours.get(`emailTemplates/${added.body.key}`)).body.subject.en).toBe('Our decline subject');

        // "Reset All" here leaves the other journal's templates.
        expect((await ours.delete('emailTemplates/restoreDefaults')).status).toBe(200);
        expect((await namesOf(ours)).slice(1)).toEqual([]);
        expect((await namesOf(theirs)).slice(1)).toEqual(['Their decline']);
    });
});

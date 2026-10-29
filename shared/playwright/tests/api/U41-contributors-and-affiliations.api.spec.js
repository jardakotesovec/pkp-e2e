/**
 * Contributors & affiliations through the API
 * (docs/specs/U41-contributors-and-affiliations.md "Through the API").
 * Who may call these routes is the grids' (the spec's own three, the edit
 * gate's and the workflow screen's), checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A scratch journal's manager client, a submission's version route and the journal's roles. */
async function contributorsOf(scratch) {
    const j = await scratch({users: {mg: 'manager', au: 'author'}});
    const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
    const api = await j.as('mg');
    const roles = (await api.get('contributorRoles')).body;
    return {api, roles, route: `submissions/${submissionId}/publications/${publicationId}/contributors`};
}

const person = (roleId, extra = {}) => ({
    contributorType: 'PERSON',
    givenName: {en: 'Dana'},
    familyName: {en: 'Phillips'},
    email: 'dana.phillips@example.test',
    country: 'CA',
    contributorRoles: [roleId],
    ...extra,
});

test.describe('contributors & affiliations through the API', () => {
    test('API1: An edit keeps what it leaves out, and the affiliations it resends', async ({scratch}) => {
        const {api, roles, route} = await contributorsOf(scratch);
        const added = await api.post(route, person(roles[0].id, {affiliations: [{name: {en: 'Probe Institute'}}, {name: {en: 'Second Institute'}}]}));
        expect(added.status).toBe(200);
        const read = (await api.get(`${route}/${added.body.id}`)).body;

        // The type, a new given name and the affiliations as read: nothing else.
        const edited = await api.put(`${route}/${added.body.id}`, {contributorType: 'PERSON', givenName: {en: 'Dani'}, affiliations: read.affiliations});
        expect(edited.status).toBe(200);

        const after = (await api.get(`${route}/${added.body.id}`)).body;
        expect(after.givenName.en).toBe('Dani');
        expect(after.familyName.en).toBe('Phillips');
        expect(after.email).toBe('dana.phillips@example.test');
        expect(after.country).toBe('CA');
        expect(after.contributorRoles.map((role) => role.id)).toEqual([roles[0].id]);
        expect(after.affiliations.map((affiliation) => [affiliation.id, affiliation.name.en])).toEqual(
            read.affiliations.map((affiliation) => [affiliation.id, affiliation.name.en]),
        );
    });

    test('API2: A contributor type sent empty or left out of an add is refused', async ({scratch}) => {
        const {api, roles, route} = await contributorsOf(scratch);
        const before = (await api.get(route)).body.itemsMax;

        for (const contributorType of ['', undefined]) {
            const refused = await api.post(route, person(roles[0].id, {contributorType}));
            expect(refused.status, `add, type ${JSON.stringify(contributorType)}`).toBe(400);
            expect(refused.body, `add, type ${JSON.stringify(contributorType)}`).toHaveProperty('contributorType');
        }
        expect((await api.get(route)).body.itemsMax).toBe(before);

        // The edit: the type sent empty is refused, and nothing changes.
        const added = await api.post(route, person(roles[0].id));
        expect(added.status).toBe(200);
        const refused = await api.put(`${route}/${added.body.id}`, {contributorType: '', givenName: {en: 'Emptied'}});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('contributorType');
        const after = (await api.get(`${route}/${added.body.id}`)).body;
        expect([after.contributorType, after.givenName.en, after.email]).toEqual(['PERSON', 'Dana', 'dana.phillips@example.test']);
    });

    test('API3: A contributor role of another journal is not taken', async ({scratch}) => {
        const {api, route} = await contributorsOf(scratch);
        const elsewhere = await (await scratch()).as('mg');
        const foreignRole = (await elsewhere.get('contributorRoles')).body[0].id;
        const before = (await api.get(route)).body.itemsMax;

        const refused = await api.post(route, person(foreignRole));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('contributorRoles');
        expect((await api.get(route)).body.itemsMax).toBe(before);
    });

    test('API4: A role identifier the list lacks is refused, and an edit keeps the identifier', async ({scratch}) => {
        const api = await (await scratch()).as('mg');
        const count = (await api.get('contributorRoles')).body.length;

        const refused = await api.post('contributorRoles', {contributorRoleIdentifier: 'HANDLING_EDITOR', name: {en: 'Handling editor'}});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('contributorRoleIdentifier');
        expect((await api.get('contributorRoles')).body.length).toBe(count);

        const added = await api.post('contributorRoles', {contributorRoleIdentifier: 'EDITOR', name: {en: 'Handling editor'}});
        expect(added.status).toBe(200);
        const edited = await api.put(`contributorRoles/${added.body.id}`, {contributorRoleIdentifier: 'TRANSLATOR', name: {en: 'Section handler'}});
        expect(edited.status).toBe(200);
        const after = (await api.get(`contributorRoles/${added.body.id}`)).body;
        expect([after.contributorRoleIdentifier, after.name.en]).toEqual(['EDITOR', 'Section handler']);
    });

    test('API5: A registry id that is not a ROR address is refused', async ({scratch}) => {
        const api = await (await scratch()).as('mg');

        for (const ror of ['', '01abcde12', 'https://example.org/01abcde12', 'https://ror.org/abc']) {
            const refused = await api.post('rors', {ror});
            expect(refused.status, ror).toBe(400);
            expect(refused.body, ror).toHaveProperty('ror');
        }
    });

    test("API6: The assigned reviewer's contributor list is empty while the review hides the authors", async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
        const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
        const {submissionId, publicationId} = await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'accepted'}]}],
        });
        const version = `submissions/${submissionId}/publications/${publicationId}`;
        // The seeded contributor is named after the author's username.
        const name = j.user('au');

        // Control: the manager's same request names the contributor.
        const managerList = await (await j.as('mg')).get(`${version}/contributors`);
        expect(managerList.status).toBe(200);
        expect(managerList.body.items.map((c) => c.fullName)).toEqual([name]);

        const list = await (await j.as('rv')).get(`${version}/contributors`);
        expect(list.status).toBe(200);
        expect(list.body).toMatchObject({items: [], itemsMax: 0});
    });
});

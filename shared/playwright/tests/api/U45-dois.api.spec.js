/**
 * DOIs through the API (docs/specs/U45-dois.md "Through the API"). Who may
 * call the DOI routes is the spec's DOIs and registration grids, checked by
 * the matrix (docs/process/api.md), never here. No scratch journal here
 * has a registration agency, so nothing is ever sent to one.
 */
const {test, expect} = require('../../support/base-test.js');

const uniqueDoi = (prefix) => `${prefix}/api.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The DOI record of a submission's version, or null. */
async function doiOf(api, {submissionId, publicationId}) {
    const res = await api.get(`submissions/${submissionId}/publications/${publicationId}`);
    expect(res.status).toBe(200);
    return res.body.doiObject || null;
}

test.describe('DOIs through the API', () => {
    test('API1: A DOI record added naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch({doiPrefix: '10.1234'});
        const other = await scratch({doiPrefix: '10.1234'});
        const ours = await own.as('mg');
        const doi = uniqueDoi('10.1234');

        const added = await ours.post('dois', {doi, contextId: other.seeded.contextId});
        expect(added.status).toBe(200);
        expect(added.body).toMatchObject({doi, contextId: own.seeded.contextId});
        const one = await ours.get(`dois/${added.body.id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({doi, contextId: own.seeded.contextId, status: 1});
        expect((await ours.get('dois')).body.items.map((d) => d.doi)).toEqual([doi]);
        expect((await (await other.as('mg')).get('dois')).body.itemsMax).toBe(0);
    });

    test('API2: Without a registration agency, export and deposit are refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}, doiPrefix: '10.1234'});
        const work = await j.submission('w', {submitter: 'au', published: true});
        const api = await j.as('mg');
        expect((await api.post('dois/submissions/assignDois', {ids: [work.submissionId]})).status).toBe(200);
        const before = await doiOf(api, work);
        expect(before).toMatchObject({status: 1});

        for (const action of ['export', 'deposit']) {
            const refused = await api.put(`dois/submissions/${action}`, {ids: [work.submissionId]});
            expect(refused.status, action).toBe(400);
            expect(refused.body, action).toHaveProperty('error');
        }
        const all = await api.put('dois/depositAll', {});
        expect(all.status).toBe(200);
        expect(await doiOf(api, work)).toMatchObject({id: before.id, doi: before.doi, status: 1});
    });

    test('API3: Bulk actions naming another journal\'s work change nothing there', async ({scratch}) => {
        // "Never": no work gets a DOI by itself, so "Assign DOIs" decides.
        const own = await scratch({users: {mg: 'manager', au: 'author'}, doiPrefix: '10.1234', doiCreationTime: 'never'});
        const other = await scratch({users: {mg: 'manager', au: 'author'}, doiPrefix: '10.1234', doiCreationTime: 'never'});
        const ours = await own.as('mg');
        const theirs = await other.as('mg');
        const theirRegistered = await other.submission('r', {submitter: 'au', published: true});
        const theirBare = await other.submission('b', {submitter: 'au'});
        const ownBare = await own.submission('b', {submitter: 'au'});
        expect((await theirs.post('dois/submissions/assignDois', {ids: [theirRegistered.submissionId]})).status).toBe(200);
        expect((await theirs.put('dois/submissions/markRegistered', {ids: [theirRegistered.submissionId]})).status).toBe(200);
        expect(await doiOf(theirs, theirRegistered)).toMatchObject({status: 3});
        expect(await doiOf(theirs, theirBare)).toBeNull();

        // "Assign DOIs" naming their work without a DOI.
        const assign = await ours.post('dois/submissions/assignDois', {ids: [theirBare.submissionId]});
        expect(assign.status).toBe(400);
        expect(assign.body.failedDoiActions).toHaveLength(1);
        expect(await doiOf(theirs, theirBare)).toBeNull();

        // "Mark DOIs Unregistered" naming their registered work.
        const unmark = await ours.put('dois/submissions/markUnregistered', {ids: [theirRegistered.submissionId]});
        expect(unmark.status).toBe(400);
        expect(unmark.body.failedDoiActions).toHaveLength(1);
        expect(await doiOf(theirs, theirRegistered)).toMatchObject({status: 3});

        // Control: the same two on this journal's own work.
        expect((await ours.post('dois/submissions/assignDois', {ids: [ownBare.submissionId]})).status).toBe(200);
        expect(await doiOf(ours, ownBare)).toMatchObject({status: 1});
        expect((await ours.put('dois/submissions/markUnregistered', {ids: [ownBare.submissionId]})).status).toBe(200);
    });

    test('API4: A registration agency no agency plugin offers is refused', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const route = `contexts/${j.seeded.contextId}/registrationAgency`;

        const refused = await api.put(route, {registrationAgency: 'nosuchagencyplugin'});
        expect(refused.status).toBe(400);
        expect(refused.body.error).toMatch(/registration agency plugin/i);

        // Control: "None" is saved.
        const none = await api.put(route, {registrationAgency: null});
        expect(none.status).toBe(200);
        expect(none.body).toEqual({registrationAgency: null});
    });
});

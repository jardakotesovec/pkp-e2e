/**
 * Preprint relations through the API (docs/specs/U75-preprint-relations.md
 * "Through the API"). Who may call the relation route is the spec's
 * relation route grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('preprint relations through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasPreprintRelations, 'only a preprint server has relations (Purpose)');
    });

    test('API1: A relation the route cannot store is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
        const version = `submissions/${submissionId}/publications/${publicationId}`;
        const api = await j.as('mg');
        const relation = async () => {
            const res = await api.get(version);
            expect(res.status).toBe(200);
            return {relationStatus: res.body.relationStatus, vorDoi: res.body.vorDoi || ''};
        };
        const before = await relation();
        expect(before).toEqual({relationStatus: null, vorDoi: ''});

        const noStatus = await api.put(`${version}/relate`, {vorDoi: 'https://doi.org/10.1234/abcd'});
        expect(noStatus.status).toBe(400);
        expect(noStatus.body).toHaveProperty('relationStatus');

        const notAChoice = await api.put(`${version}/relate`, {relationStatus: 7});
        expect(notAChoice.status).toBe(400);
        expect(notAChoice.body).toHaveProperty('relationStatus');

        const notAnAddress = await api.put(`${version}/relate`, {relationStatus: 3, vorDoi: '10.1234/abcd'});
        expect(notAnAddress.status).toBe(400);
        expect(notAnAddress.body.vorDoi).toEqual(['This is not a valid URL.']);

        // Control: the version's relation reads as before.
        expect(await relation()).toEqual(before);
    });
});

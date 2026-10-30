/**
 * Catalog management through the API (docs/specs/U70-catalog-management.md
 * "Through the API"). Who may call the catalog routes is the spec's
 * catalog grid, checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {STATUS} = require('../../support/pkp-ids.js');

test.describe('catalog management through the API', () => {
    test.beforeEach(async ({appContext}) => {
        // A press keeps series, not sections, and is the only app with a catalog.
        test.skip(!appContext.capabilities.hasCatalog, 'only a press has a catalog');
    });

    test('API1: An add to the catalog naming an unknown book publishes nothing; a published book is passed over', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const atlas = await j.submission('a', {submitter: 'au', title: 'Atlas', decisions: ['skipExternalReview']});
        const chronicle = await j.submission('c', {submitter: 'au', title: 'Chronicle', decisions: ['skipExternalReview'], published: true});
        const api = await j.as('mg');
        const read = async ({submissionId}) => (await api.get(`submissions/${submissionId}`)).body;
        const before = await read(chronicle);
        expect(before.status).toBe(STATUS.PUBLISHED);

        const unknown = await api.put('_submissions/addToCatalog', {submissionIds: [atlas.submissionId, 999999999]});
        expect(unknown.status).toBe(404);
        expect((await read(atlas)).status).not.toBe(STATUS.PUBLISHED);

        const withPublished = await api.put('_submissions/addToCatalog', {submissionIds: [chronicle.submissionId, atlas.submissionId]});
        expect(withPublished.status).toBe(200);
        expect((await read(atlas)).status).toBe(STATUS.PUBLISHED);
        const after = await read(chronicle);
        expect(after.status).toBe(STATUS.PUBLISHED);
        expect(after.publications.map((p) => [p.id, p.status, p.datePublished]))
            .toEqual(before.publications.map((p) => [p.id, p.status, p.datePublished]));
    });
});

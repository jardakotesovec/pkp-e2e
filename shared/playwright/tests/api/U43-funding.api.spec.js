/**
 * Funding through the API (docs/specs/U43-funding.md "Through the API").
 * Who may call the funders routes is the edit gate's grid, checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A manager's client and a fresh submission's funders route. */
async function fundersOf(apiAs, pkpApi, appContext, tag) {
    const {submissionId, publicationId} = await pkpApi.createSubmission({
        tag,
        context: appContext.contextPath,
        submitter: appContext.seed.actors.author,
    });
    const api = await apiAs(appContext.seed.actors.manager);
    return {api, route: `submissions/${submissionId}/publications/${publicationId}/funders`};
}

test.describe('funding through the API', () => {
    test('API1: a funder without a name is refused', async ({apiAs, pkpApi, appContext}, testInfo) => {
        const {api, route} = await fundersOf(apiAs, pkpApi, appContext, `u43a1${testInfo.workerIndex}${Date.now().toString(36)}`);

        const refused = await api.post(route, {funder: {name: {}}, grants: [{grantNumber: 'G-1'}]});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('funder');
        expect((await api.get(route)).body.itemsMax).toBe(0);

        // Control: the same request with a name is stored.
        const added = await api.post(route, {funder: {name: {en: 'Named Foundation'}}, grants: [{grantNumber: 'G-1'}]});
        expect(added.status).toBe(200);
        expect((await api.get(route)).body.items.map((f) => f.name.en)).toEqual(['Named Foundation']);
    });

    test('API2: a registry id that is not a ROR address is refused', async ({apiAs, pkpApi, appContext}, testInfo) => {
        const {api, route} = await fundersOf(apiAs, pkpApi, appContext, `u43a2${testInfo.workerIndex}${Date.now().toString(36)}`);

        for (const ror of ['01abcde12', 'https://example.org/01abcde12', 'https://ror.org/abc']) {
            const refused = await api.post(route, {funder: {ror}});
            expect(refused.status, ror).toBe(400);
            expect(refused.body, ror).toHaveProperty('ror');
        }
        expect((await api.get(route)).body.itemsMax).toBe(0);
    });
});
